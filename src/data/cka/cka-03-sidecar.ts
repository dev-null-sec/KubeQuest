/**
 * CKA 第三题：Sidecar 容器
 * 
 * 考点：Sidecar 模式、多容器 Pod、共享存储卷
 */

import type { Scenario } from '../scenarios';
import type { ClusterState, Deployment } from '../../engine/cluster';

// 初始状态：有 synergy-leverager Deployment（还原真实考试环境）
const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system'],
    deployments: [
        {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: 'synergy-leverager',
                namespace: 'default',
                uid: '24ca0d20-67bd-463e-865d-9054e362c01e',
                creationTimestamp: '2025-06-20T16:38:59Z',
                labels: { app: 'synergy-leverager' },
                annotations: {
                    'deployment.kubernetes.io/revision': '12',
                    'kubectl.kubernetes.io/last-applied-configuration': '{"apiVersion":"apps/v1","kind":"Deployment","metadata":{"annotations":{"deployment.kubernetes.io/revision":"1"},"generation":1,"labels":{"app":"synergy-leverager"},"name":"synergy-leverager","namespace":"default"},"spec":{"progressDeadlineSeconds":600,"replicas":1,"revisionHistoryLimit":10,"selector":{"matchLabels":{"app":"synergy-leverager"}},"strategy":{"rollingUpdate":{"maxSurge":"25%","maxUnavailable":"25%"},"type":"RollingUpdate"},"template":{"metadata":{"creationTimestamp":null,"labels":{"app":"synergy-leverager"}},"spec":{"containers":[{"args":["/bin/sh","-c","i=0; while true; do\\n  echo \\"$(date) INFO $i\\" \\u003e\\u003e /var/log/synergy-leverager.log;\\n  i=$((i+1));\\n  sleep 5;\\ndone\\n"],"image":"registry.cn-hangzhou.aliyuncs.com/fizz_wangwei/k8s-exam:3busybox","imagePullPolicy":"IfNotPresent","name":"synergy-leverager","resources":{},"terminationMessagePath":"/dev/termination-log","terminationMessagePolicy":"File"}],"dnsPolicy":"ClusterFirst","restartPolicy":"Always","schedulerName":"default-scheduler","securityContext":{},"terminationGracePeriodSeconds":30}}}}',
                },
                generation: 12,
                resourceVersion: '158712',
            },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'synergy-leverager' } },
                progressDeadlineSeconds: 600,
                revisionHistoryLimit: 10,
                strategy: {
                    type: 'RollingUpdate',
                    rollingUpdate: {
                        maxSurge: '25%',
                        maxUnavailable: '25%',
                    },
                },
                template: {
                    metadata: { 
                        labels: { app: 'synergy-leverager' },
                        annotations: {
                            'kubectl.kubernetes.io/restartedAt': '2025-06-22T03:51:24Z',
                        },
                        creationTimestamp: null,
                    },
                    spec: {
                        containers: [{
                            name: 'synergy-leverager',
                            image: 'registry.cn-hangzhou.aliyuncs.com/fizz_1024/cka:busybox-unstable',
                            args: ['/bin/sh', '-c', `i=0; while true; do
  echo "$(date) INFO $i" >> /var/log/synergy-leverager.log;
  i=$((i+1));
  sleep 5;
done
`],
                            imagePullPolicy: 'Always' as const,
                            resources: {},
                            terminationMessagePath: '/dev/termination-log',
                            terminationMessagePolicy: 'File',
                        }],
                        dnsPolicy: 'ClusterFirst',
                        restartPolicy: 'Always',
                        schedulerName: 'default-scheduler',
                        securityContext: {},
                        terminationGracePeriodSeconds: 30,
                    },
                },
            },
            status: {
                replicas: 1,
                readyReplicas: 1,
                availableReplicas: 1,
                updatedReplicas: 1,
                observedGeneration: 12,
                conditions: [
                    { 
                        type: 'Progressing', 
                        status: 'True', 
                        reason: 'NewReplicaSetAvailable',
                        message: 'ReplicaSet "synergy-leverager-587c7bc457" has successfully progressed.',
                        lastTransitionTime: '2025-06-20T16:38:59Z',
                        lastUpdateTime: '2025-09-30T01:29:37Z',
                    },
                    { 
                        type: 'Available', 
                        status: 'True', 
                        reason: 'MinimumReplicasAvailable',
                        message: 'Deployment has minimum availability.',
                        lastTransitionTime: '2025-12-11T11:49:59Z',
                        lastUpdateTime: '2025-12-11T11:49:59Z',
                    },
                ],
            },
        } as Deployment,
    ],
    pods: [
        {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'synergy-leverager-587c7bc457-x2k9m',
                namespace: 'default',
                uid: 'synergy-pod-uid',
                creationTimestamp: '2025-06-20T16:38:59Z',
                labels: { app: 'synergy-leverager', 'pod-template-hash': '587c7bc457' },
            },
            spec: {
                containers: [{
                    name: 'synergy-leverager',
                    image: 'registry.cn-hangzhou.aliyuncs.com/fizz_1024/cka:busybox-unstable',
                    args: ['/bin/sh', '-c', `i=0; while true; do
  echo "$(date) INFO $i" >> /var/log/synergy-leverager.log;
  i=$((i+1));
  sleep 5;
done
`],
                }],
                nodeName: 'node01',
            },
            status: { phase: 'Running', conditions: [], containerStatuses: [] },
        },
    ],
};

export const cka03Sidecar: Scenario = {
    id: 'cka-03',
    title: 'CKA 第3题：Sidecar 容器',
    description: '为现有 Deployment 添加日志采集 Sidecar 容器',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

您需要将一个传统应用程序集成到 Kubernetes 的日志架构（例如 kubectl logs）中。
实现这个要求的通常方法是添加一个流式传输并置容器。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

更新现有的 synergy-leverager Deployment：
• 将使用 busybox:stable 镜像，且名为 sidecar 的并置容器，添加到现有的 Pod
• 新的并置容器必须运行以下命令：
  /bin/sh -c "tail -n+1 -f /var/log/synergy-leverager.log"
• 使用挂载在 /var/log 的 Volume，使日志文件 synergy-leverager.log 可供并置容器使用

⚠️ 除了添加所需的卷挂载之外，请勿修改现有容器的规范。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'add-sidecar',
            description: '添加名为 sidecar 的容器，使用 busybox:stable 镜像',
            hint: '导出 Deployment YAML，添加第二个容器',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const deploy = state.deployments.find(d => d.metadata.name === 'synergy-leverager');
                if (!deploy) return false;
                
                const containers = deploy.spec.template.spec.containers;
                // 只检查 sidecar 容器是否存在，镜像名包含 busybox 即可
                return containers.some(c => 
                    c.name === 'sidecar' && 
                    (c.image === 'busybox:stable' || c.image?.includes('busybox'))
                );
            },
        },
        {
            id: 'configure-volume',
            description: '配置共享 Volume 并挂载到 /var/log',
            hint: '添加 emptyDir 卷并在两个容器中挂载',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const deploy = state.deployments.find(d => d.metadata.name === 'synergy-leverager');
                if (!deploy) return false;
                
                const volumes = deploy.spec.template.spec.volumes || [];
                const hasVarlogVolume = volumes.some(v => v.name === 'varlog' && v.emptyDir);
                
                const containers = deploy.spec.template.spec.containers;
                const allContainersHaveMount = containers.every(c => 
                    c.volumeMounts?.some(vm => vm.name === 'varlog' && vm.mountPath === '/var/log')
                );
                
                return hasVarlogVolume && allContainersHaveMount;
            },
        },
        {
            id: 'verify-running',
            description: '验证 Pod 显示 2/2 Running',
            hint: '使用 kubectl get pod | grep synergy-leverager',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const deploy = state.deployments.find(d => d.metadata.name === 'synergy-leverager');
                return deploy?.spec.template.spec.containers.length === 2;
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 导出 Deployment YAML
kubectl get deployment synergy-leverager -o yaml > sidecar.yaml

2️⃣ 官网模板（搜"边车"或 sidecar）
参考链接：https://kubernetes.io/docs/concepts/cluster-administration/logging

3️⃣ 编辑 sidecar.yaml，在 dnsPolicy: ClusterFirst 上面添加：

        volumeMounts:
        - name: varlog
          mountPath: /var/log
      - name: sidecar
        image: busybox:stable
        args: [/bin/sh, -c, 'tail -n+1 -f /var/log/synergy-leverager.log'] 
        volumeMounts:
        - name: varlog
          mountPath: /var/log

4️⃣ 在 status: 的上面添加：
      volumes:
      - name: varlog
        emptyDir: {}

5️⃣ 更新应用
kubectl apply -f sidecar.yaml

6️⃣ 检查新 Pod 是否 Running
kubectl get pod | grep synergy-leverager
显示 2/2 Running 表示成功`,
        
        `💡 关键知识点：
• Sidecar 模式是多容器 Pod 的常见设计模式
• 使用 emptyDir 卷在容器间共享文件
• tail -f 命令持续输出文件内容到 stdout
• 这样 kubectl logs 就可以访问日志了`,
    ],
    rewards: {
        xp: 100,
        badges: ['sidecar-master'],
    },
};
