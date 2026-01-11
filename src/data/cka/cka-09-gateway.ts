/**
 * CKA 第九题：Gateway API
 * 
 * 考点：Gateway、HTTPRoute 创建，从 Ingress 迁移到 Gateway API
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system'],
    gatewayClasses: [
        {
            apiVersion: 'gateway.networking.k8s.io/v1',
            kind: 'GatewayClass',
            metadata: { name: 'nginx', uid: 'gc-uid', creationTimestamp: new Date().toISOString() },
            spec: { controllerName: 'k8s.io/nginx-gateway-controller' },
        },
    ],
    ingresses: [
        {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'Ingress',
            metadata: { name: 'web', namespace: 'default', uid: 'web-ing-uid', creationTimestamp: new Date().toISOString() },
            spec: {
                ingressClassName: 'nginx',
                tls: [{ hosts: ['gateway.web.k8s.local'], secretName: 'web-cert' }],
                rules: [{
                    host: 'gateway.web.k8s.local',
                    http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'web', port: { number: 80 } } } }] },
                }],
            },
            status: { loadBalancer: {} },
        },
    ],
    secrets: [
        {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: { name: 'web-cert', namespace: 'default', uid: 'cert-uid', creationTimestamp: new Date().toISOString() },
            type: 'kubernetes.io/tls',
            data: { 'tls.crt': 'LS0t...', 'tls.key': 'LS0t...' },
        },
    ],
    services: [
        {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: { name: 'web', namespace: 'default', uid: 'web-svc-uid', creationTimestamp: new Date().toISOString() },
            spec: { selector: { app: 'web' }, ports: [{ port: 80, targetPort: 80 }], type: 'ClusterIP' },
        },
    ],
};

export const cka09Gateway: Scenario = {
    id: 'cka-09',
    title: 'CKA 第9题：Gateway API 迁移',
    description: '将 Web 应用从 Ingress 迁移到 Gateway API',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

将现有 Web 应用程序从 Ingress 迁移到 Gateway API。您必须维护 HTTPS 访问权限。
注意：集群中安装了一个名为 nginx 的 GatewayClass。

• 首先，创建一个名为 web-gateway 的 Gateway，主机名为 gateway.web.k8s.local
  并保持现有名为 web 的 Ingress 资源的现有 TLS 和侦听器配置
• 接下来，创建一个名为 web-route 的 HTTPRoute，主机名为 gateway.web.k8s.local
  并保持现有名为 web 的 Ingress 资源的现有路由规则
• 最后，删除名为 web 的现有 Ingress 资源

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'create-gateway',
            description: '创建名为 web-gateway 的 Gateway',
            hint: '参考官方 Gateway 模板',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return state.gateways.some(g => g.metadata.name === 'web-gateway');
            },
        },
        {
            id: 'create-httproute',
            description: '创建名为 web-route 的 HTTPRoute',
            hint: '参考官方 HTTPRoute 模板',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return state.httpRoutes.some(r => r.metadata.name === 'web-route');
            },
        },
        {
            id: 'delete-ingress',
            description: '删除名为 web 的 Ingress',
            hint: 'kubectl delete ingress web',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return !state.ingresses.some(i => i.metadata.name === 'web');
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 检查现有 Ingress
kubectl get ingress web -o yaml
查看 tls secretName 和 paths 配置

2️⃣ 创建 Gateway
参考链接：https://kubernetes.io/docs/concepts/services-networking/gateway/

vim gateway.yaml

apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
spec:
  gatewayClassName: nginx 
  listeners:
    - name: https
      hostname: gateway.web.k8s.local
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: web-cert
            kind: Secret
            group: ""

kubectl apply -f gateway.yaml

3️⃣ 创建 HTTPRoute
vim httproute.yaml

apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
spec:
  parentRefs:
    - name: web-gateway
  hostnames:
    - "gateway.web.k8s.local"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: web
          port: 80

kubectl apply -f httproute.yaml

4️⃣ 删除 Ingress
kubectl delete ingress web`,
    ],
    rewards: { xp: 150, badges: ['gateway-master'] },
};
