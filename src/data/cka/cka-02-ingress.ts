/**
 * CKA 第二题：Ingress
 * 
 * 考点：Ingress 资源创建、路径配置、Service 关联
 */

import type { Scenario } from '../scenarios';
import type { ClusterState, Service } from '../../engine/cluster';

// 初始状态：sound-repeater 命名空间中有 echoserver-service
const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'sound-repeater'],
    services: [
        {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
                name: 'echoserver-service',
                namespace: 'sound-repeater',
                uid: 'echo-svc-uid',
                creationTimestamp: new Date().toISOString(),
            },
            spec: {
                selector: { app: 'echoserver' },
                ports: [{ port: 8080, targetPort: 8080, protocol: 'TCP' }],
                type: 'ClusterIP',
                clusterIP: '10.96.100.1',
            },
        } as Service,
    ],
    pods: [
        {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'echoserver-abc12',
                namespace: 'sound-repeater',
                uid: 'echo-pod-uid',
                creationTimestamp: new Date().toISOString(),
                labels: { app: 'echoserver' },
            },
            spec: {
                containers: [{
                    name: 'echoserver',
                    image: 'k8s.gcr.io/echoserver:1.4',
                    ports: [{ containerPort: 8080 }],
                }],
                nodeName: 'node01',
            },
            status: { phase: 'Running', conditions: [], containerStatuses: [] },
        },
    ],
};

export const cka02Ingress: Scenario = {
    id: 'cka-02',
    title: 'CKA 第2题：创建 Ingress',
    description: '在 sound-repeater namespace 中创建 Ingress 资源',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

如下创建新的 Ingress 资源：
• 名称：echo
• Namespace：sound-repeater
• 使用 Service 端口 8080 在 http://example.org/echo 上公开 echoserver-service Service

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-ingress',
            description: '创建名为 echo 的 Ingress，在 /echo 路径公开 echoserver-service:8080',
            hint: '创建 ingress.yaml 并使用 kubectl apply -f ingress.yaml',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const ingress = state.ingresses.find(i => 
                    i.metadata.name === 'echo' && 
                    i.metadata.namespace === 'sound-repeater'
                );
                if (!ingress) return false;
                
                // 检查规则
                const hasCorrectRule = ingress.spec.rules?.some(rule => 
                    rule.host === 'example.org' &&
                    rule.http?.paths?.some(path => 
                        path.path === '/echo' &&
                        path.backend?.service?.name === 'echoserver-service' &&
                        path.backend?.service?.port?.number === 8080
                    )
                ) ?? false;
                
                return hasCorrectRule;
            },
        },
    ],
    initialState,
    hints: [
        `📖 解题步骤：

1️⃣ 在官网 ingress 搜基础 ingress 文档找模板
参考链接：https://kubernetes.io/docs/concepts/services-networking/ingress/

2️⃣ 集群用的是 ingress-nginx，创建 ingress.yaml：

vim ingress.yaml

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: 
  name: echo
  namespace: sound-repeater
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: "/"  
spec:
  ingressClassName: nginx
  rules:
  - host: "example.org"   
    http:
      paths:
      - path: /echo
        pathType: Prefix
        backend:
          service:
            name: echoserver-service
            port:
              number: 8080

3️⃣ 创建 Ingress
kubectl apply -f ingress.yaml

4️⃣ 测试
curl http://example.org:30080/echo`,
        
        `💡 关键知识点：
• ingressClassName 指定 Ingress 控制器
• pathType 可以是 Prefix、Exact 或 ImplementationSpecific
• backend.service 指定后端服务名称和端口`,
    ],
    rewards: {
        xp: 100,
        badges: ['ingress-master'],
    },
};
