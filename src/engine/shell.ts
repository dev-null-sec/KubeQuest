/**
 * Linux Shell 命令模拟
 */

import type { FileSystem, FileNode } from './filesystem';
import { 
    resolvePath, getNode, getParentNode, createNode, 
    deleteNode, cloneNode 
} from './filesystem';

export interface ShellResult {
    output: string | null; // null 表示命令未被处理
    newFs: FileSystem;
    // 如果需要进入 vim 模式
    vimMode?: {
        filePath: string;
        content: string;
        isNew: boolean;
    };
}

/**
 * 替换命令中的环境变量
 */
function expandEnvVars(command: string, env: Record<string, string> = {}): string {
    // 替换 $VAR 和 ${VAR} 格式的环境变量
    return command.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (match, varName) => {
        return env[varName] ?? match;
    });
}

/**
 * 执行 shell 命令
 */
export function executeShellCommand(command: string, fs: FileSystem): ShellResult {
    // 确保 env 对象存在
    if (!fs.env) {
        fs = { ...fs, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/user', USER: 'user' } };
    }
    
    // 展开环境变量
    const expandedCommand = expandEnvVars(command, fs.env);
    const parts = parseCommand(expandedCommand);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
        case 'ls':
            return handleLs(args, fs);
        case 'cd':
            return handleCd(args, fs);
        case 'pwd':
            return { output: fs.currentPath, newFs: fs };
        case 'cat':
            return handleCat(args, fs);
        case 'mkdir':
            return handleMkdir(args, fs);
        case 'touch':
            return handleTouch(args, fs);
        case 'rm':
            return handleRm(args, fs);
        case 'cp':
            return handleCp(args, fs);
        case 'mv':
            return handleMv(args, fs);
        case 'echo':
            return handleEcho(args, fs);
        case 'vim':
        case 'vi':
        case 'nano':
            return handleVim(args, fs);
        case 'head':
            return handleHead(args, fs);
        case 'tail':
            return handleTail(args, fs);
        case 'grep':
            return handleGrep(args, fs);
        case 'wc':
            return handleWc(args, fs);
        case 'whoami':
            return { output: 'user', newFs: fs };
        case 'hostname':
            return { output: 'k8s-quest', newFs: fs };
        case 'date':
            return { output: new Date().toString(), newFs: fs };
        case 'uname':
            return { output: 'Linux k8s-quest 5.15.0-k8s #1 SMP x86_64 GNU/Linux', newFs: fs };
        case 'which':
            return handleWhich(args, fs);
        case 'tree':
            return handleTree(args, fs);
        case 'export':
            return handleExport(args, fs);
        case 'env':
        case 'printenv':
            return handleEnv(args, fs);
        case 'unset':
            return handleUnset(args, fs);
        case 'systemctl':
            return handleSystemctl(args, fs);
        case 'sudo':
            // 处理 sudo 命令
            if (args.length === 0) {
                return { output: 'usage: sudo command', newFs: fs };
            }
            // sudo -i 切换到 root 用户
            if (args[0] === '-i' || args[0] === '-s' || args[0] === 'su') {
                return { output: 'root@k8s-quest:~#', newFs: { ...fs, currentPath: '/root' } };
            }
            const sudoCmd = args[0];
            const sudoArgs = args.slice(1);
            if (sudoCmd === 'systemctl') {
                return handleSystemctl(sudoArgs, fs);
            }
            if (sudoCmd === 'dpkg') {
                return handleDpkg(sudoArgs, fs);
            }
            if (sudoCmd === 'sysctl') {
                return handleSysctl(sudoArgs, fs);
            }
            if (sudoCmd === 'vim' || sudoCmd === 'vi' || sudoCmd === 'nano') {
                return handleVim(sudoArgs, fs);
            }
            if (sudoCmd === 'cat') {
                return handleCat(sudoArgs, fs);
            }
            if (sudoCmd === 'ls') {
                return handleLs(sudoArgs, fs);
            }
            return { output: '', newFs: fs };
        case 'exit':
            // exit 命令 - 返回普通用户
            return { output: 'logout', newFs: { ...fs, currentPath: '/home/user' } };
        case 'dpkg':
            return handleDpkg(args, fs);
        case 'sysctl':
            return handleSysctl(args, fs);
        case 'wget':
            return handleWget(args, fs);
        case 'curl':
            return handleCurl(args, fs);
        default:
            return { output: null, newFs: fs }; // null 表示命令未被处理
    }
}

/**
 * 解析命令（处理引号）
 */
function parseCommand(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (const char of command.trim()) {
        if ((char === '"' || char === "'") && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
            inQuotes = false;
            quoteChar = '';
        } else if (char === ' ' && !inQuotes) {
            if (current) {
                parts.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }
    if (current) parts.push(current);
    return parts;
}

/**
 * ls 命令
 */
function handleLs(args: string[], fs: FileSystem): ShellResult {
    const flags = args.filter(a => a.startsWith('-'));
    const paths = args.filter(a => !a.startsWith('-'));
    const targetPath = paths[0] || '.';
    
    const showAll = flags.some(f => f.includes('a'));
    const longFormat = flags.some(f => f.includes('l'));
    
    const node = getNode(fs, targetPath);
    if (!node) {
        return { output: `ls: cannot access '${targetPath}': No such file or directory`, newFs: fs };
    }
    
    if (node.type === 'file') {
        if (longFormat) {
            return { output: formatLongEntry(node), newFs: fs };
        }
        return { output: node.name, newFs: fs };
    }
    
    let entries = Array.from(node.children!.entries());
    if (!showAll) {
        entries = entries.filter(([name]) => !name.startsWith('.'));
    }
    
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    
    if (longFormat) {
        const total = entries.length;
        const lines = [`total ${total}`];
        
        if (showAll) {
            lines.push(formatLongEntry({ name: '.', type: 'directory', permissions: 'drwxr-xr-x', owner: 'user' }));
            lines.push(formatLongEntry({ name: '..', type: 'directory', permissions: 'drwxr-xr-x', owner: 'user' }));
        }
        
        for (const [, entry] of entries) {
            lines.push(formatLongEntry(entry));
        }
        return { output: lines.join('\n'), newFs: fs };
    }
    
    const names = entries.map(([name, entry]) => 
        entry.type === 'directory' ? `\x1b[1;34m${name}\x1b[0m` : name
    );
    return { output: names.join('  '), newFs: fs };
}

function formatLongEntry(node: FileNode): string {
    const perm = node.permissions || (node.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--');
    const owner = node.owner || 'user';
    const size = node.content?.length || 4096;
    const date = 'Dec  2 20:00';
    const name = node.type === 'directory' ? `\x1b[1;34m${node.name}\x1b[0m` : node.name;
    return `${perm} 1 ${owner} ${owner} ${String(size).padStart(5)} ${date} ${name}`;
}

/**
 * cd 命令
 */
function handleCd(args: string[], fs: FileSystem): ShellResult {
    const targetPath = args[0] || '/home/user';
    const absolutePath = resolvePath(fs.currentPath, targetPath);
    const node = getNode(fs, absolutePath);
    
    if (!node) {
        return { output: `cd: ${targetPath}: No such file or directory`, newFs: fs };
    }
    if (node.type !== 'directory') {
        return { output: `cd: ${targetPath}: Not a directory`, newFs: fs };
    }
    
    return { 
        output: '', 
        newFs: { ...fs, currentPath: absolutePath }
    };
}

/**
 * cat 命令
 */
function handleCat(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        return { output: 'cat: missing file operand', newFs: fs };
    }
    
    const outputs: string[] = [];
    for (const path of args) {
        const node = getNode(fs, path);
        if (!node) {
            outputs.push(`cat: ${path}: No such file or directory`);
        } else if (node.type === 'directory') {
            outputs.push(`cat: ${path}: Is a directory`);
        } else {
            outputs.push(node.content || '');
        }
    }
    
    return { output: outputs.join('\n'), newFs: fs };
}

/**
 * mkdir 命令
 */
function handleMkdir(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        return { output: 'mkdir: missing operand', newFs: fs };
    }
    
    const newFs = { ...fs, root: cloneNode(fs.root) };
    const errors: string[] = [];
    
    for (const path of args.filter(a => !a.startsWith('-'))) {
        const existing = getNode(newFs, path);
        if (existing) {
            errors.push(`mkdir: cannot create directory '${path}': File exists`);
            continue;
        }
        
        const success = createNode(newFs, path, {
            name: '',
            type: 'directory',
            permissions: 'drwxr-xr-x',
            owner: 'user',
            children: new Map()
        });
        
        if (!success) {
            errors.push(`mkdir: cannot create directory '${path}': No such file or directory`);
        }
    }
    
    return { output: errors.join('\n'), newFs };
}

/**
 * touch 命令
 */
function handleTouch(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        return { output: 'touch: missing file operand', newFs: fs };
    }
    
    const newFs = { ...fs, root: cloneNode(fs.root) };
    
    for (const path of args) {
        const existing = getNode(newFs, path);
        if (existing) {
            existing.modifiedAt = new Date().toISOString();
            continue;
        }
        
        createNode(newFs, path, {
            name: '',
            type: 'file',
            permissions: '-rw-r--r--',
            owner: 'user',
            content: ''
        });
    }
    
    return { output: '', newFs };
}

/**
 * rm 命令
 */
function handleRm(args: string[], fs: FileSystem): ShellResult {
    const flags = args.filter(a => a.startsWith('-'));
    const paths = args.filter(a => !a.startsWith('-'));
    const recursive = flags.some(f => f.includes('r') || f.includes('R'));
    const force = flags.some(f => f.includes('f'));
    
    if (paths.length === 0) {
        return { output: 'rm: missing operand', newFs: fs };
    }
    
    const newFs = { ...fs, root: cloneNode(fs.root) };
    const errors: string[] = [];
    
    for (const path of paths) {
        const node = getNode(newFs, path);
        if (!node) {
            if (!force) {
                errors.push(`rm: cannot remove '${path}': No such file or directory`);
            }
            continue;
        }
        
        if (node.type === 'directory' && !recursive) {
            errors.push(`rm: cannot remove '${path}': Is a directory`);
            continue;
        }
        
        deleteNode(newFs, path);
    }
    
    return { output: errors.join('\n'), newFs };
}

/**
 * cp 命令
 */
function handleCp(args: string[], fs: FileSystem): ShellResult {
    const flags = args.filter(a => a.startsWith('-'));
    const paths = args.filter(a => !a.startsWith('-'));
    const recursive = flags.some(f => f.includes('r') || f.includes('R'));
    
    if (paths.length < 2) {
        return { output: 'cp: missing destination file operand', newFs: fs };
    }
    
    const source = paths[0];
    const dest = paths[1];
    
    const sourceNode = getNode(fs, source);
    if (!sourceNode) {
        return { output: `cp: cannot stat '${source}': No such file or directory`, newFs: fs };
    }
    
    if (sourceNode.type === 'directory' && !recursive) {
        return { output: `cp: -r not specified; omitting directory '${source}'`, newFs: fs };
    }
    
    const newFs = { ...fs, root: cloneNode(fs.root) };
    const cloned = cloneNode(sourceNode);
    
    // 检查目标是否是目录
    const destNode = getNode(newFs, dest);
    if (destNode && destNode.type === 'directory') {
        cloned.name = sourceNode.name;
        destNode.children!.set(sourceNode.name, cloned);
    } else {
        createNode(newFs, dest, cloned);
    }
    
    return { output: '', newFs };
}

/**
 * mv 命令
 */
function handleMv(args: string[], fs: FileSystem): ShellResult {
    const paths = args.filter(a => !a.startsWith('-'));
    
    if (paths.length < 2) {
        return { output: 'mv: missing destination file operand', newFs: fs };
    }
    
    const source = paths[0];
    const dest = paths[1];
    
    const sourceNode = getNode(fs, source);
    if (!sourceNode) {
        return { output: `mv: cannot stat '${source}': No such file or directory`, newFs: fs };
    }
    
    const newFs = { ...fs, root: cloneNode(fs.root) };
    const cloned = cloneNode(sourceNode);
    
    // 先删除源
    deleteNode(newFs, source);
    
    // 检查目标是否是目录
    const destNode = getNode(newFs, dest);
    if (destNode && destNode.type === 'directory') {
        cloned.name = sourceNode.name;
        destNode.children!.set(sourceNode.name, cloned);
    } else {
        createNode(newFs, dest, cloned);
    }
    
    return { output: '', newFs };
}

/**
 * echo 命令
 */
function handleEcho(args: string[], fs: FileSystem): ShellResult {
    // 检查重定向
    const redirectIndex = args.findIndex(a => a === '>' || a === '>>');
    
    if (redirectIndex === -1) {
        return { output: args.join(' '), newFs: fs };
    }
    
    const text = args.slice(0, redirectIndex).join(' ');
    const append = args[redirectIndex] === '>>';
    const targetPath = args[redirectIndex + 1];
    
    if (!targetPath) {
        return { output: 'bash: syntax error near unexpected token `newline\'', newFs: fs };
    }
    
    const newFs = { ...fs, root: cloneNode(fs.root) };
    const existingNode = getNode(newFs, targetPath);
    
    if (existingNode && existingNode.type === 'file') {
        existingNode.content = append ? (existingNode.content || '') + '\n' + text : text;
    } else if (!existingNode) {
        createNode(newFs, targetPath, {
            name: '',
            type: 'file',
            permissions: '-rw-r--r--',
            owner: 'user',
            content: text
        });
    }
    
    return { output: '', newFs };
}

/**
 * vim 命令 - 返回 vim 模式数据
 */
function handleVim(args: string[], fs: FileSystem): ShellResult {
    const filePath = args[0];
    if (!filePath) {
        return { output: 'vim: missing file argument', newFs: fs };
    }
    
    const absolutePath = resolvePath(fs.currentPath, filePath);
    const node = getNode(fs, absolutePath);
    
    if (node && node.type === 'directory') {
        return { output: `vim: ${filePath} is a directory`, newFs: fs };
    }
    
    return {
        output: '',
        newFs: fs,
        vimMode: {
            filePath: absolutePath,
            content: node?.content || '',
            isNew: !node
        }
    };
}

/**
 * head 命令
 */
function handleHead(args: string[], fs: FileSystem): ShellResult {
    const flags = args.filter(a => a.startsWith('-'));
    const paths = args.filter(a => !a.startsWith('-'));
    
    let lines = 10;
    const nFlag = flags.find(f => f.startsWith('-n'));
    if (nFlag) {
        lines = parseInt(nFlag.slice(2)) || 10;
    }
    
    if (paths.length === 0) {
        return { output: 'head: missing file operand', newFs: fs };
    }
    
    const node = getNode(fs, paths[0]);
    if (!node) {
        return { output: `head: cannot open '${paths[0]}' for reading: No such file or directory`, newFs: fs };
    }
    if (node.type === 'directory') {
        return { output: `head: error reading '${paths[0]}': Is a directory`, newFs: fs };
    }
    
    const content = node.content || '';
    const result = content.split('\n').slice(0, lines).join('\n');
    return { output: result, newFs: fs };
}

/**
 * tail 命令
 */
function handleTail(args: string[], fs: FileSystem): ShellResult {
    const flags = args.filter(a => a.startsWith('-'));
    const paths = args.filter(a => !a.startsWith('-'));
    
    let lines = 10;
    const nFlag = flags.find(f => f.startsWith('-n'));
    if (nFlag) {
        lines = parseInt(nFlag.slice(2)) || 10;
    }
    
    if (paths.length === 0) {
        return { output: 'tail: missing file operand', newFs: fs };
    }
    
    const node = getNode(fs, paths[0]);
    if (!node) {
        return { output: `tail: cannot open '${paths[0]}' for reading: No such file or directory`, newFs: fs };
    }
    if (node.type === 'directory') {
        return { output: `tail: error reading '${paths[0]}': Is a directory`, newFs: fs };
    }
    
    const content = node.content || '';
    const allLines = content.split('\n');
    const result = allLines.slice(-lines).join('\n');
    return { output: result, newFs: fs };
}

/**
 * grep 命令
 */
function handleGrep(args: string[], fs: FileSystem): ShellResult {
    if (args.length < 2) {
        return { output: 'Usage: grep PATTERN [FILE]...', newFs: fs };
    }
    
    const pattern = args[0];
    const filePath = args[1];
    
    const node = getNode(fs, filePath);
    if (!node) {
        return { output: `grep: ${filePath}: No such file or directory`, newFs: fs };
    }
    if (node.type === 'directory') {
        return { output: `grep: ${filePath}: Is a directory`, newFs: fs };
    }
    
    const content = node.content || '';
    const matches = content.split('\n').filter(line => line.includes(pattern));
    
    // 高亮匹配部分
    const highlighted = matches.map(line => 
        line.replace(new RegExp(pattern, 'g'), `\x1b[1;31m${pattern}\x1b[0m`)
    );
    
    return { output: highlighted.join('\n'), newFs: fs };
}

/**
 * wc 命令
 */
function handleWc(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        return { output: 'wc: missing file operand', newFs: fs };
    }
    
    const filePath = args.filter(a => !a.startsWith('-'))[0];
    const node = getNode(fs, filePath);
    
    if (!node) {
        return { output: `wc: ${filePath}: No such file or directory`, newFs: fs };
    }
    if (node.type === 'directory') {
        return { output: `wc: ${filePath}: Is a directory`, newFs: fs };
    }
    
    const content = node.content || '';
    const lines = content.split('\n').length;
    const words = content.split(/\s+/).filter(w => w).length;
    const bytes = content.length;
    
    return { output: `  ${lines}   ${words}  ${bytes} ${filePath}`, newFs: fs };
}

/**
 * which 命令
 */
function handleWhich(args: string[], fs: FileSystem): ShellResult {
    const commands: Record<string, string> = {
        'kubectl': '/usr/local/bin/kubectl',
        'ls': '/bin/ls',
        'cat': '/bin/cat',
        'cd': 'shell built-in',
        'vim': '/usr/bin/vim',
        'grep': '/bin/grep',
        'bash': '/bin/bash'
    };
    
    if (args.length === 0) {
        return { output: '', newFs: fs };
    }
    
    const cmd = args[0];
    const path = commands[cmd];
    return { 
        output: path || `which: no ${cmd} in (/usr/local/bin:/usr/bin:/bin)`, 
        newFs: fs 
    };
}

/**
 * tree 命令
 */
function handleTree(args: string[], fs: FileSystem): ShellResult {
    const targetPath = args[0] || '.';
    const node = getNode(fs, targetPath);
    
    if (!node) {
        return { output: `${targetPath} [error opening dir]`, newFs: fs };
    }
    if (node.type === 'file') {
        return { output: targetPath, newFs: fs };
    }
    
    const lines: string[] = [targetPath];
    let dirCount = 0;
    let fileCount = 0;
    
    function traverse(node: FileNode, prefix: string) {
        if (node.type !== 'directory' || !node.children) return;
        
        const entries = Array.from(node.children.entries())
            .filter(([name]) => !name.startsWith('.'))
            .sort((a, b) => a[0].localeCompare(b[0]));
        
        entries.forEach(([name, child], i) => {
            const isLast = i === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            
            if (child.type === 'directory') {
                dirCount++;
                lines.push(`${prefix}${connector}\x1b[1;34m${name}\x1b[0m`);
                traverse(child, newPrefix);
            } else {
                fileCount++;
                lines.push(`${prefix}${connector}${name}`);
            }
        });
    }
    
    traverse(node, '');
    lines.push(`\n${dirCount} directories, ${fileCount} files`);
    
    return { output: lines.join('\n'), newFs: fs };
}

/**
 * export 命令 - 设置环境变量
 */
function handleExport(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        // 显示所有已导出的环境变量
        const env = fs.env || {};
        const lines = Object.entries(env).map(([k, v]) => `declare -x ${k}="${v}"`);
        return { output: lines.join('\n'), newFs: fs };
    }
    
    const newEnv = { ...(fs.env || {}) };
    
    for (const arg of args) {
        // 支持 export VAR=value 和 export VAR="value" 格式
        const match = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
            const [, name, value] = match;
            // 去除首尾引号
            const cleanValue = value.replace(/^["']|["']$/g, '');
            newEnv[name] = cleanValue;
        } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) {
            // export VAR （从当前环境导出）
            // 如果变量不存在，则设为空
            if (!(arg in newEnv)) {
                newEnv[arg] = '';
            }
        } else {
            return { output: `export: \`${arg}': not a valid identifier`, newFs: fs };
        }
    }
    
    return { output: '', newFs: { ...fs, env: newEnv } };
}

/**
 * env/printenv 命令 - 显示环境变量
 */
function handleEnv(args: string[], fs: FileSystem): ShellResult {
    const env = fs.env || {};
    
    if (args.length === 0) {
        // 显示所有环境变量
        const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
        return { output: lines.join('\n'), newFs: fs };
    }
    
    // 显示指定的环境变量
    const varName = args[0];
    if (varName in env) {
        return { output: env[varName], newFs: fs };
    }
    return { output: '', newFs: fs };
}

/**
 * unset 命令 - 删除环境变量
 */
function handleUnset(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        return { output: '', newFs: fs };
    }
    
    const newEnv = { ...(fs.env || {}) };
    for (const arg of args) {
        delete newEnv[arg];
    }
    
    return { output: '', newFs: { ...fs, env: newEnv } };
}

// ========== 系统管理命令 ==========

// 模拟的服务状态
const serviceStatus: Map<string, { active: boolean; enabled: boolean }> = new Map([
    ['kubelet', { active: true, enabled: true }],
    ['docker', { active: true, enabled: true }],
    ['containerd', { active: true, enabled: true }],
    ['cri-docker', { active: false, enabled: false }],
    ['etcd', { active: true, enabled: true }],
]);

/**
 * systemctl 命令处理
 */
function handleSystemctl(args: string[], fs: FileSystem): ShellResult {
    const action = args[0];
    const service = args[1];
    
    if (!action) {
        return { output: 'Usage: systemctl [start|stop|restart|enable|disable|status] <service>', newFs: fs };
    }
    
    switch (action) {
        case 'start': {
            if (!service) return { output: 'Too few arguments.', newFs: fs };
            const svc = serviceStatus.get(service);
            if (svc) {
                svc.active = true;
                return { output: '', newFs: fs };
            }
            return { output: `Failed to start ${service}.service: Unit ${service}.service not found.`, newFs: fs };
        }
        case 'stop': {
            if (!service) return { output: 'Too few arguments.', newFs: fs };
            const svc = serviceStatus.get(service);
            if (svc) {
                svc.active = false;
                return { output: '', newFs: fs };
            }
            return { output: `Failed to stop ${service}.service: Unit ${service}.service not found.`, newFs: fs };
        }
        case 'restart': {
            if (!service) return { output: 'Too few arguments.', newFs: fs };
            const svc = serviceStatus.get(service);
            if (svc) {
                return { output: '', newFs: fs };
            }
            return { output: `Failed to restart ${service}.service: Unit ${service}.service not found.`, newFs: fs };
        }
        case 'enable': {
            if (!service) return { output: 'Too few arguments.', newFs: fs };
            let svc = serviceStatus.get(service);
            if (!svc) {
                svc = { active: false, enabled: false };
                serviceStatus.set(service, svc);
            }
            svc.enabled = true;
            return { output: `Created symlink /etc/systemd/system/multi-user.target.wants/${service}.service → /lib/systemd/system/${service}.service.`, newFs: fs };
        }
        case 'disable': {
            if (!service) return { output: 'Too few arguments.', newFs: fs };
            const svc = serviceStatus.get(service);
            if (svc) {
                svc.enabled = false;
                return { output: `Removed /etc/systemd/system/multi-user.target.wants/${service}.service.`, newFs: fs };
            }
            return { output: '', newFs: fs };
        }
        case 'status': {
            if (!service) return { output: 'Too few arguments.', newFs: fs };
            const svc = serviceStatus.get(service);
            if (svc) {
                const activeText = svc.active ? 'active (running)' : 'inactive (dead)';
                const enabledText = svc.enabled ? 'enabled' : 'disabled';
                return { 
                    output: `● ${service}.service - ${service.charAt(0).toUpperCase() + service.slice(1)} Service
   Loaded: loaded (/lib/systemd/system/${service}.service; ${enabledText}; vendor preset: enabled)
   Active: ${activeText} since ${new Date().toUTCString()}
 Main PID: ${Math.floor(Math.random() * 10000) + 1000}
    Tasks: ${Math.floor(Math.random() * 50) + 5}
   Memory: ${Math.floor(Math.random() * 500) + 50}M
      CPU: ${Math.floor(Math.random() * 10)}s
   CGroup: /system.slice/${service}.service`, 
                    newFs: fs 
                };
            }
            return { output: `Unit ${service}.service could not be found.`, newFs: fs };
        }
        case 'daemon-reload':
            return { output: '', newFs: fs };
        case 'list-units':
            const units = Array.from(serviceStatus.entries())
                .map(([name, status]) => `${name}.service\t${status.active ? 'active' : 'inactive'}\t${status.enabled ? 'enabled' : 'disabled'}`)
                .join('\n');
            return { output: `UNIT FILE\t\tSTATE\t\tPRESET\n${units}`, newFs: fs };
        default:
            return { output: `Unknown operation '${action}'.`, newFs: fs };
    }
}

/**
 * dpkg 命令处理 - 模拟 Debian 包管理
 */
function handleDpkg(args: string[], fs: FileSystem): ShellResult {
    if (args.length === 0) {
        return { output: 'dpkg: need an action option\nUsage: dpkg -i <package.deb>', newFs: fs };
    }
    
    const action = args[0];
    
    if (action === '-i' || action === '--install') {
        const pkg = args[1];
        if (!pkg) {
            return { output: 'dpkg: need an action option\nUsage: dpkg -i <package.deb>', newFs: fs };
        }
        
        // 检查文件是否存在
        const node = getNode(fs, pkg);
        if (!node) {
            return { output: `dpkg: error processing package ${pkg} (--install):\n cannot access archive: No such file or directory`, newFs: fs };
        }
        
        // 模拟安装过程
        const pkgName = pkg.split('/').pop()?.replace('.deb', '') || 'package';
        return { 
            output: `Selecting previously unselected package ${pkgName}.
(Reading database ... 150000 files and directories currently installed.)
Preparing to unpack ${pkg} ...
Unpacking ${pkgName} ...
Setting up ${pkgName} ...`, 
            newFs: fs 
        };
    }
    
    if (action === '-l' || action === '--list') {
        return { 
            output: `Desired=Unknown/Install/Remove/Purge/Hold
| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend
|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)
||/ Name           Version      Architecture Description
+++-==============-============-============-=================================
ii  apt            2.4.8        amd64        commandline package manager
ii  bash           5.1-6        amd64        GNU Bourne Again SHell
ii  containerd     1.6.0        amd64        container runtime
ii  cri-dockerd    0.3.6.3      amd64        CRI for Docker
ii  docker.io      24.0.5       amd64        Docker container runtime
ii  kubelet        1.28.0       amd64        Kubernetes node agent
ii  kubeadm        1.28.0       amd64        Kubernetes admin tool
ii  kubectl        1.28.0       amd64        Kubernetes CLI`, 
            newFs: fs 
        };
    }
    
    return { output: `dpkg: unknown option '${action}'`, newFs: fs };
}

/**
 * sysctl 命令处理 - 模拟内核参数管理
 */
function handleSysctl(args: string[], fs: FileSystem): ShellResult {
    // 模拟的内核参数
    const sysctlParams: Record<string, string> = {
        'net.bridge.bridge-nf-call-iptables': '1',
        'net.ipv6.conf.all.forwarding': '1',
        'net.ipv4.ip_forward': '1',
        'net.netfilter.nf_conntrack_max': '131072',
        'kernel.hostname': 'k8s-node',
        'vm.swappiness': '0',
    };
    
    if (args.length === 0) {
        // 显示所有参数
        const output = Object.entries(sysctlParams)
            .map(([k, v]) => `${k} = ${v}`)
            .join('\n');
        return { output, newFs: fs };
    }
    
    const action = args[0];
    
    if (action === '-p' || action === '--load') {
        // 加载配置文件
        return { 
            output: `net.bridge.bridge-nf-call-iptables = 1
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
net.netfilter.nf_conntrack_max = 131072`, 
            newFs: fs 
        };
    }
    
    if (action === '-w' || action === '--write') {
        // 写入参数
        const param = args[1];
        if (!param) {
            return { output: 'sysctl: must provide parameter to set', newFs: fs };
        }
        const [key, value] = param.split('=');
        if (key && value !== undefined) {
            sysctlParams[key] = value;
            return { output: `${key} = ${value}`, newFs: fs };
        }
        return { output: `sysctl: cannot parse '${param}'`, newFs: fs };
    }
    
    if (action === '-a' || action === '--all') {
        const output = Object.entries(sysctlParams)
            .map(([k, v]) => `${k} = ${v}`)
            .join('\n');
        return { output, newFs: fs };
    }
    
    // 查询单个参数
    if (action in sysctlParams) {
        return { output: `${action} = ${sysctlParams[action]}`, newFs: fs };
    }
    
    return { output: `sysctl: cannot stat /proc/sys/${action.replace(/\./g, '/')}: No such file or directory`, newFs: fs };
}

/**
 * wget 命令处理 - 模拟文件下载
 */
function handleWget(args: string[], fs: FileSystem): ShellResult {
    // 解析参数
    const url = args.find(a => a.startsWith('http://') || a.startsWith('https://'));
    if (!url) {
        return { output: 'wget: missing URL\nUsage: wget [OPTION]... [URL]...', newFs: fs };
    }
    
    // 从 URL 提取文件名
    const urlParts = url.split('/');
    let filename = urlParts[urlParts.length - 1] || 'index.html';
    
    // 检查 -O 参数指定输出文件名
    const oIndex = args.indexOf('-O');
    if (oIndex !== -1 && args[oIndex + 1]) {
        filename = args[oIndex + 1];
    }
    
    // 模拟下载的文件内容
    let content = '';
    if (url.includes('tigera-operator')) {
        content = `# Tigera Operator for Calico
apiVersion: v1
kind: Namespace
metadata:
  name: tigera-operator
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tigera-operator
  namespace: tigera-operator
`;
    } else if (url.includes('custom-resources')) {
        content = `# Calico Custom Resources
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
    - cidr: 192.168.0.0/16
`;
    } else if (url.includes('flannel')) {
        content = `# Flannel CNI
apiVersion: v1
kind: Namespace
metadata:
  name: kube-flannel
`;
    } else {
        content = `# Downloaded from ${url}\n# Content placeholder`;
    }
    
    // 创建文件
    const filePath = filename.startsWith('/') ? filename : `${fs.currentPath}/${filename}`.replace(/\/+/g, '/');
    const newFs = { ...fs };
    const parentInfo = getParentNode(newFs, filePath);
    
    if (parentInfo && parentInfo.parent && parentInfo.parent.children) {
        parentInfo.parent.children.set(filename.split('/').pop() || filename, {
            name: filename.split('/').pop() || filename,
            type: 'file',
            content: content,
            permissions: '-rw-r--r--',
            owner: 'user'
        });
    }
    
    return { 
        output: `--${new Date().toISOString()}--  ${url}
Resolving ${urlParts[2]}... connected.
HTTP request sent, awaiting response... 200 OK
Length: ${content.length} (${(content.length / 1024).toFixed(1)}K) [application/octet-stream]
Saving to: '${filename}'

${filename}              100%[===================>] ${(content.length / 1024).toFixed(1)}K  --.-KB/s    in 0s

${new Date().toISOString()} - '${filename}' saved [${content.length}/${content.length}]`, 
        newFs 
    };
}

/**
 * curl 命令处理 - 模拟 HTTP 请求
 */
function handleCurl(args: string[], fs: FileSystem): ShellResult {
    const url = args.find(a => a.startsWith('http://') || a.startsWith('https://'));
    if (!url) {
        return { output: 'curl: no URL specified!', newFs: fs };
    }
    
    // 检查 -k 参数（忽略 SSL）
    const insecure = args.includes('-k') || args.includes('--insecure');
    
    // 检查 --tls-max 参数
    const tlsMaxIdx = args.findIndex(a => a.startsWith('--tls-max'));
    let tlsMax = '';
    if (tlsMaxIdx !== -1) {
        tlsMax = args[tlsMaxIdx].includes('=') ? args[tlsMaxIdx].split('=')[1] : args[tlsMaxIdx + 1];
    }
    
    // 模拟响应
    let output = '';
    if (url.includes('web.k8snginx.local')) {
        output = `<!DOCTYPE html>
<html>
<head><title>Welcome to nginx!</title></head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, nginx is working correctly.</p>
</body>
</html>`;
    } else {
        output = `{"status": "ok", "url": "${url}"}`;
    }
    
    return { output, newFs: fs };
}
