/**
 * CKA 第四题：StorageClass
 * 
 * 考点：StorageClass 创建、默认 StorageClass、volumeBindingMode
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system'],
    storageClasses: [
        {
            apiVersion: 'storage.k8s.io/v1',
            kind: 'StorageClass',
            metadata: {
                name: 'local-path',
                uid: 'local-path-uid',
                creationTimestamp: new Date().toISOString(),
            },
            provisioner: 'rancher.io/local-path',
            reclaimPolicy: 'Delete',
            volumeBindingMode: 'WaitForFirstConsumer',
        },
    ],
};

export const cka04StorageClass: Scenario = {
    id: 'cka-04',
    title: 'CKA 第4题：StorageClass',
    description: '创建 StorageClass 并设置为默认',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

首先，为名为 rancher.io/local-path 的现有制备器，创建一个名为 ran-local-path 的新 StorageClass
• 将卷绑定模式设置为 WaitForFirstConsumer

⚠️ 注意：没有设置卷绑定模式，或者将其设置为 WaitForFirstConsumer 之外的其他任何模式，都将导致分数降低。

接下来，将 ran-local-path StorageClass 配置为默认的 StorageClass

⚠️ 请勿修改任何现有的 Deployment 和 PersistentVolumeClaim，否则将导致分数降低。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-storageclass',
            description: '创建名为 ran-local-path 的 StorageClass，provisioner 为 rancher.io/local-path',
            hint: '参考官方文档创建 StorageClass YAML',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return state.storageClasses.some(sc => 
                    sc.metadata.name === 'ran-local-path' &&
                    sc.provisioner === 'rancher.io/local-path'
                );
            },
        },
        {
            id: 'set-binding-mode',
            description: '设置 volumeBindingMode 为 WaitForFirstConsumer',
            hint: 'volumeBindingMode: WaitForFirstConsumer',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const sc = state.storageClasses.find(s => s.metadata.name === 'ran-local-path');
                return sc?.volumeBindingMode === 'WaitForFirstConsumer';
            },
        },
        {
            id: 'set-default',
            description: '将 ran-local-path 设置为默认 StorageClass',
            hint: '添加 annotation: storageclass.kubernetes.io/is-default-class: "true"',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const sc = state.storageClasses.find(s => s.metadata.name === 'ran-local-path');
                return sc?.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true';
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 创建 StorageClass
官方模板（搜存储类）：
参考链接：https://kubernetes.io/docs/concepts/storage/storage-classes/

2️⃣ 创建 storage.yaml：

vim storage.yaml

apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ran-local-path
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer

3️⃣ 创建
kubectl apply -f storage.yaml

4️⃣ 验证是否为默认 StorageClass
kubectl get storageclass

ran-local-path 后面显示 (default) 表示正确`,
        
        `💡 关键知识点：
• volumeBindingMode: WaitForFirstConsumer 延迟绑定直到 Pod 调度
• 默认 StorageClass 通过 annotation 设置
• 每个集群只应有一个默认 StorageClass`,
    ],
    rewards: {
        xp: 100,
        badges: ['storage-master'],
    },
};
