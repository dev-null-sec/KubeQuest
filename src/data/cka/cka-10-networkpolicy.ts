/**
 * CKA 第十题：NetworkPolicy
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'frontend', 'backend'],
    networkPolicies: [
        {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'NetworkPolicy',
            metadata: { name: 'default-deny-all', namespace: 'backend', uid: 'np-uid', creationTimestamp: new Date().toISOString() },
            spec: { podSelector: { matchLabels: {} }, policyTypes: ['Ingress', 'Egress'] },
        },
    ],
    deployments: [
        {
            apiVersion: 'apps/v1', kind: 'Deployment',
            metadata: { name: 'frontend', namespace: 'frontend', uid: 'fe-uid', creationTimestamp: new Date().toISOString(), labels: { app: 'frontend' } },
            spec: { replicas: 1, selector: { matchLabels: { app: 'frontend' } }, template: { metadata: { labels: { app: 'frontend' } }, spec: { containers: [{ name: 'nginx', image: 'nginx' }] } } },
            status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
        },
        {
            apiVersion: 'apps/v1', kind: 'Deployment',
            metadata: { name: 'backend', namespace: 'backend', uid: 'be-uid', creationTimestamp: new Date().toISOString(), labels: { app: 'backend' } },
            spec: { replicas: 1, selector: { matchLabels: { app: 'backend' } }, template: { metadata: { labels: { app: 'backend' } }, spec: { containers: [{ name: 'nginx', image: 'nginx' }] } } },
            status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
        },
    ],
    pods: [
        {
            apiVersion: 'v1', kind: 'Pod',
            metadata: { name: 'frontend-abc12', namespace: 'frontend', uid: 'fe-pod-uid', creationTimestamp: new Date().toISOString(), labels: { app: 'frontend' } },
            spec: { containers: [{ name: 'nginx', image: 'nginx' }], nodeName: 'node01' },
            status: { phase: 'Running', podIP: '10.244.1.10', containerStatuses: [{ name: 'nginx', ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } }, image: 'nginx', imageID: 'docker://nginx' }] },
        },
        {
            apiVersion: 'v1', kind: 'Pod',
            metadata: { name: 'backend-xyz34', namespace: 'backend', uid: 'be-pod-uid', creationTimestamp: new Date().toISOString(), labels: { app: 'backend' } },
            spec: { containers: [{ name: 'nginx', image: 'nginx' }], nodeName: 'node01' },
            status: { phase: 'Running', podIP: '10.244.1.11', containerStatuses: [{ name: 'nginx', ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } }, image: 'nginx', imageID: 'docker://nginx' }] },
        },
    ],
};

const netpol1Yaml = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-ns
  namespace: backend
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: frontend
`;

const netpol2Yaml = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-app
  namespace: backend
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: frontend
      podSelector:
        matchLabels:
          app: frontend
`;

const netpol3Yaml = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-wrong-label
  namespace: backend
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: frontend
      podSelector:
        matchLabels:
          role: web
`;

export const cka10NetworkPolicy: Scenario = {
    id: 'cka-10',
    title: 'CKA 第10题：NetworkPolicy',
    description: '选择并应用正确的 NetworkPolicy',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

从提供的 YAML 样本中查看并应用适当的 NetworkPolicy。

确保选择的 NetworkPolicy 不过于宽松，同时允许运行在 frontend 和 backend namespaces 中的 
frontend 和 backend Deployment 之间的通信。

• 首先，分析 frontend 和 backend Deployment，确定需要应用的 NetworkPolicy 的具体要求
• 接下来，检查位于 ~/netpol 文件夹中的 NetworkPolicy YAML 示例
• 最后，应用启用 frontend 和 backend Deployment 之间通信的 NetworkPolicy，但不要过于宽容

⚠️ 请勿删除或修改提供的示例。仅应用其中一个。
⚠️ 请勿删除或修改现有的默认拒绝所有入站流量或出口流量 NetworkPolicy。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'apply-netpol',
            description: '应用正确的 NetworkPolicy (netpol2.yaml)',
            hint: 'kubectl apply -f ~/netpol/netpol2.yaml',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return state.networkPolicies.some(np => 
                    np.metadata.namespace === 'backend' &&
                    np.spec.ingress?.some(rule => 
                        rule.from?.some(f => f.namespaceSelector?.matchLabels?.['kubernetes.io/metadata.name'] === 'frontend')
                    )
                );
            },
        },
    ],
    initialState,
    initialFiles: {
        'netpol/netpol1.yaml': netpol1Yaml,
        'netpol/netpol2.yaml': netpol2Yaml,
        'netpol/netpol3.yaml': netpol3Yaml,
    },
    hints: [
        `📖 解题步骤：

1️⃣ 检查 namespace 标签
kubectl get ns frontend backend --show-labels

2️⃣ 检查 Pod 标签
kubectl -n frontend get pod --show-labels
kubectl -n backend get pod --show-labels
# app=frontend 和 app=backend

3️⃣ 查看默认拒绝策略
kubectl -n backend get networkpolicies

4️⃣ 查看题目给的 NetworkPolicy
cat ~/netpol/netpol1.yaml  # 允许 frontend ns 所有 Pod
cat ~/netpol/netpol2.yaml  # 允许 frontend ns 有 app=frontend Pod（更精确）
cat ~/netpol/netpol3.yaml  # 错误的选择器

5️⃣ 选择 netpol2.yaml（最精确）
kubectl apply -f ~/netpol/netpol2.yaml

6️⃣ 验证
kubectl -n backend get networkpolicies`,
    ],
    rewards: { xp: 100, badges: ['netpol-master'] },
};
