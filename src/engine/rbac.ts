/**
 * RBAC (Role-Based Access Control) 权限检查系统
 * 实现 Kubernetes 的权限模型
 */

import type { 
    ClusterState, 
    Role, 
    ClusterRole, 
    RoleBinding, 
    ClusterRoleBinding 
} from './cluster';

export interface AccessRequest {
    user: string;
    groups: string[];
    serviceAccount?: { name: string; namespace: string };
    verb: 'get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete' | '*';
    resource: string;
    resourceName?: string;
    namespace?: string;
    apiGroup?: string;
}

export interface AccessDecision {
    allowed: boolean;
    reason?: string;
    matchedRule?: {
        kind: 'Role' | 'ClusterRole';
        name: string;
        binding: string;
    };
}

/**
 * 检查用户是否有权限执行某个操作
 */
export function checkAccess(request: AccessRequest, state: ClusterState): AccessDecision {
    // 1. 检查是否是超级用户 (system:masters 组)
    if (request.groups.includes('system:masters')) {
        return { 
            allowed: true, 
            reason: 'User is member of system:masters group',
            matchedRule: { kind: 'ClusterRole', name: 'cluster-admin', binding: 'system:masters' }
        };
    }

    // 2. 检查 ClusterRoleBindings (集群级别)
    for (const binding of state.clusterRoleBindings) {
        if (matchesSubject(request, binding.subjects)) {
            const role = state.clusterRoles.find(r => r.metadata.name === binding.roleRef.name);
            if (role && matchesRule(request, role.rules, undefined)) {
                return {
                    allowed: true,
                    reason: `Allowed by ClusterRoleBinding "${binding.metadata.name}"`,
                    matchedRule: { kind: 'ClusterRole', name: role.metadata.name, binding: binding.metadata.name }
                };
            }
        }
    }

    // 3. 如果请求是命名空间级别的，检查 RoleBindings
    if (request.namespace) {
        for (const binding of state.roleBindings) {
            if (binding.metadata.namespace !== request.namespace) continue;
            
            if (matchesSubject(request, binding.subjects)) {
                // RoleBinding 可以引用 Role 或 ClusterRole
                if (binding.roleRef.kind === 'Role') {
                    const role = state.roles.find(r => 
                        r.metadata.name === binding.roleRef.name && 
                        r.metadata.namespace === request.namespace
                    );
                    if (role && matchesRule(request, role.rules, request.namespace)) {
                        return {
                            allowed: true,
                            reason: `Allowed by RoleBinding "${binding.metadata.name}"`,
                            matchedRule: { kind: 'Role', name: role.metadata.name, binding: binding.metadata.name }
                        };
                    }
                } else {
                    // ClusterRole 被 RoleBinding 引用（只在该命名空间生效）
                    const role = state.clusterRoles.find(r => r.metadata.name === binding.roleRef.name);
                    if (role && matchesRule(request, role.rules, request.namespace)) {
                        return {
                            allowed: true,
                            reason: `Allowed by RoleBinding "${binding.metadata.name}" referencing ClusterRole`,
                            matchedRule: { kind: 'ClusterRole', name: role.metadata.name, binding: binding.metadata.name }
                        };
                    }
                }
            }
        }
    }

    return {
        allowed: false,
        reason: `User "${request.user}" cannot ${request.verb} resource "${request.resource}"${request.namespace ? ` in namespace "${request.namespace}"` : ''}`
    };
}

/**
 * 检查请求是否匹配 subject
 */
function matchesSubject(
    request: AccessRequest, 
    subjects: { kind: string; name: string; namespace?: string }[]
): boolean {
    for (const subject of subjects) {
        switch (subject.kind) {
            case 'User':
                if (subject.name === request.user) return true;
                break;
            case 'Group':
                if (request.groups.includes(subject.name)) return true;
                break;
            case 'ServiceAccount':
                if (request.serviceAccount && 
                    request.serviceAccount.name === subject.name &&
                    request.serviceAccount.namespace === subject.namespace) {
                    return true;
                }
                break;
        }
    }
    return false;
}

/**
 * 检查请求是否匹配规则
 */
function matchesRule(
    request: AccessRequest, 
    rules: Role['rules'] | ClusterRole['rules'],
    _namespace?: string
): boolean {
    for (const rule of rules) {
        // 检查 apiGroup
        if (!matchesApiGroup(request.apiGroup || '', rule.apiGroups)) continue;

        // 检查资源
        if (!matchesResource(request.resource, rule.resources)) continue;

        // 检查动作
        if (!matchesVerb(request.verb, rule.verbs)) continue;

        // 检查资源名称（如果指定）
        if (rule.resourceNames && rule.resourceNames.length > 0) {
            if (!request.resourceName || !rule.resourceNames.includes(request.resourceName)) {
                continue;
            }
        }

        return true;
    }
    return false;
}

function matchesApiGroup(requested: string, allowed: string[]): boolean {
    return allowed.includes('*') || allowed.includes(requested);
}

function matchesResource(requested: string, allowed: string[]): boolean {
    if (allowed.includes('*')) return true;
    
    // 处理子资源，如 pods/log
    const requestedBase = requested.split('/')[0];
    return allowed.includes(requested) || allowed.includes(requestedBase);
}

function matchesVerb(requested: string, allowed: readonly string[]): boolean {
    return allowed.includes('*') || allowed.includes(requested);
}

// ========== 权限查询工具 ==========

/**
 * 获取用户在指定命名空间的所有权限
 */
export function getUserPermissions(
    user: string, 
    groups: string[], 
    namespace: string, 
    state: ClusterState
): { resource: string; verbs: string[] }[] {
    const permissions: Map<string, Set<string>> = new Map();

    const request: Omit<AccessRequest, 'verb' | 'resource'> = {
        user,
        groups,
        namespace
    };

    // 检查所有资源类型
    const resourceTypes = [
        'pods', 'services', 'deployments', 'configmaps', 'secrets',
        'persistentvolumeclaims', 'ingresses', 'jobs', 'cronjobs',
        'daemonsets', 'statefulsets', 'roles', 'rolebindings'
    ];

    const verbs: AccessRequest['verb'][] = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

    for (const resource of resourceTypes) {
        const allowedVerbs: string[] = [];
        for (const verb of verbs) {
            const decision = checkAccess({ ...request, resource, verb }, state);
            if (decision.allowed) {
                allowedVerbs.push(verb);
            }
        }
        if (allowedVerbs.length > 0) {
            permissions.set(resource, new Set(allowedVerbs));
        }
    }

    return Array.from(permissions.entries()).map(([resource, verbs]) => ({
        resource,
        verbs: Array.from(verbs)
    }));
}

/**
 * 模拟 kubectl auth can-i 命令
 */
export function canI(
    verb: string, 
    resource: string, 
    state: ClusterState,
    options?: {
        namespace?: string;
        resourceName?: string;
        asUser?: string;
        asGroup?: string[];
    }
): { allowed: boolean; reason: string } {
    const request: AccessRequest = {
        user: options?.asUser || state.currentContext.user,
        groups: options?.asGroup || state.currentContext.groups,
        serviceAccount: state.currentContext.serviceAccount,
        verb: verb as AccessRequest['verb'],
        resource,
        resourceName: options?.resourceName,
        namespace: options?.namespace
    };

    const decision = checkAccess(request, state);
    
    return {
        allowed: decision.allowed,
        reason: decision.reason || (decision.allowed ? 'yes' : 'no')
    };
}

/**
 * 创建 Role
 */
export function createRole(
    name: string,
    namespace: string,
    rules: Role['rules']
): Role {
    return {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'Role',
        metadata: { name, namespace },
        rules
    };
}

/**
 * 创建 ClusterRole
 */
export function createClusterRole(
    name: string,
    rules: ClusterRole['rules']
): ClusterRole {
    return {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: { name },
        rules
    };
}

/**
 * 创建 RoleBinding
 */
export function createRoleBinding(
    name: string,
    namespace: string,
    roleRef: { kind: 'Role' | 'ClusterRole'; name: string },
    subjects: RoleBinding['subjects']
): RoleBinding {
    return {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: { name, namespace },
        roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: roleRef.kind,
            name: roleRef.name
        },
        subjects
    };
}

/**
 * 创建 ClusterRoleBinding
 */
export function createClusterRoleBinding(
    name: string,
    roleRef: { name: string },
    subjects: ClusterRoleBinding['subjects']
): ClusterRoleBinding {
    return {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: { name },
        roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'ClusterRole',
            name: roleRef.name
        },
        subjects
    };
}
