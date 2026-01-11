/**
 * CKA 第十一题：CRD (定制资源定义)
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'cert-manager'],
    pods: [
        {
            apiVersion: 'v1', kind: 'Pod',
            metadata: { name: 'cert-manager-6d4b5d4c7-xkj2m', namespace: 'cert-manager', uid: 'cm-pod-1', creationTimestamp: new Date().toISOString(), labels: { app: 'cert-manager' } },
            spec: { containers: [{ name: 'cert-manager', image: 'quay.io/jetstack/cert-manager-controller:v1.13.0' }], nodeName: 'node01' },
            status: { phase: 'Running', podIP: '10.244.1.20', containerStatuses: [{ name: 'cert-manager', ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } }, image: 'quay.io/jetstack/cert-manager-controller:v1.13.0', imageID: 'docker://cert-manager' }] },
        },
        {
            apiVersion: 'v1', kind: 'Pod',
            metadata: { name: 'cert-manager-cainjector-5c5695d979-abc12', namespace: 'cert-manager', uid: 'cm-pod-2', creationTimestamp: new Date().toISOString(), labels: { app: 'cainjector' } },
            spec: { containers: [{ name: 'cert-manager-cainjector', image: 'quay.io/jetstack/cert-manager-cainjector:v1.13.0' }], nodeName: 'node01' },
            status: { phase: 'Running', podIP: '10.244.1.21', containerStatuses: [{ name: 'cert-manager-cainjector', ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } }, image: 'quay.io/jetstack/cert-manager-cainjector:v1.13.0', imageID: 'docker://cainjector' }] },
        },
        {
            apiVersion: 'v1', kind: 'Pod',
            metadata: { name: 'cert-manager-webhook-7f9f8b7b6-def34', namespace: 'cert-manager', uid: 'cm-pod-3', creationTimestamp: new Date().toISOString(), labels: { app: 'webhook' } },
            spec: { containers: [{ name: 'cert-manager-webhook', image: 'quay.io/jetstack/cert-manager-webhook:v1.13.0' }], nodeName: 'node01' },
            status: { phase: 'Running', podIP: '10.244.1.22', containerStatuses: [{ name: 'cert-manager-webhook', ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } }, image: 'quay.io/jetstack/cert-manager-webhook:v1.13.0', imageID: 'docker://webhook' }] },
        },
    ],
};

export const cka11CRD: Scenario = {
    id: 'cka-11',
    title: 'CKA 第11题：CRD 定制资源定义',
    description: '验证 cert-manager 并导出 CRD 信息',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

验证已部署到集群的 cert-manager 应用程序。

• 使用 kubectl，将 cert-manager 所有定制资源定义（CRD）的列表保存到 ~/resources.yaml
  注意：您必须使用 kubectl 的默认输出格式。请勿设置输出格式。

• 使用 kubectl，提取定制资源 Certificate 的 subject 规范字段的文档，并将其保存到 ~/subject.yaml

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'export-crds',
            description: '将 cert-manager 的 CRD 列表保存到 ~/resources.yaml',
            hint: 'kubectl get crds | grep cert-manager > ~/resources.yaml',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('get crds') && cmd.includes('cert-manager') && cmd.includes('>')
                );
            },
        },
        {
            id: 'explain-certificate',
            description: '导出 Certificate.spec.subject 文档到 ~/subject.yaml',
            hint: 'kubectl explain certificate.spec.subject > ~/subject.yaml',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('explain') && cmd.includes('certificate') && cmd.includes('subject')
                );
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 检查 cert-manager 资源
kubectl -n cert-manager get pods

2️⃣ 获取定制资源定义(CRD)的列表
kubectl get crds | grep cert-manager > ~/resources.yaml

3️⃣ 检查文件内容
cat ~/resources.yaml

4️⃣ 获取 Certificate 的 subject 规范字段
kubectl explain certificate.spec.subject > ~/subject.yaml

5️⃣ 检查文件内容
cat ~/subject.yaml`,
    ],
    rewards: { xp: 100, badges: ['crd-master'] },
};
