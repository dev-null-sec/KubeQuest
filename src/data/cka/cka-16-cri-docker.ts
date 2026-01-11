/**
 * CKA 第十六题：cri-dockerd 配置
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system'],
};

export const cka16CriDocker: Scenario = {
    id: 'cka-16',
    title: 'CKA 第16题：cri-dockerd 配置',
    description: '安装 cri-dockerd 并配置系统参数',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
您的任务是为 Kubernetes 准备一个 Linux 系统。Docker 已被安装，但您需要为 kubeadm 配置它。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

完成以下任务，为 Kubernetes 准备系统。

设置 cri-dockerd：
• 安装 Debian 软件包 ~/cri-dockerd_0.3.6.3-0.ubuntu-jammy_amd64.deb
  （Debian 软件包使用 dpkg 安装）
• 启用并启动 cri-docker 服务

配置以下系统参数：
• net.bridge.bridge-nf-call-iptables 设置为 1
• net.ipv6.conf.all.forwarding 设置为 1
• net.ipv4.ip_forward 设置为 1
• net.netfilter.nf_conntrack_max 设置为 131072

确保这些系统参数在系统重启后仍然存在，并应用于正在运行的系统。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'install-cri-docker',
            description: '使用 dpkg 安装 cri-dockerd',
            hint: 'sudo dpkg -i ~/cri-dockerd_0.3.6.3-0.ubuntu-jammy_amd64.deb',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('dpkg') && cmd.includes('-i') && cmd.includes('cri-dockerd')
                );
            },
        },
        {
            id: 'enable-cri-docker',
            description: '启用并启动 cri-docker 服务',
            hint: 'sudo systemctl enable cri-docker && sudo systemctl start cri-docker',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => cmd.includes('systemctl') && cmd.includes('enable') && cmd.includes('cri-docker')) &&
                       commandHistory.some(cmd => cmd.includes('systemctl') && cmd.includes('start') && cmd.includes('cri-docker'));
            },
        },
        {
            id: 'configure-sysctl',
            description: '配置系统参数并使其生效',
            hint: '编辑 /etc/sysctl.conf 并运行 sysctl -p',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => cmd.includes('sysctl') && cmd.includes('-p'));
            },
        },
    ],
    initialState,
    initialFiles: {
        'cri-dockerd_0.3.6.3-0.ubuntu-jammy_amd64.deb': '(binary package content - simulated)',
        '/etc/sysctl.conf': `# System default sysctl settings
# Add custom settings at the end
`,
    },
    hints: [
        `📖 解题步骤：

1️⃣ 安装 cri-dockerd
sudo dpkg -i ~/cri-dockerd_0.3.6.3-0.ubuntu-jammy_amd64.deb

2️⃣ 启用并启动 cri-docker 服务
sudo systemctl enable cri-docker 
sudo systemctl start cri-docker
sudo systemctl status cri-docker

3️⃣ 配置系统参数
sudo vim /etc/sysctl.conf

在文件最末尾添加（按 G 跳转到文件最后）：
net.bridge.bridge-nf-call-iptables = 1
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
net.netfilter.nf_conntrack_max = 131072

4️⃣ 使配置立即生效
sudo sysctl -p

5️⃣ 验证
sysctl net.bridge.bridge-nf-call-iptables
sysctl net.ipv4.ip_forward`,
    ],
    rewards: { xp: 100, badges: ['cri-docker-master'] },
};
