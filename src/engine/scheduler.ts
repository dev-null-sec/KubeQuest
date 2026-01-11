/**
 * Kubernetes 调度器模拟
 * 实现真实的调度算法：过滤 -> 打分 -> 绑定
 */

import type { Pod, Node, ClusterState, Toleration, Taint } from './cluster';

export interface ScheduleResult {
    success: boolean;
    nodeName?: string;
    reason?: string;
    message?: string;
}

/**
 * 调度 Pod 到合适的节点
 */
export function schedulePod(pod: Pod, state: ClusterState): ScheduleResult {
    // 如果已经指定了 nodeName，直接绑定
    if (pod.spec.nodeName) {
        const node = state.nodes.find(n => n.metadata.name === pod.spec.nodeName);
        if (!node) {
            return { success: false, reason: 'NodeNotFound', message: `node "${pod.spec.nodeName}" not found` };
        }
        if (!isNodeReady(node)) {
            return { success: false, reason: 'NodeNotReady', message: `node "${pod.spec.nodeName}" is not ready` };
        }
        return { success: true, nodeName: pod.spec.nodeName };
    }

    // 1. 过滤阶段 - 找出所有可调度的节点
    const feasibleNodes = filterNodes(pod, state);
    
    if (feasibleNodes.length === 0) {
        return { 
            success: false, 
            reason: 'Unschedulable', 
            message: 'no nodes available to schedule pods' 
        };
    }

    // 2. 打分阶段 - 对可调度节点打分
    const scoredNodes = scoreNodes(pod, feasibleNodes, state);
    
    // 3. 选择得分最高的节点
    scoredNodes.sort((a, b) => b.score - a.score);
    const selectedNode = scoredNodes[0].node;

    return { success: true, nodeName: selectedNode.metadata.name };
}

/**
 * 过滤阶段：找出所有满足条件的节点
 */
function filterNodes(pod: Pod, state: ClusterState): Node[] {
    return state.nodes.filter(node => {
        // 1. 检查节点是否就绪
        if (!isNodeReady(node)) return false;

        // 2. 检查节点是否可调度
        if (node.spec.unschedulable) return false;

        // 3. 检查 NodeSelector
        if (!matchNodeSelector(pod, node)) return false;

        // 4. 检查 NodeAffinity (required)
        if (!matchNodeAffinity(pod, node)) return false;

        // 5. 检查 Taints/Tolerations
        if (!toleratesTaints(pod, node)) return false;

        // 6. 检查资源是否足够 (简化版)
        if (!hasEnoughResources(pod, node, state)) return false;

        return true;
    });
}

/**
 * 打分阶段：对可调度节点打分
 */
function scoreNodes(pod: Pod, nodes: Node[], state: ClusterState): { node: Node; score: number }[] {
    return nodes.map(node => {
        let score = 0;

        // 1. 资源均衡得分 (剩余资源越多得分越高)
        score += scoreResourceBalance(pod, node, state);

        // 2. NodeAffinity 偏好得分
        score += scoreNodeAffinityPreference(pod, node);

        // 3. PodAffinity/AntiAffinity 得分
        score += scorePodAffinity(pod, node, state);

        // 4. 镜像本地化得分 (如果节点已有镜像)
        score += scoreImageLocality(pod, node);

        return { node, score };
    });
}

// ========== 过滤器实现 ==========

function isNodeReady(node: Node): boolean {
    const readyCondition = node.status.conditions.find(c => c.type === 'Ready');
    return readyCondition?.status === 'True';
}

function matchNodeSelector(pod: Pod, node: Node): boolean {
    const nodeSelector = pod.spec.nodeSelector;
    if (!nodeSelector) return true;

    const nodeLabels = node.metadata.labels || {};
    return Object.entries(nodeSelector).every(([key, value]) => nodeLabels[key] === value);
}

function matchNodeAffinity(pod: Pod, node: Node): boolean {
    const nodeAffinity = pod.spec.affinity?.nodeAffinity;
    if (!nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution) return true;

    const nodeLabels = node.metadata.labels || {};
    const terms = nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms;

    // 至少匹配一个 term
    return terms.some(term => {
        if (!term.matchExpressions) return true;
        return term.matchExpressions.every(expr => {
            const nodeValue = nodeLabels[expr.key];
            switch (expr.operator) {
                case 'In':
                    return expr.values?.includes(nodeValue) ?? false;
                case 'NotIn':
                    return !expr.values?.includes(nodeValue) ?? true;
                case 'Exists':
                    return nodeValue !== undefined;
                case 'DoesNotExist':
                    return nodeValue === undefined;
                case 'Gt':
                    return nodeValue !== undefined && Number(nodeValue) > Number(expr.values?.[0]);
                case 'Lt':
                    return nodeValue !== undefined && Number(nodeValue) < Number(expr.values?.[0]);
                default:
                    return false;
            }
        });
    });
}

function toleratesTaints(pod: Pod, node: Node): boolean {
    const taints = node.spec.taints;
    if (!taints || taints.length === 0) return true;

    const tolerations = pod.spec.tolerations || [];

    // 所有 NoSchedule 和 NoExecute 的 taint 都必须被 tolerate
    return taints.every(taint => {
        if (taint.effect !== 'NoSchedule' && taint.effect !== 'NoExecute') return true;
        return tolerations.some(toleration => tolerateTaint(toleration, taint));
    });
}

function tolerateTaint(toleration: Toleration, taint: Taint): boolean {
    // 空 key 的 toleration 匹配所有 taints
    if (!toleration.key && toleration.operator === 'Exists') return true;

    // key 必须匹配
    if (toleration.key !== taint.key) return false;

    // effect 必须匹配（或为空表示匹配所有）
    if (toleration.effect && toleration.effect !== taint.effect) return false;

    // operator 为 Exists 时不检查 value
    if (toleration.operator === 'Exists') return true;

    // 默认 operator 为 Equal，检查 value
    return toleration.value === taint.value;
}

function hasEnoughResources(pod: Pod, node: Node, state: ClusterState): boolean {
    // 简化版：只检查 Pod 数量限制
    const maxPods = parseInt(node.status.allocatable.pods || '110');
    const currentPods = state.pods.filter(p => p.spec.nodeName === node.metadata.name).length;
    return currentPods < maxPods;
}

// ========== 打分器实现 ==========

function scoreResourceBalance(_pod: Pod, node: Node, state: ClusterState): number {
    // 简化版：Pod 数量越少得分越高
    const maxPods = parseInt(node.status.allocatable.pods || '110');
    const currentPods = state.pods.filter(p => p.spec.nodeName === node.metadata.name).length;
    return Math.round(((maxPods - currentPods) / maxPods) * 50);
}

function scoreNodeAffinityPreference(pod: Pod, node: Node): number {
    const preferences = pod.spec.affinity?.nodeAffinity?.preferredDuringSchedulingIgnoredDuringExecution;
    if (!preferences) return 0;

    let score = 0;
    const nodeLabels = node.metadata.labels || {};

    for (const pref of preferences) {
        const matches = pref.preference.matchExpressions?.every(expr => {
            const nodeValue = nodeLabels[expr.key];
            switch (expr.operator) {
                case 'In':
                    return expr.values?.includes(nodeValue) ?? false;
                case 'NotIn':
                    return !expr.values?.includes(nodeValue) ?? true;
                case 'Exists':
                    return nodeValue !== undefined;
                case 'DoesNotExist':
                    return nodeValue === undefined;
                default:
                    return false;
            }
        }) ?? true;

        if (matches) {
            score += pref.weight;
        }
    }

    return score;
}

function scorePodAffinity(pod: Pod, node: Node, state: ClusterState): number {
    let score = 0;
    const podAffinity = pod.spec.affinity?.podAffinity;
    const podAntiAffinity = pod.spec.affinity?.podAntiAffinity;

    // PodAffinity 偏好
    if (podAffinity?.preferredDuringSchedulingIgnoredDuringExecution) {
        for (const pref of podAffinity.preferredDuringSchedulingIgnoredDuringExecution) {
            if (matchPodAffinityTerm(pref.podAffinityTerm, node, state)) {
                score += pref.weight;
            }
        }
    }

    // PodAntiAffinity 偏好（匹配时减分）
    if (podAntiAffinity?.preferredDuringSchedulingIgnoredDuringExecution) {
        for (const pref of podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution) {
            if (matchPodAffinityTerm(pref.podAffinityTerm, node, state)) {
                score -= pref.weight;
            }
        }
    }

    return score;
}

function matchPodAffinityTerm(term: { labelSelector?: { matchLabels?: Record<string, string> }; topologyKey: string }, node: Node, state: ClusterState): boolean {
    if (!term.labelSelector?.matchLabels) return false;

    // 找出在同一拓扑域的所有节点
    const topologyValue = node.metadata.labels?.[term.topologyKey];
    if (!topologyValue) return false;

    const nodesInTopology = state.nodes.filter(n => 
        n.metadata.labels?.[term.topologyKey] === topologyValue
    );

    // 检查这些节点上是否有匹配标签的 Pod
    return state.pods.some(p => {
        if (!nodesInTopology.some(n => n.metadata.name === p.spec.nodeName)) return false;
        const podLabels = p.metadata.labels || {};
        return Object.entries(term.labelSelector!.matchLabels!).every(([k, v]) => podLabels[k] === v);
    });
}

function scoreImageLocality(pod: Pod, _node: Node): number {
    // 简化版：假设所有镜像都需要拉取
    // 实际实现需要跟踪每个节点上的镜像
    return 0;
}

// ========== 辅助函数 ==========

/**
 * 获取调度失败的详细原因
 */
export function getSchedulingFailureReasons(pod: Pod, state: ClusterState): string[] {
    const reasons: string[] = [];

    for (const node of state.nodes) {
        const nodeReasons: string[] = [];

        if (!isNodeReady(node)) {
            nodeReasons.push('NodeNotReady');
        }
        if (node.spec.unschedulable) {
            nodeReasons.push('NodeUnschedulable');
        }
        if (!matchNodeSelector(pod, node)) {
            nodeReasons.push('NodeSelectorMismatch');
        }
        if (!matchNodeAffinity(pod, node)) {
            nodeReasons.push('NodeAffinityMismatch');
        }
        if (!toleratesTaints(pod, node)) {
            nodeReasons.push('TaintToleration');
        }
        if (!hasEnoughResources(pod, node, state)) {
            nodeReasons.push('InsufficientResources');
        }

        if (nodeReasons.length > 0) {
            reasons.push(`${node.metadata.name}: ${nodeReasons.join(', ')}`);
        }
    }

    return reasons;
}
