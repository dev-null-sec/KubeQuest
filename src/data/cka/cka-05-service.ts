/**
 * CKA 第五题：Service
 * 
 * 考点：容器端口暴露、NodePort Service 创建
 */

import type { Scenario } from '../scenarios';
import type { ClusterState, Deployment } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'spline-reticulator'],
    deployments: [
        {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: 'front-end',
                namespace: 'spline-reticulator',
                uid: 'front-end-uid',
                creationTimestamp: new Date().toISOString(),
            },
            spec: {
                replicas: 1,
                selector: { matchLabels: { app: 'front-end' } },
                template: {
                    metadata: { labels: { app: 'front-end' } },
                    spec: {
                        containers: [{
                            name: 'nginx',
                            image: 'nginx:latest',
                            // 注意：没有配置 ports
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
    pods: [
        {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'front-end-abc12',
                namespace: 'spline-reticulator',
                uid: 'front-end-pod-uid',
                creationTimestamp: new Date().toISOString(),
                labels: { app: 'front-end' },
            },
            spec: {
                containers: [{
                    name: 'nginx',
                    image: 'nginx:latest',
                }],
                nodeName: 'node01',
            },
            status: { phase: 'Running', conditions: [], containerStatuses: [] },
        },
    ],
};

export const cka05Service: Scenario = {
    id: 'cka-05',
    title: 'CKA 第5题：Service',
    description: '配置容器端口并创建 NodePort Service',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

重新配置 spline-reticulator namespace 中现有的 front-end Deployment，以公开现有容器 nginx 的端口 80/tcp

创建一个名为 front-end-svc 的新 Service，以公开容器端口 80/tcp

配置新的 Service，以通过 NodePort 公开各个 Pod

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'expose-port',
            description: '修改 Deployment，为 nginx 容器添加 containerPort 80',
            hint: '使用 kubectl edit deployment front-end -n spline-reticulator',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const deploy = state.deployments.find(d => 
                    d.metadata.name === 'front-end' && 
                    d.metadata.namespace === 'spline-reticulator'
                );
                if (!deploy) return false;
                
                const nginx = deploy.spec.template.spec.containers.find(c => c.name === 'nginx');
                return nginx?.ports?.some(p => p.containerPort === 80) ?? false;
            },
        },
        {
            id: 'create-service',
            description: '创建名为 front-end-svc 的 NodePort Service',
            hint: '使用 kubectl expose deployment front-end --type=NodePort --port=80 --name=front-end-svc',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const svc = state.services.find(s => 
                    s.metadata.name === 'front-end-svc' && 
                    s.metadata.namespace === 'spline-reticulator'
                );
                return svc?.spec.type === 'NodePort' && 
                       svc?.spec.ports?.some(p => p.port === 80);
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 在线修改 front-end Deployment
kubectl -n spline-reticulator edit deployment front-end

在 containers 的 nginx 容器下添加：
        ports:
        - containerPort: 80
          protocol: TCP

2️⃣ 使用 NodePort 类型暴露 80/tcp 端口
kubectl -n spline-reticulator expose deployment front-end --type=NodePort --port=80 --target-port=80 --name=front-end-svc

3️⃣ 检查 Service
kubectl -n spline-reticulator get svc front-end-svc -o wide`,
        
        `💡 关键知识点：
• containerPort 声明容器监听的端口
• NodePort 类型的 Service 会在每个节点上暴露一个端口
• kubectl expose 是快速创建 Service 的方式`,
    ],
    rewards: {
        xp: 100,
        badges: ['service-master'],
    },
};
