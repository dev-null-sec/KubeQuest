/**
 * 故障模拟系统
 * 用于模拟各种 Kubernetes 故障场景
 */

import type { ClusterState, Pod, Node, K8sEvent, SystemComponent } from './cluster';

export type FaultType = 
    | 'node-not-ready'
    | 'node-disk-pressure'
    | 'node-memory-pressure'
    | 'node-pid-pressure'
    | 'node-network-unavailable'
    | 'pod-crash-loop'
    | 'pod-image-pull-error'
    | 'pod-oom-killed'
    | 'pod-evicted'
    | 'etcd-unhealthy'
    | 'apiserver-down'
    | 'scheduler-down'
    | 'controller-manager-down'
    | 'kubelet-down'
    | 'dns-failure'
    | 'network-partition';

export interface FaultConfig {
    type: FaultType;
    target: string; // 节点名或 Pod 名
    duration?: number; // 持续时间（秒），不设置则永久
    severity?: 'warning' | 'critical';
}

export interface FaultResult {
    success: boolean;
    message: string;
    newState: ClusterState;
    events: K8sEvent[];
}

/**
 * 注入故障
 */
export function injectFault(config: FaultConfig, state: ClusterState): FaultResult {
    const events: K8sEvent[] = [];
    let newState = { ...state };

    switch (config.type) {
        case 'node-not-ready':
            return injectNodeNotReady(config.target, newState, events);
        case 'node-disk-pressure':
            return injectNodeCondition(config.target, 'DiskPressure', newState, events);
        case 'node-memory-pressure':
            return injectNodeCondition(config.target, 'MemoryPressure', newState, events);
        case 'node-pid-pressure':
            return injectNodeCondition(config.target, 'PIDPressure', newState, events);
        case 'node-network-unavailable':
            return injectNodeCondition(config.target, 'NetworkUnavailable', newState, events);
        case 'pod-crash-loop':
            return injectPodCrashLoop(config.target, newState, events);
        case 'pod-image-pull-error':
            return injectPodImagePullError(config.target, newState, events);
        case 'pod-oom-killed':
            return injectPodOOMKilled(config.target, newState, events);
        case 'pod-evicted':
            return injectPodEvicted(config.target, newState, events);
        case 'etcd-unhealthy':
            return injectEtcdUnhealthy(config.target, newState, events);
        case 'apiserver-down':
            return injectComponentDown('kube-apiserver', newState, events);
        case 'scheduler-down':
            return injectComponentDown('kube-scheduler', newState, events);
        case 'controller-manager-down':
            return injectComponentDown('kube-controller-manager', newState, events);
        case 'kubelet-down':
            return injectKubeletDown(config.target, newState, events);
        case 'dns-failure':
            return injectComponentDown('coredns', newState, events);
        case 'network-partition':
            return injectNetworkPartition(config.target, newState, events);
        default:
            return { success: false, message: `Unknown fault type: ${config.type}`, newState: state, events: [] };
    }
}

/**
 * 修复故障
 */
export function repairFault(config: FaultConfig, state: ClusterState): FaultResult {
    const events: K8sEvent[] = [];
    let newState = { ...state };

    switch (config.type) {
        case 'node-not-ready':
            return repairNodeReady(config.target, newState, events);
        case 'node-disk-pressure':
        case 'node-memory-pressure':
        case 'node-pid-pressure':
        case 'node-network-unavailable':
            return repairNodeCondition(config.target, newState, events);
        case 'pod-crash-loop':
        case 'pod-image-pull-error':
        case 'pod-oom-killed':
            return repairPod(config.target, newState, events);
        case 'etcd-unhealthy':
            return repairEtcd(config.target, newState, events);
        case 'apiserver-down':
        case 'scheduler-down':
        case 'controller-manager-down':
        case 'dns-failure':
            return repairComponent(config.type.replace('-down', ''), newState, events);
        case 'kubelet-down':
            return repairKubelet(config.target, newState, events);
        default:
            return { success: false, message: `Cannot repair fault type: ${config.type}`, newState: state, events: [] };
    }
}

// ========== 节点故障 ==========

function injectNodeNotReady(nodeName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);
    if (nodeIndex === -1) {
        return { success: false, message: `Node "${nodeName}" not found`, newState: state, events: [] };
    }

    const newNodes = [...state.nodes];
    const node = { ...newNodes[nodeIndex] };
    node.status = {
        ...node.status,
        conditions: node.status.conditions.map(c => 
            c.type === 'Ready' ? { ...c, status: 'False', message: 'Kubelet stopped posting node status' } : c
        )
    };
    newNodes[nodeIndex] = node;

    events.push(createEvent('Warning', 'NodeNotReady', `Node ${nodeName} status is now: NodeNotReady`, { kind: 'Node', name: nodeName }));

    // 将该节点上的 Pod 标记为 Unknown
    const newPods = state.pods.map(pod => {
        if (pod.spec.nodeName === nodeName) {
            return { ...pod, status: { ...pod.status, phase: 'Unknown' as const } };
        }
        return pod;
    });

    return {
        success: true,
        message: `Node "${nodeName}" is now NotReady`,
        newState: { ...state, nodes: newNodes, pods: newPods },
        events
    };
}

function injectNodeCondition(nodeName: string, condition: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);
    if (nodeIndex === -1) {
        return { success: false, message: `Node "${nodeName}" not found`, newState: state, events: [] };
    }

    const newNodes = [...state.nodes];
    const node = { ...newNodes[nodeIndex] };
    
    // 添加或更新条件
    const existingCondition = node.status.conditions.find(c => c.type === condition);
    if (existingCondition) {
        node.status = {
            ...node.status,
            conditions: node.status.conditions.map(c => 
                c.type === condition ? { ...c, status: 'True', message: `Node has ${condition}` } : c
            )
        };
    } else {
        node.status = {
            ...node.status,
            conditions: [...node.status.conditions, { type: condition, status: 'True', message: `Node has ${condition}` }]
        };
    }
    newNodes[nodeIndex] = node;

    events.push(createEvent('Warning', condition, `Node ${nodeName} has ${condition}`, { kind: 'Node', name: nodeName }));

    return {
        success: true,
        message: `Node "${nodeName}" now has ${condition}`,
        newState: { ...state, nodes: newNodes },
        events
    };
}

function repairNodeReady(nodeName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);
    if (nodeIndex === -1) {
        return { success: false, message: `Node "${nodeName}" not found`, newState: state, events: [] };
    }

    const newNodes = [...state.nodes];
    const node = { ...newNodes[nodeIndex] };
    node.status = {
        ...node.status,
        conditions: node.status.conditions.map(c => 
            c.type === 'Ready' ? { ...c, status: 'True', message: 'kubelet is posting ready status' } : c
        )
    };
    newNodes[nodeIndex] = node;

    events.push(createEvent('Normal', 'NodeReady', `Node ${nodeName} status is now: NodeReady`, { kind: 'Node', name: nodeName }));

    // 恢复该节点上的 Pod
    const newPods = state.pods.map(pod => {
        if (pod.spec.nodeName === nodeName && pod.status.phase === 'Unknown') {
            return { ...pod, status: { ...pod.status, phase: 'Running' as const } };
        }
        return pod;
    });

    return {
        success: true,
        message: `Node "${nodeName}" is now Ready`,
        newState: { ...state, nodes: newNodes, pods: newPods },
        events
    };
}

function repairNodeCondition(nodeName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);
    if (nodeIndex === -1) {
        return { success: false, message: `Node "${nodeName}" not found`, newState: state, events: [] };
    }

    const newNodes = [...state.nodes];
    const node = { ...newNodes[nodeIndex] };
    // 移除所有压力条件，只保留 Ready
    node.status = {
        ...node.status,
        conditions: node.status.conditions
            .filter(c => c.type === 'Ready')
            .map(c => ({ ...c, status: 'True' }))
    };
    newNodes[nodeIndex] = node;

    events.push(createEvent('Normal', 'NodeRecovered', `Node ${nodeName} conditions cleared`, { kind: 'Node', name: nodeName }));

    return {
        success: true,
        message: `Node "${nodeName}" conditions repaired`,
        newState: { ...state, nodes: newNodes },
        events
    };
}

// ========== Pod 故障 ==========

function injectPodCrashLoop(podName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const podIndex = state.pods.findIndex(p => p.metadata.name === podName);
    if (podIndex === -1) {
        return { success: false, message: `Pod "${podName}" not found`, newState: state, events: [] };
    }

    const newPods = [...state.pods];
    const pod = { ...newPods[podIndex] };
    pod.status = {
        ...pod.status,
        phase: 'CrashLoopBackOff',
        containerStatuses: pod.status.containerStatuses?.map(cs => ({
            ...cs,
            ready: false,
            restartCount: (cs.restartCount || 0) + 5,
            state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s restarting failed container' } },
            lastState: { terminated: { exitCode: 1, reason: 'Error', finishedAt: new Date().toISOString() } }
        }))
    };
    newPods[podIndex] = pod;

    events.push(createEvent('Warning', 'BackOff', `Back-off restarting failed container`, { kind: 'Pod', name: podName, namespace: pod.metadata.namespace }));

    return {
        success: true,
        message: `Pod "${podName}" is now in CrashLoopBackOff`,
        newState: { ...state, pods: newPods },
        events
    };
}

function injectPodImagePullError(podName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const podIndex = state.pods.findIndex(p => p.metadata.name === podName);
    if (podIndex === -1) {
        return { success: false, message: `Pod "${podName}" not found`, newState: state, events: [] };
    }

    const newPods = [...state.pods];
    const pod = { ...newPods[podIndex] };
    pod.status = {
        ...pod.status,
        phase: 'ImagePullBackOff',
        containerStatuses: pod.status.containerStatuses?.map(cs => ({
            ...cs,
            ready: false,
            state: { waiting: { reason: 'ImagePullBackOff', message: 'Back-off pulling image' } }
        }))
    };
    newPods[podIndex] = pod;

    events.push(createEvent('Warning', 'Failed', `Failed to pull image: rpc error: code = NotFound`, { kind: 'Pod', name: podName, namespace: pod.metadata.namespace }));

    return {
        success: true,
        message: `Pod "${podName}" has ImagePullBackOff error`,
        newState: { ...state, pods: newPods },
        events
    };
}

function injectPodOOMKilled(podName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const podIndex = state.pods.findIndex(p => p.metadata.name === podName);
    if (podIndex === -1) {
        return { success: false, message: `Pod "${podName}" not found`, newState: state, events: [] };
    }

    const newPods = [...state.pods];
    const pod = { ...newPods[podIndex] };
    pod.status = {
        ...pod.status,
        phase: 'Error',
        containerStatuses: pod.status.containerStatuses?.map(cs => ({
            ...cs,
            ready: false,
            restartCount: (cs.restartCount || 0) + 1,
            state: { terminated: { exitCode: 137, reason: 'OOMKilled' } },
            lastState: { terminated: { exitCode: 137, reason: 'OOMKilled', finishedAt: new Date().toISOString() } }
        }))
    };
    newPods[podIndex] = pod;

    events.push(createEvent('Warning', 'OOMKilling', `Memory limit exceeded, container killed`, { kind: 'Pod', name: podName, namespace: pod.metadata.namespace }));

    return {
        success: true,
        message: `Pod "${podName}" was OOMKilled`,
        newState: { ...state, pods: newPods },
        events
    };
}

function injectPodEvicted(podName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const podIndex = state.pods.findIndex(p => p.metadata.name === podName);
    if (podIndex === -1) {
        return { success: false, message: `Pod "${podName}" not found`, newState: state, events: [] };
    }

    const pod = state.pods[podIndex];
    const newPods = state.pods.filter(p => p.metadata.name !== podName);

    events.push(createEvent('Warning', 'Evicted', `The node was low on resource: memory`, { kind: 'Pod', name: podName, namespace: pod.metadata.namespace }));

    return {
        success: true,
        message: `Pod "${podName}" was evicted`,
        newState: { ...state, pods: newPods },
        events
    };
}

function repairPod(podName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const podIndex = state.pods.findIndex(p => p.metadata.name === podName);
    if (podIndex === -1) {
        return { success: false, message: `Pod "${podName}" not found`, newState: state, events: [] };
    }

    const newPods = [...state.pods];
    const pod = { ...newPods[podIndex] };
    pod.status = {
        ...pod.status,
        phase: 'Running',
        containerStatuses: pod.status.containerStatuses?.map(cs => ({
            ...cs,
            ready: true,
            state: { running: { startedAt: new Date().toISOString() } }
        }))
    };
    newPods[podIndex] = pod;

    events.push(createEvent('Normal', 'Started', `Started container`, { kind: 'Pod', name: podName, namespace: pod.metadata.namespace }));

    return {
        success: true,
        message: `Pod "${podName}" is now Running`,
        newState: { ...state, pods: newPods },
        events
    };
}

// ========== 系统组件故障 ==========

function injectEtcdUnhealthy(memberName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const memberIndex = state.etcd.members.findIndex(m => m.name === memberName);
    if (memberIndex === -1) {
        return { success: false, message: `ETCD member "${memberName}" not found`, newState: state, events: [] };
    }

    const newMembers = [...state.etcd.members];
    newMembers[memberIndex] = { ...newMembers[memberIndex], status: 'unhealthy' };

    events.push(createEvent('Warning', 'EtcdUnhealthy', `ETCD member ${memberName} is unhealthy`, { kind: 'Node', name: memberName }));

    return {
        success: true,
        message: `ETCD member "${memberName}" is now unhealthy`,
        newState: { ...state, etcd: { ...state.etcd, members: newMembers } },
        events
    };
}

function repairEtcd(memberName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const memberIndex = state.etcd.members.findIndex(m => m.name === memberName);
    if (memberIndex === -1) {
        return { success: false, message: `ETCD member "${memberName}" not found`, newState: state, events: [] };
    }

    const newMembers = [...state.etcd.members];
    newMembers[memberIndex] = { ...newMembers[memberIndex], status: 'healthy' };

    events.push(createEvent('Normal', 'EtcdHealthy', `ETCD member ${memberName} is healthy`, { kind: 'Node', name: memberName }));

    return {
        success: true,
        message: `ETCD member "${memberName}" is now healthy`,
        newState: { ...state, etcd: { ...state.etcd, members: newMembers } },
        events
    };
}

function injectComponentDown(componentName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const newComponents = state.systemComponents.map(c => {
        if (c.name === componentName) {
            return { ...c, status: 'Stopped' as const, message: 'Component crashed' };
        }
        return c;
    });

    events.push(createEvent('Warning', 'ComponentDown', `${componentName} is not running`, { kind: 'Node', name: 'control-plane' }));

    return {
        success: true,
        message: `${componentName} is now down`,
        newState: { ...state, systemComponents: newComponents },
        events
    };
}

function repairComponent(componentName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const newComponents = state.systemComponents.map(c => {
        if (c.name.includes(componentName)) {
            return { ...c, status: 'Running' as SystemComponent['status'], message: undefined, lastHeartbeat: new Date().toISOString() };
        }
        return c;
    });

    events.push(createEvent('Normal', 'ComponentStarted', `${componentName} is now running`, { kind: 'Node', name: 'control-plane' }));

    return {
        success: true,
        message: `${componentName} is now running`,
        newState: { ...state, systemComponents: newComponents },
        events
    };
}

function injectKubeletDown(nodeName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const newComponents = state.systemComponents.map(c => {
        if (c.name === 'kubelet' && c.node === nodeName) {
            return { ...c, status: 'Stopped' as const, message: 'Kubelet stopped' };
        }
        return c;
    });

    // 将节点标记为 NotReady
    const nodeResult = injectNodeNotReady(nodeName, { ...state, systemComponents: newComponents }, events);

    return {
        success: true,
        message: `Kubelet on "${nodeName}" is now down`,
        newState: nodeResult.newState,
        events: nodeResult.events
    };
}

function repairKubelet(nodeName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    const newComponents = state.systemComponents.map(c => {
        if (c.name === 'kubelet' && c.node === nodeName) {
            return { ...c, status: 'Running' as const, message: undefined, lastHeartbeat: new Date().toISOString() };
        }
        return c;
    });

    // 恢复节点为 Ready
    const nodeResult = repairNodeReady(nodeName, { ...state, systemComponents: newComponents }, events);

    return {
        success: true,
        message: `Kubelet on "${nodeName}" is now running`,
        newState: nodeResult.newState,
        events: nodeResult.events
    };
}

function injectNetworkPartition(nodeName: string, state: ClusterState, events: K8sEvent[]): FaultResult {
    // 将节点标记为 NetworkUnavailable
    const result = injectNodeCondition(nodeName, 'NetworkUnavailable', state, events);
    
    // 同时影响该节点上的所有 Pod
    const newPods = result.newState.pods.map(pod => {
        if (pod.spec.nodeName === nodeName) {
            return { ...pod, status: { ...pod.status, phase: 'Unknown' as const } };
        }
        return pod;
    });

    return {
        ...result,
        message: `Network partition on node "${nodeName}"`,
        newState: { ...result.newState, pods: newPods }
    };
}

// ========== 辅助函数 ==========

function createEvent(type: 'Normal' | 'Warning', reason: string, message: string, involvedObject: { kind: string; name: string; namespace?: string }): K8sEvent {
    return {
        type,
        reason,
        message,
        involvedObject,
        timestamp: new Date().toISOString(),
        count: 1,
        firstTimestamp: new Date().toISOString(),
        lastTimestamp: new Date().toISOString(),
        source: { component: 'fault-injector' }
    };
}

/**
 * 获取当前活跃的故障列表
 */
export function getActiveFaults(state: ClusterState): { type: FaultType; target: string; description: string }[] {
    const faults: { type: FaultType; target: string; description: string }[] = [];

    // 检查节点故障
    for (const node of state.nodes) {
        const ready = node.status.conditions.find(c => c.type === 'Ready');
        if (ready?.status !== 'True') {
            faults.push({ type: 'node-not-ready', target: node.metadata.name, description: `Node ${node.metadata.name} is NotReady` });
        }
        for (const condition of node.status.conditions) {
            if (condition.type !== 'Ready' && condition.status === 'True') {
                faults.push({ 
                    type: `node-${condition.type.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}` as FaultType, 
                    target: node.metadata.name, 
                    description: `Node ${node.metadata.name} has ${condition.type}` 
                });
            }
        }
    }

    // 检查 Pod 故障
    for (const pod of state.pods) {
        if (pod.status.phase === 'CrashLoopBackOff') {
            faults.push({ type: 'pod-crash-loop', target: pod.metadata.name, description: `Pod ${pod.metadata.name} is in CrashLoopBackOff` });
        }
        if (pod.status.phase === 'ImagePullBackOff') {
            faults.push({ type: 'pod-image-pull-error', target: pod.metadata.name, description: `Pod ${pod.metadata.name} has ImagePullBackOff` });
        }
    }

    // 检查 ETCD 故障
    for (const member of state.etcd.members) {
        if (member.status !== 'healthy') {
            faults.push({ type: 'etcd-unhealthy', target: member.name, description: `ETCD member ${member.name} is ${member.status}` });
        }
    }

    // 检查系统组件故障
    for (const component of state.systemComponents) {
        if (component.status !== 'Running') {
            faults.push({ 
                type: `${component.name}-down` as FaultType, 
                target: component.node, 
                description: `${component.name} on ${component.node} is ${component.status}` 
            });
        }
    }

    return faults;
}
