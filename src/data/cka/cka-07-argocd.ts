/**
 * CKA 第七题：Argo CD
 * 
 * 考点：Helm 仓库添加、template 生成、Helm install
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'argocd'],
};

export const cka07ArgoCD: Scenario = {
    id: 'cka-07',
    title: 'CKA 第7题：Argo CD Helm 安装',
    description: '使用 Helm 安装 Argo CD',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Quick Reference
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
文档 Argo Helm Charts: https://argoproj.github.io/argo-helm/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

通过执行以下任务在集群中安装 Argo CD：
• 添加名为 argo 的官方 Argo CD Helm 存储库
  注意：Argo CD CRD 已在集群中预安装
• 为 argocd namespace 生成 Argo CD Helm 图表版本 7.7.3 的模板，并将其保存到 ~/argo-helm.yaml
  将图表配置为不安装 CRDs
• 使用 Helm 安装 Argo CD，设置发布名称为 argocd，使用与模板中相同的配置和版本（7.7.3）
  将其安装在 argocd namespace 中，并配置为不安装 CRDs

⚠️ 注意：您不需要配置对 Argo CD 服务器 UI 的访问权限。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'add-helm-repo',
            description: '添加名为 argo 的 Helm 仓库',
            hint: 'helm repo add argo https://argoproj.github.io/argo-helm',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('helm repo add') && cmd.includes('argo')
                );
            },
        },
        {
            id: 'generate-template',
            description: '生成 Helm template 并保存到 ~/argo-helm.yaml',
            hint: 'helm template argocd argo/argo-cd --namespace argocd --version 7.7.3 --set crds.install=false > ~/argo-helm.yaml',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('helm template') && 
                    cmd.includes('argo-cd') &&
                    cmd.includes('crds.install=false')
                );
            },
        },
        {
            id: 'install-argocd',
            description: '使用 Helm 安装 Argo CD 到 argocd namespace',
            hint: 'helm install argocd argo/argo-cd --namespace argocd --version 7.7.3 --set crds.install=false',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('helm install') && 
                    cmd.includes('argo-cd') &&
                    cmd.includes('argocd')
                );
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 添加官方的 Argo CD Helm 存储库，并更新
考试时可以打开题目里给的 Quick Reference 文档的网址复制命令
https://argoproj.github.io/argo-helm/

helm repo add argo https://argoproj.github.io/argo-helm 
helm repo update

2️⃣ 生成 Argo CD Helm 模板
这条命令要背！！具体版本号以题目要求为准

helm template argocd argo/argo-cd \\
  --namespace argocd \\
  --version 7.7.3 \\
  --set crds.install=false > ~/argo-helm.yaml

cat ~/argo-helm.yaml  # 查看是一些资源就对了

3️⃣ 使用 Helm 安装 Argo CD
这条命令要背过，跟上一条类似，template 改成 install

helm install argocd argo/argo-cd \\
  --namespace argocd \\
  --version 7.7.3 \\
  --set crds.install=false

4️⃣ 验证安装
kubectl -n argocd get pods

有 Pod 存在即可，不需要关注状态是否 Running`,
        
        `💡 关键知识点：
• helm repo add 添加 Helm 仓库
• helm template 生成 YAML 但不安装
• helm install 安装 chart
• --set 用于覆盖 values.yaml 中的值`,
    ],
    rewards: {
        xp: 150,
        badges: ['helm-master'],
    },
};
