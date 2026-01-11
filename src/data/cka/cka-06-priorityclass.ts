/**
 * CKA 第六题：PriorityClass
 * 
 * 考点：PriorityClass 创建、优先级值设置、Deployment 优先级配置
 */

import type { Scenario } from '../scenarios';
import type { ClusterState, Deployment } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'priority'],
    priorityClasses: [
        {
            apiVersion: 'scheduling.k8s.io/v1',
            kind: 'PriorityClass',
            metadata: {
                name: 'system-cluster-critical',
                uid: 'sys-cluster-uid',
                creationTimestamp: new Date().toISOString(),
            },
            value: 2000000000,
            globalDefault: false,
            description: 'System cluster critical',
        },
        {
            apiVersion: 'scheduling.k8s.io/v1',
            kind: 'PriorityClass',
            metadata: {
                name: 'system-node-critical',
                uid: 'sys-node-uid',
                creationTimestamp: new Date().toISOString(),
            },
            value: 2000001000,
            globalDefault: false,
            description: 'System node critical',
        },
        {
            apiVersion: 'scheduling.k8s.io/v1',
            kind: 'PriorityClass',
            metadata: {
                name: 'max-user-priority',
                uid: 'max-user-uid',
                creationTimestamp: new Date().toISOString(),
            },
            value: 1000000000,
            globalDefault: false,
            description: 'Maximum user priority',
        },
    ],
    deployments: [
        {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: 'busybox-logger',
                namespace: 'priority',
                uid: 'busybox-logger-uid',
                creationTimestamp: new Date().toISOString(),
            },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'busybox-logger' } },
                template: {
                    metadata: { labels: { app: 'busybox-logger' } },
                    spec: {
                        containers: [{
                            name: 'busybox',
                            image: 'busybox:stable',
                            command: ['/bin/sh', '-c', 'while true; do echo "logging..."; sleep 5; done'],
                        }],
                    },
                },
            },
            status: {
                replicas: 1,
                readyReplicas: 1,
                availableReplicas: 1,
                conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' }],
            },
        } as Deployment,
    ],
};

export const cka06PriorityClass: Scenario = {
    id: 'cka-06',
    title: 'CKA 第6题：Pod 优先级 PriorityClass',
    description: '创建 PriorityClass 并为 Deployment 配置优先级',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请执行以下任务：
• 为用户工作负载创建一个名为 high-priority 的新 PriorityClass，其值比用户定义的现有最高优先级类值小一
• 修改在 priority namespace 中运行的现有 busybox-logger Deployment，以使用 high-priority 优先级类
• 确保 busybox-logger Deployment 在设置了新优先级类后成功部署

⚠️ 请勿修改在 priority namespace 中运行的其他 Deployment，否则可能导致分数降低。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-priorityclass',
            description: '创建名为 high-priority 的 PriorityClass，值为 999999999',
            hint: '查看现有 PriorityClass 后创建新的',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return state.priorityClasses.some(pc => 
                    pc.metadata.name === 'high-priority' &&
                    pc.value === 999999999
                );
            },
        },
        {
            id: 'update-deployment',
            description: '修改 busybox-logger Deployment 使用 high-priority',
            hint: '使用 kubectl edit deployment busybox-logger -n priority',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const deploy = state.deployments.find(d => 
                    d.metadata.name === 'busybox-logger' && 
                    d.metadata.namespace === 'priority'
                );
                return deploy?.spec.template.spec.priorityClassName === 'high-priority';
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 查找现有的用户自定义 PriorityClass
kubectl get priorityclass

其中 system-cluster-critical 和 system-node-critical 是集群默认带的
max-user-priority 是用户自定义的，其值为 1000000000（十位数）
所以小一就是九个 9（999999999）

2️⃣ 创建新的 PriorityClass
官方文档搜"优先级"，模板为：
参考链接：https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/

vim priority.yaml

apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 999999999
globalDefault: false
description: "此优先级类应仅用于 XYZ 服务 Pod。"

3️⃣ 创建
kubectl apply -f priority.yaml

4️⃣ 在线修改 Deployment 的 priorityClassName
kubectl -n priority edit deployment busybox-logger

在 spec.template.spec 部分，dnsPolicy: ClusterFirst 上面添加：
priorityClassName: high-priority

5️⃣ 验证
kubectl -n priority get deployment busybox-logger`,
        
        `💡 关键知识点：
• PriorityClass 用于定义 Pod 调度优先级
• 值越高优先级越高，会优先调度
• 高优先级 Pod 可以抢占低优先级 Pod 的资源`,
    ],
    rewards: {
        xp: 100,
        badges: ['priority-master'],
    },
};
