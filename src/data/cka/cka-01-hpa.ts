/**
 * CKA 第一题：部署 HPA 并设置稳定窗口
 * 
 * 考点：HorizontalPodAutoscaler、autoscale 命令、behavior 配置
 */

import type { Scenario } from '../scenarios';
import type { ClusterState, Deployment, HorizontalPodAutoscaler } from '../../engine/cluster';

// 初始状态：autoscale 命名空间中有 apache-server Deployment
const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'autoscale'],
    deployments: [
        {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: 'apache-server',
                namespace: 'autoscale',
                uid: 'apache-server-uid',
                creationTimestamp: new Date().toISOString(),
            },
            spec: {
                replicas: 2,
                selector: { matchLabels: { app: 'apache-server' } },
                template: {
                    metadata: { labels: { app: 'apache-server' } },
                    spec: {
                        containers: [{
                            name: 'apache',
                            image: 'httpd:2.4',
                            ports: [{ containerPort: 80 }],
                            resources: {
                                requests: { cpu: '100m', memory: '128Mi' },
                                limits: { cpu: '200m', memory: '256Mi' },
                            },
                        }],
                    },
                },
            },
            status: {
                replicas: 2,
                readyReplicas: 2,
                availableReplicas: 2,
                conditions: [{ type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' }],
            },
        } as Deployment,
    ],
    pods: [
        {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'apache-server-abc12',
                namespace: 'autoscale',
                uid: 'pod-1',
                creationTimestamp: new Date().toISOString(),
                labels: { app: 'apache-server' },
            },
            spec: {
                containers: [{
                    name: 'apache',
                    image: 'httpd:2.4',
                    ports: [{ containerPort: 80 }],
                }],
                nodeName: 'node01',
            },
            status: { phase: 'Running', conditions: [], containerStatuses: [] },
        },
        {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'apache-server-def34',
                namespace: 'autoscale',
                uid: 'pod-2',
                creationTimestamp: new Date().toISOString(),
                labels: { app: 'apache-server' },
            },
            spec: {
                containers: [{
                    name: 'apache',
                    image: 'httpd:2.4',
                    ports: [{ containerPort: 80 }],
                }],
                nodeName: 'node01',
            },
            status: { phase: 'Running', conditions: [], containerStatuses: [] },
        },
    ],
};

export const cka01Hpa: Scenario = {
    id: 'cka-01',
    title: 'CKA 第1题：部署 HPA 并设置稳定窗口',
    description: '在 autoscale namespace 中创建 HPA，并配置缩小稳定窗口',
    story: `你必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

在 autoscale namespace 中创建一个名为 apache-server 的新 HorizontalPodAutoscaler (HPA)
此 HPA 必须定位到 autoscale namespace 中名为 apache-server 的现有 Deployment。

将 HPA 设置为每个 Pod 的 CPU 使用率旨在 50%。
将其配置为至少有 1 个 Pod，且不超过 4 个 Pod。
此外，将缩小稳定窗口设置为 30 秒。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-hpa',
            description: '创建名为 apache-server 的 HPA，目标 CPU 使用率 50%，最少1个副本，最多4个副本',
            hint: '使用 kubectl -n autoscale autoscale deployment apache-server --cpu=50% --min=1 --max=4',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const hpa = state.hpas.find(h => 
                    h.metadata.name === 'apache-server' && 
                    h.metadata.namespace === 'autoscale'
                );
                if (!hpa) return false;
                const hasCorrectMetrics = hpa.spec.metrics?.some(m => 
                    m.type === 'Resource' && 
                    m.resource?.target?.averageUtilization === 50
                ) ?? false;
                return hpa.spec.minReplicas === 1 && 
                       hpa.spec.maxReplicas === 4 &&
                       hasCorrectMetrics;
            },
        },
        {
            id: 'set-stabilization-window',
            description: '将缩小稳定窗口设置为 30 秒(stabilizationWindowSeconds: 30)',
            hint: '使用 kubectl -n autoscale edit hpa apache-server，在 maxReplicas 下添加 behavior.scaleDown.stabilizationWindowSeconds: 30',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const hpa = state.hpas.find(h => 
                    h.metadata.name === 'apache-server' && 
                    h.metadata.namespace === 'autoscale'
                ) as (HorizontalPodAutoscaler & { spec: { behavior?: { scaleDown?: { stabilizationWindowSeconds?: number } } } }) | undefined;
                return hpa?.spec?.behavior?.scaleDown?.stabilizationWindowSeconds === 30;
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 创建 HorizontalPodAutoscaler
kubectl -n autoscale autoscale deployment apache-server --cpu=50% --min=1 --max=4

2️⃣ 修改 HPA 缩小稳定窗口为 30 秒
kubectl -n autoscale edit hpa apache-server

3️⃣ 在 k8s 官网搜"稳定窗口"，复制模板
参考链接：https://kubernetes.io/zh-cn/docs/tasks/run-application/horizontal-pod-autoscale/

4️⃣ 在 maxReplicas: 4 这一行下面新增 3 行（注意保持缩进）：
behavior: 
  scaleDown:
    stabilizationWindowSeconds: 30

5️⃣ 保存退出后验证
kubectl -n autoscale get hpa apache-server -o yaml`,
        
        `💡 关键知识点：
• HPA 的 behavior 字段控制扩缩容行为
• scaleDown.stabilizationWindowSeconds 控制缩容前的等待时间
• 这可以防止副本数频繁波动（抖动）`,
    ],
    rewards: {
        xp: 100,
        badges: ['hpa-master'],
    },
};
