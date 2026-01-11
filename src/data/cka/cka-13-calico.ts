/**
 * CKA 第十三题：Calico CNI 安装
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system'],
};

export const cka13Calico: Scenario = {
    id: 'cka-13',
    title: 'CKA 第13题：Calico CNI 安装',
    description: '安装支持 NetworkPolicy 的 CNI',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
集群的 CNI 未通过安全审核，已被移除。您必须安装一个可以实施网络策略的新 CNI。

文档地址：
• Flannel: https://github.com/flannel-io/flannel/releases/download/v0.26.1/kube-flannel.yml
• Calico: https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/tigera-operator.yaml

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

选择并安装以下 CNI 选项之一：
• Flannel 版本 0.26.1
• Calico 版本 3.27.0

选择的 CNI 必须：
• 让 Pod 相互通信
• 支持 Network Policy 实施
• 从清单文件安装（请勿使用 Helm）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'install-tigera',
            description: '下载并部署 tigera-operator.yaml',
            hint: 'kubectl create -f tigera-operator.yaml',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    (cmd.includes('kubectl create') || cmd.includes('kubectl apply')) && 
                    cmd.includes('tigera-operator')
                );
            },
        },
        {
            id: 'install-custom-resources',
            description: '部署 Calico 自定义资源 CRD',
            hint: 'kubectl create -f custom-resources.yaml',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    (cmd.includes('kubectl create') || cmd.includes('kubectl apply')) && 
                    cmd.includes('custom-resources')
                );
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 选择 Calico（因为题目要求支持 NetworkPolicy，Flannel 不支持）

2️⃣ 下载并部署 tigera-operator
wget https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/tigera-operator.yaml
kubectl create -f tigera-operator.yaml

3️⃣ 检查 Pod CIDR
kubectl cluster-info dump | grep -i cluster-cidr
# 默认都是 192.168.0.0/16

4️⃣ 下载并部署 custom-resources
wget https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/custom-resources.yaml
# 编辑配置文件，修改 IP 为 cluster-cidr
vi custom-resources.yaml
kubectl create -f custom-resources.yaml

5️⃣ 验证
kubectl -n calico-system get pod
# 等待约 2 分钟，Pod 才会 Running`,
    ],
    rewards: { xp: 150, badges: ['cni-master'] },
};
