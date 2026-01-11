/**
 * ETCD 操作模拟
 * 实现 ETCD 的备份、恢复、健康检查等功能
 */

import type { ClusterState, ETCDCluster, ETCDMember } from './cluster';

export interface ETCDCommandResult {
    success: boolean;
    output: string;
    newState?: Partial<ClusterState>;
}

// 期望的证书路径（用于提示）
export const ETCD_CACERT_PATH = '/etc/kubernetes/pki/etcd/ca.crt';
export const ETCD_CERT_PATH = '/etc/kubernetes/pki/etcd/server.crt';
export const ETCD_KEY_PATH = '/etc/kubernetes/pki/etcd/server.key';
export const ETCD_ENDPOINT = 'https://127.0.0.1:2379';

/**
 * 验证证书参数
 */
function validateCerts(options: { cacert?: string; cert?: string; key?: string; endpoints: string[] }): { valid: boolean; error?: string } {
    // 检查是否使用 HTTPS 端点
    const hasHttpsEndpoint = options.endpoints.some(e => e.startsWith('https://'));
    
    if (hasHttpsEndpoint) {
        if (!options.cacert) {
            return { valid: false, error: 'Error: etcdserver: request requires TLS client certificates, please provide --cacert' };
        }
        if (!options.cert) {
            return { valid: false, error: 'Error: etcdserver: request requires TLS client certificates, please provide --cert' };
        }
        if (!options.key) {
            return { valid: false, error: 'Error: etcdserver: request requires TLS client certificates, please provide --key' };
        }
    }
    return { valid: true };
}

/**
 * 执行 etcdctl 命令
 */
export function executeEtcdctl(command: string, state: ClusterState): ETCDCommandResult {
    const parts = command.trim().split(/\s+/);
    
    // 移除 etcdctl 前缀
    if (parts[0] === 'etcdctl') {
        parts.shift();
    }

    // 解析全局选项
    const options = parseEtcdOptions(parts);
    const subCommand = options.args[0];
    const subArgs = options.args.slice(1);

    // snapshot status/restore 操作本地文件，不需要连接服务器
    const isLocalCommand = subCommand === 'snapshot' && 
        (options.args[1] === 'status' || options.args[1] === 'restore');

    // 检查 ETCD 是否损坏（恢复关卡的初始状态）
    // 本地命令和 snapshot restore 仍然可用
    if (state.etcd.corrupted && !isLocalCommand) {
        return { 
            success: false, 
            output: `Error: context deadline exceeded\nError: unhealthy cluster: failed to connect to etcd member at ${options.endpoints[0]}\nPlease restore etcd from backup.`
        };
    }

    // 验证证书（version 和本地文件操作命令不需要）
    if (subCommand !== 'version' && !isLocalCommand) {
        const certValidation = validateCerts(options);
        if (!certValidation.valid) {
            return { success: false, output: certValidation.error! };
        }
    }

    switch (subCommand) {
        case 'member':
            return handleMemberCommand(subArgs, state);
        case 'endpoint':
            return handleEndpointCommand(subArgs, state, options);
        case 'snapshot':
            return handleSnapshotCommand(subArgs, state, options);
        case 'get':
            return handleGetCommand(subArgs, state);
        case 'put':
            return handlePutCommand(subArgs, state);
        case 'del':
            return handleDelCommand(subArgs, state);
        case 'alarm':
            return handleAlarmCommand(subArgs, state);
        case 'defrag':
            return handleDefragCommand(state);
        case 'version':
            return { success: true, output: `etcdctl version: 3.5.9\nAPI version: 3.5` };
        default:
            return { success: false, output: `Error: unknown command "${subCommand}" for "etcdctl"` };
    }
}

/**
 * 解析 etcdctl 选项
 */
function parseEtcdOptions(parts: string[]): { 
    endpoints: string[]; 
    cacert?: string; 
    cert?: string; 
    key?: string;
    args: string[] 
} {
    const options: { endpoints: string[]; cacert?: string; cert?: string; key?: string; args: string[] } = {
        endpoints: ['https://127.0.0.1:2379'],
        args: []
    };

    let i = 0;
    while (i < parts.length) {
        const part = parts[i];
        if (part.startsWith('--endpoints=')) {
            options.endpoints = part.split('=')[1].split(',');
        } else if (part === '--endpoints') {
            options.endpoints = (parts[++i] || '').split(',');
        } else if (part.startsWith('--cacert=')) {
            options.cacert = part.split('=')[1];
        } else if (part === '--cacert') {
            options.cacert = parts[++i];
        } else if (part.startsWith('--cert=')) {
            options.cert = part.split('=')[1];
        } else if (part === '--cert') {
            options.cert = parts[++i];
        } else if (part.startsWith('--key=')) {
            options.key = part.split('=')[1];
        } else if (part === '--key') {
            options.key = parts[++i];
        } else if (!part.startsWith('-')) {
            options.args.push(part);
        }
        i++;
    }

    return options;
}

/**
 * etcdctl member 命令
 */
function handleMemberCommand(args: string[], state: ClusterState): ETCDCommandResult {
    const subCommand = args[0];
    
    switch (subCommand) {
        case 'list':
            return memberList(state);
        case 'add':
            return memberAdd(args.slice(1), state);
        case 'remove':
            return memberRemove(args.slice(1), state);
        case 'update':
            return memberUpdate(args.slice(1), state);
        default:
            return { success: false, output: `Error: unknown member command "${subCommand}"` };
    }
}

function memberList(state: ClusterState): ETCDCommandResult {
    const lines = ['+------------------+---------+---------------+------------------------+------------------------+------------+'];
    lines.push('|        ID        | STATUS  |     NAME      |       PEER ADDRS       |      CLIENT ADDRS      | IS LEARNER |');
    lines.push('+------------------+---------+---------------+------------------------+------------------------+------------+');
    
    for (const member of state.etcd.members) {
        const status = member.status === 'healthy' ? 'started' : member.status;
        lines.push(`| ${member.id.padEnd(16)} | ${status.padEnd(7)} | ${member.name.padEnd(13)} | ${member.peerURLs[0].padEnd(22)} | ${member.clientURLs[0].padEnd(22)} |   false    |`);
    }
    
    lines.push('+------------------+---------+---------------+------------------------+------------------------+------------+');
    
    return { success: true, output: lines.join('\n') };
}

function memberAdd(args: string[], state: ClusterState): ETCDCommandResult {
    // 解析 --peer-urls
    let peerUrls: string[] = [];
    let name = '';
    
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--peer-urls=')) {
            peerUrls = args[i].split('=')[1].split(',');
        } else if (args[i] === '--peer-urls') {
            peerUrls = (args[++i] || '').split(',');
        } else if (!args[i].startsWith('-')) {
            name = args[i];
        }
    }
    
    if (!peerUrls.length) {
        return { success: false, output: 'Error: --peer-urls is required' };
    }
    
    const newMember: ETCDMember = {
        id: Math.random().toString(16).slice(2, 14),
        name: name || `etcd-${state.etcd.members.length}`,
        peerURLs: peerUrls,
        clientURLs: peerUrls.map(u => u.replace(':2380', ':2379')),
        status: 'unknown',
        isLeader: false,
        dbSize: 0,
        dbSizeInUse: 0
    };
    
    const newEtcd: ETCDCluster = {
        ...state.etcd,
        members: [...state.etcd.members, newMember]
    };
    
    return {
        success: true,
        output: `Member ${newMember.id} added to cluster ${state.etcd.clusterID}`,
        newState: { etcd: newEtcd }
    };
}

function memberRemove(args: string[], state: ClusterState): ETCDCommandResult {
    const memberId = args[0];
    if (!memberId) {
        return { success: false, output: 'Error: member ID is required' };
    }
    
    const memberIndex = state.etcd.members.findIndex(m => m.id === memberId);
    if (memberIndex === -1) {
        return { success: false, output: `Error: member ${memberId} not found` };
    }
    
    const newMembers = [...state.etcd.members];
    newMembers.splice(memberIndex, 1);
    
    return {
        success: true,
        output: `Member ${memberId} removed from cluster ${state.etcd.clusterID}`,
        newState: { etcd: { ...state.etcd, members: newMembers } }
    };
}

function memberUpdate(_args: string[], _state: ClusterState): ETCDCommandResult {
    return { success: true, output: 'Member updated' };
}

/**
 * etcdctl endpoint 命令
 */
function handleEndpointCommand(args: string[], state: ClusterState, options: { endpoints: string[] }): ETCDCommandResult {
    const subCommand = args[0];
    
    switch (subCommand) {
        case 'health':
            return endpointHealth(state, options);
        case 'status':
            return endpointStatus(state, options);
        default:
            return { success: false, output: `Error: unknown endpoint command "${subCommand}"` };
    }
}

function endpointHealth(state: ClusterState, options: { endpoints: string[] }): ETCDCommandResult {
    const lines: string[] = [];
    const endpoint = options.endpoints[0] || 'https://127.0.0.1:2379';
    
    for (const member of state.etcd.members) {
        const isHealthy = member.status === 'healthy';
        lines.push(`${endpoint} is ${isHealthy ? 'healthy' : 'unhealthy'}: successfully committed proposal: took = ${(Math.random() * 10 + 1).toFixed(2)}ms`);
    }
    
    return { success: true, output: lines.join('\n') };
}

function endpointStatus(state: ClusterState, options: { endpoints: string[] }): ETCDCommandResult {
    const endpoint = options.endpoints[0] || 'https://127.0.0.1:2379';
    const lines = ['+------------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+'];
    lines.push('|        ENDPOINT        |        ID        | VERSION | DB SIZE | IS LEADER | IS LEARNER | RAFT TERM | RAFT INDEX | RAFT APPLIED INDEX | ERRORS |');
    lines.push('+------------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+');
    
    for (const member of state.etcd.members) {
        const dbSize = `${(member.dbSize / 1024 / 1024).toFixed(1)} MB`;
        lines.push(`| ${member.clientURLs[0].padEnd(22)} | ${member.id.padEnd(16)} | ${state.etcd.version.padEnd(7)} | ${dbSize.padEnd(7)} | ${String(member.isLeader).padEnd(9)} |   false    |         4 |       1234 |               1234 |        |`);
    }
    
    lines.push('+------------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+');
    
    return { success: true, output: lines.join('\n') };
}

/**
 * etcdctl snapshot 命令
 */
function handleSnapshotCommand(args: string[], state: ClusterState, _options: { endpoints: string[] }): ETCDCommandResult {
    const subCommand = args[0];
    
    switch (subCommand) {
        case 'save':
            return snapshotSave(args.slice(1), state);
        case 'restore':
            return snapshotRestore(args.slice(1), state);
        case 'status':
            return snapshotStatus(args.slice(1), state);
        default:
            return { success: false, output: `Error: unknown snapshot command "${subCommand}"` };
    }
}

function snapshotSave(args: string[], state: ClusterState): ETCDCommandResult {
    const path = args[0];
    if (!path) {
        return { success: false, output: 'Error: snapshot path is required' };
    }
    
    const backup = {
        name: path.split('/').pop() || 'snapshot.db',
        timestamp: new Date().toISOString(),
        size: state.etcd.members[0]?.dbSize || 4194304,
        path
    };
    
    const newEtcd: ETCDCluster = {
        ...state.etcd,
        backups: [...state.etcd.backups, backup]
    };
    
    return {
        success: true,
        output: `{"hash":${Math.floor(Math.random() * 1000000000)},"revision":1234,"totalKey":${Math.floor(Math.random() * 1000)},"totalSize":${backup.size}}`,
        newState: { etcd: newEtcd }
    };
}

function snapshotRestore(args: string[], state: ClusterState): ETCDCommandResult {
    const path = args[0];
    if (!path) {
        return { success: false, output: 'Error: snapshot path is required' };
    }
    
    // 解析其他选项
    let dataDir = '/var/lib/etcd';
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--data-dir=')) {
            dataDir = args[i].split('=')[1];
        } else if (args[i] === '--data-dir') {
            dataDir = args[++i] || dataDir;
        }
    }
    
    // 恢复 etcd 状态（清除 corrupted 标记，恢复成员健康状态）
    const restoredEtcd: ETCDCluster = {
        ...state.etcd,
        corrupted: false,
        members: state.etcd.members.map(m => ({
            ...m,
            status: 'healthy' as const
        }))
    };
    
    return {
        success: true,
        output: `Deprecated: Use \`etcdutl snapshot restore\` instead.

2024-01-01T00:00:00Z\tinfo\tsnapshot/v3_snapshot.go:251\trestoring snapshot\t{"path": "${path}", "wal-dir": "${dataDir}/member/wal", "data-dir": "${dataDir}", "snap-dir": "${dataDir}/member/snap", "stack": "..."}
2024-01-01T00:00:00Z\tinfo\tmembership/store.go:141\tTrimming membership info from the backend...
2024-01-01T00:00:00Z\tinfo\tsnapshot/v3_snapshot.go:272\trestored snapshot\t{"path": "${path}", "wal-dir": "${dataDir}/member/wal", "data-dir": "${dataDir}", "snap-dir": "${dataDir}/member/snap"}`,
        newState: { etcd: restoredEtcd }
    };
}

function snapshotStatus(args: string[], _state: ClusterState): ETCDCommandResult {
    const path = args[0];
    if (!path) {
        return { success: false, output: 'Error: snapshot path is required' };
    }
    
    const hash = Math.floor(Math.random() * 1000000000);
    const revision = Math.floor(Math.random() * 10000);
    const totalKey = Math.floor(Math.random() * 1000);
    const totalSize = Math.floor(Math.random() * 10000000);
    
    return {
        success: true,
        output: `+----------+----------+------------+------------+
|   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
+----------+----------+------------+------------+
| ${hash.toString(16).padEnd(8)} |    ${String(revision).padEnd(5)} |       ${String(totalKey).padEnd(4)} | ${(totalSize / 1024 / 1024).toFixed(1)} MB   |
+----------+----------+------------+------------+`
    };
}

/**
 * etcdctl get/put/del 命令
 */
function handleGetCommand(args: string[], _state: ClusterState): ETCDCommandResult {
    const key = args[0];
    if (!key) {
        return { success: false, output: 'Error: key is required' };
    }
    
    // 模拟一些常见的 key
    if (key.startsWith('/registry/')) {
        return { success: true, output: `${key}\n{"kind":"...","apiVersion":"..."}` };
    }
    
    return { success: true, output: '' };
}

function handlePutCommand(args: string[], _state: ClusterState): ETCDCommandResult {
    const key = args[0];
    const value = args[1];
    
    if (!key) {
        return { success: false, output: 'Error: key is required' };
    }
    if (!value) {
        return { success: false, output: 'Error: value is required' };
    }
    
    return { success: true, output: 'OK' };
}

function handleDelCommand(args: string[], _state: ClusterState): ETCDCommandResult {
    const key = args[0];
    if (!key) {
        return { success: false, output: 'Error: key is required' };
    }
    
    return { success: true, output: '1' };
}

/**
 * etcdctl alarm 命令
 */
function handleAlarmCommand(args: string[], state: ClusterState): ETCDCommandResult {
    const subCommand = args[0];
    
    switch (subCommand) {
        case 'list':
            // 通常没有告警
            return { success: true, output: '' };
        case 'disarm':
            return { success: true, output: 'alarm disarmed' };
        default:
            return { success: false, output: `Error: unknown alarm command "${subCommand}"` };
    }
}

/**
 * etcdctl defrag 命令
 */
function handleDefragCommand(state: ClusterState): ETCDCommandResult {
    const lines: string[] = [];
    
    for (const member of state.etcd.members) {
        lines.push(`Finished defragmenting etcd member[${member.clientURLs[0]}]`);
    }
    
    return { success: true, output: lines.join('\n') };
}

// ========== 辅助函数 ==========

/**
 * 检查 ETCD 集群健康状态
 */
export function checkETCDHealth(state: ClusterState): { healthy: boolean; message: string } {
    const healthyMembers = state.etcd.members.filter(m => m.status === 'healthy');
    const totalMembers = state.etcd.members.length;
    const quorum = Math.floor(totalMembers / 2) + 1;
    
    if (healthyMembers.length >= quorum) {
        return { healthy: true, message: `ETCD cluster is healthy (${healthyMembers.length}/${totalMembers} members healthy)` };
    } else {
        return { healthy: false, message: `ETCD cluster is unhealthy (${healthyMembers.length}/${totalMembers} members healthy, need ${quorum} for quorum)` };
    }
}

/**
 * 获取 ETCD leader
 */
export function getETCDLeader(state: ClusterState): ETCDMember | undefined {
    return state.etcd.members.find(m => m.isLeader);
}
