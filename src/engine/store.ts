import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClusterState } from './cluster';
import { initialClusterState } from './cluster';
import { executeKubectl } from './kubectl';
import { executeEtcdctl } from './etcd';
import type { Scenario } from '../data/scenarios';
import type { FileSystem } from './filesystem';
import { createInitialFileSystem, getNode, cloneNode, createNode, deleteNode, type FileNode } from './filesystem';
import { executeShellCommand } from './shell';
import { executeHelm } from './helm';

export interface VimMode {
    active: boolean;
    filePath: string;
    content: string;
    isNew: boolean;
    isK8sResource?: boolean;
    resourceType?: string;
    resourceName?: string;
    resourceNamespace?: string;
}

export interface ExecMode {
    active: boolean;
    podName: string;
    containerName?: string;
}

interface GameStore {
    // 集群状态
    clusterState: ClusterState;
    commandHistory: string[];
    
    // 文件系统
    fileSystem: FileSystem;
    vimMode: VimMode | null;
    execMode: ExecMode | null;

    // 场景相关
    currentScenario: Scenario | null;
    completedScenarios: string[];

    // 玩家信息
    playerXP: number;
    playerLevel: number;

    // 命令执行
    executeCommand: (command: string) => Promise<string | { vimMode: VimMode } | { execMode: ExecMode }>;
    
    // Exec 操作
    exitExec: () => void;
    
    // Vim 操作
    openVim: (filePath: string, content: string, isNew: boolean, k8sResource?: { type: string; name: string }) => void;
    saveVim: (content: string) => void;
    closeVim: () => void;

    // 集群管理
    resetCluster: () => void;

    // 场景管理
    loadScenario: (scenario: Scenario) => void;
    checkObjectives: () => void;
    completeScenario: () => void;
    resetScenario: () => void;
}

/**
 * 根据经验值计算玩家等级
 * 等级公式：每升一级需要的经验递增
 */
function calculateLevel(xp: number): number {
    // 等级阶梯：10级需100XP, 20级需400XP, 30级需900XP...
    if (xp < 100) return Math.max(1, Math.floor(xp / 10));
    if (xp < 400) return 10 + Math.floor((xp - 100) / 30);
    if (xp < 900) return 20 + Math.floor((xp - 400) / 50);
    if (xp < 1600) return 30 + Math.floor((xp - 900) / 70);
    return 40 + Math.floor((xp - 1600) / 100);
}

/**
 * 游戏状态管理 Store
 * 使用 Zustand 管理全局状态，通过 persist 中间件持久化到 localStorage
 */
export const useGameStore = create<GameStore>()(
    persist(
        (set, get) => ({
            clusterState: initialClusterState,
            commandHistory: [],
            fileSystem: createInitialFileSystem(),
            vimMode: null,
            execMode: null,
            currentScenario: null,
            completedScenarios: [],
            playerXP: 0,
            playerLevel: 1,

            /**
             * 执行命令（kubectl或其他）
             */
            executeCommand: async (command: string): Promise<string | { vimMode: VimMode } | { execMode: ExecMode }> => {
                const trimmed = command.trim();
                
                // 检查是否在 exec 模式中
                const currentExecMode = get().execMode;
                if (currentExecMode?.active) {
                    // 在容器 shell 中执行命令
                    if (trimmed === 'exit') {
                        set({ execMode: null });
                        return 'exit';
                    }
                    
                    // 模拟容器内命令
                    const pod = get().clusterState.pods.find(p => p.metadata.name === currentExecMode.podName);
                    if (!pod) {
                        set({ execMode: null });
                        return 'error: pod no longer exists';
                    }
                    
                    // 模拟常见命令
                    if (trimmed === 'env' || trimmed === 'printenv') {
                        const clusterState = get().clusterState;
                        const envVars: string[] = [
                            'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                            `HOSTNAME=${currentExecMode.podName}`,
                            'HOME=/root'
                        ];
                        // 添加 ConfigMap/Secret 环境变量
                        pod.spec.containers.forEach(c => {
                            // 处理 envFrom - 注入整个 ConfigMap/Secret
                            c.envFrom?.forEach(ef => {
                                if (ef.configMapRef) {
                                    const cm = clusterState.configMaps.find(cm => cm.metadata.name === ef.configMapRef?.name);
                                    if (cm?.data) {
                                        Object.entries(cm.data).forEach(([k, v]) => envVars.push(`${k}=${v}`));
                                    }
                                }
                                if (ef.secretRef) {
                                    const secret = clusterState.secrets.find(s => s.metadata.name === ef.secretRef?.name);
                                    if (secret?.data) {
                                        Object.entries(secret.data).forEach(([k, v]) => {
                                            // Secret 值是 base64 编码，这里模拟解码
                                            try {
                                                envVars.push(`${k}=${atob(v)}`);
                                            } catch {
                                                envVars.push(`${k}=${v}`);
                                            }
                                        });
                                    }
                                }
                            });
                            // 处理 env - 单独的环境变量
                            c.env?.forEach(e => {
                                if (e.value) {
                                    envVars.push(`${e.name}=${e.value}`);
                                } else if (e.valueFrom?.configMapKeyRef) {
                                    const cm = clusterState.configMaps.find(cm => cm.metadata.name === e.valueFrom?.configMapKeyRef?.name);
                                    if (cm?.data) {
                                        const key = e.valueFrom.configMapKeyRef.key;
                                        if (key && cm.data[key]) envVars.push(`${e.name}=${cm.data[key]}`);
                                    }
                                } else if (e.valueFrom?.secretKeyRef) {
                                    const secret = clusterState.secrets.find(s => s.metadata.name === e.valueFrom?.secretKeyRef?.name);
                                    if (secret?.data) {
                                        const key = e.valueFrom.secretKeyRef.key;
                                        if (key && secret.data[key]) {
                                            try {
                                                envVars.push(`${e.name}=${atob(secret.data[key])}`);
                                            } catch {
                                                envVars.push(`${e.name}=${secret.data[key]}`);
                                            }
                                        }
                                    }
                                }
                            });
                        });
                        return envVars.join('\n');
                    }
                    if (trimmed === 'ls' || trimmed === 'ls /') {
                        return 'bin  dev  etc  home  lib  proc  root  sys  tmp  usr  var';
                    }
                    if (trimmed.startsWith('ls ')) {
                        const path = trimmed.slice(3).trim();
                        if (path === '/data' || path === '/mnt' || path === '/config') {
                            return 'file1.txt  file2.txt';
                        }
                        return `ls: cannot access '${path}': No such file or directory`;
                    }
                    if (trimmed.startsWith('cat ')) {
                        return '# File content (simulated)\nkey=value\nconfig=enabled';
                    }
                    if (trimmed === 'pwd') {
                        return '/';
                    }
                    if (trimmed === 'whoami') {
                        return 'root';
                    }
                    if (trimmed === 'hostname') {
                        return currentExecMode.podName;
                    }
                    if (trimmed.startsWith('echo ')) {
                        return trimmed.slice(5);
                    }
                    if (trimmed === '' || trimmed === 'help') {
                        return '模拟容器 Shell 环境\n可用命令: ls, cat, env, pwd, whoami, hostname, echo, exit';
                    }
                    
                    return `sh: ${trimmed.split(' ')[0]}: command not found`;
                }

                // 添加到历史（过滤掉包含占位符 <...> 的命令，这些不是有效命令）
                // 占位符格式如 <pod>, <name> 等，但保留重定向 > 和 >>
                if (!/<[a-zA-Z][a-zA-Z0-9_-]*>/.test(trimmed)) {
                    set((state: GameStore) => ({
                        commandHistory: [...state.commandHistory, trimmed]
                    }));
                }
                
                // 解析重定向 (> 或 >>)
                let actualCommand = trimmed;
                let redirectFile: string | null = null;
                let appendMode = false;
                
                const redirectMatch = trimmed.match(/^(.+?)\s*(>>|>)\s*(\S+)\s*$/);
                if (redirectMatch) {
                    actualCommand = redirectMatch[1].trim();
                    appendMode = redirectMatch[2] === '>>';
                    redirectFile = redirectMatch[3];
                }
                
                // 检查是否有管道
                if (actualCommand.includes(' | ')) {
                    const pipeResult = await handlePipeCommand(actualCommand, get, set);
                    // 处理重定向
                    if (redirectFile && pipeResult) {
                        const fs = get().fileSystem;
                        let targetPath = redirectFile;
                        if (redirectFile.startsWith('~/')) {
                            targetPath = '/home/user/' + redirectFile.slice(2);
                        } else if (redirectFile === '~') {
                            targetPath = '/home/user';
                        } else if (!redirectFile.startsWith('/')) {
                            targetPath = `${fs.currentPath}/${redirectFile}`.replace(/\/+/g, '/');
                        }
                        const existingNode = getNode(fs, targetPath);
                        let newContent = pipeResult;
                        if (appendMode && existingNode?.type === 'file' && existingNode.content) {
                            newContent = existingNode.content + '\n' + pipeResult;
                        }
                        const fileNode: FileNode = {
                            name: targetPath.split('/').pop() || 'file',
                            type: 'file',
                            content: newContent,
                            permissions: '-rw-r--r--',
                            owner: 'user',
                            modifiedAt: new Date().toISOString()
                        };
                        if (existingNode) deleteNode(fs, targetPath);
                        createNode(fs, targetPath, fileNode);
                        set({ fileSystem: { ...fs } });
                        return '';
                    }
                    return pipeResult;
                }

                // 特殊命令
                if (actualCommand === 'clear') {
                    return '\x1b[2J\x1b[0;0H'; // 清屏ANSI码
                }

                if (actualCommand === 'help') {
                    return getHelpText();
                }

                // etcdctl 命令
                if (actualCommand.startsWith('etcdctl')) {
                    const result = executeEtcdctl(actualCommand, get().clusterState);
                    if (result.newState) {
                        set({ clusterState: { ...get().clusterState, ...result.newState } });
                    }
                    get().checkObjectives();
                    return result.output;
                }

                // kubectl 命令
                if (actualCommand.startsWith('kubectl')) {
                    // 特殊处理 kubectl edit (支持 -n 参数在任意位置)
                    if (actualCommand.match(/\bedit\b/)) {
                        return handleKubectlEdit(actualCommand, get, set);
                    }
                    
                    // 特殊处理 kubectl apply -f (需要读取文件系统)
                    const applyMatch = actualCommand.match(/^kubectl\s+apply\s+(?:-f|--filename)\s+(\S+)/);
                    if (applyMatch) {
                        const filename = applyMatch[1];
                        const fs = get().fileSystem;
                        let filePath = filename;
                        if (filename.startsWith('~/')) {
                            filePath = '/home/user/' + filename.slice(2);
                        } else if (filename === '~') {
                            filePath = '/home/user';
                        } else if (!filename.startsWith('/')) {
                            filePath = `${fs.currentPath}/${filename}`.replace(/\/+/g, '/');
                        }
                        
                        const fileNode = getNode(fs, filePath);
                        if (!fileNode || fileNode.type !== 'file') {
                            return `error: the path "${filename}" does not exist`;
                        }
                        
                        const yamlContent = fileNode.content || '';
                        const result = applyYamlToCluster(yamlContent, get().clusterState);
                        set({ clusterState: result.newState });
                        get().checkObjectives();
                        return result.output;
                    }
                    
                    // 特殊处理 kubectl create -f (需要读取文件系统)
                    const createMatch = actualCommand.match(/^kubectl\s+create\s+(?:-f|--filename)\s+(\S+)/);
                    if (createMatch) {
                        const filename = createMatch[1];
                        const fs = get().fileSystem;
                        let filePath = filename;
                        if (filename.startsWith('~/')) {
                            filePath = '/home/user/' + filename.slice(2);
                        } else if (filename === '~') {
                            filePath = '/home/user';
                        } else if (!filename.startsWith('/')) {
                            filePath = `${fs.currentPath}/${filename}`.replace(/\/+/g, '/');
                        }
                        
                        const fileNode = getNode(fs, filePath);
                        if (!fileNode || fileNode.type !== 'file') {
                            return `error: the path "${filename}" does not exist`;
                        }
                        
                        const yamlContent = fileNode.content || '';
                        const result = applyYamlToCluster(yamlContent, get().clusterState);
                        set({ clusterState: result.newState });
                        get().checkObjectives();
                        // create 输出格式与 apply 略有不同
                        return result.output.replace(' configured', ' created');
                    }
                    
                    // 特殊处理 kubectl delete -f (需要读取文件系统)
                    const deleteMatch = actualCommand.match(/^kubectl\s+delete\s+(?:-f|--filename)\s+(\S+)/);
                    if (deleteMatch) {
                        const filename = deleteMatch[1];
                        const fs = get().fileSystem;
                        let filePath = filename;
                        if (filename.startsWith('~/')) {
                            filePath = '/home/user/' + filename.slice(2);
                        } else if (filename === '~') {
                            filePath = '/home/user';
                        } else if (!filename.startsWith('/')) {
                            filePath = `${fs.currentPath}/${filename}`.replace(/\/+/g, '/');
                        }
                        
                        const fileNode = getNode(fs, filePath);
                        if (!fileNode || fileNode.type !== 'file') {
                            return `error: the path "${filename}" does not exist`;
                        }
                        
                        const yamlContent = fileNode.content || '';
                        const result = deleteFromYaml(yamlContent, get().clusterState);
                        set({ clusterState: result.newState });
                        get().checkObjectives();
                        return result.output;
                    }
                    
                    const { output, newState } = await executeKubectl(actualCommand, get().clusterState);
                    set({ clusterState: newState });

                    // 检查目标完成情况
                    get().checkObjectives();
                    
                    // 检查是否是 exec 模式标记
                    if (output.startsWith('__EXEC_MODE__:')) {
                        const podName = output.split(':')[1];
                        const execMode: ExecMode = { active: true, podName };
                        set({ execMode });
                        return { execMode };
                    }

                    // 处理重定向
                    if (redirectFile && output) {
                        const fs = get().fileSystem;
                        let targetPath = redirectFile;
                        if (redirectFile.startsWith('~/')) {
                            targetPath = '/home/user/' + redirectFile.slice(2);
                        } else if (redirectFile === '~') {
                            targetPath = '/home/user';
                        } else if (!redirectFile.startsWith('/')) {
                            targetPath = `${fs.currentPath}/${redirectFile}`.replace(/\/+/g, '/');
                        }
                        
                        const existingNode = getNode(fs, targetPath);
                        let newContent = output;
                        if (appendMode && existingNode?.type === 'file' && existingNode.content) {
                            newContent = existingNode.content + '\n' + output;
                        }
                        
                        // 创建或更新文件节点
                        const fileNode: FileNode = {
                            name: targetPath.split('/').pop() || 'file',
                            type: 'file',
                            content: newContent,
                            permissions: '-rw-r--r--',
                            owner: 'user',
                            modifiedAt: new Date().toISOString()
                        };
                        
                        // 如果文件已存在，先删除
                        if (existingNode) {
                            deleteNode(fs, targetPath);
                        }
                        createNode(fs, targetPath, fileNode);
                        set({ fileSystem: { ...fs } });
                        return ''; // 重定向时不输出到终端
                    }

                    return output;
                }
                
                // helm 命令
                if (actualCommand.startsWith('helm')) {
                    const { output, newState } = await executeHelm(actualCommand, get().clusterState);
                    set({ clusterState: newState });
                    get().checkObjectives();
                    
                    // 处理重定向
                    if (redirectFile && output) {
                        const fs = get().fileSystem;
                        let targetPath = redirectFile;
                        if (redirectFile.startsWith('~/')) {
                            targetPath = '/home/user/' + redirectFile.slice(2);
                        } else if (redirectFile === '~') {
                            targetPath = '/home/user';
                        } else if (!redirectFile.startsWith('/')) {
                            targetPath = `${fs.currentPath}/${redirectFile}`.replace(/\/+/g, '/');
                        }
                        
                        const existingNode = getNode(fs, targetPath);
                        let newContent = output;
                        if (appendMode && existingNode?.type === 'file' && existingNode.content) {
                            newContent = existingNode.content + '\n' + output;
                        }
                        
                        const fileNode: FileNode = {
                            name: targetPath.split('/').pop() || 'file',
                            type: 'file',
                            content: newContent,
                            permissions: '-rw-r--r--',
                            owner: 'user',
                            modifiedAt: new Date().toISOString()
                        };
                        
                        if (existingNode) {
                            deleteNode(fs, targetPath);
                        }
                        createNode(fs, targetPath, fileNode);
                        set({ fileSystem: { ...fs } });
                        return '';
                    }
                    
                    return output;
                }
                
                // 特殊处理 systemctl restart kubelet - 恢复集群状态
                if (actualCommand.match(/systemctl\s+(restart|start)\s+kubelet/)) {
                    const clusterState = get().clusterState;
                    // 如果 ETCD 标记为损坏，且用户已经编辑了 kube-apiserver.yaml，则恢复集群
                    const commandHistory = get().commandHistory;
                    const hasEditedApiserver = commandHistory.some(cmd => 
                        cmd.includes('vim') && cmd.includes('kube-apiserver')
                    );
                    
                    if (clusterState.etcd?.corrupted && hasEditedApiserver) {
                        // 恢复集群状态
                        set({ 
                            clusterState: {
                                ...clusterState,
                                etcd: {
                                    ...clusterState.etcd,
                                    corrupted: false,
                                    members: clusterState.etcd.members.map(m => ({
                                        ...m,
                                        status: 'healthy' as const
                                    }))
                                },
                                systemComponents: clusterState.systemComponents?.map(c => ({
                                    ...c,
                                    status: 'Running' as const,
                                    message: undefined
                                }))
                            }
                        });
                    }
                    get().checkObjectives();
                    return '';
                }
                
                // Shell 命令
                const shellResult = executeShellCommand(trimmed, get().fileSystem);
                
                // 检查是否需要进入 vim 模式
                if (shellResult.vimMode) {
                    const vimMode: VimMode = {
                        active: true,
                        filePath: shellResult.vimMode.filePath,
                        content: shellResult.vimMode.content,
                        isNew: shellResult.vimMode.isNew
                    };
                    set({ vimMode, fileSystem: shellResult.newFs });
                    return { vimMode };
                }
                
                // 如果 shell 处理了命令（output 不为 null）
                if (shellResult.output !== null) {
                    // 更新文件系统状态
                    if (shellResult.newFs !== get().fileSystem) {
                        set({ fileSystem: shellResult.newFs });
                    }
                    // 检查任务完成状态
                    get().checkObjectives();
                    return shellResult.output;
                }

                return `command not found: ${trimmed.split(' ')[0]}`;
            },
            
            /**
             * 打开 Vim 编辑器
             */
            openVim: (filePath: string, content: string, isNew: boolean, k8sResource?: { type: string; name: string }) => {
                set({
                    vimMode: {
                        active: true,
                        filePath,
                        content,
                        isNew,
                        isK8sResource: !!k8sResource,
                        resourceType: k8sResource?.type,
                        resourceName: k8sResource?.name
                    }
                });
            },
            
            /**
             * 保存 Vim 内容
             */
            saveVim: (content: string) => {
                const { vimMode, fileSystem, clusterState } = get();
                if (!vimMode) return;
                
                // 如果是 K8s 资源编辑
                if (vimMode.isK8sResource && vimMode.resourceType && vimMode.resourceName) {
                    const ns = vimMode.resourceNamespace || 'default';
                    const newState = applyK8sResourceEdit(clusterState, vimMode.resourceType, vimMode.resourceName, ns, content);
                    set({ clusterState: newState, vimMode: null });
                    get().checkObjectives();
                    return;
                }
                
                // 普通文件保存
                const newFs = { ...fileSystem, root: cloneNode(fileSystem.root) };
                const node = getNode(newFs, vimMode.filePath);
                
                if (node && node.type === 'file') {
                    node.content = content;
                    node.modifiedAt = new Date().toISOString();
                } else if (vimMode.isNew) {
                    createNode(newFs, vimMode.filePath, {
                        name: '',
                        type: 'file',
                        permissions: '-rw-r--r--',
                        owner: 'user',
                        content,
                        modifiedAt: new Date().toISOString()
                    });
                }
                
                set({ fileSystem: newFs, vimMode: null });
            },
            
            /**
             * 关闭 Vim
             */
            closeVim: () => {
                set({ vimMode: null });
            },
            
            /**
             * 退出 Exec 模式
             */
            exitExec: () => {
                set({ execMode: null });
            },

            /**
             * 重置集群到初始状态
             */
            resetCluster: () => {
                set({ clusterState: initialClusterState, commandHistory: [] });
            },

            /**
             * 加载场景
             */
            loadScenario: (scenario: Scenario) => {
                // 合并场景初始状态和默认集群状态
                const mergedState = scenario.initialState 
                    ? { ...initialClusterState, ...scenario.initialState }
                    : initialClusterState;
                
                // 创建初始文件系统
                const fs = createInitialFileSystem();
                
                // 如果场景有初始文件，添加到文件系统
                if (scenario.initialFiles) {
                    for (const [filePath, content] of Object.entries(scenario.initialFiles)) {
                        const fullPath = filePath.startsWith('/') ? filePath : `/home/user/${filePath}`;
                        
                        // 确保父目录存在
                        const parts = fullPath.split('/').filter(p => p);
                        let currentPath = '';
                        for (let i = 0; i < parts.length - 1; i++) {
                            currentPath += '/' + parts[i];
                            const existingNode = getNode(fs, currentPath);
                            if (!existingNode) {
                                createNode(fs, currentPath, {
                                    name: parts[i],
                                    type: 'directory',
                                    children: new Map(),
                                    permissions: 'drwxr-xr-x',
                                    owner: 'user',
                                    modifiedAt: new Date().toISOString()
                                });
                            }
                        }
                        
                        createNode(fs, fullPath, {
                            name: fullPath.split('/').pop() || 'file',
                            type: 'file',
                            content,
                            permissions: '-rw-r--r--',
                            owner: 'user',
                            modifiedAt: new Date().toISOString()
                        });
                    }
                }
                
                set({
                    currentScenario: scenario,
                    clusterState: mergedState,
                    commandHistory: [],
                    fileSystem: fs,
                    vimMode: null
                });
            },

            /**
             * 检查目标完成情况
             */
            checkObjectives: () => {
                const { currentScenario, clusterState, commandHistory } = get();
                if (!currentScenario) return;

                const updatedObjectives = currentScenario.objectives.map(obj => ({
                    ...obj,
                    completed: obj.checkCondition(clusterState, commandHistory)
                }));

                set({
                    currentScenario: {
                        ...currentScenario,
                        objectives: updatedObjectives
                    }
                });

                // 检查是否所有目标都完成
                const allCompleted = updatedObjectives.every(obj => obj.completed);
                if (allCompleted && !get().completedScenarios.includes(currentScenario.id)) {
                    // 自动完成场景
                    setTimeout(() => {
                        get().completeScenario();
                    }, 500);
                }
            },

            /**
             * 完成场景
             */
            completeScenario: () => {
                const { currentScenario, playerXP, completedScenarios } = get();
                if (!currentScenario) return;

                // 添加到已完成列表
                if (!completedScenarios.includes(currentScenario.id)) {
                    const newXP = playerXP + currentScenario.rewards.xp;
                    set({
                        completedScenarios: [...completedScenarios, currentScenario.id],
                        playerXP: newXP,
                        playerLevel: calculateLevel(newXP)
                    });
                }
            },

            /**
             * 重置当前场景
             */
            resetScenario: () => {
                const { currentScenario } = get();
                if (currentScenario) {
                    get().loadScenario(currentScenario);
                }
            }
        }),
        {
            name: 'k8s-quest-save', // localStorage 键名
            // 只持久化玩家进度数据，不持久化临时状态
            partialize: (state) => ({
                completedScenarios: state.completedScenarios,
                playerXP: state.playerXP,
                playerLevel: state.playerLevel,
            }),
            // 从存储恢复时重新计算等级
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.playerLevel = calculateLevel(state.playerXP);
                }
            },
        }
    )
);

/**
 * 处理 kubectl edit 命令
 */
function handleKubectlEdit(
    command: string, 
    get: () => GameStore, 
    set: (state: Partial<GameStore>) => void
): string | { vimMode: VimMode } {
    const parts = command.trim().split(/\s+/);
    
    // 解析 -n/--namespace 参数
    let namespace = 'default';
    for (let i = 0; i < parts.length; i++) {
        if ((parts[i] === '-n' || parts[i] === '--namespace') && parts[i + 1]) {
            namespace = parts[i + 1];
        }
    }
    
    // 找到 edit 后面的资源类型和名称
    let resourceType = '';
    let resourceName = '';
    let foundEdit = false;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'edit') {
            foundEdit = true;
            continue;
        }
        if (foundEdit && !parts[i].startsWith('-')) {
            if (!resourceType) {
                resourceType = parts[i];
            } else if (!resourceName) {
                resourceName = parts[i];
                break;
            }
        }
        // 跳过 flag 值
        if (parts[i] === '-n' || parts[i] === '--namespace') {
            i++;
        }
    }
    
    if (!resourceType || !resourceName) {
        return 'error: you must specify the type of resource to edit';
    }
    
    const { clusterState } = get();
    let content = '';
    let found = false;
    
    switch (resourceType) {
        case 'deployment':
        case 'deployments':
        case 'deploy':
            const dep = clusterState.deployments.find(d => d.metadata.name === resourceName && d.metadata.namespace === namespace);
            if (dep) {
                content = generateYaml('Deployment', dep);
                found = true;
            }
            break;
        case 'service':
        case 'services':
        case 'svc':
            const svc = clusterState.services.find(s => s.metadata.name === resourceName && s.metadata.namespace === namespace);
            if (svc) {
                content = generateYaml('Service', svc);
                found = true;
            }
            break;
        case 'pod':
        case 'pods':
            const pod = clusterState.pods.find(p => p.metadata.name === resourceName && p.metadata.namespace === namespace);
            if (pod) {
                content = generateYaml('Pod', pod);
                found = true;
            }
            break;
        case 'configmap':
        case 'configmaps':
        case 'cm':
            const cm = clusterState.configMaps.find(c => c.metadata.name === resourceName && c.metadata.namespace === namespace);
            if (cm) {
                content = generateYaml('ConfigMap', cm);
                found = true;
            }
            break;
        case 'hpa':
        case 'horizontalpodautoscaler':
        case 'horizontalpodautoscalers':
            const hpa = clusterState.hpas.find(h => h.metadata.name === resourceName && h.metadata.namespace === namespace);
            if (hpa) {
                content = generateYaml('HorizontalPodAutoscaler', hpa);
                found = true;
            }
            break;
    }
    
    if (!found) {
        return `Error from server (NotFound): ${resourceType} "${resourceName}" not found in namespace "${namespace}"`;
    }
    
    const vimMode: VimMode = {
        active: true,
        filePath: `/tmp/${resourceType}-${resourceName}.yaml`,
        content,
        isNew: false,
        isK8sResource: true,
        resourceType,
        resourceName,
        resourceNamespace: namespace
    };
    
    set({ vimMode });
    return { vimMode };
}

/**
 * 生成资源的 YAML 表示
 */
function generateYaml(kind: string, resource: any): string {
    const lines: string[] = [];
    lines.push(`apiVersion: ${resource.apiVersion || 'v1'}`);
    lines.push(`kind: ${kind}`);
    lines.push('metadata:');
    lines.push(`  name: ${resource.metadata.name}`);
    if (resource.metadata.namespace) {
        lines.push(`  namespace: ${resource.metadata.namespace}`);
    }
    if (resource.metadata.labels) {
        lines.push('  labels:');
        for (const [k, v] of Object.entries(resource.metadata.labels)) {
            lines.push(`    ${k}: ${v}`);
        }
    }
    
    if (resource.spec) {
        lines.push('spec:');
        if (resource.spec.replicas !== undefined) {
            lines.push(`  replicas: ${resource.spec.replicas}`);
        }
        if (resource.spec.selector) {
            lines.push('  selector:');
            if (resource.spec.selector.matchLabels) {
                lines.push('    matchLabels:');
                for (const [k, v] of Object.entries(resource.spec.selector.matchLabels)) {
                    lines.push(`      ${k}: ${v}`);
                }
            }
        }
        if (resource.spec.template) {
            lines.push('  template:');
            lines.push('    metadata:');
            if (resource.spec.template.metadata?.labels) {
                lines.push('      labels:');
                for (const [k, v] of Object.entries(resource.spec.template.metadata.labels)) {
                    lines.push(`        ${k}: ${v}`);
                }
            }
            if (resource.spec.template.spec?.containers) {
                lines.push('    spec:');
                lines.push('      dnsPolicy: ClusterFirst');
                lines.push('      containers:');
                for (const container of resource.spec.template.spec.containers) {
                    lines.push(`      - name: ${container.name}`);
                    lines.push(`        image: ${container.image}`);
                    if (container.imagePullPolicy) {
                        lines.push(`        imagePullPolicy: ${container.imagePullPolicy}`);
                    }
                    if (container.ports && container.ports.length > 0) {
                        lines.push('        ports:');
                        for (const port of container.ports) {
                            lines.push(`        - containerPort: ${port.containerPort}`);
                            if (port.protocol) lines.push(`          protocol: ${port.protocol}`);
                        }
                    }
                    if (container.resources) {
                        lines.push('        resources:');
                        if (container.resources.requests) {
                            lines.push('          requests:');
                            if (container.resources.requests.cpu) lines.push(`            cpu: ${container.resources.requests.cpu}`);
                            if (container.resources.requests.memory) lines.push(`            memory: ${container.resources.requests.memory}`);
                        }
                        if (container.resources.limits) {
                            lines.push('          limits:');
                            if (container.resources.limits.cpu) lines.push(`            cpu: ${container.resources.limits.cpu}`);
                            if (container.resources.limits.memory) lines.push(`            memory: ${container.resources.limits.memory}`);
                        }
                    }
                    if (container.env && container.env.length > 0) {
                        lines.push('        env:');
                        for (const env of container.env) {
                            lines.push(`        - name: ${env.name}`);
                            lines.push(`          value: "${env.value || ''}"`);
                        }
                    }
                }
            }
        }
        if (resource.spec.containers) {
            lines.push('  containers:');
            for (const container of resource.spec.containers) {
                lines.push(`  - name: ${container.name}`);
                lines.push(`    image: ${container.image}`);
                if (container.env && container.env.length > 0) {
                    lines.push('    env:');
                    for (const env of container.env) {
                        lines.push(`    - name: ${env.name}`);
                        lines.push(`      value: "${env.value || ''}"`);
                    }
                }
            }
        }
        if (resource.spec.type) {
            lines.push(`  type: ${resource.spec.type}`);
        }
        if (resource.spec.ports) {
            lines.push('  ports:');
            for (const port of resource.spec.ports) {
                lines.push(`  - port: ${port.port}`);
                if (port.targetPort) lines.push(`    targetPort: ${port.targetPort}`);
                if (port.protocol) lines.push(`    protocol: ${port.protocol}`);
            }
        }
        
        // HPA 特有字段
        if (resource.spec.scaleTargetRef) {
            lines.push('  scaleTargetRef:');
            lines.push(`    apiVersion: ${resource.spec.scaleTargetRef.apiVersion || 'apps/v1'}`);
            lines.push(`    kind: ${resource.spec.scaleTargetRef.kind}`);
            lines.push(`    name: ${resource.spec.scaleTargetRef.name}`);
        }
        if (resource.spec.minReplicas !== undefined) {
            lines.push(`  minReplicas: ${resource.spec.minReplicas}`);
        }
        if (resource.spec.maxReplicas !== undefined) {
            lines.push(`  maxReplicas: ${resource.spec.maxReplicas}`);
        }
        if (resource.spec.metrics) {
            lines.push('  metrics:');
            for (const metric of resource.spec.metrics) {
                lines.push(`  - type: ${metric.type}`);
                if (metric.resource) {
                    lines.push('    resource:');
                    lines.push(`      name: ${metric.resource.name || 'cpu'}`);
                    if (metric.resource.target) {
                        lines.push('      target:');
                        lines.push(`        type: ${metric.resource.target.type || 'Utilization'}`);
                        if (metric.resource.target.averageUtilization !== undefined) {
                            lines.push(`        averageUtilization: ${metric.resource.target.averageUtilization}`);
                        }
                    }
                }
            }
        }
        if (resource.spec.behavior) {
            lines.push('  behavior:');
            if (resource.spec.behavior.scaleDown) {
                lines.push('    scaleDown:');
                if (resource.spec.behavior.scaleDown.stabilizationWindowSeconds !== undefined) {
                    lines.push(`      stabilizationWindowSeconds: ${resource.spec.behavior.scaleDown.stabilizationWindowSeconds}`);
                }
            }
        }
    }
    
    return lines.join('\n');
}

/**
 * 应用 K8s 资源编辑
 */
function applyK8sResourceEdit(state: ClusterState, resourceType: string, resourceName: string, namespace: string, yamlContent: string): ClusterState {
    const newState = { ...state };
    
    // 简单解析 YAML（提取关键字段）
    const lines = yamlContent.split('\n');
    const parsed: any = { env: [], ports: [], resources: {}, priorityClassName: undefined };
    let inEnv = false;
    let inPorts = false;
    let inResources = false;
    let inRequests = false;
    let inLimits = false;
    let currentEnvName = '';
    let currentPort: any = {};
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        const replicasMatch = line.match(/^\s*replicas:\s*(\d+)/);
        if (replicasMatch) {
            parsed.replicas = parseInt(replicasMatch[1]);
        }
        const imageMatch = line.match(/^\s*image:\s*(.+)/);
        if (imageMatch) {
            parsed.image = imageMatch[1].trim().replace(/^["']|["']$/g, '');
        }
        
        // 解析 priorityClassName
        const priorityClassMatch = line.match(/^\s*priorityClassName:\s*(\S+)/);
        if (priorityClassMatch) {
            parsed.priorityClassName = priorityClassMatch[1];
        }
        
        // 解析 ports 部分
        if (line.match(/^\s*ports:\s*$/)) {
            inPorts = true;
            inEnv = false;
            inResources = false;
            continue;
        }
        if (inPorts) {
            const containerPortMatch = line.match(/^\s*-\s*containerPort:\s*(\d+)/);
            if (containerPortMatch) {
                if (currentPort.containerPort) {
                    parsed.ports.push(currentPort);
                }
                currentPort = { containerPort: parseInt(containerPortMatch[1]) };
                continue;
            }
            const protocolMatch = line.match(/^\s*protocol:\s*(\w+)/);
            if (protocolMatch) {
                currentPort.protocol = protocolMatch[1];
                continue;
            }
            // 如果遇到新的顶层字段，结束 ports 解析
            if (line.match(/^\s*\w+:/) && !line.match(/^\s*(containerPort|protocol|name):/)) {
                if (currentPort.containerPort) {
                    parsed.ports.push(currentPort);
                    currentPort = {};
                }
                inPorts = false;
            }
        }
        
        // 解析 resources 部分
        if (line.match(/^\s*resources:\s*$/)) {
            inResources = true;
            inPorts = false;
            inEnv = false;
            continue;
        }
        if (inResources) {
            if (line.match(/^\s*requests:\s*$/)) {
                inRequests = true;
                inLimits = false;
                continue;
            }
            if (line.match(/^\s*limits:\s*$/)) {
                inLimits = true;
                inRequests = false;
                continue;
            }
            const cpuMatch = line.match(/^\s*cpu:\s*["']?([^"'\s]+)["']?/);
            if (cpuMatch) {
                if (inRequests) {
                    parsed.resources.requests = parsed.resources.requests || {};
                    parsed.resources.requests.cpu = cpuMatch[1];
                } else if (inLimits) {
                    parsed.resources.limits = parsed.resources.limits || {};
                    parsed.resources.limits.cpu = cpuMatch[1];
                }
                continue;
            }
            const memoryMatch = line.match(/^\s*memory:\s*["']?([^"'\s]+)["']?/);
            if (memoryMatch) {
                if (inRequests) {
                    parsed.resources.requests = parsed.resources.requests || {};
                    parsed.resources.requests.memory = memoryMatch[1];
                } else if (inLimits) {
                    parsed.resources.limits = parsed.resources.limits || {};
                    parsed.resources.limits.memory = memoryMatch[1];
                }
                continue;
            }
            // 如果遇到其他顶层字段，结束 resources 解析
            if (line.match(/^\s*\w+:/) && !line.match(/^\s*(requests|limits|cpu|memory):/)) {
                inResources = false;
                inRequests = false;
                inLimits = false;
            }
        }
        
        // 解析 env 部分
        if (line.match(/^\s*env:\s*$/)) {
            inEnv = true;
            inPorts = false;
            inResources = false;
            continue;
        }
        if (inEnv) {
            const envNameMatch = line.match(/^\s*-\s*name:\s*(.+)/);
            if (envNameMatch) {
                currentEnvName = envNameMatch[1].trim();
                continue;
            }
            const envValueMatch = line.match(/^\s*value:\s*"?([^"]*)"?/);
            if (envValueMatch && currentEnvName) {
                parsed.env.push({ name: currentEnvName, value: envValueMatch[1] });
                currentEnvName = '';
                continue;
            }
            // 如果遇到非 env 相关的行，结束 env 解析
            if (line.match(/^\s*\w+:/) && !line.match(/^\s*(name|value):/)) {
                inEnv = false;
            }
        }
    }
    
    // 处理最后一个 port（如果有）
    if (currentPort.containerPort) {
        parsed.ports.push(currentPort);
    }
    
    switch (resourceType) {
        case 'deployment':
        case 'deployments':
        case 'deploy':
            newState.deployments = state.deployments.map(d => {
                if (d.metadata.name === resourceName) {
                    const updated = { ...d };
                    if (parsed.replicas !== undefined && parsed.replicas !== d.spec.replicas) {
                        // 只有当 replicas 真的变化时才处理
                        updated.spec = { ...updated.spec, replicas: parsed.replicas };
                        updated.status = { 
                            ...updated.status, 
                            replicas: parsed.replicas,
                            readyReplicas: parsed.replicas,
                            availableReplicas: parsed.replicas
                        };
                        
                        // 使用 selector.matchLabels 筛选 Pod
                        const selectorLabels = d.spec.selector.matchLabels;
                        const currentPods = state.pods.filter(p => {
                            const pLabels = p.metadata.labels || {};
                            return Object.entries(selectorLabels).every(([k, v]) => pLabels[k] === v);
                        });
                        
                        if (currentPods.length < parsed.replicas) {
                            // 需要创建更多 Pod
                            const rsHash = Math.random().toString(36).substring(2, 12);
                            for (let i = currentPods.length; i < parsed.replicas; i++) {
                                const podHash = Math.random().toString(36).substring(2, 7);
                                const newPod = {
                                    apiVersion: 'v1' as const,
                                    kind: 'Pod' as const,
                                    metadata: {
                                        name: `${resourceName}-${rsHash}-${podHash}`,
                                        namespace: 'default',
                                        labels: { ...d.spec.template.metadata.labels, 'pod-template-hash': rsHash },
                                        uid: crypto.randomUUID?.() || Math.random().toString(),
                                        creationTimestamp: new Date().toISOString()
                                    },
                                    spec: {
                                        containers: updated.spec.template.spec.containers,
                                        nodeName: state.nodes[1]?.metadata.name || 'node01'
                                    },
                                    status: {
                                        phase: 'Running' as const,
                                        podIP: `10.244.1.${state.pods.length + i + 10}`
                                    }
                                };
                                newState.pods = [...newState.pods, newPod];
                            }
                        } else if (currentPods.length > parsed.replicas) {
                            // 需要删除多余 Pod
                            const toRemove = currentPods.slice(parsed.replicas);
                            newState.pods = state.pods.filter(p => 
                                !toRemove.some(r => r.metadata.name === p.metadata.name)
                            );
                        }
                    }
                    if (parsed.image) {
                        updated.spec.template.spec.containers = 
                            updated.spec.template.spec.containers.map(c => ({
                                ...c,
                                image: parsed.image
                            }));
                    }
                    
                    // 更新 ports
                    if (parsed.ports && parsed.ports.length > 0) {
                        updated.spec = { ...updated.spec };
                        updated.spec.template = { ...updated.spec.template };
                        updated.spec.template.spec = { ...updated.spec.template.spec };
                        updated.spec.template.spec.containers = updated.spec.template.spec.containers.map(c => ({
                            ...c,
                            ports: parsed.ports
                        }));
                    }
                    
                    // 更新 resources
                    if (parsed.resources && (parsed.resources.requests || parsed.resources.limits)) {
                        updated.spec = { ...updated.spec };
                        updated.spec.template = { ...updated.spec.template };
                        updated.spec.template.spec = { ...updated.spec.template.spec };
                        updated.spec.template.spec.containers = updated.spec.template.spec.containers.map(c => ({
                            ...c,
                            resources: {
                                ...c.resources,
                                ...parsed.resources
                            }
                        }));
                    }
                    
                    // 更新 priorityClassName
                    if (parsed.priorityClassName) {
                        updated.spec = { ...updated.spec };
                        updated.spec.template = { ...updated.spec.template };
                        updated.spec.template.spec = { 
                            ...updated.spec.template.spec,
                            priorityClassName: parsed.priorityClassName
                        };
                    }
                    
                    // 检查 env 是否真的有变化（用 JSON 比较）
                    if (parsed.env && parsed.env.length > 0) {
                        const oldEnv = d.spec.template.spec.containers[0]?.env || [];
                        const oldEnvStr = JSON.stringify(oldEnv.map(e => ({ name: e.name, value: e.value || '' })));
                        const newEnvStr = JSON.stringify(parsed.env.map((e: any) => ({ name: e.name, value: e.value || '' })));
                        
                        if (oldEnvStr !== newEnvStr) {
                            updated.spec = { ...updated.spec };
                            updated.spec.template = { ...updated.spec.template };
                            updated.spec.template.spec = { ...updated.spec.template.spec };
                            updated.spec.template.spec.containers = updated.spec.template.spec.containers.map(c => ({
                                ...c,
                                env: parsed.env
                            }));
                            updated.status = { ...updated.status, readyReplicas: updated.spec.replicas, availableReplicas: updated.spec.replicas };
                            
                            // 标记需要滚动更新
                            (updated as any)._needsRollingUpdate = true;
                        }
                    }
                    return updated;
                }
                return d;
            });
            
            // 处理滚动更新
            const updatedDep = newState.deployments.find(d => d.metadata.name === resourceName);
            if (updatedDep && (updatedDep as any)._needsRollingUpdate) {
                delete (updatedDep as any)._needsRollingUpdate;
                
                // 删除旧 Pod（匹配 selector labels）
                const labels = updatedDep.spec.selector.matchLabels;
                newState.pods = newState.pods.filter(p => {
                    const pLabels = p.metadata.labels || {};
                    const matches = Object.entries(labels).every(([k, v]) => pLabels[k] === v);
                    return !matches; // 保留不匹配的
                });
                
                // 创建新的健康 Pod（格式：deployment-replicaset_hash-pod_hash）
                const rsHash = Math.random().toString(36).substring(2, 12);
                for (let i = 0; i < updatedDep.spec.replicas; i++) {
                    const podHash = Math.random().toString(36).substring(2, 7);
                    const container = updatedDep.spec.template.spec.containers[0];
                    newState.pods.push({
                        apiVersion: 'v1',
                        kind: 'Pod',
                        metadata: {
                            name: `${resourceName}-${rsHash}-${podHash}`,
                            namespace: 'default',
                            labels: { ...updatedDep.spec.template.metadata.labels, 'pod-template-hash': rsHash }
                        },
                        spec: {
                            containers: [{ name: container.name, image: container.image, env: container.env }],
                            nodeName: state.nodes[(i + 1) % state.nodes.length]?.metadata.name || 'node01'
                        },
                        status: {
                            phase: 'Running',
                            podIP: `10.244.${i + 1}.${20 + i}`,
                            hostIP: '192.168.1.3'
                        }
                    });
                }
            }
            break;
            
        case 'hpa':
        case 'horizontalpodautoscaler':
        case 'horizontalpodautoscalers':
            // 解析 HPA 特有的字段
            let minReplicas = 1;
            let maxReplicas = 10;
            let stabilizationWindow: number | undefined;
            let inBehavior = false;
            let inScaleDown = false;
            
            for (const line of yamlContent.split('\n')) {
                const minMatch = line.match(/^\s*minReplicas:\s*(\d+)/);
                if (minMatch) minReplicas = parseInt(minMatch[1]);
                
                const maxMatch = line.match(/^\s*maxReplicas:\s*(\d+)/);
                if (maxMatch) maxReplicas = parseInt(maxMatch[1]);
                
                if (line.match(/^\s*behavior:/)) inBehavior = true;
                if (inBehavior && line.match(/^\s*scaleDown:/)) inScaleDown = true;
                
                const stabMatch = line.match(/^\s*stabilizationWindowSeconds:\s*(\d+)/);
                if (stabMatch && inScaleDown) {
                    stabilizationWindow = parseInt(stabMatch[1]);
                }
            }
            
            newState.hpas = state.hpas.map(h => {
                if (h.metadata.name === resourceName && h.metadata.namespace === namespace) {
                    const updated = { ...h };
                    updated.spec = { 
                        ...updated.spec, 
                        minReplicas, 
                        maxReplicas 
                    };
                    if (stabilizationWindow !== undefined) {
                        (updated.spec as any).behavior = {
                            scaleDown: {
                                stabilizationWindowSeconds: stabilizationWindow
                            }
                        };
                    }
                    return updated;
                }
                return h;
            });
            break;
    }
    
    return newState;
}

function getHelpText(): string {
    return `K8s Quest - 可用命令:

\x1b[1;33mKubectl 命令:\x1b[0m
  kubectl get <资源>              - 列出资源 (pods/nodes/deployments/services)
  kubectl describe <资源> <名称>  - 显示资源详情
  kubectl create deployment <名称> --image=<镜像> - 创建 Deployment
  kubectl scale deployment <名称> --replicas=N    - 扩缩容
  kubectl delete <资源> <名称>    - 删除资源
  kubectl edit <资源> <名称>      - 编辑资源配置 (打开vim)
  kubectl logs <pod>              - 查看日志
  kubectl exec <pod> -- <命令>    - 在容器中执行命令

\x1b[1;33mLinux 命令:\x1b[0m
  ls [-la] [路径]    - 列出目录内容
  cd <路径>          - 切换目录
  pwd                - 显示当前路径
  cat <文件>         - 查看文件内容
  vim/vi <文件>      - 编辑文件
  mkdir <目录>       - 创建目录
  touch <文件>       - 创建空文件
  cp <源> <目标>     - 复制文件
  mv <源> <目标>     - 移动/重命名
  rm [-rf] <路径>    - 删除文件/目录
  tree [路径]        - 树形显示目录
  grep <模式> <文件> - 搜索文本

\x1b[1;33mVim 编辑器:\x1b[0m
  i        - 进入插入模式
  Esc      - 退出插入模式
  :w       - 保存
  :q       - 退出
  :wq      - 保存并退出
  :q!      - 强制退出不保存

\x1b[1;33m其他:\x1b[0m
  help     - 显示此帮助
  clear    - 清屏`;
}

/**
 * 解析 YAML 内容并应用到集群
 */
function applyYamlToCluster(yamlContent: string, state: ClusterState): { output: string; newState: ClusterState } {
    const newState = { ...state };
    const lines = yamlContent.split('\n');
    
    // 简单解析 YAML
    let kind = '';
    let name = '';
    let namespace = 'default';
    let image = '';
    let containerName = '';
    let replicas = 1;
    const labels: Record<string, string> = {};
    let inLabels = false;
    let inContainers = false;
    let inEnvFrom = false;
    let inEnv = false;
    let inVolumes = false;
    let inVolumeMounts = false;
    
    // 容器配置
    const envFrom: Array<{ configMapRef?: { name: string }; secretRef?: { name: string } }> = [];
    const env: Array<{ name: string; value?: string; valueFrom?: { configMapKeyRef?: { name: string; key: string }; secretKeyRef?: { name: string; key: string } } }> = [];
    const volumes: Array<{ name: string; configMap?: { name: string }; secret?: { secretName: string }; persistentVolumeClaim?: { claimName: string }; emptyDir?: {} }> = [];
    const volumeMounts: Array<{ name: string; mountPath: string }> = [];
    
    // 资源配置
    let inResources = false;
    let inLimits = false;
    let inRequests = false;
    const resources: { 
        limits?: { cpu?: string; memory?: string }; 
        requests?: { cpu?: string; memory?: string };
    } = {};
    
    let currentEnvName = '';
    let currentVolumeName = '';
    let currentMountName = '';
    let inStatus = false;  // 标记是否在 status 部分（需要完全跳过）
    let inMetadata = false; // 标记是否在 metadata 部分
    let inSpec = false;     // 标记是否在 spec 部分
    
    for (const line of lines) {
        // 遇到 status: 时开始跳过（status 由 k8s 自动管理）
        if (line.match(/^status:/)) { 
            inStatus = true;
            inMetadata = false;
            inSpec = false;
            continue;
        }
        // 如果在 status 部分，跳过所有行
        if (inStatus) continue;
        
        // 跟踪顶层区域
        if (line.match(/^metadata:/)) { inMetadata = true; inSpec = false; }
        if (line.match(/^spec:/)) { inSpec = true; inMetadata = false; }
        
        const kindMatch = line.match(/^kind:\s*(\S+)/);
        if (kindMatch) kind = kindMatch[1];
        
        // 只在 metadata 区域解析资源名称（缩进2空格）
        if (inMetadata && !inSpec) {
            const metaNameMatch = line.match(/^  name:\s*(\S+)/);
            if (metaNameMatch && !name) {
                name = metaNameMatch[1];
            }
        }
        
        // 支持 "name: xxx" 和 "- name: xxx" 两种格式（用于容器、env、volumes等，但不用于资源名称）
        const nameMatch = line.match(/^\s*-?\s*name:\s*(\S+)/);
        if (nameMatch) {
            if (inEnv) {
                currentEnvName = nameMatch[1];
            } else if (inVolumes) {
                currentVolumeName = nameMatch[1];
                volumes.push({ name: currentVolumeName });
            } else if (inVolumeMounts) {
                currentMountName = nameMatch[1];
            } else if (inContainers && !containerName) {
                containerName = nameMatch[1];
            }
            // 注意：资源名称在 metadata 区域单独解析，不在这里处理
        }
        
        const nsMatch = line.match(/^\s*namespace:\s*(\S+)/);
        if (nsMatch) namespace = nsMatch[1];
        
        const imageMatch = line.match(/^\s*image:\s*(\S+)/);
        if (imageMatch) image = imageMatch[1];
        
        // 解析 replicas
        const replicasMatch = line.match(/^\s*replicas:\s*(\d+)/);
        if (replicasMatch) replicas = parseInt(replicasMatch[1], 10);
        
        // 状态切换
        if (line.match(/^\s*labels:/)) { inLabels = true; inEnvFrom = false; inEnv = false; inVolumes = false; inVolumeMounts = false; inResources = false; inLimits = false; inRequests = false; }
        if (line.match(/^\s*containers:/)) { inLabels = false; inContainers = true; inEnvFrom = false; inEnv = false; inResources = false; inLimits = false; inRequests = false; }
        if (line.match(/^\s*envFrom:/)) { inEnvFrom = true; inEnv = false; inLabels = false; inVolumes = false; inVolumeMounts = false; inResources = false; inLimits = false; inRequests = false; }
        if (line.match(/^\s*env:/)) { inEnv = true; inEnvFrom = false; inLabels = false; inVolumes = false; inVolumeMounts = false; inResources = false; inLimits = false; inRequests = false; }
        if (line.match(/^\s*volumes:/)) { inVolumes = true; inEnvFrom = false; inEnv = false; inLabels = false; inVolumeMounts = false; inResources = false; inLimits = false; inRequests = false; }
        if (line.match(/^\s*volumeMounts:/)) { inVolumeMounts = true; inVolumes = false; inEnvFrom = false; inEnv = false; inLabels = false; inResources = false; inLimits = false; inRequests = false; }
        if (line.match(/^\s*resources:/)) { inResources = true; inLimits = false; inRequests = false; inVolumeMounts = false; inVolumes = false; inEnvFrom = false; inEnv = false; inLabels = false; }
        if (line.match(/^\s*limits:/)) { inLimits = true; inRequests = false; }
        if (line.match(/^\s*requests:/)) { inRequests = true; inLimits = false; }
        if (line.match(/^\s*spec:/) && !inContainers) inLabels = false;
        
        // 解析 labels
        if (inLabels) {
            const labelMatch = line.match(/^\s+(\S+):\s*(\S+)/);
            if (labelMatch) labels[labelMatch[1]] = labelMatch[2];
        }
        
        // 解析 envFrom
        if (inEnvFrom) {
            // 支持 configMapRef 和常见错误写法 configMapKeyRef
            const configMapRefMatch = line.match(/^\s*-?\s*configMap(Ref|KeyRef):/);
            if (configMapRefMatch) {
                envFrom.push({ configMapRef: { name: '' } });
            }
            // 支持 secretRef 和常见错误写法 secretKeyRef
            const secretRefMatch = line.match(/^\s*-?\s*secret(Ref|KeyRef):/);
            if (secretRefMatch) {
                envFrom.push({ secretRef: { name: '' } });
            }
            const refNameMatch = line.match(/^\s+name:\s*(\S+)/);
            if (refNameMatch && envFrom.length > 0) {
                const last = envFrom[envFrom.length - 1];
                if (last.configMapRef) last.configMapRef.name = refNameMatch[1];
                if (last.secretRef) last.secretRef.name = refNameMatch[1];
            }
        }
        
        // 解析 env
        if (inEnv) {
            // 支持 value: "xxx", value: xxx, value: (空), value: ""
            const valueMatch = line.match(/^\s+value:\s*(.*)/);
            if (valueMatch && currentEnvName) {
                let val = valueMatch[1].trim();
                // 移除引号
                val = val.replace(/^["']|["']$/g, '');
                env.push({ name: currentEnvName, value: val });
                currentEnvName = '';
            }
            const configMapKeyRefMatch = line.match(/^\s+configMapKeyRef:/);
            if (configMapKeyRefMatch && currentEnvName) {
                env.push({ name: currentEnvName, valueFrom: { configMapKeyRef: { name: '', key: '' } } });
            }
            const secretKeyRefMatch = line.match(/^\s+secretKeyRef:/);
            if (secretKeyRefMatch && currentEnvName) {
                env.push({ name: currentEnvName, valueFrom: { secretKeyRef: { name: '', key: '' } } });
            }
            const keyMatch = line.match(/^\s+key:\s*(\S+)/);
            if (keyMatch && env.length > 0) {
                const last = env[env.length - 1];
                if (last.valueFrom?.configMapKeyRef) last.valueFrom.configMapKeyRef.key = keyMatch[1];
                if (last.valueFrom?.secretKeyRef) last.valueFrom.secretKeyRef.key = keyMatch[1];
            }
            const cmNameMatch = line.match(/^\s+name:\s*(\S+)/);
            if (cmNameMatch && env.length > 0) {
                const last = env[env.length - 1];
                if (last.valueFrom?.configMapKeyRef) last.valueFrom.configMapKeyRef.name = cmNameMatch[1];
                if (last.valueFrom?.secretKeyRef) last.valueFrom.secretKeyRef.name = cmNameMatch[1];
            }
        }
        
        // 解析 volumes
        if (inVolumes && volumes.length > 0) {
            const cmMatch = line.match(/^\s+configMap:/);
            if (cmMatch) volumes[volumes.length - 1].configMap = { name: '' };
            const secretMatch = line.match(/^\s+secret:/);
            if (secretMatch) volumes[volumes.length - 1].secret = { secretName: '' };
            const pvcMatch = line.match(/^\s+persistentVolumeClaim:/);
            if (pvcMatch) volumes[volumes.length - 1].persistentVolumeClaim = { claimName: '' };
            const emptyDirMatch = line.match(/^\s+emptyDir:/);
            if (emptyDirMatch) volumes[volumes.length - 1].emptyDir = {};
            
            const volNameMatch = line.match(/^\s+name:\s*(\S+)/);
            if (volNameMatch) {
                const last = volumes[volumes.length - 1];
                if (last.configMap) last.configMap.name = volNameMatch[1];
            }
            const secretNameMatch = line.match(/^\s+secretName:\s*(\S+)/);
            if (secretNameMatch && volumes[volumes.length - 1].secret) {
                volumes[volumes.length - 1].secret!.secretName = secretNameMatch[1];
            }
            const claimNameMatch = line.match(/^\s+claimName:\s*["']?(\S+?)["']?\s*$/);
            if (claimNameMatch && volumes[volumes.length - 1].persistentVolumeClaim) {
                // 去掉可能残留的引号
                volumes[volumes.length - 1].persistentVolumeClaim!.claimName = claimNameMatch[1].replace(/["']/g, '');
            }
        }
        
        // 解析 volumeMounts
        if (inVolumeMounts) {
            const mountPathMatch = line.match(/^\s+mountPath:\s*(\S+)/);
            if (mountPathMatch && currentMountName) {
                volumeMounts.push({ name: currentMountName, mountPath: mountPathMatch[1] });
                currentMountName = '';
            }
        }
        
        // 解析 resources (limits/requests)
        if (inLimits || inRequests) {
            const cpuMatch = line.match(/^\s+cpu:\s*["']?(\S+?)["']?$/);
            if (cpuMatch) {
                if (inLimits) {
                    if (!resources.limits) resources.limits = {};
                    resources.limits.cpu = cpuMatch[1];
                } else {
                    if (!resources.requests) resources.requests = {};
                    resources.requests.cpu = cpuMatch[1];
                }
            }
            const memoryMatch = line.match(/^\s+memory:\s*["']?(\S+?)["']?$/);
            if (memoryMatch) {
                if (inLimits) {
                    if (!resources.limits) resources.limits = {};
                    resources.limits.memory = memoryMatch[1];
                } else {
                    if (!resources.requests) resources.requests = {};
                    resources.requests.memory = memoryMatch[1];
                }
            }
        }
    }
    
    if (!kind || !name) {
        return { output: 'error: invalid YAML - missing kind or name', newState: state };
    }
    
    switch (kind.toLowerCase()) {
        case 'pod':
            // 检查是否已存在
            const existingPod = newState.pods.find(p => p.metadata.name === name);
            if (existingPod) {
                return { output: `pod/${name} unchanged`, newState };
            }
            
            // 构建容器配置
            const containerSpec: {
                name: string;
                image: string;
                env?: typeof env;
                envFrom?: typeof envFrom;
                volumeMounts?: typeof volumeMounts;
                resources?: typeof resources;
            } = {
                name: containerName || name,
                image: image || 'nginx'
            };
            if (env.length > 0) containerSpec.env = env;
            if (envFrom.length > 0) containerSpec.envFrom = envFrom;
            if (volumeMounts.length > 0) containerSpec.volumeMounts = volumeMounts;
            if (resources.limits || resources.requests) containerSpec.resources = resources;
            
            // 检查资源请求是否超过节点可分配资源
            const checkResourceFit = (): { fits: boolean; reason: string } => {
                const reqMem = resources.requests?.memory || '';
                const reqCpu = resources.requests?.cpu || '';
                
                // 解析内存请求（转为 Mi）
                let memMi = 0;
                if (reqMem.includes('Gi')) memMi = parseInt(reqMem) * 1024;
                else if (reqMem.includes('Mi')) memMi = parseInt(reqMem);
                
                // 解析 CPU 请求（转为 m）
                let cpuM = 0;
                if (reqCpu.includes('m')) cpuM = parseInt(reqCpu);
                else if (reqCpu) cpuM = parseFloat(reqCpu) * 1000;
                
                // 获取可调度节点的资源（排除 control-plane）
                const workerNodes = state.nodes.filter(n => 
                    !n.metadata.name.includes('control') && 
                    !n.spec.unschedulable &&
                    n.status.conditions.find(c => c.type === 'Ready')?.status === 'True'
                );
                
                if (workerNodes.length === 0) {
                    return { fits: false, reason: '0/3 nodes are available: 3 node(s) had untolerable taint.' };
                }
                
                // 检查是否有节点能容纳该 Pod
                for (const node of workerNodes) {
                    const allocMem = node.status.allocatable.memory;
                    const allocCpu = node.status.allocatable.cpu;
                    
                    // 解析节点可分配内存
                    let nodeMemMi = 0;
                    if (allocMem.includes('Gi')) nodeMemMi = parseInt(allocMem) * 1024;
                    else if (allocMem.includes('Mi')) nodeMemMi = parseInt(allocMem);
                    
                    // 解析节点可分配 CPU
                    let nodeCpuM = 0;
                    if (allocCpu.includes('m')) nodeCpuM = parseInt(allocCpu);
                    else if (allocCpu) nodeCpuM = parseFloat(allocCpu) * 1000;
                    
                    // 如果资源足够，可以调度
                    if (memMi <= nodeMemMi && cpuM <= nodeCpuM) {
                        return { fits: true, reason: '' };
                    }
                }
                
                // 没有节点能满足资源需求
                const reasons: string[] = [];
                if (memMi > 0) reasons.push(`${workerNodes.length} Insufficient memory`);
                if (cpuM > 0 && reasons.length === 0) reasons.push(`${workerNodes.length} Insufficient cpu`);
                return { 
                    fits: false, 
                    reason: `0/3 nodes are available: 1 node(s) had untolerable taint, ${reasons.join(', ')}.`
                };
            };
            
            const resourceCheck = checkResourceFit();
            
            // 简单模拟：检查是否有必需的环境变量为空（如 DB_HOST）
            const hasEmptyRequiredEnv = env.some(e => 
                (e.name === 'DB_HOST' || e.name === 'DATABASE_URL') && 
                (!e.value || e.value === '')
            );
            
            // 确定 Pod 状态
            let podPhase: 'Pending' | 'Running' | 'CrashLoopBackOff' = 'Running';
            let podConditions: { type: string; status: string; reason?: string; message?: string }[] | undefined;
            let assignedNode = state.nodes[1]?.metadata.name || 'node01';
            
            if (!resourceCheck.fits) {
                podPhase = 'Pending';
                assignedNode = '';  // 未调度
                podConditions = [{
                    type: 'PodScheduled',
                    status: 'False',
                    reason: 'Unschedulable',
                    message: resourceCheck.reason
                }];
            } else if (hasEmptyRequiredEnv) {
                podPhase = 'CrashLoopBackOff';
            }
            
            const newPod = {
                apiVersion: 'v1' as const,
                kind: 'Pod' as const,
                metadata: {
                    name,
                    namespace,
                    labels,
                    uid: crypto.randomUUID?.() || Math.random().toString(),
                    creationTimestamp: new Date().toISOString()
                },
                spec: {
                    containers: [containerSpec],
                    nodeName: assignedNode,
                    volumes: volumes.length > 0 ? volumes : undefined
                },
                status: {
                    phase: podPhase,
                    podIP: podPhase === 'Running' ? `10.244.1.${state.pods.length + 10}` : undefined,
                    hostIP: podPhase === 'Running' ? '192.168.1.3' : undefined,
                    conditions: podConditions
                }
            };
            newState.pods = [...newState.pods, newPod];
            return { output: `pod/${name} created`, newState };
            
        case 'deployment':
            const existingDep = newState.deployments.find(d => d.metadata.name === name);
            if (existingDep) {
                // 更新现有 Deployment 的 spec
                const updatedDep = { ...existingDep };
                
                // 解析所有容器
                const allContainers: Array<{
                    name: string;
                    image: string;
                    args?: string[];
                    command?: string[];
                    volumeMounts?: typeof volumeMounts;
                    imagePullPolicy?: string;
                    resources?: typeof resources;
                    terminationMessagePath?: string;
                    terminationMessagePolicy?: string;
                }> = [];
                
                // 重新解析 YAML 获取所有容器
                let currentContainer: typeof allContainers[0] | null = null;
                let currentVolumeMounts: typeof volumeMounts = [];
                let parsingContainers = false;
                let parsingVolumeMounts = false;
                let parsingArgs = false;
                let currentArgs: string[] = [];
                
                for (const line of lines) {
                    if (line.match(/^status:/)) break; // 遇到 status 停止解析
                    
                    if (line.match(/^\s*containers:/)) {
                        parsingContainers = true;
                        continue;
                    }
                    if (line.match(/^\s*volumes:/)) {
                        parsingContainers = false;
                        if (currentContainer) {
                            if (currentVolumeMounts.length > 0) currentContainer.volumeMounts = [...currentVolumeMounts];
                            if (currentArgs.length > 0) currentContainer.args = [...currentArgs];
                            allContainers.push(currentContainer);
                            currentContainer = null;
                        }
                        continue;
                    }
                    
                    // 检测 Pod spec 级别的字段，表示容器列表已结束
                    if (parsingContainers && line.match(/^\s+(dnsPolicy|restartPolicy|schedulerName|securityContext|terminationGracePeriodSeconds|serviceAccountName|nodeSelector|affinity|tolerations):/)) {
                        if (currentContainer) {
                            if (currentVolumeMounts.length > 0) currentContainer.volumeMounts = [...currentVolumeMounts];
                            if (currentArgs.length > 0) currentContainer.args = [...currentArgs];
                            allContainers.push(currentContainer);
                            currentContainer = null;
                        }
                        parsingContainers = false;
                        continue;
                    }
                    
                    if (parsingContainers) {
                        // 新容器开始（但不在 volumeMounts 或 args 解析中）
                        if (!parsingVolumeMounts && !parsingArgs) {
                            const containerNameMatch = line.match(/^\s+-\s*name:\s*(\S+)/);
                            if (containerNameMatch) {
                                if (currentContainer) {
                                    if (currentVolumeMounts.length > 0) currentContainer.volumeMounts = [...currentVolumeMounts];
                                    if (currentArgs.length > 0) currentContainer.args = [...currentArgs];
                                    allContainers.push(currentContainer);
                                }
                                currentContainer = { name: containerNameMatch[1], image: '' };
                                currentVolumeMounts = [];
                                currentArgs = [];
                                parsingVolumeMounts = false;
                                parsingArgs = false;
                                continue;
                            }
                        }
                        
                        if (currentContainer) {
                            // 修复 image 解析：支持带引号和不带引号的格式
                            const imgMatch = line.match(/^\s+image:\s*["']?([^"'\s]+)["']?\s*$/);
                            if (imgMatch) {
                                currentContainer.image = imgMatch[1];
                                // 遇到 image: 说明这是新容器的属性，结束 volumeMounts/args 解析
                                parsingVolumeMounts = false;
                                parsingArgs = false;
                            }
                            
                            const ipMatch = line.match(/^\s+imagePullPolicy:\s*(\S+)/);
                            if (ipMatch) {
                                currentContainer.imagePullPolicy = ipMatch[1];
                                parsingVolumeMounts = false;
                                parsingArgs = false;
                            }
                            
                            if (line.match(/^\s+volumeMounts:/)) {
                                parsingVolumeMounts = true;
                                parsingArgs = false;
                                continue;
                            }
                            // 检查 args: 开头（支持内联数组和多行格式）
                            if (line.match(/^\s+args:/)) {
                                // 检查是否是内联数组格式 args: [/bin/sh, -c, '...']
                                const inlineArgsMatch = line.match(/^\s+args:\s*\[(.+)\]/);
                                if (inlineArgsMatch) {
                                    const argsStr = inlineArgsMatch[1];
                                    currentArgs = argsStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
                                    parsingArgs = false;
                                } else {
                                    parsingArgs = true;
                                }
                                parsingVolumeMounts = false;
                                continue;
                            }
                            
                            // 解析 args（多行格式）
                            if (parsingArgs) {
                                const argMatch = line.match(/^\s+-\s*(.+)/);
                                if (argMatch) {
                                    let arg = argMatch[1].trim();
                                    arg = arg.replace(/^["']|["']$/g, '');
                                    currentArgs.push(arg);
                                }
                            }
                            
                            // 解析 volumeMounts
                            if (parsingVolumeMounts) {
                                // volumeMounts 的 - name: 通常缩进 8+ 空格
                                // 容器的 - name: 通常缩进 6 空格
                                // 如果遇到较浅缩进的 - name:，说明是新容器开始
                                const vmNameMatch = line.match(/^(\s+)-\s*name:\s*(\S+)/);
                                if (vmNameMatch) {
                                    const indent = vmNameMatch[1].length;
                                    if (indent <= 6) {
                                        // 这是新容器，结束 volumeMounts 解析
                                        parsingVolumeMounts = false;
                                        // 保存当前容器
                                        if (currentContainer) {
                                            if (currentVolumeMounts.length > 0) currentContainer.volumeMounts = [...currentVolumeMounts];
                                            if (currentArgs.length > 0) currentContainer.args = [...currentArgs];
                                            allContainers.push(currentContainer);
                                        }
                                        // 开始新容器
                                        currentContainer = { name: vmNameMatch[2], image: '' };
                                        currentVolumeMounts = [];
                                        currentArgs = [];
                                        parsingArgs = false;
                                        continue;
                                    } else {
                                        // 这是 volumeMount 的 name
                                        currentVolumeMounts.push({ name: vmNameMatch[2], mountPath: '' });
                                    }
                                }
                                const mpMatch = line.match(/^\s+mountPath:\s*(\S+)/);
                                if (mpMatch && currentVolumeMounts.length > 0) {
                                    currentVolumeMounts[currentVolumeMounts.length - 1].mountPath = mpMatch[1];
                                }
                            }
                        }
                    }
                }
                // 添加最后一个容器
                if (currentContainer) {
                    if (currentVolumeMounts.length > 0) currentContainer.volumeMounts = [...currentVolumeMounts];
                    if (currentArgs.length > 0) currentContainer.args = [...currentArgs];
                    allContainers.push(currentContainer);
                }
                
                // 更新 Deployment spec
                if (allContainers.length > 0) {
                    updatedDep.spec = {
                        ...updatedDep.spec,
                        template: {
                            ...updatedDep.spec.template,
                            spec: {
                                ...updatedDep.spec.template.spec,
                                containers: allContainers as any,
                                volumes: volumes.length > 0 ? volumes as any : updatedDep.spec.template.spec.volumes,
                            }
                        }
                    };
                }
                
                // 更新 deployments 数组
                newState.deployments = newState.deployments.map(d => 
                    d.metadata.name === name ? updatedDep : d
                );
                
                // 更新关联的 Pod
                const podLabel = updatedDep.spec.selector.matchLabels;
                const labelKey = Object.keys(podLabel)[0];
                const labelValue = podLabel[labelKey];
                
                newState.pods = newState.pods.map(p => {
                    if (p.metadata.labels?.[labelKey] === labelValue) {
                        const newContainers = allContainers.length > 0 ? allContainers as any : p.spec.containers;
                        // 更新 containerStatuses 以匹配容器数量
                        const containerStatuses = newContainers.map((c: { name: string; image: string }) => ({
                            name: c.name,
                            ready: true,
                            restartCount: 0,
                            state: { running: { startedAt: new Date().toISOString() } },
                            image: c.image,
                            imageID: `docker://sha256:${Math.random().toString(36).substring(2, 15)}`,
                        }));
                        return {
                            ...p,
                            spec: {
                                ...p.spec,
                                containers: newContainers,
                                volumes: volumes.length > 0 ? volumes as any : p.spec.volumes,
                            },
                            status: {
                                ...p.status,
                                containerStatuses,
                            }
                        };
                    }
                    return p;
                });
                
                return { output: `deployment.apps/${name} configured`, newState };
            }
            
            const newDep = {
                apiVersion: 'apps/v1' as const,
                kind: 'Deployment' as const,
                metadata: {
                    name,
                    namespace,
                    labels,
                    uid: crypto.randomUUID?.() || Math.random().toString()
                },
                spec: {
                    replicas,
                    selector: { matchLabels: { app: name } },
                    template: {
                        metadata: { labels: { app: name } },
                        spec: { 
                            containers: [{ 
                                name: containerName || name, 
                                image: image || 'nginx',
                                ...(volumeMounts.length > 0 ? { volumeMounts } : {}),
                                ...(env.length > 0 ? { env } : {}),
                            }],
                            ...(volumes.length > 0 ? { volumes } : {}),
                        }
                    }
                },
                status: { replicas, readyReplicas: replicas, availableReplicas: replicas }
            };
            newState.deployments = [...newState.deployments, newDep];
            
            // 根据 replicas 创建对应数量的 Pod
            const availableNodes = state.nodes.filter(n => 
                !n.spec.unschedulable && 
                n.status.conditions.find(c => c.type === 'Ready')?.status === 'True'
            );
            
            for (let i = 0; i < replicas; i++) {
                const node = availableNodes[i % availableNodes.length] || availableNodes[0] || state.nodes[1];
                const depPod = {
                    apiVersion: 'v1' as const,
                    kind: 'Pod' as const,
                    metadata: {
                        name: `${name}-${Math.random().toString(36).substring(2, 12)}`,
                        namespace,
                        labels: { app: name },
                        uid: crypto.randomUUID?.() || Math.random().toString(),
                        creationTimestamp: new Date().toISOString()
                    },
                    spec: {
                        containers: [{ name, image: image || 'nginx' }],
                        nodeName: node?.metadata.name || 'node01'
                    },
                    status: {
                        phase: 'Running' as const,
                        podIP: `10.244.${Math.floor(Math.random() * 3) + 1}.${newState.pods.length + 10 + i}`,
                        hostIP: node?.status.addresses[0]?.address || '192.168.1.3'
                    }
                };
                newState.pods = [...newState.pods, depPod];
            }
            return { output: `deployment.apps/${name} created`, newState };
            
        case 'service':
            const existingSvc = newState.services.find(s => s.metadata.name === name);
            if (existingSvc) {
                return { output: `service/${name} unchanged`, newState };
            }
            
            const newSvc = {
                apiVersion: 'v1' as const,
                kind: 'Service' as const,
                metadata: { name, namespace },
                spec: {
                    type: 'ClusterIP' as const,
                    selector: labels,
                    ports: [{ port: 80, targetPort: 80, protocol: 'TCP' as const }],
                    clusterIP: `10.96.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
                },
                status: { loadBalancer: {} }
            };
            newState.services = [...newState.services, newSvc];
            return { output: `service/${name} created`, newState };
            
        case 'gateway':
            const existingGateway = newState.gateways.find(g => g.metadata.name === name);
            if (existingGateway) {
                return { output: `gateway.gateway.networking.k8s.io/${name} unchanged`, newState };
            }
            
            // 解析 Gateway 配置
            const gatewayListeners: { name: string; hostname?: string; port: number; protocol: string; tls?: { mode?: string; certificateRefs?: { name: string; kind?: string; group?: string }[] } }[] = [];
            let inListeners = false;
            let currentListener: { name: string; hostname?: string; port: number; protocol: string; tls?: { mode?: string; certificateRefs?: { name: string; kind?: string; group?: string }[] } } | null = null;
            let gatewayClassName = '';
            let inTls = false;
            let inCertRefs = false;
            
            for (const line of lines) {
                const gcMatch = line.match(/^\s*gatewayClassName:\s*(\S+)/);
                if (gcMatch) gatewayClassName = gcMatch[1];
                
                if (line.match(/^\s*listeners:/)) { inListeners = true; continue; }
                if (line.match(/^\s*tls:/)) { inTls = true; continue; }
                if (line.match(/^\s*certificateRefs:/)) { inCertRefs = true; continue; }
                
                if (inListeners) {
                    const listenerNameMatch = line.match(/^\s+-\s*name:\s*(\S+)/);
                    if (listenerNameMatch) {
                        if (currentListener) gatewayListeners.push(currentListener);
                        currentListener = { name: listenerNameMatch[1], port: 80, protocol: 'HTTP' };
                    }
                    if (currentListener) {
                        const hostnameMatch = line.match(/^\s+hostname:\s*(\S+)/);
                        if (hostnameMatch) currentListener.hostname = hostnameMatch[1];
                        const portMatch = line.match(/^\s+port:\s*(\d+)/);
                        if (portMatch) currentListener.port = parseInt(portMatch[1]);
                        const protocolMatch = line.match(/^\s+protocol:\s*(\S+)/);
                        if (protocolMatch) currentListener.protocol = protocolMatch[1];
                        
                        if (inTls) {
                            const modeMatch = line.match(/^\s+mode:\s*(\S+)/);
                            if (modeMatch) {
                                if (!currentListener.tls) currentListener.tls = {};
                                currentListener.tls.mode = modeMatch[1];
                            }
                        }
                        if (inCertRefs) {
                            const certNameMatch = line.match(/^\s+-\s*name:\s*(\S+)/);
                            if (certNameMatch) {
                                if (!currentListener.tls) currentListener.tls = {};
                                if (!currentListener.tls.certificateRefs) currentListener.tls.certificateRefs = [];
                                currentListener.tls.certificateRefs.push({ name: certNameMatch[1] });
                            }
                        }
                    }
                }
            }
            if (currentListener) gatewayListeners.push(currentListener);
            
            const newGateway = {
                apiVersion: 'gateway.networking.k8s.io/v1' as const,
                kind: 'Gateway' as const,
                metadata: { name, namespace },
                spec: {
                    gatewayClassName: gatewayClassName || 'nginx',
                    listeners: gatewayListeners.length > 0 ? gatewayListeners as any : [{ name: 'http', port: 80, protocol: 'HTTP' as const }]
                },
                status: {
                    conditions: [{ type: 'Accepted', status: 'True' }, { type: 'Programmed', status: 'True' }]
                }
            };
            newState.gateways = [...newState.gateways, newGateway];
            return { output: `gateway.gateway.networking.k8s.io/${name} created`, newState };
            
        case 'httproute':
            const existingRoute = newState.httpRoutes.find(r => r.metadata.name === name);
            if (existingRoute) {
                return { output: `httproute.gateway.networking.k8s.io/${name} unchanged`, newState };
            }
            
            // 解析 HTTPRoute 配置
            const parentRefs: { name: string; namespace?: string }[] = [];
            const hostnames: string[] = [];
            const rules: { matches?: { path?: { type: string; value: string } }[]; backendRefs?: { name: string; port: number }[] }[] = [];
            let inParentRefs = false;
            let inHostnames = false;
            let inRules = false;
            let inMatches = false;
            let inBackendRefs = false;
            let currentRule: { matches?: { path?: { type: string; value: string } }[]; backendRefs?: { name: string; port: number }[] } | null = null;
            
            for (const line of lines) {
                if (line.match(/^\s*parentRefs:/)) { inParentRefs = true; inHostnames = false; inRules = false; continue; }
                if (line.match(/^\s*hostnames:/)) { inHostnames = true; inParentRefs = false; inRules = false; continue; }
                if (line.match(/^\s*rules:/)) { inRules = true; inParentRefs = false; inHostnames = false; continue; }
                if (line.match(/^\s*matches:/)) { inMatches = true; inBackendRefs = false; continue; }
                if (line.match(/^\s*backendRefs:/)) { inBackendRefs = true; inMatches = false; continue; }
                
                if (inParentRefs) {
                    const parentNameMatch = line.match(/^\s+-?\s*name:\s*(\S+)/);
                    if (parentNameMatch) parentRefs.push({ name: parentNameMatch[1] });
                }
                if (inHostnames) {
                    const hostnameMatch = line.match(/^\s+-\s*["']?([^"'\s]+)["']?/);
                    if (hostnameMatch) hostnames.push(hostnameMatch[1]);
                }
                if (inRules) {
                    if (line.match(/^\s+-\s*matches:/)) {
                        if (currentRule) rules.push(currentRule);
                        currentRule = { matches: [], backendRefs: [] };
                        inMatches = true;
                    }
                    if (inMatches && currentRule) {
                        const pathTypeMatch = line.match(/^\s+type:\s*(\S+)/);
                        if (pathTypeMatch && currentRule.matches) {
                            if (currentRule.matches.length === 0) currentRule.matches.push({ path: { type: pathTypeMatch[1], value: '/' } });
                            else currentRule.matches[currentRule.matches.length - 1].path!.type = pathTypeMatch[1];
                        }
                        const pathValueMatch = line.match(/^\s+value:\s*(\S+)/);
                        if (pathValueMatch && currentRule.matches) {
                            if (currentRule.matches.length === 0) currentRule.matches.push({ path: { type: 'PathPrefix', value: pathValueMatch[1] } });
                            else currentRule.matches[currentRule.matches.length - 1].path!.value = pathValueMatch[1];
                        }
                    }
                    if (inBackendRefs && currentRule) {
                        const backendNameMatch = line.match(/^\s+-?\s*name:\s*(\S+)/);
                        if (backendNameMatch) currentRule.backendRefs!.push({ name: backendNameMatch[1], port: 80 });
                        const backendPortMatch = line.match(/^\s+port:\s*(\d+)/);
                        if (backendPortMatch && currentRule.backendRefs!.length > 0) {
                            currentRule.backendRefs![currentRule.backendRefs!.length - 1].port = parseInt(backendPortMatch[1]);
                        }
                    }
                }
            }
            if (currentRule) rules.push(currentRule);
            
            const newHTTPRoute = {
                apiVersion: 'gateway.networking.k8s.io/v1' as const,
                kind: 'HTTPRoute' as const,
                metadata: { name, namespace },
                spec: {
                    parentRefs: parentRefs.length > 0 ? parentRefs : [{ name: 'default-gateway' }],
                    hostnames: hostnames.length > 0 ? hostnames : undefined,
                    rules: rules.length > 0 ? rules as any : [{ backendRefs: [{ name: 'default-svc', port: 80 }] }]
                }
            };
            newState.httpRoutes = [...newState.httpRoutes, newHTTPRoute];
            return { output: `httproute.gateway.networking.k8s.io/${name} created`, newState };
            
        case 'ingress':
            const existingIngress = newState.ingresses.find(i => i.metadata.name === name);
            if (existingIngress) {
                return { output: `ingress.networking.k8s.io/${name} configured`, newState };
            }
            
            // 解析 Ingress 配置
            let ingressClassName = '';
            const ingressRules: Array<{
                host?: string;
                http?: {
                    paths: Array<{
                        path?: string;
                        pathType?: string;
                        backend: {
                            service: { name: string; port: { number: number } }
                        }
                    }>
                }
            }> = [];
            let inIngressRules = false;
            let inHttpPaths = false;
            let currentIngressRule: any = null;
            let currentPath: any = null;
            
            for (const line of lines) {
                const icMatch = line.match(/^\s*ingressClassName:\s*(\S+)/);
                if (icMatch) ingressClassName = icMatch[1];
                
                if (line.match(/^\s*rules:/)) { inIngressRules = true; continue; }
                if (line.match(/^\s*http:/)) { 
                    if (currentIngressRule) currentIngressRule.http = { paths: [] };
                    continue; 
                }
                if (line.match(/^\s*paths:/)) { inHttpPaths = true; continue; }
                
                if (inIngressRules) {
                    const hostMatch = line.match(/^\s+-\s*host:\s*["']?([^"'\s]+)["']?/);
                    if (hostMatch) {
                        if (currentIngressRule) ingressRules.push(currentIngressRule);
                        currentIngressRule = { host: hostMatch[1].replace(/^["']|["']$/g, '') };
                        inHttpPaths = false;
                    }
                    
                    if (inHttpPaths && currentIngressRule?.http) {
                        const pathMatch = line.match(/^\s+-\s*path:\s*(\S+)/);
                        if (pathMatch) {
                            if (currentPath) currentIngressRule.http.paths.push(currentPath);
                            currentPath = { path: pathMatch[1], pathType: 'Prefix', backend: { service: { name: '', port: { number: 80 } } } };
                        }
                        const pathTypeMatch = line.match(/^\s+pathType:\s*(\S+)/);
                        if (pathTypeMatch && currentPath) currentPath.pathType = pathTypeMatch[1];
                        
                        const svcNameMatch = line.match(/^\s+name:\s*(\S+)/);
                        if (svcNameMatch && currentPath && !currentPath.backend.service.name) {
                            currentPath.backend.service.name = svcNameMatch[1];
                        }
                        const portNumMatch = line.match(/^\s+number:\s*(\d+)/);
                        if (portNumMatch && currentPath) {
                            currentPath.backend.service.port.number = parseInt(portNumMatch[1]);
                        }
                    }
                }
            }
            if (currentPath && currentIngressRule?.http) currentIngressRule.http.paths.push(currentPath);
            if (currentIngressRule) ingressRules.push(currentIngressRule);
            
            const newIngress = {
                apiVersion: 'networking.k8s.io/v1' as const,
                kind: 'Ingress' as const,
                metadata: { 
                    name, 
                    namespace, 
                    uid: crypto.randomUUID?.() || Math.random().toString() 
                },
                spec: {
                    ingressClassName: ingressClassName || 'nginx',
                    rules: ingressRules.length > 0 ? ingressRules : [{ host: 'example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'default-svc', port: { number: 80 } } } }] } }]
                },
                status: {
                    loadBalancer: {}
                }
            };
            newState.ingresses = [...newState.ingresses, newIngress as any];
            return { output: `ingress.networking.k8s.io/${name} created`, newState };
            
        case 'configmap':
            const existingCM = newState.configMaps.find(c => c.metadata.name === name && c.metadata.namespace === namespace);
            // 解析 data
            const cmData: Record<string, string> = {};
            let inData = false;
            let currentKey = '';
            let currentValue = '';
            let inMultilineValue = false;
            let inQuotedValue = false;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.match(/^data:/)) { inData = true; continue; }
                if (line.match(/^immutable:/) || line.match(/^kind:/) || line.match(/^metadata:/)) { 
                    if (currentKey && currentValue) {
                        cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
                    }
                    inData = false; 
                    inMultilineValue = false;
                    inQuotedValue = false;
                    currentKey = '';
                    currentValue = '';
                }
                
                if (inData) {
                    // 检查多行值开始 (key: |)
                    const multilineMatch = line.match(/^\s{2}(\S+):\s*\|/);
                    if (multilineMatch) {
                        if (currentKey && currentValue) cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
                        currentKey = multilineMatch[1];
                        currentValue = '';
                        inMultilineValue = true;
                        inQuotedValue = false;
                        continue;
                    }
                    
                    // 检查双引号多行值开始 (key: "...)
                    const quotedStartMatch = line.match(/^\s{2}(\S+):\s*"(.*)$/);
                    if (quotedStartMatch && !inMultilineValue && !inQuotedValue) {
                        if (currentKey && currentValue) cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
                        currentKey = quotedStartMatch[1];
                        const valueStart = quotedStartMatch[2];
                        // 检查是否在同一行结束
                        if (valueStart.endsWith('"')) {
                            cmData[currentKey] = valueStart.slice(0, -1).replace(/\\n/g, '\n');
                            currentKey = '';
                            currentValue = '';
                        } else {
                            currentValue = valueStart + '\n';
                            inQuotedValue = true;
                        }
                        continue;
                    }
                    
                    // 双引号多行值内容
                    if (inQuotedValue) {
                        if (line.endsWith('"')) {
                            currentValue += line.slice(0, -1);
                            cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
                            currentKey = '';
                            currentValue = '';
                            inQuotedValue = false;
                        } else {
                            currentValue += line + '\n';
                        }
                        continue;
                    }
                    
                    // 单行键值对
                    const kvMatch = line.match(/^\s{2}(\S+):\s*(.+)/);
                    if (kvMatch && !inMultilineValue) {
                        if (currentKey && currentValue) cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
                        let value = kvMatch[2];
                        // 去掉引号
                        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        cmData[kvMatch[1]] = value.replace(/\\n/g, '\n');
                        currentKey = '';
                        currentValue = '';
                        continue;
                    }
                    
                    // 多行值内容 (| 格式)
                    if (inMultilineValue && line.match(/^\s{4}/)) {
                        currentValue += line.substring(4) + '\n';
                    } else if (inMultilineValue && !line.match(/^\s{4}/) && line.trim()) {
                        if (currentKey && currentValue) cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
                        inMultilineValue = false;
                        currentKey = '';
                        currentValue = '';
                    }
                }
            }
            if (currentKey && currentValue) cmData[currentKey] = currentValue.replace(/\\n/g, '\n').trim();
            
            // 检查 immutable
            let cmImmutable = false;
            const immutableMatch = yamlContent.match(/immutable:\s*(true|false)/);
            if (immutableMatch) cmImmutable = immutableMatch[1] === 'true';
            
            if (existingCM) {
                // 更新现有 ConfigMap
                newState.configMaps = newState.configMaps.map(c => {
                    if (c.metadata.name === name && c.metadata.namespace === namespace) {
                        return { ...c, data: { ...c.data, ...cmData }, immutable: cmImmutable };
                    }
                    return c;
                });
                return { output: `configmap/${name} configured`, newState };
            }
            
            const newCM = {
                apiVersion: 'v1' as const,
                kind: 'ConfigMap' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                data: cmData,
                immutable: cmImmutable
            };
            newState.configMaps = [...newState.configMaps, newCM];
            return { output: `configmap/${name} created`, newState };
            
        case 'secret':
            const existingSecret = newState.secrets.find(s => s.metadata.name === name && s.metadata.namespace === namespace);
            const secretData: Record<string, string> = {};
            let inSecretData = false;
            
            for (const line of lines) {
                if (line.match(/^data:/)) { inSecretData = true; continue; }
                if (line.match(/^type:/)) { inSecretData = false; }
                
                if (inSecretData) {
                    const kvMatch = line.match(/^\s{2}(\S+):\s*(.+)/);
                    if (kvMatch) secretData[kvMatch[1]] = kvMatch[2];
                }
            }
            
            let secretType = 'Opaque';
            const typeMatch = yamlContent.match(/type:\s*(\S+)/);
            if (typeMatch) secretType = typeMatch[1];
            
            if (existingSecret) {
                newState.secrets = newState.secrets.map(s => {
                    if (s.metadata.name === name && s.metadata.namespace === namespace) {
                        return { ...s, data: { ...s.data, ...secretData } };
                    }
                    return s;
                });
                return { output: `secret/${name} configured`, newState };
            }
            
            const newSecret = {
                apiVersion: 'v1' as const,
                kind: 'Secret' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                type: secretType,
                data: secretData
            };
            newState.secrets = [...newState.secrets, newSecret as any];
            return { output: `secret/${name} created`, newState };
            
        case 'horizontalpodautoscaler':
            const existingHPA = newState.hpas.find(h => h.metadata.name === name && h.metadata.namespace === namespace);
            
            // 解析 HPA spec
            let hpaMinReplicas = 1;
            let hpaMaxReplicas = 10;
            let hpaTargetCPU = 50;
            let scaleTargetRef = { apiVersion: 'apps/v1', kind: 'Deployment', name: '' };
            
            for (const line of lines) {
                const minMatch = line.match(/minReplicas:\s*(\d+)/);
                if (minMatch) hpaMinReplicas = parseInt(minMatch[1]);
                
                const maxMatch = line.match(/maxReplicas:\s*(\d+)/);
                if (maxMatch) hpaMaxReplicas = parseInt(maxMatch[1]);
                
                const cpuMatch = line.match(/averageUtilization:\s*(\d+)/);
                if (cpuMatch) hpaTargetCPU = parseInt(cpuMatch[1]);
                
                const targetNameMatch = line.match(/^\s+name:\s*(\S+)/);
                if (targetNameMatch && !scaleTargetRef.name) scaleTargetRef.name = targetNameMatch[1];
            }
            
            if (existingHPA) {
                newState.hpas = newState.hpas.map(h => {
                    if (h.metadata.name === name && h.metadata.namespace === namespace) {
                        return { ...h, spec: { ...h.spec, minReplicas: hpaMinReplicas, maxReplicas: hpaMaxReplicas } };
                    }
                    return h;
                });
                return { output: `horizontalpodautoscaler.autoscaling/${name} configured`, newState };
            }
            
            const newHPA = {
                apiVersion: 'autoscaling/v2' as const,
                kind: 'HorizontalPodAutoscaler' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                spec: {
                    scaleTargetRef,
                    minReplicas: hpaMinReplicas,
                    maxReplicas: hpaMaxReplicas,
                    metrics: [{ type: 'Resource' as const, resource: { name: 'cpu', target: { type: 'Utilization' as const, averageUtilization: hpaTargetCPU } } }]
                },
                status: { currentReplicas: 1, desiredReplicas: 1 }
            };
            newState.hpas = [...newState.hpas, newHPA];
            return { output: `horizontalpodautoscaler.autoscaling/${name} created`, newState };
            
        case 'persistentvolumeclaim':
        case 'pvc':
            const existingPVC = newState.persistentVolumeClaims.find(p => p.metadata.name === name && p.metadata.namespace === namespace);
            
            let pvcStorage = '1Gi';
            let pvcStorageClassName = '';
            let pvcAccessModes: string[] = ['ReadWriteOnce'];
            
            for (const line of lines) {
                const storageMatch = line.match(/storage:\s*(\S+)/);
                if (storageMatch) pvcStorage = storageMatch[1];
                
                const scMatch = line.match(/storageClassName:\s*(\S+)/);
                if (scMatch) pvcStorageClassName = scMatch[1];
                
                const amMatch = line.match(/^\s+-\s*(ReadWriteOnce|ReadOnlyMany|ReadWriteMany)/);
                if (amMatch) pvcAccessModes = [amMatch[1]];
            }
            
            if (existingPVC) {
                return { output: `persistentvolumeclaim/${name} unchanged`, newState };
            }
            
            const newPVC = {
                apiVersion: 'v1' as const,
                kind: 'PersistentVolumeClaim' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                spec: {
                    accessModes: pvcAccessModes as any,
                    resources: { requests: { storage: pvcStorage } },
                    storageClassName: pvcStorageClassName || undefined
                },
                status: { phase: 'Bound' as const }
            };
            newState.persistentVolumeClaims = [...newState.persistentVolumeClaims, newPVC];
            return { output: `persistentvolumeclaim/${name} created`, newState };
            
        case 'persistentvolume':
        case 'pv':
            const existingPV = newState.persistentVolumes.find(p => p.metadata.name === name);
            
            let pvCapacity = '1Gi';
            let pvAccessModes: string[] = ['ReadWriteOnce'];
            let pvStorageClassName = '';
            let pvHostPath = '/data';
            
            for (const line of lines) {
                const capMatch = line.match(/storage:\s*(\S+)/);
                if (capMatch) pvCapacity = capMatch[1];
                
                const scMatch = line.match(/storageClassName:\s*(\S+)/);
                if (scMatch) pvStorageClassName = scMatch[1];
                
                const amMatch = line.match(/^\s+-\s*(ReadWriteOnce|ReadOnlyMany|ReadWriteMany)/);
                if (amMatch) pvAccessModes = [amMatch[1]];
                
                const pathMatch = line.match(/path:\s*(\S+)/);
                if (pathMatch) pvHostPath = pathMatch[1];
            }
            
            if (existingPV) {
                return { output: `persistentvolume/${name} unchanged`, newState };
            }
            
            const newPV = {
                apiVersion: 'v1' as const,
                kind: 'PersistentVolume' as const,
                metadata: { name, uid: crypto.randomUUID?.() || Math.random().toString() },
                spec: {
                    capacity: { storage: pvCapacity },
                    accessModes: pvAccessModes as any,
                    storageClassName: pvStorageClassName || undefined,
                    hostPath: { path: pvHostPath }
                },
                status: { phase: 'Available' as const }
            };
            newState.persistentVolumes = [...newState.persistentVolumes, newPV as any];
            return { output: `persistentvolume/${name} created`, newState };
            
        case 'storageclass':
            const existingSC = newState.storageClasses.find(s => s.metadata.name === name);
            
            let scProvisioner = 'kubernetes.io/no-provisioner';
            let scReclaimPolicy = 'Retain';
            let scVolumeBindingMode = 'WaitForFirstConsumer';
            let scAnnotations: Record<string, string> = {};
            let inAnnotations = false;
            
            for (const line of lines) {
                const provMatch = line.match(/provisioner:\s*(\S+)/);
                if (provMatch) scProvisioner = provMatch[1];
                
                const rpMatch = line.match(/reclaimPolicy:\s*(\S+)/);
                if (rpMatch) scReclaimPolicy = rpMatch[1];
                
                const vbmMatch = line.match(/volumeBindingMode:\s*(\S+)/);
                if (vbmMatch) scVolumeBindingMode = vbmMatch[1];
                
                // 解析 annotations
                if (line.match(/^\s+annotations:/)) {
                    inAnnotations = true;
                    continue;
                }
                if (inAnnotations) {
                    // 检查是否是 annotation 行（缩进 + key: value）
                    const annotMatch = line.match(/^\s+([a-zA-Z0-9.\-_/]+):\s*["']?(.+?)["']?\s*$/);
                    if (annotMatch) {
                        scAnnotations[annotMatch[1]] = annotMatch[2];
                    } else if (!line.match(/^\s+/)) {
                        inAnnotations = false;
                    }
                }
            }
            
            if (existingSC) {
                return { output: `storageclass.storage.k8s.io/${name} unchanged`, newState };
            }
            
            const newSC = {
                apiVersion: 'storage.k8s.io/v1' as const,
                kind: 'StorageClass' as const,
                metadata: { 
                    name, 
                    uid: crypto.randomUUID?.() || Math.random().toString(),
                    annotations: Object.keys(scAnnotations).length > 0 ? scAnnotations : undefined
                },
                provisioner: scProvisioner,
                reclaimPolicy: scReclaimPolicy,
                volumeBindingMode: scVolumeBindingMode
            };
            newState.storageClasses = [...newState.storageClasses, newSC as any];
            return { output: `storageclass.storage.k8s.io/${name} created`, newState };
            
        case 'networkpolicy':
            const existingNP = newState.networkPolicies.find(n => n.metadata.name === name && n.metadata.namespace === namespace);
            
            if (existingNP) {
                return { output: `networkpolicy.networking.k8s.io/${name} configured`, newState };
            }
            
            // 解析 NetworkPolicy
            const npPolicyTypes: string[] = [];
            const npIngress: Array<{ from?: Array<{ namespaceSelector?: { matchLabels?: Record<string, string> }; podSelector?: { matchLabels?: Record<string, string> } }> }> = [];
            const npEgress: Array<{ to?: Array<{ namespaceSelector?: { matchLabels?: Record<string, string> }; podSelector?: { matchLabels?: Record<string, string> } }> }> = [];
            let npPodSelector: { matchLabels?: Record<string, string> } = {};
            
            let npInPolicyTypes = false;
            let npInIngress = false;
            let npInEgress = false;
            let npInFrom = false;
            let npInPodSelector = false;
            let npInNamespaceSelector = false;
            let npCurrentIngressRule: any = null;
            let npCurrentFrom: any = null;
            
            for (const line of lines) {
                if (line.match(/^\s*policyTypes:/)) { npInPolicyTypes = true; npInIngress = false; npInEgress = false; continue; }
                if (line.match(/^\s*ingress:/)) { npInIngress = true; npInPolicyTypes = false; npInEgress = false; continue; }
                if (line.match(/^\s*egress:/)) { npInEgress = true; npInIngress = false; npInPolicyTypes = false; continue; }
                
                if (npInPolicyTypes) {
                    const typeMatch = line.match(/^\s*-\s*(Ingress|Egress)/);
                    if (typeMatch) npPolicyTypes.push(typeMatch[1]);
                }
                
                // 解析 podSelector（顶层的）
                if (line.match(/^\s{2}podSelector:/) && !npInIngress && !npInEgress) {
                    npInPodSelector = true;
                    continue;
                }
                if (npInPodSelector && !npInIngress && !npInEgress) {
                    const matchLabelsMatch = line.match(/^\s*matchLabels:/);
                    if (matchLabelsMatch) continue;
                    const labelMatch = line.match(/^\s+(\S+):\s*(\S+)/);
                    if (labelMatch) {
                        if (!npPodSelector.matchLabels) npPodSelector.matchLabels = {};
                        npPodSelector.matchLabels[labelMatch[1]] = labelMatch[2];
                    }
                    if (line.match(/^\s{2}\w+:/) && !line.match(/matchLabels/)) {
                        npInPodSelector = false;
                    }
                }
                
                // 解析 ingress rules
                if (npInIngress) {
                    if (line.match(/^\s*-\s*from:/)) {
                        if (npCurrentIngressRule) npIngress.push(npCurrentIngressRule);
                        npCurrentIngressRule = { from: [] };
                        npInFrom = true;
                        continue;
                    }
                    if (npInFrom && npCurrentIngressRule) {
                        if (line.match(/^\s+-\s*namespaceSelector:/)) {
                            if (npCurrentFrom) npCurrentIngressRule.from.push(npCurrentFrom);
                            npCurrentFrom = { namespaceSelector: { matchLabels: {} } };
                            npInNamespaceSelector = true;
                            continue;
                        }
                        if (line.match(/^\s+namespaceSelector:/)) {
                            if (!npCurrentFrom) npCurrentFrom = {};
                            npCurrentFrom.namespaceSelector = { matchLabels: {} };
                            npInNamespaceSelector = true;
                            continue;
                        }
                        if (line.match(/^\s+podSelector:/)) {
                            if (!npCurrentFrom) npCurrentFrom = {};
                            npCurrentFrom.podSelector = { matchLabels: {} };
                            npInNamespaceSelector = false;
                            continue;
                        }
                        const labelMatch = line.match(/^\s+(\S+):\s*(\S+)/);
                        if (labelMatch && npCurrentFrom) {
                            if (npInNamespaceSelector && npCurrentFrom.namespaceSelector) {
                                npCurrentFrom.namespaceSelector.matchLabels[labelMatch[1]] = labelMatch[2];
                            } else if (npCurrentFrom.podSelector) {
                                npCurrentFrom.podSelector.matchLabels[labelMatch[1]] = labelMatch[2];
                            }
                        }
                    }
                }
            }
            // 最后一条规则
            if (npCurrentFrom && npCurrentIngressRule) npCurrentIngressRule.from.push(npCurrentFrom);
            if (npCurrentIngressRule) npIngress.push(npCurrentIngressRule);
            
            const newNP = {
                apiVersion: 'networking.k8s.io/v1' as const,
                kind: 'NetworkPolicy' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                spec: {
                    podSelector: npPodSelector,
                    policyTypes: npPolicyTypes.length > 0 ? npPolicyTypes as any : ['Ingress', 'Egress'],
                    ingress: npIngress.length > 0 ? npIngress as any : [],
                    egress: npEgress.length > 0 ? npEgress as any : []
                }
            };
            newState.networkPolicies = [...newState.networkPolicies, newNP as any];
            return { output: `networkpolicy.networking.k8s.io/${name} created`, newState };
            
        case 'priorityclass':
            const existingPC = newState.priorityClasses.find(p => p.metadata.name === name);
            
            let pcValue = 1000;
            let pcGlobalDefault = false;
            let pcDescription = '';
            
            for (const line of lines) {
                const valueMatch = line.match(/value:\s*(\d+)/);
                if (valueMatch) pcValue = parseInt(valueMatch[1]);
                
                const gdMatch = line.match(/globalDefault:\s*(true|false)/);
                if (gdMatch) pcGlobalDefault = gdMatch[1] === 'true';
                
                const descMatch = line.match(/description:\s*"?([^"]+)"?/);
                if (descMatch) pcDescription = descMatch[1];
            }
            
            if (existingPC) {
                return { output: `priorityclass.scheduling.k8s.io/${name} unchanged`, newState };
            }
            
            const newPC = {
                apiVersion: 'scheduling.k8s.io/v1' as const,
                kind: 'PriorityClass' as const,
                metadata: { name, uid: crypto.randomUUID?.() || Math.random().toString() },
                value: pcValue,
                globalDefault: pcGlobalDefault,
                description: pcDescription
            };
            newState.priorityClasses = [...newState.priorityClasses, newPC];
            return { output: `priorityclass.scheduling.k8s.io/${name} created`, newState };
            
        case 'serviceaccount':
            const existingSA = newState.serviceAccounts.find(s => s.metadata.name === name && s.metadata.namespace === namespace);
            
            if (existingSA) {
                return { output: `serviceaccount/${name} unchanged`, newState };
            }
            
            const newSA = {
                apiVersion: 'v1' as const,
                kind: 'ServiceAccount' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() }
            };
            newState.serviceAccounts = [...newState.serviceAccounts, newSA];
            return { output: `serviceaccount/${name} created`, newState };
            
        case 'role':
            const existingRole = newState.roles.find(r => r.metadata.name === name && r.metadata.namespace === namespace);
            
            if (existingRole) {
                return { output: `role.rbac.authorization.k8s.io/${name} configured`, newState };
            }
            
            const newRole = {
                apiVersion: 'rbac.authorization.k8s.io/v1' as const,
                kind: 'Role' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                rules: []
            };
            newState.roles = [...newState.roles, newRole as any];
            return { output: `role.rbac.authorization.k8s.io/${name} created`, newState };
            
        case 'rolebinding':
            const existingRB = newState.roleBindings.find(r => r.metadata.name === name && r.metadata.namespace === namespace);
            
            if (existingRB) {
                return { output: `rolebinding.rbac.authorization.k8s.io/${name} configured`, newState };
            }
            
            const newRB = {
                apiVersion: 'rbac.authorization.k8s.io/v1' as const,
                kind: 'RoleBinding' as const,
                metadata: { name, namespace, uid: crypto.randomUUID?.() || Math.random().toString() },
                roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: '' },
                subjects: []
            };
            newState.roleBindings = [...newState.roleBindings, newRB as any];
            return { output: `rolebinding.rbac.authorization.k8s.io/${name} created`, newState };
            
        case 'clusterrole':
            const existingCR = newState.clusterRoles.find(r => r.metadata.name === name);
            
            if (existingCR) {
                return { output: `clusterrole.rbac.authorization.k8s.io/${name} configured`, newState };
            }
            
            const newCR = {
                apiVersion: 'rbac.authorization.k8s.io/v1' as const,
                kind: 'ClusterRole' as const,
                metadata: { name, uid: crypto.randomUUID?.() || Math.random().toString() },
                rules: []
            };
            newState.clusterRoles = [...newState.clusterRoles, newCR as any];
            return { output: `clusterrole.rbac.authorization.k8s.io/${name} created`, newState };
            
        case 'clusterrolebinding':
            const existingCRB = newState.clusterRoleBindings.find(r => r.metadata.name === name);
            
            if (existingCRB) {
                return { output: `clusterrolebinding.rbac.authorization.k8s.io/${name} configured`, newState };
            }
            
            const newCRB = {
                apiVersion: 'rbac.authorization.k8s.io/v1' as const,
                kind: 'ClusterRoleBinding' as const,
                metadata: { name, uid: crypto.randomUUID?.() || Math.random().toString() },
                roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: '' },
                subjects: []
            };
            newState.clusterRoleBindings = [...newState.clusterRoleBindings, newCRB as any];
            return { output: `clusterrolebinding.rbac.authorization.k8s.io/${name} created`, newState };
            
        case 'namespace':
            if (newState.namespaces.includes(name)) {
                return { output: `namespace/${name} unchanged`, newState };
            }
            newState.namespaces = [...newState.namespaces, name];
            return { output: `namespace/${name} created`, newState };
            
        default:
            return { output: `error: unknown resource kind "${kind}"`, newState: state };
    }
}

/**
 * 从 YAML 内容删除资源
 */
function deleteFromYaml(yamlContent: string, state: ClusterState): { output: string; newState: ClusterState } {
    const newState = { ...state };
    const lines = yamlContent.split('\n');
    
    // 简单解析 YAML
    let kind = '';
    let name = '';
    let namespace = 'default';
    let inMetadata = false;
    
    for (const line of lines) {
        const kindMatch = line.match(/^kind:\s*(\S+)/);
        if (kindMatch) kind = kindMatch[1];
        
        if (line.match(/^metadata:/)) {
            inMetadata = true;
            continue;
        }
        if (inMetadata && line.match(/^[a-z]/)) {
            inMetadata = false;
        }
        
        if (inMetadata) {
            const nameMatch = line.match(/^\s+name:\s*(\S+)/);
            if (nameMatch && !name) name = nameMatch[1];
            
            const nsMatch = line.match(/^\s+namespace:\s*(\S+)/);
            if (nsMatch) namespace = nsMatch[1];
        }
    }
    
    if (!kind || !name) {
        return { output: 'error: invalid YAML - missing kind or name', newState: state };
    }
    
    switch (kind.toLowerCase()) {
        case 'pod':
            const podIndex = newState.pods.findIndex(p => p.metadata.name === name && p.metadata.namespace === namespace);
            if (podIndex === -1) {
                return { output: `Error from server (NotFound): pods "${name}" not found`, newState: state };
            }
            newState.pods = newState.pods.filter(p => !(p.metadata.name === name && p.metadata.namespace === namespace));
            return { output: `pod "${name}" deleted`, newState };
            
        case 'deployment':
            const depIndex = newState.deployments.findIndex(d => d.metadata.name === name && d.metadata.namespace === namespace);
            if (depIndex === -1) {
                return { output: `Error from server (NotFound): deployments.apps "${name}" not found`, newState: state };
            }
            // 删除关联的 pods
            const dep = newState.deployments[depIndex];
            const depLabels = dep.spec.selector.matchLabels;
            newState.pods = newState.pods.filter(p => {
                if (p.metadata.namespace !== namespace) return true;
                const podLabels = p.metadata.labels || {};
                return !Object.entries(depLabels).every(([k, v]) => podLabels[k] === v);
            });
            newState.deployments = newState.deployments.filter(d => !(d.metadata.name === name && d.metadata.namespace === namespace));
            return { output: `deployment.apps "${name}" deleted`, newState };
            
        case 'service':
            const svcIndex = newState.services.findIndex(s => s.metadata.name === name && s.metadata.namespace === namespace);
            if (svcIndex === -1) {
                return { output: `Error from server (NotFound): services "${name}" not found`, newState: state };
            }
            newState.services = newState.services.filter(s => !(s.metadata.name === name && s.metadata.namespace === namespace));
            return { output: `service "${name}" deleted`, newState };
            
        case 'ingress':
            const ingIndex = newState.ingresses.findIndex(i => i.metadata.name === name && i.metadata.namespace === namespace);
            if (ingIndex === -1) {
                return { output: `Error from server (NotFound): ingresses.networking.k8s.io "${name}" not found`, newState: state };
            }
            newState.ingresses = newState.ingresses.filter(i => !(i.metadata.name === name && i.metadata.namespace === namespace));
            return { output: `ingress.networking.k8s.io "${name}" deleted`, newState };
            
        case 'configmap':
            const cmIndex = newState.configMaps.findIndex(c => c.metadata.name === name && c.metadata.namespace === namespace);
            if (cmIndex === -1) {
                return { output: `Error from server (NotFound): configmaps "${name}" not found`, newState: state };
            }
            newState.configMaps = newState.configMaps.filter(c => !(c.metadata.name === name && c.metadata.namespace === namespace));
            return { output: `configmap "${name}" deleted`, newState };
            
        case 'secret':
            const secIndex = newState.secrets.findIndex(s => s.metadata.name === name && s.metadata.namespace === namespace);
            if (secIndex === -1) {
                return { output: `Error from server (NotFound): secrets "${name}" not found`, newState: state };
            }
            newState.secrets = newState.secrets.filter(s => !(s.metadata.name === name && s.metadata.namespace === namespace));
            return { output: `secret "${name}" deleted`, newState };
            
        case 'networkpolicy':
            const npIndex = newState.networkPolicies.findIndex(np => np.metadata.name === name && np.metadata.namespace === namespace);
            if (npIndex === -1) {
                return { output: `Error from server (NotFound): networkpolicies.networking.k8s.io "${name}" not found`, newState: state };
            }
            newState.networkPolicies = newState.networkPolicies.filter(np => !(np.metadata.name === name && np.metadata.namespace === namespace));
            return { output: `networkpolicy.networking.k8s.io "${name}" deleted`, newState };
            
        case 'horizontalpodautoscaler':
            const hpaIndex = newState.hpas.findIndex(h => h.metadata.name === name && h.metadata.namespace === namespace);
            if (hpaIndex === -1) {
                return { output: `Error from server (NotFound): horizontalpodautoscalers.autoscaling "${name}" not found`, newState: state };
            }
            newState.hpas = newState.hpas.filter(h => !(h.metadata.name === name && h.metadata.namespace === namespace));
            return { output: `horizontalpodautoscaler.autoscaling "${name}" deleted`, newState };
            
        case 'storageclass':
            const scIndex = newState.storageClasses.findIndex(s => s.metadata.name === name);
            if (scIndex === -1) {
                return { output: `Error from server (NotFound): storageclasses.storage.k8s.io "${name}" not found`, newState: state };
            }
            newState.storageClasses = newState.storageClasses.filter(s => s.metadata.name !== name);
            return { output: `storageclass.storage.k8s.io "${name}" deleted`, newState };
            
        case 'persistentvolume':
            const pvDelIndex = newState.persistentVolumes.findIndex(p => p.metadata.name === name);
            if (pvDelIndex === -1) {
                return { output: `Error from server (NotFound): persistentvolumes "${name}" not found`, newState: state };
            }
            newState.persistentVolumes = newState.persistentVolumes.filter(p => p.metadata.name !== name);
            return { output: `persistentvolume "${name}" deleted`, newState };
            
        case 'persistentvolumeclaim':
            const pvcDelIndex = newState.persistentVolumeClaims.findIndex(p => p.metadata.name === name && p.metadata.namespace === namespace);
            if (pvcDelIndex === -1) {
                return { output: `Error from server (NotFound): persistentvolumeclaims "${name}" not found`, newState: state };
            }
            newState.persistentVolumeClaims = newState.persistentVolumeClaims.filter(p => !(p.metadata.name === name && p.metadata.namespace === namespace));
            return { output: `persistentvolumeclaim "${name}" deleted`, newState };
            
        default:
            return { output: `error: the server doesn't have a resource type "${kind}"`, newState: state };
    }
}

/**
 * 处理管道命令
 */
async function handlePipeCommand(
    command: string, 
    get: () => GameStore, 
    set: (partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>)) => void
): Promise<string> {
    const pipeCommands = command.split(/\s*\|\s*/);
    let output = '';
    
    for (let i = 0; i < pipeCommands.length; i++) {
        const cmd = pipeCommands[i].trim();
        if (!cmd) continue;
        
        // 第一个命令正常执行
        if (i === 0) {
            if (cmd.startsWith('kubectl')) {
                const result = await executeKubectl(cmd, get().clusterState);
                set({ clusterState: result.newState });
                output = result.output;
            } else if (cmd.startsWith('echo ')) {
                output = cmd.slice(5).replace(/^["']|["']$/g, '');
            } else if (cmd.startsWith('cat ')) {
                const filename = cmd.slice(4).trim();
                const fs = get().fileSystem;
                const filePath = filename.startsWith('/') 
                    ? filename 
                    : `${fs.currentPath}/${filename}`.replace(/\/+/g, '/');
                const node = getNode(fs, filePath);
                output = node?.type === 'file' ? (node.content || '') : `cat: ${filename}: No such file or directory`;
            } else {
                output = cmd;
            }
            continue;
        }
        
        // 管道后的命令处理
        if (cmd.startsWith('grep ')) {
            const pattern = cmd.slice(5).trim().replace(/^["']|["']$/g, '');
            output = output.split('\n').filter(line => line.includes(pattern)).join('\n');
        } else if (cmd.startsWith('head')) {
            const match = cmd.match(/head(?:\s+-n?\s*(\d+))?/);
            const n = match?.[1] ? parseInt(match[1]) : 10;
            output = output.split('\n').slice(0, n).join('\n');
        } else if (cmd.startsWith('tail')) {
            const match = cmd.match(/tail(?:\s+-n?\s*(\d+))?/);
            const n = match?.[1] ? parseInt(match[1]) : 10;
            output = output.split('\n').slice(-n).join('\n');
        } else if (cmd === 'wc -l') {
            output = String(output.split('\n').filter(l => l).length);
        } else if (cmd === 'base64' || cmd === 'base64 -w0') {
            try { output = btoa(output.trim()); } catch { /* keep */ }
        } else if (cmd === 'base64 -d' || cmd === 'base64 --decode') {
            try { output = atob(output.trim()); } catch { /* keep */ }
        } else if (cmd === 'sort') {
            output = output.split('\n').sort().join('\n');
        } else if (cmd === 'uniq') {
            const lines = output.split('\n');
            output = lines.filter((line, idx) => idx === 0 || line !== lines[idx - 1]).join('\n');
        }
    }
    
    return output;
}
