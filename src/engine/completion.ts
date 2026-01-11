import type { ClusterState } from './cluster';
import type { FileSystem } from './filesystem';
import { getNode } from './filesystem';

/**
 * 命令补全引擎
 * 提供Tab键自动补全功能
 */

// Shell 命令列表
const SHELL_COMMANDS = [
    'ls', 'cd', 'pwd', 'cat', 'vim', 'vi', 'nano', 'mkdir', 'touch', 'rm', 'cp', 'mv',
    'echo', 'head', 'tail', 'grep', 'wc', 'whoami', 'hostname', 'date', 'uname', 'which', 'tree'
];

// kubectl 子命令列表
const KUBECTL_COMMANDS = [
    'get', 'describe', 'run', 'delete', 'create', 'apply', 'logs', 'exec',
    'port-forward', 'scale', 'rollout', 'label', 'annotate', 'expose',
    'edit', 'set', 'taint', 'cordon', 'uncordon', 'drain', 'top',
    'autoscale', 'config', 'cp'
];

// kubectl get/describe/delete 的资源类型
const RESOURCE_TYPES = [
    'pods', 'pod', 'deployments', 'deployment', 'deploy',
    'services', 'service', 'svc', 'nodes', 'node',
    'namespaces', 'namespace', 'ns', 'configmaps', 'configmap', 'cm',
    'secrets', 'secret', 'persistentvolumes', 'pv',
    'persistentvolumeclaims', 'pvc', 'ingress', 'ingresses', 'ing',
    'hpa', 'horizontalpodautoscaler', 'events', 'ev',
    'serviceaccounts', 'sa', 'roles', 'rolebindings',
    'networkpolicies', 'netpol',
    // Gateway API
    'gateways', 'gateway', 'gtw', 'httproutes', 'httproute',
    'gatewayclasses', 'gatewayclass', 'gc',
    // CRD
    'crds', 'crd', 'customresourcedefinitions',
    // 其他
    'storageclasses', 'sc', 'priorityclasses', 'priorityclass'
];

// kubectl create 的资源类型
const CREATE_RESOURCE_TYPES = [
    'deployment', 'service', 'configmap', 'secret', 'namespace',
    'serviceaccount', 'ingress', 'job', 'cronjob', 'role', 'rolebinding',
    'clusterrole', 'clusterrolebinding', 'quota', 'priorityclass',
    'gateway', 'httproute'
];

// kubectl rollout 子命令
const ROLLOUT_SUBCOMMANDS = ['status', 'history', 'undo', 'restart', 'pause', 'resume'];

// kubectl set 子命令
const SET_SUBCOMMANDS = ['image', 'resources', 'env', 'serviceaccount', 'selector', 'subject'];

// kubectl config 子命令
const CONFIG_SUBCOMMANDS = ['view', 'current-context', 'get-contexts', 'use-context', 'set-context'];

// kubectl top 资源类型
const TOP_RESOURCE_TYPES = ['nodes', 'node', 'pods', 'pod'];

// 常用标志
const COMMON_FLAGS: Record<string, string[]> = {
    'get': ['--all-namespaces', '-A', '--namespace', '-n', '--output', '-o', '--watch', '-w', '--selector', '-l', '--show-labels'],
    'describe': ['--namespace', '-n'],
    'delete': ['--namespace', '-n', '--force', '--grace-period', '--all'],
    'create': ['--dry-run', '--namespace', '-n', '--save-config', '-o', '--output'],
    'create-configmap': ['--from-literal', '--from-file', '--from-env-file', '--dry-run', '-o', '--output'],
    'create-secret': ['--from-literal', '--from-file', '--from-env-file', '--type', '--dry-run', '-o', '--output'],
    'create-deployment': ['--image', '--replicas', '--port', '--dry-run', '-o', '--output'],
    'create-service': ['--tcp', '--dry-run', '-o', '--output'],
    'create-role': ['--verb', '--resource', '--resource-name', '--dry-run', '-o', '--output'],
    'create-rolebinding': ['--role', '--clusterrole', '--user', '--serviceaccount', '--dry-run', '-o', '--output'],
    'create-clusterrole': ['--verb', '--resource', '--resource-name', '--dry-run', '-o', '--output'],
    'create-clusterrolebinding': ['--clusterrole', '--user', '--serviceaccount', '--dry-run', '-o', '--output'],
    'run': ['--image', '--replicas', '--port', '--dry-run', '--restart', '--env', '--labels', '-o', '--output'],
    'apply': ['--filename', '-f', '--dry-run', '--force', '--prune'],
    'logs': ['--follow', '-f', '--tail', '--previous', '-p', '--container', '-c', '--timestamps'],
    'exec': ['--stdin', '-i', '--tty', '-t', '--container', '-c'],
    'scale': ['--replicas', '--current-replicas', '--resource-version'],
    'expose': ['--port', '--target-port', '--type', '--name', '--protocol', '--selector'],
    'label': ['--overwrite', '--all', '--resource-version'],
    'autoscale': ['--min', '--max', '--cpu', '--name'],
    'rollout': ['--namespace', '-n'],
    'set': ['--all', '--dry-run', '-o'],
    'default': ['--namespace', '-n', '--output', '-o']
};

/**
 * 获取命令补全建议
 */
export function getCompletions(input: string, state: ClusterState, fileSystem?: FileSystem): string[] {
    const trimmedInput = input.trimStart();
    const parts = trimmedInput.split(/\s+/);
    const endsWithSpace = input.endsWith(' ');

    // 空输入
    if (parts.length === 0 || trimmedInput === '') {
        return ['kubectl', 'help', 'clear', ...SHELL_COMMANDS];
    }

    const lastPart = endsWithSpace ? '' : parts[parts.length - 1];
    const prefix = endsWithSpace ? input : input.slice(0, input.lastIndexOf(lastPart));
    const effectiveParts = endsWithSpace ? parts : parts.slice(0, -1);

    // 第一个词补全
    if (effectiveParts.length === 0) {
        const allCommands = ['kubectl', 'help', 'clear', ...SHELL_COMMANDS];
        return filterAndComplete(allCommands, lastPart, '');
    }

    const firstCmd = effectiveParts[0];
    
    // Shell 命令补全
    if (SHELL_COMMANDS.includes(firstCmd) && fileSystem) {
        return handleShellCompletion(effectiveParts, lastPart, prefix, fileSystem);
    }

    // 非 kubectl 命令
    if (firstCmd !== 'kubectl') {
        return [];
    }

    // kubectl 后面 - 补全子命令
    if (effectiveParts.length === 1) {
        return filterAndComplete(KUBECTL_COMMANDS, lastPart, prefix);
    }

    // 检查是否在 -n 或 --namespace 之后需要补全 namespace
    const lastEffectiveArg = effectiveParts[effectiveParts.length - 1];
    if (lastEffectiveArg === '-n' || lastEffectiveArg === '--namespace') {
        return filterAndComplete(state.namespaces, lastPart, prefix);
    }

    // 检查是否在 -f 或 --filename 之后需要文件补全
    if (fileSystem) {
        if (lastEffectiveArg === '-f' || lastEffectiveArg === '--filename') {
            return getFileCompletions(lastPart, prefix, fileSystem, true);
        }
    }

    // 检查是否在 -o 或 --output 之后需要补全输出格式
    if (lastEffectiveArg === '-o' || lastEffectiveArg === '--output') {
        const outputFormats = ['wide', 'yaml', 'json', 'name', 'jsonpath=', 'custom-columns='];
        return filterAndComplete(outputFormats, lastPart, prefix);
    }

    // 找到实际的 action（跳过 flags）
    let action = '';
    for (let i = 1; i < effectiveParts.length; i++) {
        const part = effectiveParts[i];
        if (!part.startsWith('-') && effectiveParts[i-1] !== '-n' && effectiveParts[i-1] !== '--namespace' && 
            effectiveParts[i-1] !== '-o' && effectiveParts[i-1] !== '--output' &&
            effectiveParts[i-1] !== '-f' && effectiveParts[i-1] !== '--filename') {
            action = part;
            break;
        }
    }
    
    // 如果没有找到 action，补全子命令
    if (!action) {
        return filterAndComplete(KUBECTL_COMMANDS, lastPart, prefix);
    }

    // 根据不同命令提供不同补全
    switch (action) {
        case 'get':
        case 'describe':
        case 'delete':
        case 'edit':
            return handleResourceCompletion(effectiveParts, lastPart, prefix, state);

        case 'create':
            return handleCreateCompletion(effectiveParts, lastPart, prefix, state);
            
        case 'apply':
            return handleApplyCompletion(effectiveParts, lastPart, prefix, fileSystem);

        case 'logs':
        case 'exec':
        case 'port-forward':
            return handlePodCompletion(effectiveParts, lastPart, prefix, state);

        case 'scale':
        case 'autoscale':
            return handleScaleCompletion(effectiveParts, lastPart, prefix, state);

        case 'expose':
            return handleExposeCompletion(effectiveParts, lastPart, prefix, state);

        case 'rollout':
            return handleRolloutCompletion(effectiveParts, lastPart, prefix, state);

        case 'set':
            return handleSetCompletion(effectiveParts, lastPart, prefix, state);

        case 'label':
        case 'annotate':
        case 'taint':
            return handleLabelCompletion(effectiveParts, lastPart, prefix, state);

        case 'cordon':
        case 'uncordon':
        case 'drain':
            return handleNodeCompletion(effectiveParts, lastPart, prefix, state);

        case 'top':
            return handleTopCompletion(effectiveParts, lastPart, prefix, state);

        case 'config':
            return handleConfigCompletion(effectiveParts, lastPart, prefix);

        case 'run':
            return handleRunCompletion(effectiveParts, lastPart, prefix);

        default:
            // 标志补全
            if (lastPart.startsWith('-')) {
                const flags = COMMON_FLAGS[action] || COMMON_FLAGS['default'];
                return filterAndComplete(flags, lastPart, prefix);
            }
            return [];
    }
}

/**
 * 从命令部分中提取非 flag 参数（跳过 -n value, -o value 等）
 */
function extractNonFlagParts(parts: string[]): string[] {
    const result: string[] = [];
    const flagsWithValue = ['-n', '--namespace', '-o', '--output', '-f', '--filename', '-l', '--selector', '-c', '--container'];
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('-')) {
            // 如果是带值的 flag，跳过下一个参数
            if (flagsWithValue.includes(part) && i + 1 < parts.length) {
                i++; // 跳过值
            }
            continue;
        }
        result.push(part);
    }
    return result;
}

/**
 * 从命令中获取指定 flag 的值
 */
function getFlagValue(parts: string[], flag: string, altFlag?: string): string | undefined {
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === flag || (altFlag && parts[i] === altFlag)) {
            return parts[i + 1];
        }
    }
    return undefined;
}

/**
 * get/describe/delete/edit 资源补全
 */
function handleResourceCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // 标志补全优先（以 - 开头）
    if (lastPart.startsWith('-')) {
        const nonFlagParts = extractNonFlagParts(parts);
        const action = nonFlagParts[1];
        const flags = COMMON_FLAGS[action] || COMMON_FLAGS['default'];
        return filterAndComplete(flags, lastPart, prefix);
    }

    // 提取非 flag 部分: ['kubectl', 'get', 'pods', 'name']
    const nonFlagParts = extractNonFlagParts(parts);
    const namespace = getFlagValue(parts, '-n', '--namespace');
    
    // kubectl get <资源类型>
    if (nonFlagParts.length === 2) {
        return filterAndComplete(RESOURCE_TYPES, lastPart, prefix);
    }

    // kubectl get pods <pod名>
    if (nonFlagParts.length === 3) {
        const resourceType = nonFlagParts[2];
        const names = getResourceNames(resourceType, state, namespace);
        if (names.length > 0) {
            return filterAndComplete(names, lastPart, prefix);
        }
    }

    return [];
}

/**
 * create 命令补全
 */
function handleCreateCompletion(parts: string[], lastPart: string, prefix: string, _state: ClusterState): string[] {
    // kubectl create <资源类型>
    if (parts.length === 2) {
        return filterAndComplete(CREATE_RESOURCE_TYPES, lastPart, prefix);
    }

    const resourceType = parts[2];

    // kubectl create service <类型>
    if (resourceType === 'service' && parts.length === 3) {
        return filterAndComplete(['clusterip', 'nodeport', 'loadbalancer', 'externalname'], lastPart, prefix);
    }

    // kubectl create secret <类型>
    if (resourceType === 'secret' && parts.length === 3) {
        return filterAndComplete(['generic', 'docker-registry', 'tls'], lastPart, prefix);
    }

    // 标志补全 - 根据资源类型选择特定的标志
    if (lastPart.startsWith('-')) {
        let flagKey = 'create';
        if (resourceType === 'configmap' || resourceType === 'cm') {
            flagKey = 'create-configmap';
        } else if (resourceType === 'secret') {
            flagKey = 'create-secret';
        } else if (resourceType === 'deployment' || resourceType === 'deploy') {
            flagKey = 'create-deployment';
        } else if (resourceType === 'service' || resourceType === 'svc') {
            flagKey = 'create-service';
        } else if (resourceType === 'role') {
            flagKey = 'create-role';
        } else if (resourceType === 'rolebinding') {
            flagKey = 'create-rolebinding';
        } else if (resourceType === 'clusterrole') {
            flagKey = 'create-clusterrole';
        } else if (resourceType === 'clusterrolebinding') {
            flagKey = 'create-clusterrolebinding';
        }
        return filterAndComplete(COMMON_FLAGS[flagKey] || COMMON_FLAGS['create'], lastPart, prefix);
    }

    return [];
}

/**
 * logs/exec/port-forward 补全 - 直接补全 pod 名
 */
function handlePodCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // kubectl logs <pod名>
    if (parts.length === 2) {
        const podNames = state.pods.map(p => p.metadata.name);
        return filterAndComplete(podNames, lastPart, prefix);
    }

    // 标志补全
    if (lastPart.startsWith('-')) {
        return filterAndComplete(COMMON_FLAGS[parts[1]] || COMMON_FLAGS['default'], lastPart, prefix);
    }

    return [];
}

/**
 * scale/autoscale 补全
 */
function handleScaleCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // 标志补全优先（以 - 开头）
    if (lastPart.startsWith('-')) {
        const nonFlagParts = extractNonFlagParts(parts);
        const action = nonFlagParts[1]; // scale 或 autoscale
        const flags = COMMON_FLAGS[action] || COMMON_FLAGS['scale'];
        return filterAndComplete(flags, lastPart, prefix);
    }

    // 提取非 flag 部分: ['kubectl', 'autoscale', 'deployment', 'name']
    const nonFlagParts = extractNonFlagParts(parts);
    const namespace = getFlagValue(parts, '-n', '--namespace');

    // kubectl scale/autoscale <资源类型>
    if (nonFlagParts.length === 2) {
        return filterAndComplete(['deployment', 'deploy', 'statefulset', 'sts'], lastPart, prefix);
    }

    // kubectl scale/autoscale deployment <名称>
    if (nonFlagParts.length === 3) {
        const resourceType = nonFlagParts[2];
        if (resourceType === 'deployment' || resourceType === 'deploy') {
            const names = state.deployments
                .filter(d => !namespace || d.metadata.namespace === namespace)
                .map(d => d.metadata.name);
            return filterAndComplete(names, lastPart, prefix);
        }
        if (resourceType === 'statefulset' || resourceType === 'sts') {
            const names = state.statefulSets
                .filter(s => !namespace || s.metadata.namespace === namespace)
                .map(s => s.metadata.name);
            return filterAndComplete(names, lastPart, prefix);
        }
    }

    return [];
}

/**
 * expose 补全
 */
function handleExposeCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // 标志补全优先
    if (lastPart.startsWith('-')) {
        return filterAndComplete(COMMON_FLAGS['expose'], lastPart, prefix);
    }

    // 提取非 flag 部分: ['kubectl', 'expose', 'deployment', 'name']
    const nonFlagParts = extractNonFlagParts(parts);
    const namespace = getFlagValue(parts, '-n', '--namespace');

    // kubectl expose <资源类型>
    if (nonFlagParts.length === 2) {
        return filterAndComplete(['deployment', 'pod', 'service', 'replicaset'], lastPart, prefix);
    }

    // kubectl expose deployment <名称>
    if (nonFlagParts.length === 3) {
        const resourceType = nonFlagParts[2];
        const names = getResourceNames(resourceType, state, namespace);
        return filterAndComplete(names, lastPart, prefix);
    }

    return [];
}

/**
 * rollout 补全
 */
function handleRolloutCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // kubectl rollout <子命令>
    if (parts.length === 2) {
        return filterAndComplete(ROLLOUT_SUBCOMMANDS, lastPart, prefix);
    }

    // kubectl rollout status <资源类型>
    if (parts.length === 3) {
        return filterAndComplete(['deployment', 'daemonset', 'statefulset'], lastPart, prefix);
    }

    // kubectl rollout status deployment <名称>
    if (parts.length === 4) {
        const resourceType = parts[3];
        if (resourceType === 'deployment' || resourceType === 'deploy') {
            const names = state.deployments.map(d => d.metadata.name);
            return filterAndComplete(names, lastPart, prefix);
        }
    }

    return [];
}

/**
 * set 补全
 */
function handleSetCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // kubectl set <子命令>
    if (parts.length === 2) {
        return filterAndComplete(SET_SUBCOMMANDS, lastPart, prefix);
    }

    // kubectl set image <资源>
    if (parts.length === 3 && parts[2] === 'image') {
        const deploymentPaths = state.deployments.map(d => `deployment/${d.metadata.name}`);
        return filterAndComplete(deploymentPaths, lastPart, prefix);
    }

    return [];
}

/**
 * label/annotate/taint 补全
 */
function handleLabelCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // kubectl label <资源类型>
    if (parts.length === 2) {
        return filterAndComplete(['node', 'pod', 'deployment', 'service', 'namespace'], lastPart, prefix);
    }

    // kubectl label node <名称>
    if (parts.length === 3) {
        const resourceType = parts[2];
        const names = getResourceNames(resourceType, state);
        return filterAndComplete(names, lastPart, prefix);
    }

    return [];
}

/**
 * cordon/uncordon/drain 节点补全
 */
function handleNodeCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // kubectl cordon <节点名>
    if (parts.length === 2) {
        const nodeNames = state.nodes.map(n => n.metadata.name);
        return filterAndComplete(nodeNames, lastPart, prefix);
    }

    return [];
}

/**
 * top 补全
 */
function handleTopCompletion(parts: string[], lastPart: string, prefix: string, state: ClusterState): string[] {
    // kubectl top <资源类型>
    if (parts.length === 2) {
        return filterAndComplete(TOP_RESOURCE_TYPES, lastPart, prefix);
    }

    return [];
}

/**
 * config 补全
 */
function handleConfigCompletion(parts: string[], lastPart: string, prefix: string): string[] {
    // kubectl config <子命令>
    if (parts.length === 2) {
        return filterAndComplete(CONFIG_SUBCOMMANDS, lastPart, prefix);
    }

    return [];
}

/**
 * run 补全
 */
function handleRunCompletion(parts: string[], lastPart: string, prefix: string): string[] {
    // 标志补全
    if (lastPart.startsWith('-')) {
        return filterAndComplete(COMMON_FLAGS['run'], lastPart, prefix);
    }

    return [];
}

/**
 * 根据资源类型获取资源名称列表（支持按 namespace 过滤）
 */
function getResourceNames(resourceType: string, state: ClusterState, namespace?: string): string[] {
    const ns = namespace || 'default';
    
    switch (resourceType) {
        case 'pod':
        case 'pods':
            return state.pods
                .filter(p => !namespace || p.metadata.namespace === ns)
                .map(p => p.metadata.name);

        case 'node':
        case 'nodes':
            return state.nodes.map(n => n.metadata.name);

        case 'deployment':
        case 'deployments':
        case 'deploy':
        case 'dep':
            return state.deployments
                .filter(d => !namespace || d.metadata.namespace === ns)
                .map(d => d.metadata.name);

        case 'service':
        case 'services':
        case 'svc':
            return state.services
                .filter(s => !namespace || s.metadata.namespace === ns)
                .map(s => s.metadata.name);

        case 'configmap':
        case 'configmaps':
        case 'cm':
            return state.configMaps
                .filter(c => !namespace || c.metadata.namespace === ns)
                .map(c => c.metadata.name);

        case 'secret':
        case 'secrets':
            return state.secrets
                .filter(s => !namespace || s.metadata.namespace === ns)
                .map(s => s.metadata.name);

        case 'ingress':
        case 'ingresses':
        case 'ing':
            return state.ingresses
                .filter(i => !namespace || i.metadata.namespace === ns)
                .map(i => i.metadata.name);

        case 'hpa':
        case 'horizontalpodautoscaler':
            return state.hpas
                .filter(h => !namespace || h.metadata.namespace === ns)
                .map(h => h.metadata.name);

        case 'pv':
        case 'persistentvolume':
        case 'persistentvolumes':
            return state.persistentVolumes.map(p => p.metadata.name);

        case 'pvc':
        case 'persistentvolumeclaim':
        case 'persistentvolumeclaims':
            return state.persistentVolumeClaims
                .filter(p => !namespace || p.metadata.namespace === ns)
                .map(p => p.metadata.name);

        case 'sa':
        case 'serviceaccount':
        case 'serviceaccounts':
            return state.serviceAccounts
                .filter(s => !namespace || s.metadata.namespace === ns)
                .map(s => s.metadata.name);
                
        case 'networkpolicy':
        case 'networkpolicies':
        case 'netpol':
            return state.networkPolicies
                .filter(np => !namespace || np.metadata.namespace === ns)
                .map(np => np.metadata.name);
                
        case 'priorityclass':
        case 'priorityclasses':
        case 'pc':
            return state.priorityClasses.map(pc => pc.metadata.name);

        case 'storageclass':
        case 'storageclasses':
        case 'sc':
            return state.storageClasses.map(sc => sc.metadata.name);

        case 'namespace':
        case 'namespaces':
        case 'ns':
            return state.namespaces;

        default:
            return [];
    }
}

/**
 * 过滤匹配项并生成完整补全
 */
function filterAndComplete(candidates: string[], partial: string, prefix: string): string[] {
    const matches = candidates.filter(c => c.startsWith(partial));

    // 如果只有一个匹配，返回完整命令
    if (matches.length === 1) {
        return [prefix + matches[0] + ' '];
    }

    // 多个匹配，返回所有可能的完整命令
    return matches.map(m => prefix + m);
}

/**
 * 找到最长公共前缀
 * 当有多个补全选项时，可以补全到公共前缀
 */
export function findCommonPrefix(completions: string[]): string {
    if (completions.length === 0) return '';
    if (completions.length === 1) return completions[0];

    let prefix = completions[0];
    for (let i = 1; i < completions.length; i++) {
        while (!completions[i].startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
            if (prefix === '') return '';
        }
    }
    return prefix;
}

/**
 * Shell 命令补全 - 补全文件名
 */
function handleShellCompletion(parts: string[], lastPart: string, prefix: string, fs: FileSystem): string[] {
    const cmd = parts[0];
    
    // 需要文件参数的命令
    const fileCommands = ['cat', 'vim', 'vi', 'nano', 'head', 'tail', 'grep', 'rm', 'cp', 'mv', 'touch'];
    // 需要目录参数的命令
    const dirCommands = ['cd', 'ls', 'mkdir', 'tree'];
    
    if (fileCommands.includes(cmd) || dirCommands.includes(cmd)) {
        return getFileCompletions(lastPart, prefix, fs, !dirCommands.includes(cmd) || cmd === 'ls');
    }
    
    return [];
}

/**
 * 获取文件/目录补全
 */
function getFileCompletions(partial: string, prefix: string, fs: FileSystem, includeFiles: boolean = true): string[] {
    // 解析部分路径
    let dirPath = fs.currentPath;
    let filePrefix = partial;
    
    if (partial.includes('/')) {
        const lastSlash = partial.lastIndexOf('/');
        const pathPart = partial.substring(0, lastSlash) || '/';
        filePrefix = partial.substring(lastSlash + 1);
        
        // 解析目录路径
        if (pathPart.startsWith('/')) {
            dirPath = pathPart;
        } else {
            dirPath = fs.currentPath === '/' 
                ? '/' + pathPart 
                : fs.currentPath + '/' + pathPart;
        }
    }
    
    // 获取目录内容
    const dirNode = getNode(fs, dirPath);
    if (!dirNode || dirNode.type !== 'directory' || !dirNode.children) {
        return [];
    }
    
    const matches: string[] = [];
    for (const [name, node] of dirNode.children) {
        if (!name.startsWith(filePrefix)) continue;
        
        if (node.type === 'directory') {
            matches.push(name + '/');
        } else if (includeFiles) {
            matches.push(name);
        }
    }
    
    // 构建完整补全
    const pathPrefix = partial.includes('/') 
        ? partial.substring(0, partial.lastIndexOf('/') + 1)
        : '';
    
    if (matches.length === 1) {
        return [prefix + pathPrefix + matches[0]];
    }
    
    return matches.map(m => prefix + pathPrefix + m);
}

/**
 * kubectl apply 补全
 */
function handleApplyCompletion(parts: string[], lastPart: string, prefix: string, fs?: FileSystem): string[] {
    // kubectl apply 后面默认提示 -f
    if (parts.length === 2) {
        if (lastPart.startsWith('-')) {
            return filterAndComplete(COMMON_FLAGS['apply'], lastPart, prefix);
        }
        return filterAndComplete(['-f', '--filename'], lastPart, prefix);
    }
    
    // 标志补全
    if (lastPart.startsWith('-')) {
        return filterAndComplete(COMMON_FLAGS['apply'], lastPart, prefix);
    }
    
    return [];
}
