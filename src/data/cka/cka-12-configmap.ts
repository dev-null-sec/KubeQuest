/**
 * CKA 第十二题：ConfigMap
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const nginxConfContent = `server {
  listen 443 ssl;
  server_name web.k8snginx.local;

  ssl_certificate /etc/nginx/ssl/tls.crt;
  ssl_certificate_key /etc/nginx/ssl/tls.key;

  ssl_protocols TLSv1.3;
  ssl_ciphers 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256';
  ssl_prefer_server_ciphers on;

  location / {
    root /usr/share/nginx/html;
    index index.html;
  }
}
`;

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'nginx-static'],
    configMaps: [
        {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: { 
                name: 'nginx-config', 
                namespace: 'nginx-static', 
                uid: 'e9e3b942-61d8-4add-9ce0-6a8660cfa9c6', 
                creationTimestamp: '2025-11-17T06:49:39Z',
                resourceVersion: '146634',
            },
            data: { 'nginx.conf': nginxConfContent },
            immutable: false,
        },
    ],
    deployments: [
        {
            apiVersion: 'apps/v1', kind: 'Deployment',
            metadata: { name: 'nginx-static', namespace: 'nginx-static', uid: 'nginx-dep-uid', creationTimestamp: new Date().toISOString(), labels: { app: 'nginx-static' } },
            spec: { 
                replicas: 1, 
                selector: { matchLabels: { app: 'nginx-static' } }, 
                template: { 
                    metadata: { labels: { app: 'nginx-static' } }, 
                    spec: { 
                        containers: [{ name: 'nginx', image: 'nginx:1.25' }],
                        volumes: [{ name: 'config', configMap: { name: 'nginx-config' } }]
                    } 
                } 
            },
            status: { replicas: 1, readyReplicas: 1, availableReplicas: 1 },
        },
    ],
    pods: [
        {
            apiVersion: 'v1', kind: 'Pod',
            metadata: { name: 'nginx-static-7f8d9c6b5-xk2mj', namespace: 'nginx-static', uid: 'nginx-pod-uid', creationTimestamp: new Date().toISOString(), labels: { app: 'nginx-static' } },
            spec: { containers: [{ name: 'nginx', image: 'nginx:1.25' }], nodeName: 'node01' },
            status: { phase: 'Running', podIP: '10.244.1.30', containerStatuses: [{ name: 'nginx', ready: true, restartCount: 0, state: { running: { startedAt: new Date().toISOString() } }, image: 'nginx:1.25', imageID: 'docker://nginx' }] },
        },
    ],
};

export const cka12ConfigMap: Scenario = {
    id: 'cka-12',
    title: 'CKA 第12题：ConfigMap 与 TLS 配置',
    description: '更新 ConfigMap 并设置为不可变',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

名为 nginx-static 的 NGINX Deployment 正在 nginx-static namespace 中运行。
它通过名为 nginx-config 的 ConfigMap 进行配置。

• 更新 nginx-config ConfigMap，添加 TLSv1.2 支持（当前仅有 TLSv1.3）
• 最后请将 nginx-config ConfigMap 设置为不可变

您可以使用以下命令测试更改：
student@cka000048$ curl -k --tls-max 1.2 https://web.k8snginx.local

注意：您可以根据需要重新创建、重新启动或扩展资源。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'delete-configmap',
            description: '删除旧的 ConfigMap',
            hint: 'kubectl -n nginx-static delete configmap nginx-config',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('delete') && 
                    cmd.includes('configmap') && 
                    cmd.includes('nginx-config')
                );
            },
        },
        {
            id: 'update-ssl',
            description: '重新创建 ConfigMap，添加 TLSv1.2 支持',
            hint: '修改 ssl_protocols 为 TLSv1.2 TLSv1.3，然后 kubectl apply',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const cm = state.configMaps.find(c => c.metadata.name === 'nginx-config' && c.metadata.namespace === 'nginx-static');
                if (!cm?.data?.['nginx.conf']) return false;
                // 需要同时包含 TLSv1.2 和 TLSv1.3
                return cm.data['nginx.conf'].includes('TLSv1.2') && 
                       cm.data['nginx.conf'].includes('TLSv1.3');
            },
        },
        {
            id: 'set-immutable',
            description: '设置 ConfigMap 为不可变 (immutable: true)',
            hint: '在 YAML 中添加 immutable: true',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const cm = state.configMaps.find(c => c.metadata.name === 'nginx-config' && c.metadata.namespace === 'nginx-static');
                return cm?.immutable === true || false;
            },
        },
        {
            id: 'restart-deployment',
            description: '重启 Deployment 以应用配置更改',
            hint: 'kubectl rollout restart deployment nginx-static -n nginx-static',
            checkCondition: (_state: ClusterState, commandHistory: string[]) => {
                return commandHistory.some(cmd => 
                    cmd.includes('rollout') && 
                    cmd.includes('restart') && 
                    cmd.includes('nginx-static')
                );
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 导出 ConfigMap
kubectl -n nginx-static get configmap nginx-config -o yaml > nginx-config.yaml

2️⃣ 修改 ConfigMap
vim nginx-config.yaml

修改 ssl_protocols 配置：
ssl_protocols TLSv1.2 TLSv1.3;

添加不可变配置：
immutable: true

3️⃣ 删除并重新创建
kubectl -n nginx-static delete configmaps nginx-config
kubectl apply -f nginx-config.yaml

4️⃣ 重启 Deployment
kubectl rollout restart deployment nginx-static -n nginx-static

5️⃣ 验证
kubectl -n nginx-static get pod
curl -k --tls-max 1.2 https://web.k8snginx.local`,
    ],
    rewards: { xp: 100, badges: ['configmap-master'] },
};
