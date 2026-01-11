/**
 * CKA 第十五题：ETCD 修复
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system'],
    etcd: {
        members: [
            {
                id: 'a1b2c3d4e5f6',
                name: 'control-plane',
                peerURLs: ['https://127.0.0.1:2380'],
                clientURLs: ['https://127.0.0.1:2379'],
                isLeader: true,
                status: 'healthy',
                dbSize: 20971520,
                dbSizeInUse: 15728640
            }
        ],
        version: '3.5.9',
        clusterID: 'k8s-quest-etcd-cluster',
        backups: [
            {
                name: 'etcd-backup-latest.db',
                timestamp: new Date().toISOString(),
                size: 20971520,
                path: '/var/lib/etcd-backup/etcd-backup-latest.db'
            }
        ],
        corrupted: true  // 标记 ETCD 为损坏状态
    },
    systemComponents: [
        { name: 'kube-apiserver', status: 'Error', node: 'control-plane', message: 'ETCD connection refused' },
        { name: 'kube-scheduler', status: 'Stopped', node: 'control-plane' },
        { name: 'kube-controller-manager', status: 'Stopped', node: 'control-plane' },
        { name: 'etcd', status: 'Error', node: 'control-plane', message: 'Database corrupted' },
        { name: 'kubelet', status: 'Running', node: 'control-plane' },
    ],
};

export const cka15Etcd: Scenario = {
    id: 'cka-15',
    title: 'CKA 第15题：ETCD 修复',
    description: '修复损坏的集群组件',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
kubeadm 配置的集群已迁移到新机器。它需要更改配置才能成功运行。
注意：已停用的集群使用外部 etcd 服务器。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

修复在机器迁移过程中损坏的单节点集群。

• 首先，确定损坏的集群组件，并调查导致其损坏的原因
• 接下来，修复所有损坏的集群组件的配置
• 确保重新启动所有必要的服务和组件

最后，确保集群运行正常：
• 每个节点都处于 Ready 状态
• 所有 Pod 都处于 Ready 状态

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'fix-etcd-servers',
            description: '修复 kube-apiserver 的 --etcd-servers 参数',
            hint: '编辑 /etc/kubernetes/manifests/kube-apiserver.yaml',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('vim') && cmd.includes('kube-apiserver.yaml')
                );
            },
        },
        {
            id: 'restart-kubelet',
            description: '重启 kubelet 服务',
            hint: 'systemctl restart kubelet',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('systemctl') && cmd.includes('restart') && cmd.includes('kubelet')
                );
            },
        },
    ],
    initialState,
    initialFiles: {
        '/etc/kubernetes/manifests/kube-apiserver.yaml': `apiVersion: v1
kind: Pod
metadata:
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - name: kube-apiserver
    image: registry.k8s.io/kube-apiserver:v1.29.0
    command:
    - kube-apiserver
    - --advertise-address=192.168.1.10
    - --etcd-servers=https://10.0.0.99:2379  # 错误的地址！应该是 https://127.0.0.1:2379
    - --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt
    - --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt
    - --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key
`,
        '/etc/kubernetes/manifests/kube-scheduler.yaml': `apiVersion: v1
kind: Pod
metadata:
  name: kube-scheduler
  namespace: kube-system
spec:
  containers:
  - name: kube-scheduler
    image: registry.k8s.io/kube-scheduler:v1.29.0
    resources:
      requests:
        cpu: 100m
`,
    },
    hints: [
        `📖 解题步骤：

⚠️ 这道题需要切到 root 用户下操作

1️⃣ 切换到 root
sudo -i

2️⃣ 检查集群状态（可能会卡住或报错）
kubectl get nodes

3️⃣ 修复 kube-apiserver
vim /etc/kubernetes/manifests/kube-apiserver.yaml

找到 --etcd-servers 参数，修改为：
--etcd-servers=https://127.0.0.1:2379

4️⃣ 重启 kubelet
systemctl daemon-reload
systemctl restart kubelet

5️⃣ 检查状态
kubectl get nodes
kubectl -n kube-system get pod

6️⃣ 如果 kube-scheduler 还有问题
vim /etc/kubernetes/manifests/kube-scheduler.yaml
# 修改 requests cpu 为 100m

7️⃣ 验证集群状态
kubectl get nodes
kubectl -n kube-system get pod

8️⃣ 退出 root（执行 2 次 exit）
exit
exit`,
    ],
    rewards: { xp: 150, badges: ['etcd-master'] },
};
