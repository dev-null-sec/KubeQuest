/**
 * CKA 第十四题：Resources (CPU/Memory)
 */

import type { Scenario } from '../scenarios';
import type { ClusterState, Deployment } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'relative-fawn'],
    deployments: [
        {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: 'wordpress',
                namespace: 'relative-fawn',
                uid: 'wp-dep-uid',
                creationTimestamp: new Date().toISOString(),
            },
            spec: {
                replicas: 3,
                selector: { matchLabels: { app: 'wordpress' } },
                template: {
                    metadata: { labels: { app: 'wordpress' } },
                    spec: {
                        containers: [{
                            name: 'wordpress',
                            image: 'wordpress:6.4-apache',
                            resources: {
                                requests: {
                                    cpu: '2000m',    // 请求过高，导致无法调度
                                    memory: '4Gi',   // 请求过高
                                },
                                limits: {
                                    cpu: '4000m',
                                    memory: '8Gi',
                                },
                            },
                        }],
                        initContainers: [{
                            name: 'init-db',
                            image: 'busybox:1.36',
                            command: ['sh', '-c', 'echo init'],
                            resources: {
                                requests: {
                                    cpu: '2000m',    // 同样请求过高
                                    memory: '4Gi',
                                },
                            },
                        }],
                    },
                },
            },
            status: {
                replicas: 0,
                readyReplicas: 0,
                availableReplicas: 0,
                conditions: [{ 
                    type: 'Available', 
                    status: 'False', 
                    reason: 'MinimumReplicasUnavailable' 
                }],
            },
        } as Deployment,
    ],
    pods: [
        // Pod 处于 Pending 状态，因为资源不足
        {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'wordpress-abc12-xyz',
                namespace: 'relative-fawn',
                uid: 'wp-pod-uid-1',
                creationTimestamp: new Date().toISOString(),
                labels: { app: 'wordpress' },
            },
            spec: {
                containers: [{
                    name: 'wordpress',
                    image: 'wordpress:6.4-apache',
                }],
            },
            status: {
                phase: 'Pending',
                conditions: [{
                    type: 'PodScheduled',
                    status: 'False',
                    reason: 'Unschedulable',
                    message: '0/3 nodes are available: 1 node(s) had untolerable taint, 2 Insufficient memory, 2 Insufficient cpu.',
                }],
            },
        },
    ],
};

export const cka14Resources: Scenario = {
    id: 'cka-14',
    title: 'CKA 第14题：资源请求调整',
    description: '调整 Pod 资源请求使 Deployment 正常运行',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
您管理一个 WordPress 应用程序。由于资源请求过高，某些 Pod 无法启动。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

relative-fawn namespace 中的 WordPress 应用程序包含具有 3 个副本的 WordPress Deployment

按如下方式调整所有 Pod 资源请求：
• 将节点资源平均分配给这 3 个 Pod
• 为每个 Pod 分配公平的 CPU 和内存份额
• 添加足够的开销以保持节点稳定

请确保对容器和初始化容器使用完全相同的请求。您无需更改任何资源限制。

更新后，请确认：
• WordPress 保持 3 个副本
• 所有 Pod 都在运行并准备就绪

💡 提示：暂时将 WordPress Deployment 缩放为 0 个副本可能会有所帮助。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'scale-to-zero',
            description: '将 Deployment 缩放为 0',
            hint: 'kubectl -n relative-fawn scale deployment wordpress --replicas=0',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('scale') && cmd.includes('replicas=0')
                );
            },
        },
        {
            id: 'update-resources',
            description: '更新资源请求',
            hint: '修改 containers 的 requests cpu 和 memory',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('edit') && cmd.includes('deployment') && cmd.includes('wordpress')
                );
            },
        },
        {
            id: 'scale-to-three',
            description: '恢复为 3 个副本',
            hint: 'kubectl -n relative-fawn scale deployment wordpress --replicas=3',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('scale') && cmd.includes('replicas=3')
                );
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

⚠️ 本题只需要修改 requests，千万不要动 limits！

1️⃣ 将 Deployment 缩放为 0
kubectl -n relative-fawn scale deployment wordpress --replicas=0

2️⃣ 检查节点资源
kubectl get nodes
kubectl describe node k8s-master1

查看 Allocatable 和 Allocated resources

3️⃣ 计算资源分配
假设可用 CPU 1000m，可用 MEM 2760Mi
每个 Pod：CPU 1000m/3 ≈ 200m，MEM 2760Mi/3 ≈ 900Mi
（实际设置更小一点总是没错的，如 cpu: 80m, memory: 200Mi）

4️⃣ 更新 Deployment
kubectl -n relative-fawn edit deployment wordpress

修改 requests（不要改 limits）：
resources:
  requests:
    cpu: 80m
    memory: 200Mi

5️⃣ 恢复副本
kubectl -n relative-fawn scale deployment wordpress --replicas=3

6️⃣ 验证
kubectl -n relative-fawn get pod
kubectl -n relative-fawn get deployment`,
    ],
    rewards: { xp: 100, badges: ['resources-master'] },
};
