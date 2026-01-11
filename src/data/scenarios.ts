/**
 * 剧情模式关卡定义
 */

import type { ClusterState } from '../engine/cluster';
import { ckaScenarios } from './cka';

export interface ScenarioObjective {
    id: string;
    description: string;
    hint?: string;
    checkCondition: (state: ClusterState, commandHistory: string[]) => boolean;
    completed?: boolean;
}

export interface Scenario {
    id: string;
    title: string;
    description: string;
    story: string;
    difficulty: 'easy' | 'medium' | 'hard';
    objectives: ScenarioObjective[];
    initialState?: Partial<ClusterState>;
    initialFiles?: Record<string, string>; // 路径 -> 内容 的映射
    hints: string[];
    rewards: {
        xp: number;
        title?: string;
        badges?: string[];
    };
}

// ========== 第一章：基础操作 ==========

const scenario1_1: Scenario = {
    id: '1-1',
    title: '初入集群',
    description: '熟悉 kubectl 基本命令',
    story: `欢迎使用 Kubernetes 模拟器！

你现在在一个模拟的Kubernetes环境中。让我们从最基本的操作开始，先检查一下集群的节点状态。

执行 kubectl get nodes 命令来查看集群中的节点信息。`,
    difficulty: 'easy',
    objectives: [
        {
            id: 'get-nodes',
            description: '使用 kubectl get nodes 查看集群节点',
            hint: '尝试运行：kubectl get nodes',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+(nodes?|no)/.test(cmd))
        },
        {
            id: 'get-pods',
            description: '使用 kubectl get pods 查看默认命名空间的 Pod',
            hint: '尝试运行：kubectl get pods',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+(pods?|po)/.test(cmd))
        },
        {
            id: 'get-namespaces',
            description: '查看集群中所有的命名空间',
            hint: '尝试运行：kubectl get namespaces',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+(namespaces?|ns)/.test(cmd))
        }
    ],
    hints: [
        '使用 kubectl get <资源类型> 可以列出资源',
        'kubectl get nodes 显示集群节点',
        'kubectl get pods 显示 Pod 列表',
        'kubectl get ns 是 kubectl get namespaces 的简写'
    ],
    rewards: { xp: 50 }
};

const scenario1_2: Scenario = {
    id: '1-2',
    title: '创建第一个 Pod',
    description: '学习创建 Pod',
    story: `"不错！环境检查完毕。" Leader 满意地点点头。

"接下来，我们需要部署一个测试用的 Nginx 服务器。你先创建一个简单的 Pod 吧。"

你打开终端，准备开始你的第一次部署...`,
    difficulty: 'easy',
    objectives: [
        {
            id: 'create-nginx-pod',
            description: '创建一个使用 nginx 镜像的 Pod（名称任意）',
            hint: '使用 kubectl run 或创建 YAML 文件后 kubectl apply -f',
            checkCondition: (state) => state.pods.some(p => 
                p.spec.containers.some(c => c.image.includes('nginx'))
            )
        },
        {
            id: 'verify-pod-running',
            description: '使用 kubectl get pods 确认 Pod 状态为 Running',
            hint: '运行 kubectl get pods 查看状态',
            checkCondition: (state, history) => 
                history.some(cmd => /kubectl\s+get\s+(pods?|po)/.test(cmd)) &&
                state.pods.some(p => 
                    p.spec.containers.some(c => c.image.includes('nginx')) && 
                    p.status.phase === 'Running'
                )
        }
    ],
    hints: [
        '方式1: kubectl run my-nginx --image=nginx',
        '方式2: 先 kubectl run xxx --image=nginx --dry-run=client -o yaml > pod.yaml，再 kubectl apply -f pod.yaml',
        '最后运行 kubectl get pods 确认状态'
    ],
    rewards: { xp: 75 }
};

const scenario1_3: Scenario = {
    id: '1-3',
    title: 'Pod 的生命周期',
    description: '学习查看、删除和管理 Pod',
    story: `"太棒了！Pod 已经运行起来了。" Leader 走过来查看你的屏幕。

"现在让我教你一些更高级的操作。首先，让我们看看这个 Pod 的详细信息，然后删除它。"

注意：集群中已经有一个名为 test-nginx 的 Pod 供你操作。`,
    difficulty: 'easy',
    initialState: {
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'test-nginx', namespace: 'default', labels: { app: 'nginx' } },
                spec: { 
                    containers: [{ name: 'nginx', image: 'nginx:alpine' }],
                    restartPolicy: 'Always'
                },
                status: { 
                    phase: 'Running',
                    containerStatuses: [{
                        name: 'nginx',
                        ready: true,
                        restartCount: 0,
                        state: { running: { startedAt: new Date().toISOString() } },
                        image: 'nginx:alpine',
                        imageID: 'docker-pullable://nginx@sha256:abc123'
                    }]
                }
            }
        ]
    },
    objectives: [
        {
            id: 'describe-pod',
            description: '使用 kubectl describe pod test-nginx 查看 Pod 详细信息',
            hint: '运行：kubectl describe pod test-nginx',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+describe\s+pod\s+test-nginx/.test(cmd))
        },
        {
            id: 'delete-pod',
            description: '删除 test-nginx Pod',
            hint: '运行：kubectl delete pod test-nginx',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+delete\s+pod\s+test-nginx/.test(cmd))
        },
        {
            id: 'verify-deleted',
            description: '使用 kubectl get pods 确认 Pod 已被删除',
            hint: '运行 kubectl get pods 查看',
            checkCondition: (state, history) => 
                history.some(cmd => /kubectl\s+get\s+(pods?|po)/.test(cmd)) &&
                !state.pods.some(p => p.metadata.name === 'test-nginx')
        }
    ],
    hints: [
        'kubectl describe pod test-nginx 显示 Pod 详细信息',
        'kubectl delete pod test-nginx 删除指定 Pod',
        '删除后运行 kubectl get pods 确认'
    ],
    rewards: { xp: 75 }
};

// ========== 第二章：工作负载管理 ==========

const scenario2_1: Scenario = {
    id: '2-1',
    title: 'Deployment 与副本自愈',
    description: '使用 Deployment 管理应用副本，理解控制器的自愈机制',
    story: `一周后，你已经熟悉了基本操作。今天收到了一个新任务：

"我们需要部署一个生产级别的 Web 应用。" 项目经理说道，"要确保高可用，即使某个 Pod 挂了，服务也不能中断。"

"Deployment 控制器会自动维护期望的副本数，" 你解释道，"如果某个 Pod 被删除或崩溃，它会自动创建新的 Pod 来替代。"

"听起来不错，演示一下！"

💡 提示：Deployment 是声明式的，它会持续协调实际状态与期望状态的差异。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-deployment',
            description: '创建一个 Deployment，至少 3 个副本',
            hint: '使用 kubectl create deployment 或 YAML',
            checkCondition: (state) => state.deployments.some(d => d.spec.replicas >= 3)
        },
        {
            id: 'verify-deployment',
            description: '使用 kubectl get deploy 确认 Deployment 状态',
            hint: '查看 READY 列是否显示 3/3',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+(deployments?|deploy)/.test(cmd)
            )
        },
        {
            id: 'verify-pods',
            description: '查看 Pod 列表，确认 3 个副本都在运行',
            hint: '使用 kubectl get pods 查看',
            checkCondition: (state, history) => 
                history.some(cmd => /kubectl\s+get\s+(pods?|po)/.test(cmd)) &&
                state.pods.filter(p => p.status.phase === 'Running').length >= 3
        },
        {
            id: 'test-self-healing',
            description: '删除一个 Pod，观察 Deployment 自动恢复（会创建新 Pod）',
            hint: 'kubectl delete pod <pod-name>，然后再 get pods 观察',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+delete\s+pod/.test(cmd))
        },
        {
            id: 'scale-deployment',
            description: '将 Deployment 扩容到 5 个副本',
            hint: 'kubectl scale deployment <name> --replicas=5',
            checkCondition: (state) => state.deployments.some(d => d.spec.replicas >= 5)
        }
    ],
    hints: [
        'kubectl create deployment myapp --image=nginx --replicas=3',
        'kubectl get deploy 查看 Deployment 状态',
        '删除 Pod 后，Deployment 控制器会自动创建新 Pod 维持期望副本数',
        'kubectl scale deployment <name> --replicas=5 扩容'
    ],
    rewards: { xp: 120 }
};

const scenario2_2: Scenario = {
    id: '2-2',
    title: 'Service 暴露服务',
    description: '使用 Service 暴露应用并理解 Label Selector',
    story: `"Deployment 部署成功了！" 你向团队报告。

"很好，现在我们需要让其他服务能访问到这个 Web 应用。" 架构师说道，"创建一个 Service 来暴露它。"

"等等，" 他看了一眼配置，"这个 Deployment 的 Pod 似乎没有合适的标签，Service 需要通过 Label Selector 来找到后端 Pod。你先确认一下标签配置。"

💡 提示：Service 通过 selector 匹配 Pod 的 labels 来确定流量转发目标。`,
    difficulty: 'medium',
    initialState: {
        deployments: [
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { 
                    name: 'webapp', 
                    namespace: 'default',
                    labels: { app: 'webapp' }
                },
                spec: { 
                    replicas: 2, 
                    selector: { matchLabels: { app: 'webapp' } },
                    template: {
                        metadata: { labels: { app: 'webapp' } },
                        spec: { containers: [{ name: 'nginx', image: 'nginx:1.20' }] }
                    }
                },
                status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 }
            }
        ],
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { 
                    name: 'webapp-abc123', 
                    namespace: 'default',
                    labels: { app: 'webapp' },
                    uid: 'pod-webapp-1',
                    creationTimestamp: new Date().toISOString()
                },
                spec: { 
                    containers: [{ name: 'nginx', image: 'nginx:1.20' }],
                    nodeName: 'node01'
                },
                status: { phase: 'Running', podIP: '10.244.1.10', hostIP: '192.168.1.3' }
            },
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { 
                    name: 'webapp-def456', 
                    namespace: 'default',
                    labels: { app: 'webapp' },
                    uid: 'pod-webapp-2',
                    creationTimestamp: new Date().toISOString()
                },
                spec: { 
                    containers: [{ name: 'nginx', image: 'nginx:1.20' }],
                    nodeName: 'node02'
                },
                status: { phase: 'Running', podIP: '10.244.2.11', hostIP: '192.168.1.4' }
            }
        ]
    },
    objectives: [
        {
            id: 'check-labels',
            description: '查看 Pod 的标签配置',
            hint: '使用 kubectl get pods --show-labels 或 kubectl describe pod',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(get\s+pods?\s+.*--show-labels|describe\s+pod|get\s+pods?\s+-o\s+(yaml|json))/.test(cmd)
            )
        },
        {
            id: 'create-service',
            description: '创建一个 Service，使用正确的 selector 关联到 webapp Pod',
            hint: 'Service 的 selector 需要匹配 Pod 的 labels',
            checkCondition: (state) => state.services.some(s => 
                s.metadata.name !== 'kubernetes' && 
                s.spec.selector && 
                (s.spec.selector['app'] === 'webapp' || Object.keys(s.spec.selector).length > 0)
            )
        },
        {
            id: 'verify-service',
            description: '验证 Service 创建成功并查看详情',
            hint: '使用 kubectl get svc 和 kubectl describe svc',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+(get|describe)\s+svc/.test(cmd))
        }
    ],
    hints: [
        '先用 kubectl get pods --show-labels 查看 Pod 的标签',
        'kubectl expose deployment webapp --name=webapp-svc --port=80 --target-port=80 --type=ClusterIP',
        '命令格式: kubectl expose <资源类型> <资源名> --name=<服务名> --port=<服务端口> --target-port=<容器端口>',
        'Service 的 selector 会自动从 Deployment 继承，无需手动指定'
    ],
    rewards: { xp: 100 }
};

// ========== 第三章：配置管理 ==========

const scenario3_1: Scenario = {
    id: '3-1',
    title: 'ConfigMap 挂载实战',
    description: '创建 ConfigMap 并挂载到 Pod 中使用',
    story: `"我们的应用需要读取数据库连接配置，" 开发同事说，"但我不想把配置硬编码在镜像里。"

"没问题，" 你回答，"Kubernetes 的 ConfigMap 可以将配置与镜像解耦。你可以把配置存在 ConfigMap 里，然后挂载到 Pod 中。"

"挂载？怎么挂载？" 开发同事一脸懵。

"有两种方式：作为环境变量注入，或者作为文件挂载到容器内。让我演示一下。"

💡 提示：查阅 Kubernetes 文档 "Configure a Pod to Use a ConfigMap" 章节。`,
    difficulty: 'medium',
    initialState: {
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { 
                    name: 'demo-app', 
                    namespace: 'default',
                    labels: { app: 'demo' }
                },
                spec: { 
                    containers: [{ name: 'app', image: 'busybox', command: ['sleep', '3600'] }],
                    nodeName: 'node01'
                },
                status: { phase: 'Running', podIP: '10.244.1.20', hostIP: '192.168.1.3' }
            }
        ]
    },
    objectives: [
        {
            id: 'create-configmap',
            description: '创建一个 ConfigMap，包含至少一个配置项（如 DB_HOST=mysql.local）',
            hint: '使用 kubectl create configmap 或编写 YAML',
            checkCondition: (state) => state.configMaps.length > 0
        },
        {
            id: 'view-configmap',
            description: '查看 ConfigMap 的内容，确认配置正确',
            hint: '使用 kubectl describe configmap 或 kubectl get configmap -o yaml',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(describe\s+configmap|get\s+configmaps?\s+.*-o\s+(yaml|json))/.test(cmd)
            )
        },
        {
            id: 'create-pod-with-configmap',
            description: '创建新 Pod，将 ConfigMap 作为环境变量或 Volume 挂载',
            hint: '在 Pod YAML 中使用 envFrom 或 volumes + volumeMounts',
            checkCondition: (state) => state.pods.some(p => 
                // 检查是否使用了 envFrom 引用 ConfigMap
                p.spec.containers.some(c => 
                    c.envFrom?.some(e => e.configMapRef) ||
                    c.env?.some(e => e.valueFrom?.configMapKeyRef)
                ) ||
                // 或者检查是否挂载了 ConfigMap volume
                (p.spec.volumes?.some(v => v.configMap) &&
                 p.spec.containers.some(c => (c.volumeMounts?.length ?? 0) > 0))
            )
        },
        {
            id: 'verify-config',
            description: '进入 Pod 验证配置已生效（使用 exec 查看环境变量或文件）',
            hint: '使用 kubectl exec <pod> -- env 或 cat /path/to/config',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+exec\s+.*(--)?\s*(env|cat|printenv|echo)/.test(cmd)
            )
        }
    ],
    hints: [
        '创建 ConfigMap: kubectl create configmap myconfig --from-literal=DB_HOST=mysql.local',
        '方式一 - 环境变量: spec.containers[].envFrom[].configMapRef.name',
        '方式二 - Volume: spec.volumes[].configMap.name + spec.containers[].volumeMounts',
        '验证: kubectl exec <pod> -- env | grep DB_HOST'
    ],
    rewards: { xp: 120 }
};

const scenario3_2: Scenario = {
    id: '3-2',
    title: 'Secret 敏感数据管理',
    description: '使用 Secret 安全地存储和使用敏感信息',
    story: `"数据库密码不能明文存储！" 安全主管严肃地说。

"ConfigMap 是明文的，任何有权限的人都能看到。密码、API Key 这类敏感信息必须用 Secret。"

你需要创建一个 Secret 存储数据库密码，并安全地挂载到应用 Pod 中。

💡 提示：Secret 的值需要 base64 编码，或使用 --from-literal 自动编码。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-secret',
            description: '创建一个 Secret，存储数据库用户名和密码',
            hint: '使用 kubectl create secret generic',
            checkCondition: (state) => state.secrets.length > 0
        },
        {
            id: 'verify-secret-encoded',
            description: '查看 Secret 内容，理解 base64 编码',
            hint: '使用 kubectl get secret <name> -o yaml 查看编码后的值',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+secrets?\s+.*-o\s+(yaml|json)/.test(cmd)
            )
        },
        {
            id: 'mount-secret-to-pod',
            description: '创建 Pod，将 Secret 作为环境变量或文件挂载',
            hint: 'Secret 的挂载方式与 ConfigMap 类似',
            checkCondition: (state) => state.pods.some(p => 
                p.spec.containers.some(c => 
                    c.envFrom?.some(e => e.secretRef) ||
                    c.env?.some(e => e.valueFrom?.secretKeyRef)
                ) ||
                (p.spec.volumes?.some(v => v.secret) &&
                 p.spec.containers.some(c => (c.volumeMounts?.length ?? 0) > 0))
            )
        }
    ],
    hints: [
        '创建: kubectl create secret generic db-creds --from-literal=username=admin --from-literal=password=secret123',
        '查看: kubectl get secret db-creds -o yaml (注意 data 是 base64 编码的)',
        '解码: echo "c2VjcmV0MTIz" | base64 -d',
        '挂载为环境变量: env[].valueFrom.secretKeyRef'
    ],
    rewards: { xp: 130 }
};

// ========== 第四章：故障排查 ==========

const scenario4_1: Scenario = {
    id: '4-1',
    title: '紧急故障',
    description: '排查并修复 Deployment 管理的 Pod 故障',
    story: `凌晨 3 点，你被电话叫醒。

"紧急情况！生产环境的 critical-app 服务全挂了！" 值班同事焦急地说。

你迅速打开电脑，发现 Deployment 管理的所有 Pod 都在 CrashLoopBackOff。
看起来是有人误改了 Deployment 配置导致应用无法启动...

作为有经验的 SRE，你知道应该修改 Deployment 配置来触发滚动更新，而不是手动删除 Pod。`,
    difficulty: 'hard',
    initialState: {
        deployments: [
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { 
                    name: 'critical-app', 
                    namespace: 'default',
                    labels: { app: 'critical' }
                },
                spec: {
                    replicas: 2,
                    selector: { matchLabels: { app: 'critical' } },
                    template: {
                        metadata: { labels: { app: 'critical' } },
                        spec: {
                            containers: [{
                                name: 'app',
                                image: 'myapp:v1',
                                env: [
                                    { name: 'DB_HOST', value: '' },  // 空值导致崩溃
                                    { name: 'DB_PORT', value: '3306' }
                                ]
                            }]
                        }
                    }
                },
                status: { replicas: 2, readyReplicas: 0, availableReplicas: 0 }
            }
        ],
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { 
                    name: 'critical-app-7d4b8c6f5-x2k9m', 
                    namespace: 'default', 
                    labels: { app: 'critical', 'pod-template-hash': '7d4b8c6f5' }
                },
                spec: { 
                    containers: [{
                        name: 'app',
                        image: 'myapp:v1',
                        env: [
                            { name: 'DB_HOST', value: '' },
                            { name: 'DB_PORT', value: '3306' }
                        ]
                    }],
                    restartPolicy: 'Always',
                    nodeName: 'node01'
                },
                status: { 
                    phase: 'CrashLoopBackOff',
                    podIP: '10.244.1.100',
                    containerStatuses: [{
                        name: 'app',
                        ready: false,
                        restartCount: 5,
                        state: { waiting: { reason: 'CrashLoopBackOff' } },
                        image: 'myapp:v1',
                        imageID: 'docker://sha256:abc123'
                    }]
                }
            },
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { 
                    name: 'critical-app-7d4b8c6f5-p8n3j', 
                    namespace: 'default', 
                    labels: { app: 'critical', 'pod-template-hash': '7d4b8c6f5' }
                },
                spec: { 
                    containers: [{
                        name: 'app',
                        image: 'myapp:v1',
                        env: [
                            { name: 'DB_HOST', value: '' },
                            { name: 'DB_PORT', value: '3306' }
                        ]
                    }],
                    restartPolicy: 'Always',
                    nodeName: 'node02'
                },
                status: { 
                    phase: 'CrashLoopBackOff',
                    podIP: '10.244.2.100',
                    containerStatuses: [{
                        name: 'app',
                        ready: false,
                        restartCount: 5,
                        state: { waiting: { reason: 'CrashLoopBackOff' } },
                        image: 'myapp:v1',
                        imageID: 'docker://sha256:abc123'
                    }]
                }
            }
        ],
        configMaps: [
            {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                metadata: { name: 'app-config', namespace: 'default' },
                data: { DB_HOST: 'mysql.default.svc.cluster.local', DB_PORT: '3306' }
            }
        ]
    },
    objectives: [
        {
            id: 'check-deployment',
            description: '查看 Deployment 和 Pod 状态',
            hint: '运行：kubectl get deploy,pods 查看资源状态',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+(deploy|deployment|pods|pod|all)/.test(cmd)
            )
        },
        {
            id: 'check-logs',
            description: '使用 kubectl logs 查看容器日志找出崩溃原因',
            hint: '运行：kubectl logs <pod名称>，注意 ERROR 信息',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+logs\s+critical-app/.test(cmd)
            )
        },
        {
            id: 'fix-deployment',
            description: '修改 Deployment 配置触发滚动更新',
            hint: '使用 kubectl edit deploy critical-app 或 kubectl set env 修复 DB_HOST',
            checkCondition: (state) => {
                // 检查 Deployment 的 Pod 是否有正确的 DB_HOST 配置
                const deploy = state.deployments.find(d => d.metadata.name === 'critical-app');
                if (!deploy) return false;
                const env = deploy.spec.template.spec.containers[0]?.env;
                const dbHost = env?.find(e => e.name === 'DB_HOST');
                return dbHost?.value !== undefined && dbHost.value.length > 0;
            }
        }
    ],
    hints: [
        '第一步：kubectl get deploy,pods 查看 Deployment 和 Pod 状态',
        '第二步：kubectl logs <pod名称> 查看错误日志',
        '日志显示 DB_HOST 环境变量为空导致崩溃',
        '第三步：kubectl edit deploy critical-app 编辑 Deployment',
        '找到 env 部分，将 DB_HOST 的 value 从空改为 mysql.default.svc.cluster.local',
        '保存后 Deployment 会自动触发滚动更新，创建新的健康 Pod',
        '也可以使用：kubectl set env deploy/critical-app DB_HOST=mysql.default.svc.cluster.local'
    ],
    rewards: { xp: 150, badges: ['first-responder'] }
};

// ========== 第五章：RBAC 安全 ==========

const scenario5_1: Scenario = {
    id: '5-1',
    title: '权限管理',
    description: '配置 RBAC 权限控制',
    story: `"安全团队要求我们加强权限管控，" 安全主管说道。

"我们需要为开发团队创建一个只读账号，让他们只能查看 Pod 状态，不能修改。
请先创建一个 ServiceAccount，然后配置 Role 和 RoleBinding。"`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'create-sa',
            description: '创建一个名为 pod-reader 的 ServiceAccount',
            hint: '使用 kubectl create sa pod-reader',
            checkCondition: (state) => state.serviceAccounts.some(sa => sa.metadata.name === 'pod-reader')
        },
        {
            id: 'create-role',
            description: '创建一个名为 pod-reader 的 Role，只允许 get、list、watch pods',
            hint: '使用 kubectl create role pod-reader --verb=get,list,watch --resource=pods',
            checkCondition: (state) => state.roles.some(r => 
                r.metadata.name === 'pod-reader' && 
                r.rules.some(rule => 
                    rule.resources.includes('pods') && 
                    rule.verbs.some(v => ['get', 'list', 'watch'].includes(v))
                )
            )
        },
        {
            id: 'create-rolebinding',
            description: '创建 RoleBinding 将 pod-reader Role 绑定给 pod-reader ServiceAccount',
            hint: '使用 kubectl create rolebinding pod-reader-binding --role=pod-reader --serviceaccount=default:pod-reader',
            checkCondition: (state) => state.roleBindings.some(rb => 
                rb.roleRef.name === 'pod-reader' && 
                rb.subjects.some(s => s.kind === 'ServiceAccount' && s.name === 'pod-reader')
            )
        },
        {
            id: 'verify-permissions',
            description: '验证权限设置正确',
            hint: '使用 kubectl auth can-i get pods --as=system:serviceaccount:default:pod-reader',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+auth\s+can-i/.test(cmd))
        }
    ],
    hints: [
        '1. kubectl create sa pod-reader - 创建 ServiceAccount',
        '2. kubectl create role pod-reader --verb=get,list,watch --resource=pods',
        '3. kubectl create rolebinding pod-reader-binding --role=pod-reader --serviceaccount=default:pod-reader',
        '4. kubectl auth can-i get pods --as=system:serviceaccount:default:pod-reader'
    ],
    rewards: { xp: 150, badges: ['security-master'] }
};

// ========== 第六章：ETCD 管理 ==========

const scenario6_1: Scenario = {
    id: '6-1',
    title: 'ETCD 备份',
    description: '学习 ETCD 备份操作（需要正确指定证书）',
    story: `"生产环境的 ETCD 必须定期备份，" 运维主管严肃地说。

"注意：ETCD 使用 TLS 加密通信，执行任何命令都需要指定正确的证书路径和端点地址。
这是 CKA 考试的必考内容，务必熟练掌握！"

📍 ETCD 配置信息：
- 端点：https://127.0.0.1:2379
- CA 证书：/etc/kubernetes/pki/etcd/ca.crt
- 客户端证书：/etc/kubernetes/pki/etcd/server.crt
- 客户端密钥：/etc/kubernetes/pki/etcd/server.key`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'check-etcd-health',
            description: '使用正确的证书参数检查 ETCD 健康状态',
            hint: 'etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key endpoint health',
            checkCondition: (_state, history) => history.some(cmd => 
                /etcdctl/.test(cmd) && 
                /--cacert/.test(cmd) && 
                /--cert[^a]/.test(cmd) && 
                /--key/.test(cmd) && 
                /endpoint\s+health/.test(cmd)
            )
        },
        {
            id: 'create-backup',
            description: '创建 ETCD 快照备份到 /data/etcd-backup/snapshot.db',
            hint: 'etcdctl --endpoints=... --cacert=... --cert=... --key=... snapshot save /data/etcd-backup/snapshot.db',
            checkCondition: (state) => state.etcd.backups.some(b => b.path.includes('snapshot'))
        },
        {
            id: 'verify-backup',
            description: '验证备份文件完整性',
            hint: 'etcdctl snapshot status /data/etcd-backup/snapshot.db',
            checkCondition: (_state, history) => history.some(cmd => /etcdctl\s+snapshot\s+status/.test(cmd))
        }
    ],
    hints: [
        '📋 完整备份命令示例：',
        'etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key snapshot save /data/etcd-backup/snapshot.db',
        '',
        '💡 验证备份（不需要证书）：',
        'etcdctl snapshot status /data/etcd-backup/snapshot.db --write-out=table'
    ],
    rewards: { xp: 150, badges: ['etcd-backup'] }
};

const scenario6_2: Scenario = {
    id: '6-2',
    title: 'ETCD 恢复',
    description: '从备份恢复损坏的 ETCD 数据',
    story: `🚨 紧急告警：ETCD 数据损坏！

"糟糕！ETCD 数据目录被误删了！" 值班工程师满头大汗。
"所有 kubectl 命令都不能用了！集群完全瘫痪！"

好消息是：我们有昨天的备份文件 /data/etcd-backup/snapshot.db

你需要：
1. 停止 etcd 服务
2. 删除损坏的数据目录
3. 从备份恢复数据
4. 重启服务验证恢复成功`,
    difficulty: 'hard',
    initialState: {
        etcd: {
            members: [{
                id: '8e9e05c52164694d',
                name: 'master',
                peerURLs: ['https://192.168.1.2:2380'],
                clientURLs: ['https://127.0.0.1:2379'],
                status: 'unhealthy',
                isLeader: false,
                dbSize: 0,
                dbSizeInUse: 0
            }],
            version: '3.5.9',
            clusterID: 'cdf818194e3a8c32',
            backups: [{
                name: 'snapshot.db',
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                size: 4194304,
                path: '/data/etcd-backup/snapshot.db'
            }],
            corrupted: true
        }
    },
    objectives: [
        {
            id: 'verify-corruption',
            description: '确认 ETCD 数据已损坏（kubectl 命令不可用）',
            hint: '尝试运行 kubectl get pods 观察错误',
            checkCondition: (_state, history) => history.some(cmd => /kubectl/.test(cmd))
        },
        {
            id: 'restore-snapshot',
            description: '使用备份文件恢复 ETCD 数据',
            hint: 'etcdctl snapshot restore /data/etcd-backup/snapshot.db --data-dir=/var/lib/etcd-restored',
            checkCondition: (state) => state.etcd.corrupted === false
        },
        {
            id: 'verify-recovery',
            description: '验证 ETCD 已恢复正常',
            hint: '再次运行 etcdctl endpoint health 检查状态',
            checkCondition: (state, history) => 
                !state.etcd.corrupted && 
                history.some(cmd => /etcdctl.*endpoint\s+health/.test(cmd))
        }
    ],
    hints: [
        '⚠️ ETCD 损坏时，kubectl 命令会报错：无法连接到 API Server',
        '',
        '📋 恢复命令（不需要证书，操作本地文件）：',
        'etcdctl snapshot restore /data/etcd-backup/snapshot.db --data-dir=/var/lib/etcd',
        '',
        '📋 验证恢复（需要证书）：',
        'etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key endpoint health'
    ],
    rewards: { xp: 200, badges: ['etcd-recovery', 'disaster-recovery'] }
};

// ========== 第七章：资源管理 ==========

const scenario7_1: Scenario = {
    id: '7-1',
    title: 'Pod 资源限制',
    description: '为 Pod 配置 CPU 和内存限制',
    story: `运维主管找到你："最近有个应用把整个节点的内存都吃光了，导致其他服务全挂了。"

"我们需要给所有 Pod 设置资源限制，防止单个应用影响整个集群。你先创建一个带资源限制的 Pod 试试。"

💡 提示：查阅 Kubernetes 官方文档中关于 Resource Management 的章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-pod-with-limits',
            description: '创建一个 Pod，设置 CPU 和内存的 requests 与 limits',
            hint: '在 Pod spec 的 containers 中添加 resources 字段',
            checkCondition: (state) => state.pods.some(p => 
                p.spec.containers.some(c => 
                    c.resources?.limits?.cpu && c.resources?.limits?.memory &&
                    c.resources?.requests?.cpu && c.resources?.requests?.memory
                )
            )
        },
        {
            id: 'verify-resources',
            description: '使用 describe 命令验证资源配置已生效',
            hint: '查看 Pod 详情中的 Limits 和 Requests 部分',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+describe\s+pod/.test(cmd))
        }
    ],
    hints: [
        '资源配置位于 spec.containers[].resources',
        'requests: 调度时的最小保证资源',
        'limits: 容器能使用的最大资源',
        '格式示例: cpu: "100m", memory: "128Mi"'
    ],
    rewards: { xp: 120 }
};

const scenario7_2: Scenario = {
    id: '7-2',
    title: '资源限制故障排查',
    description: '诊断并修复因资源配置不当导致的 Pod 调度失败问题',
    story: `🚨 告警：生产环境有 Pod 一直处于 Pending 状态！

开发团队紧急上线了一个新服务 memory-hungry，但 Pod 已经 Pending 了 30 分钟。

"我明明设置了资源限制啊，" 开发者很困惑，"为什么调度不上去？"

你需要：
1. 诊断 Pod 为什么无法被调度
2. 检查节点的可用资源
3. 调整 Pod 的资源请求，使其能够被正常调度`,
    difficulty: 'medium',
    initialState: {
        pods: [{
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: 'memory-hungry',
                namespace: 'default',
                labels: { app: 'memory-hungry' },
                uid: 'pending-pod-uid',
                creationTimestamp: new Date(Date.now() - 1800000).toISOString()
            },
            spec: {
                containers: [{
                    name: 'app',
                    image: 'nginx:1.20',
                    resources: {
                        requests: { cpu: '4000m', memory: '16Gi' },
                        limits: { cpu: '8000m', memory: '32Gi' }
                    }
                }],
                nodeName: ''
            },
            status: {
                phase: 'Pending',
                conditions: [{
                    type: 'PodScheduled',
                    status: 'False',
                    reason: 'Unschedulable',
                    message: '0/3 nodes are available: 1 node(s) had untolerable taint, 2 Insufficient memory.'
                }]
            }
        }]
    },
    objectives: [
        {
            id: 'diagnose-pending',
            description: '使用 describe 命令诊断 Pod 无法调度的原因',
            hint: 'kubectl describe pod memory-hungry',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+describe\s+pod\s+memory-hungry/.test(cmd)
            )
        },
        {
            id: 'check-node-resources',
            description: '检查节点的可分配资源',
            hint: 'kubectl describe node 或 kubectl top nodes',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(describe\s+node|top\s+node)/.test(cmd)
            )
        },
        {
            id: 'fix-resource-requests',
            description: '删除旧 Pod 并创建资源请求合理的新 Pod（requests.memory <= 2Gi）',
            hint: '先删除旧 Pod，再创建一个 memory requests 不超过 2Gi 的 Pod',
            checkCondition: (state) => state.pods.some(p => 
                p.metadata.name === 'memory-hungry' &&
                p.status.phase === 'Running' &&
                p.spec.containers.some(c => {
                    const memStr = c.resources?.requests?.memory || '';
                    const memValue = parseInt(memStr);
                    // 检查内存请求是否合理（<= 2Gi）
                    if (memStr.includes('Gi')) return memValue <= 2;
                    if (memStr.includes('Mi')) return memValue <= 2048;
                    return false;
                })
            )
        }
    ],
    hints: [
        '📋 排查步骤：',
        '1. kubectl describe pod memory-hungry  查看 Events 中的调度失败原因',
        '2. kubectl describe node node01  查看 Allocatable 资源',
        '3. kubectl delete pod memory-hungry  删除有问题的 Pod',
        '4. 创建新 Pod，降低 resources.requests.memory 到合理值（如 512Mi）',
        '',
        '💡 常见原因：',
        '- Insufficient memory: 请求的内存超过节点可分配内存',
        '- Insufficient cpu: 请求的 CPU 超过节点可分配 CPU'
    ],
    rewards: { xp: 150, badges: ['troubleshooter'] }
};

// ========== 第八章：调度策略 ==========

const scenario8_1: Scenario = {
    id: '8-1',
    title: 'NodeSelector 节点选择',
    description: '使用标签选择器将 Pod 调度到指定节点',
    story: `公司购买了一批带 GPU 的服务器用于机器学习任务。

"我们需要确保 ML 训练任务只运行在 GPU 节点上，" 架构师解释道，"普通任务不应该占用这些昂贵的资源。"

你的任务是给节点打上标签，然后让 Pod 只调度到特定标签的节点。

💡 提示：查阅 Kubernetes 文档中 "Assigning Pods to Nodes" 章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'label-node',
            description: '给集群中的一个工作节点添加自定义标签',
            hint: '使用 kubectl label 命令给 node 添加标签',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+label\s+node/.test(cmd))
        },
        {
            id: 'create-pod-nodeselector',
            description: '创建一个 Pod，使用 nodeSelector 指定调度到带有该标签的节点',
            hint: '在 Pod spec 中添加 nodeSelector 字段',
            checkCondition: (state) => state.pods.some(p => 
                p.spec.nodeSelector && Object.keys(p.spec.nodeSelector).length > 0
            )
        },
        {
            id: 'verify-scheduling',
            description: '验证 Pod 是否被调度到了正确的节点',
            hint: '使用 kubectl get pods -o wide 查看节点分配',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+(pods?|po).*-o\s+wide/.test(cmd))
        }
    ],
    hints: [
        '给节点打标签: kubectl label nodes <node-name> <key>=<value>',
        'nodeSelector 在 spec 下与 containers 同级',
        '格式: nodeSelector: {key: value}',
        '使用 -o wide 可以看到 Pod 运行在哪个节点'
    ],
    rewards: { xp: 140 }
};

const scenario8_2: Scenario = {
    id: '8-2',
    title: 'Taints 与 Tolerations',
    description: '使用污点和容忍度控制 Pod 调度',
    story: `生产集群中，控制平面节点不应该运行普通工作负载。

"我们需要确保只有特定的系统组件才能运行在 master 节点上，" SRE 工程师说，"其他 Pod 必须调度到工作节点。"

Taints（污点）可以让节点排斥 Pod，而 Tolerations（容忍）可以让 Pod 忽略某些污点。

💡 提示：查阅 Kubernetes 文档中 "Taints and Tolerations" 章节。`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'taint-node',
            description: '给一个工作节点添加 NoSchedule 效果的污点',
            hint: '使用 kubectl taint 命令',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+taint\s+node/.test(cmd))
        },
        {
            id: 'create-pod-toleration',
            description: '创建一个带有对应 toleration 的 Pod，使其能调度到有污点的节点',
            hint: '在 Pod spec 中添加 tolerations 数组',
            checkCondition: (state) => state.pods.some(p => 
                p.spec.tolerations && p.spec.tolerations.length > 0
            )
        },
        {
            id: 'verify-pod-scheduled',
            description: '验证 Pod 成功运行',
            hint: '检查 Pod 状态是否为 Running',
            checkCondition: (state, history) => 
                history.some(cmd => /kubectl\s+get\s+(pods?|po)/.test(cmd)) &&
                state.pods.some(p => p.status.phase === 'Running')
        }
    ],
    hints: [
        '添加污点: kubectl taint nodes <node> key=value:NoSchedule',
        '移除污点: kubectl taint nodes <node> key=value:NoSchedule-',
        'tolerations 格式: [{key, operator, value, effect}]',
        'operator 可以是 Equal 或 Exists'
    ],
    rewards: { xp: 160 }
};

// ========== 第九章：存储管理 ==========

const scenario9_1: Scenario = {
    id: '9-1',
    title: 'PersistentVolume 完整实战',
    description: '创建 PV → 申请 PVC → 挂载到 Pod → 验证数据持久化',
    story: `数据库团队遇到了严重问题：

"MySQL Pod 重启后数据全丢了！" DBA 焦急地说，"这个 Pod 用的是 emptyDir，容器一删数据就没了。"

"我们需要持久化存储，" 你解释道，"Kubernetes 的存储体系分为三层：
1. **PV（PersistentVolume）**：管理员预先配置的存储资源
2. **PVC（PersistentVolumeClaim）**：用户申请存储的'订单'
3. **Pod 挂载**：将 PVC 挂载到容器的指定路径"

💡 提示：查阅 Kubernetes 文档 "Persistent Volumes" 章节。`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'create-pv',
            description: '创建 PersistentVolume（1Gi，accessMode: ReadWriteOnce）',
            hint: '定义 capacity、accessModes、hostPath（或其他存储后端）',
            checkCondition: (state) => state.persistentVolumes.length > 0
        },
        {
            id: 'verify-pv',
            description: '查看 PV 状态，确认为 Available',
            hint: 'kubectl get pv 查看 STATUS 列',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+pv/.test(cmd))
        },
        {
            id: 'create-pvc',
            description: '创建 PVC 申请存储（大小和 accessMode 要匹配）',
            hint: 'PVC 的 requests.storage 不能超过 PV 的 capacity',
            checkCondition: (state) => state.persistentVolumeClaims.length > 0
        },
        {
            id: 'verify-binding',
            description: '确认 PVC 与 PV 绑定成功（状态变为 Bound）',
            hint: 'kubectl get pvc 查看 STATUS 和 VOLUME 列',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+pvc/.test(cmd))
        },
        {
            id: 'mount-to-pod',
            description: '创建 Pod，将 PVC 挂载到容器的 /data 目录',
            hint: 'spec.volumes + spec.containers[].volumeMounts',
            checkCondition: (state) => state.pods.some(p =>
                p.spec.volumes?.some(v => v.persistentVolumeClaim) &&
                p.spec.containers.some(c => (c.volumeMounts?.length ?? 0) > 0)
            )
        },
        {
            id: 'verify-mount',
            description: '进入 Pod 验证挂载成功（写入文件测试）',
            hint: 'kubectl exec <pod> -- ls /data 或 touch /data/test',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+exec/.test(cmd))
        }
    ],
    hints: [
        'PV YAML: spec.capacity.storage: 1Gi, spec.accessModes: [ReadWriteOnce], spec.hostPath.path: /mnt/data',
        'PVC YAML: spec.accessModes: [ReadWriteOnce], spec.resources.requests.storage: 1Gi',
        'Pod volumes: [{name: data, persistentVolumeClaim: {claimName: <pvc-name>}}]',
        'Pod volumeMounts: [{name: data, mountPath: /data}]'
    ],
    rewards: { xp: 200 }
};

// ========== 第十章：网络策略 ==========

const scenario10_1: Scenario = {
    id: '10-1',
    title: 'NetworkPolicy 网络隔离',
    description: '使用网络策略限制 Pod 之间的通信',
    story: `安全审计发现集群中的 Pod 可以任意互相访问，这是一个安全隐患。

"我们需要实施零信任网络策略，" 安全团队要求，"数据库只能被特定的应用访问，其他 Pod 不应该能连接到它。"

NetworkPolicy 可以控制 Pod 的入站（Ingress）和出站（Egress）流量。

💡 提示：查阅 Kubernetes 文档中 "Network Policies" 章节。`,
    difficulty: 'hard',
    objectives: [
        {
            id: 'create-networkpolicy',
            description: '创建一个 NetworkPolicy，限制对特定 Pod 的访问',
            hint: '使用 podSelector 选择目标 Pod，ingress 定义入站规则',
            checkCondition: (state) => state.networkPolicies.length > 0
        },
        {
            id: 'verify-policy',
            description: '查看创建的 NetworkPolicy 详情',
            hint: '使用 kubectl describe 或 get -o yaml 查看',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(describe|get.*-o\s+yaml)\s+networkpolic/.test(cmd)
            )
        }
    ],
    hints: [
        'NetworkPolicy 通过 podSelector 选择被保护的 Pod',
        'ingress.from 定义允许访问的来源',
        '可以按 podSelector、namespaceSelector 或 ipBlock 过滤',
        '空的 ingress 列表表示拒绝所有入站流量'
    ],
    rewards: { xp: 170 }
};

// ========== 第十一章：多容器 Pod ==========

const scenario11_1: Scenario = {
    id: '11-1',
    title: 'Sidecar 容器模式',
    description: '使用多容器 Pod 实现 Sidecar 模式',
    story: `应用团队希望在不修改应用代码的情况下收集日志。

"我们想用 Sidecar 容器来处理日志收集，" 开发负责人说，"主应用写日志到共享卷，Sidecar 容器读取并转发。"

多容器 Pod 中的容器共享网络和存储，非常适合这种场景。

💡 提示：查阅 Kubernetes 文档中 "Multi-container Pods" 和 "Logging Architecture" 章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-multicontainer-pod',
            description: '创建一个包含两个容器的 Pod',
            hint: '在 containers 数组中定义多个容器',
            checkCondition: (state) => state.pods.some(p => p.spec.containers.length >= 2)
        },
        {
            id: 'shared-volume',
            description: '配置共享 Volume 让两个容器可以交换数据',
            hint: '使用 emptyDir 类型的 volume，两个容器都挂载它',
            checkCondition: (state) => state.pods.some(p =>
                p.spec.volumes && p.spec.volumes.some(v => v.emptyDir) &&
                p.spec.containers.filter(c => c.volumeMounts && c.volumeMounts.length > 0).length >= 2
            )
        }
    ],
    hints: [
        '一个 Pod 可以有多个 containers',
        'emptyDir: {} 创建临时共享存储',
        '每个容器通过 volumeMounts 挂载同一个 volume',
        '容器之间可以用 localhost 通信'
    ],
    rewards: { xp: 150 }
};

const scenario11_2: Scenario = {
    id: '11-2',
    title: 'InitContainer 初始化容器',
    description: '使用初始化容器进行预处理',
    story: `新的微服务在启动前需要等待数据库就绪。

"应用容器启动时数据库还没准备好，导致连接失败，" 开发者抱怨道，"我们需要一个机制来确保依赖服务先就绪。"

Init Containers 在应用容器之前运行，可以用来等待依赖、下载配置等。

💡 提示：查阅 Kubernetes 文档中 "Init Containers" 章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-initcontainer',
            description: '创建一个 Pod，包含 Init Container 用于初始化',
            hint: '在 Pod spec 中添加 initContainers 数组',
            checkCondition: (state) => state.pods.some(p => 
                p.spec.initContainers && p.spec.initContainers.length > 0
            )
        },
        {
            id: 'verify-init',
            description: '观察 Pod 状态变化，确认 Init Container 先执行',
            hint: 'Init 阶段 Pod 状态会显示 Init:x/y',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+(pods?|po)/.test(cmd))
        }
    ],
    hints: [
        'initContainers 与 containers 同级',
        'Init Containers 按顺序执行，全部成功后才启动主容器',
        '常用于：等待服务就绪、下载配置、设置权限',
        '可以使用 busybox 镜像配合 sleep 或 wget 命令'
    ],
    rewards: { xp: 140 }
};

// ========== 第十二章：健康检查 ==========

const scenario12_1: Scenario = {
    id: '12-1',
    title: 'Liveness 与 Readiness 探针',
    description: '配置容器健康检查，实现自动故障检测与恢复',
    story: `凌晨告警：API 服务无响应，但 Pod 状态显示 Running。

"容器进程还在，但内部已经死锁了，" SRE 分析道，"Kubernetes 看不出问题，所以不会重启它。"

这就是为什么我们需要健康检查：
- **Liveness Probe**：检测容器是否"活着"，失败则重启容器
- **Readiness Probe**：检测容器是否"就绪"，失败则从 Service 移除

你需要为应用配置合适的探针，让 Kubernetes 能自动检测并处理故障。

💡 提示：查阅 Kubernetes 文档 "Configure Liveness, Readiness and Startup Probes"。`,
    difficulty: 'medium',
    initialState: {
        deployments: [
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name: 'api-server', namespace: 'default' },
                spec: { 
                    replicas: 2, 
                    selector: { matchLabels: { app: 'api' } },
                    template: {
                        metadata: { labels: { app: 'api' } },
                        spec: { containers: [{ name: 'api', image: 'myapi:v1', ports: [{ containerPort: 8080 }] }] }
                    }
                },
                status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 }
            }
        ],
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'api-server-abc', namespace: 'default', labels: { app: 'api' } },
                spec: { containers: [{ name: 'api', image: 'myapi:v1' }], nodeName: 'node01' },
                status: { phase: 'Running', podIP: '10.244.1.30', hostIP: '192.168.1.3' }
            },
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'api-server-def', namespace: 'default', labels: { app: 'api' } },
                spec: { containers: [{ name: 'api', image: 'myapi:v1' }], nodeName: 'node02' },
                status: { phase: 'Running', podIP: '10.244.2.31', hostIP: '192.168.1.4' }
            }
        ]
    },
    objectives: [
        {
            id: 'check-current',
            description: '查看当前 Deployment 配置，确认没有健康检查',
            hint: '使用 kubectl describe deploy 或 get -o yaml',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(describe\s+deploy|get\s+deploy.*-o\s+(yaml|json))/.test(cmd)
            )
        },
        {
            id: 'create-pod-with-probes',
            description: '创建/更新 Pod，配置 livenessProbe（HTTP 或 TCP 或 exec）',
            hint: '在 containers 中添加 livenessProbe 配置',
            checkCondition: (state) => state.pods.some(p =>
                p.spec.containers.some(c => c.livenessProbe)
            )
        },
        {
            id: 'add-readiness',
            description: '同时配置 readinessProbe，确保服务就绪后才接收流量',
            hint: 'readinessProbe 可用于检测依赖服务是否就绪',
            checkCondition: (state) => state.pods.some(p =>
                p.spec.containers.some(c => c.readinessProbe)
            )
        },
        {
            id: 'verify-probes',
            description: '使用 describe 确认探针配置正确',
            hint: '查看 Liveness 和 Readiness 字段',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+describe\s+pod/.test(cmd))
        }
    ],
    hints: [
        'livenessProbe.httpGet: {path: "/healthz", port: 8080}',
        'livenessProbe.tcpSocket: {port: 8080}',
        'livenessProbe.exec: {command: ["cat", "/tmp/healthy"]}',
        '关键参数: initialDelaySeconds(启动等待), periodSeconds(检查间隔), failureThreshold(失败阈值)'
    ],
    rewards: { xp: 160 }
};

// ========== 第十三章：批处理任务 ==========

const scenario13_1: Scenario = {
    id: '13-1',
    title: 'Job 一次性任务',
    description: '使用 Job 运行一次性批处理任务',
    story: `数据团队需要运行一个数据迁移脚本。

"这个任务只需要执行一次，执行完就结束，" 数据工程师说，"而且如果失败了需要能自动重试。"

Job 资源专门用于运行一次性任务，完成后 Pod 不会重启。

💡 提示：查阅 Kubernetes 文档中 "Jobs" 章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-job',
            description: '创建一个 Job 资源',
            hint: 'Job 的 kind 是 Job，apiVersion 是 batch/v1',
            checkCondition: (state) => state.jobs.length > 0
        },
        {
            id: 'check-job-status',
            description: '查看 Job 执行状态',
            hint: '使用 kubectl get jobs 查看完成情况',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+jobs?/.test(cmd))
        }
    ],
    hints: [
        'restartPolicy 必须是 Never 或 OnFailure',
        'backoffLimit 控制失败重试次数',
        'completions 指定需要成功完成的 Pod 数',
        'parallelism 控制并行执行的 Pod 数'
    ],
    rewards: { xp: 130 }
};

const scenario13_2: Scenario = {
    id: '13-2',
    title: 'CronJob 定时任务',
    description: '使用 CronJob 运行定期执行的任务',
    story: `运维团队需要每天凌晨清理临时文件。

"我们需要一个定时任务，每天自动执行清理脚本，" 运维工程师说。

CronJob 可以按照 Cron 表达式定期创建 Job。

💡 提示：查阅 Kubernetes 文档中 "CronJob" 章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-cronjob',
            description: '创建一个 CronJob，设置定时调度规则',
            hint: '使用 schedule 字段定义 Cron 表达式',
            checkCondition: (state) => state.cronJobs.length > 0
        },
        {
            id: 'verify-cronjob',
            description: '查看 CronJob 的调度配置',
            hint: '使用 kubectl get cronjobs 或 describe',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+(get|describe)\s+cronjobs?/.test(cmd))
        }
    ],
    hints: [
        'schedule 格式: "分 时 日 月 周"',
        '例如 "0 2 * * *" 表示每天凌晨 2 点',
        'concurrencyPolicy: Allow/Forbid/Replace',
        'successfulJobsHistoryLimit 保留成功 Job 历史数量'
    ],
    rewards: { xp: 140 }
};

// ========== 第十四章：升级与回滚 ==========

const scenario14_1: Scenario = {
    id: '14-1',
    title: 'Deployment 滚动更新',
    description: '执行 Deployment 的滚动更新',
    story: `新版本应用已经准备好发布了。

"我们需要做到零停机更新，" 产品经理要求，"用户不能感知到服务中断。"

Deployment 的滚动更新策略可以逐步替换旧版本 Pod。

💡 提示：查阅 Kubernetes 文档中 "Performing a Rolling Update" 章节。`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'update-image',
            description: '更新 Deployment 的容器镜像版本',
            hint: '可以使用 kubectl set image 命令或编辑 YAML',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(set\s+image|apply|edit)/.test(cmd)
            )
        },
        {
            id: 'watch-rollout',
            description: '观察滚动更新进度',
            hint: '使用 rollout status 命令',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+rollout\s+status/.test(cmd))
        },
        {
            id: 'check-history',
            description: '查看 Deployment 的更新历史',
            hint: '使用 rollout history 命令',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+rollout\s+history/.test(cmd))
        }
    ],
    hints: [
        'kubectl set image deployment/<name> <container>=<image>',
        'kubectl rollout status deployment/<name> 观察进度',
        'kubectl rollout history deployment/<name> 查看历史',
        '记录变更原因: --record 参数'
    ],
    rewards: { xp: 150 }
};

const scenario14_2: Scenario = {
    id: '14-2',
    title: 'Deployment 回滚',
    description: '将 Deployment 回滚到之前的版本',
    story: `糟糕！新版本有严重 bug，需要紧急回滚！

"快回滚到上一个版本！" 值班经理焦急地说。

幸好 Deployment 保存了版本历史，可以快速回滚。

💡 提示：查阅 Kubernetes 文档中 "Rolling Back a Deployment" 章节。`,
    difficulty: 'medium',
    initialState: {
        deployments: [
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name: 'buggy-app', namespace: 'default' },
                spec: { 
                    replicas: 3, 
                    selector: { matchLabels: { app: 'buggy' } },
                    template: {
                        metadata: { labels: { app: 'buggy' } },
                        spec: { containers: [{ name: 'app', image: 'myapp:v2-buggy' }] }
                    }
                },
                status: { replicas: 3, readyReplicas: 0, availableReplicas: 0 }
            }
        ]
    },
    objectives: [
        {
            id: 'check-history',
            description: '查看 buggy-app 的版本历史',
            hint: '使用 rollout history 命令',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+rollout\s+history/.test(cmd))
        },
        {
            id: 'rollback',
            description: '执行回滚操作',
            hint: '使用 rollout undo 命令',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+rollout\s+undo/.test(cmd))
        },
        {
            id: 'verify-rollback',
            description: '验证回滚成功',
            hint: '检查 Deployment 和 Pod 状态',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+(deploy|pods?)/.test(cmd))
        }
    ],
    hints: [
        'kubectl rollout undo deployment/<name> 回滚到上一版本',
        'kubectl rollout undo deployment/<name> --to-revision=N 回滚到指定版本',
        '回滚后用 get pods 确认 Pod 镜像版本',
        'describe deployment 查看当前镜像'
    ],
    rewards: { xp: 160 }
};

// ========== 第十五章：Namespace 管理 ==========

const scenario15_1: Scenario = {
    id: '15-1',
    title: 'Namespace 隔离',
    description: '学习使用 Namespace 进行资源隔离',
    story: `公司决定将开发、测试、生产环境部署在同一个集群中。

"我们需要使用 Namespace 来隔离不同环境的资源。" 架构师说道。

"先创建 dev 和 prod 两个命名空间，然后在不同命名空间中部署应用。"`,
    difficulty: 'easy',
    objectives: [
        {
            id: 'create-dev-ns',
            description: '创建 dev 命名空间',
            hint: '使用 kubectl create namespace dev',
            checkCondition: (state) => state.namespaces.includes('dev')
        },
        {
            id: 'create-prod-ns',
            description: '创建 prod 命名空间',
            hint: '使用 kubectl create namespace prod',
            checkCondition: (state) => state.namespaces.includes('prod')
        },
        {
            id: 'deploy-to-dev',
            description: '在 dev 命名空间中部署一个 nginx Pod',
            hint: '使用 kubectl run nginx --image=nginx -n dev',
            checkCondition: (state) => state.pods.some(p => p.metadata.namespace === 'dev')
        },
        {
            id: 'list-pods-ns',
            description: '查看 dev 命名空间中的 Pod',
            hint: '使用 kubectl get pods -n dev',
            checkCondition: (_state, history) => history.some(cmd => /kubectl\s+get\s+pods?\s+(-n|--namespace)\s+dev/.test(cmd))
        }
    ],
    hints: [
        'kubectl create namespace <name> 创建命名空间',
        'kubectl get ns 查看所有命名空间',
        '-n <namespace> 指定命名空间',
        'kubectl get pods --all-namespaces 查看所有命名空间的 Pod'
    ],
    rewards: { xp: 100 }
};

const scenario15_2: Scenario = {
    id: '15-2',
    title: 'ResourceQuota 资源配额',
    description: '为 Namespace 设置资源配额限制',
    story: `"开发团队的 Pod 太多了，占用了大量集群资源。" 运维负责人说。

"我们需要为 dev 命名空间设置资源配额，限制他们能创建的 Pod 数量和资源使用量。"`,
    difficulty: 'medium',
    initialState: {
        namespaces: ['default', 'kube-system', 'kube-public', 'kube-node-lease', 'dev', 'prod']
    },
    objectives: [
        {
            id: 'create-quota',
            description: '为 dev 命名空间创建 ResourceQuota，限制最多 5 个 Pod',
            hint: '创建一个 ResourceQuota YAML 文件并 apply',
            checkCondition: (state) => state.resourceQuotas.some(q => 
                q.metadata.namespace === 'dev' && q.spec.hard?.pods
            )
        },
        {
            id: 'view-quota',
            description: '查看 dev 命名空间的资源配额使用情况',
            hint: '使用 kubectl describe resourcequota -n dev',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(describe|get)\s+resourcequota/.test(cmd)
            )
        }
    ],
    hints: [
        'ResourceQuota 可以限制 pods, requests.cpu, requests.memory, limits.cpu, limits.memory 等',
        'kubectl create quota my-quota --hard=pods=5 -n dev',
        'kubectl describe quota -n dev 查看配额使用情况',
        '超出配额的资源创建请求会被拒绝'
    ],
    rewards: { xp: 120 }
};

// ========== 第十六章：动态存储供给 ==========

const scenario16_1: Scenario = {
    id: '16-1',
    title: 'StorageClass 与动态供给',
    description: '学习使用 StorageClass 实现动态存储供给',
    story: `"手动创建 PV 太麻烦了！" 开发团队抱怨道。

"我们可以配置 StorageClass，让 PVC 自动创建 PV。" 存储管理员解释道。

"这就是动态供给（Dynamic Provisioning）的魔力。"`,
    difficulty: 'medium',
    initialState: {
        storageClasses: [
            {
                apiVersion: 'storage.k8s.io/v1',
                kind: 'StorageClass',
                metadata: { name: 'standard', annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' } },
                provisioner: 'kubernetes.io/no-provisioner',
                reclaimPolicy: 'Delete',
                volumeBindingMode: 'WaitForFirstConsumer'
            },
            {
                apiVersion: 'storage.k8s.io/v1',
                kind: 'StorageClass',
                metadata: { name: 'fast-ssd' },
                provisioner: 'kubernetes.io/gce-pd',
                parameters: { type: 'pd-ssd' },
                reclaimPolicy: 'Retain',
                volumeBindingMode: 'Immediate'
            }
        ]
    },
    objectives: [
        {
            id: 'list-sc',
            description: '查看集群中的 StorageClass',
            hint: '使用 kubectl get storageclass',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+(storageclass|sc)/.test(cmd)
            )
        },
        {
            id: 'create-pvc-dynamic',
            description: '创建一个使用 fast-ssd StorageClass 的 PVC',
            hint: '在 PVC spec 中指定 storageClassName: fast-ssd',
            checkCondition: (state) => state.persistentVolumeClaims.some(pvc => 
                pvc.spec.storageClassName === 'fast-ssd'
            )
        },
        {
            id: 'verify-pv-created',
            description: '验证 PV 是否被自动创建',
            hint: '使用 kubectl get pv 查看',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+(pv|persistentvolumes?)/.test(cmd)
            )
        }
    ],
    hints: [
        'kubectl get sc 查看 StorageClass',
        'storageClassName 在 PVC 中指定使用哪个 StorageClass',
        '默认 StorageClass 标记为 (default)',
        'reclaimPolicy 决定 PV 删除后的行为：Delete 或 Retain',
        'volumeBindingMode: WaitForFirstConsumer 等到 Pod 使用时才绑定'
    ],
    rewards: { xp: 140 }
};

// ========== 第十七章：HPA 自动扩缩容 ==========

const scenario17_1: Scenario = {
    id: '17-1',
    title: 'Horizontal Pod Autoscaler',
    description: '配置 HPA 实现 Pod 自动扩缩容',
    story: `"我们的 web 服务流量波动很大，高峰期需要更多副本。" 产品经理说。

"手动扩容太慢了，我们需要自动扩缩容。" 

"HPA 可以根据 CPU 或内存使用率自动调整 Pod 副本数。" 你解释道。`,
    difficulty: 'medium',
    initialState: {
        deployments: [
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name: 'web-app', namespace: 'default' },
                spec: {
                    replicas: 2,
                    selector: { matchLabels: { app: 'web' } },
                    template: {
                        metadata: { labels: { app: 'web' } },
                        spec: {
                            containers: [{
                                name: 'web',
                                image: 'nginx',
                                resources: {
                                    requests: { cpu: '100m', memory: '128Mi' },
                                    limits: { cpu: '500m', memory: '256Mi' }
                                }
                            }]
                        }
                    }
                },
                status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 }
            }
        ],
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'web-app-abc123', namespace: 'default', labels: { app: 'web' } },
                spec: { containers: [{ name: 'web', image: 'nginx' }], nodeName: 'node01' },
                status: { phase: 'Running', podIP: '10.244.1.50', hostIP: '192.168.1.3' }
            },
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'web-app-def456', namespace: 'default', labels: { app: 'web' } },
                spec: { containers: [{ name: 'web', image: 'nginx' }], nodeName: 'node02' },
                status: { phase: 'Running', podIP: '10.244.2.50', hostIP: '192.168.1.4' }
            }
        ]
    },
    objectives: [
        {
            id: 'create-hpa',
            description: '为 web-app Deployment 创建 HPA，目标 CPU 使用率 50%，最小 2 副本，最大 10 副本',
            hint: '使用 kubectl autoscale deployment web-app --cpu=50% --min=2 --max=10',
            checkCondition: (state) => state.hpas.some(h => 
                h.spec.scaleTargetRef.name === 'web-app' &&
                h.spec.minReplicas === 2 &&
                h.spec.maxReplicas === 10
            )
        },
        {
            id: 'view-hpa',
            description: '查看 HPA 状态',
            hint: '使用 kubectl get hpa',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+(hpa|horizontalpodautoscaler)/.test(cmd)
            )
        },
        {
            id: 'describe-hpa',
            description: '查看 HPA 详细信息',
            hint: '使用 kubectl describe hpa web-app',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+describe\s+(hpa|horizontalpodautoscaler)/.test(cmd)
            )
        }
    ],
    hints: [
        'kubectl autoscale deployment <name> --cpu=<目标CPU%> --min=<最小副本> --max=<最大副本>',
        'HPA 需要 metrics-server 提供指标',
        'kubectl top pods 查看 Pod 资源使用情况',
        'HPA 会根据当前负载自动调整副本数'
    ],
    rewards: { xp: 150 }
};

const scenario17_2: Scenario = {
    id: '17-2',
    title: 'HPA 高级配置',
    description: '使用 YAML 配置更复杂的 HPA 策略',
    story: `"除了 CPU，我们还想根据内存使用率来扩缩容。" 开发负责人说。

"而且扩容要快，缩容要慢，避免频繁波动。"

你决定使用 YAML 来配置更精细的 HPA 策略。`,
    difficulty: 'hard',
    initialState: {
        deployments: [
            {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { name: 'api-server', namespace: 'default' },
                spec: {
                    replicas: 3,
                    selector: { matchLabels: { app: 'api' } },
                    template: {
                        metadata: { labels: { app: 'api' } },
                        spec: {
                            containers: [{
                                name: 'api',
                                image: 'myapi:v1',
                                resources: {
                                    requests: { cpu: '200m', memory: '256Mi' },
                                    limits: { cpu: '1', memory: '512Mi' }
                                }
                            }]
                        }
                    }
                },
                status: { replicas: 3, readyReplicas: 3, availableReplicas: 3 }
            }
        ]
    },
    objectives: [
        {
            id: 'create-hpa-yaml',
            description: '创建一个 HPA YAML 文件，配置 CPU 和 Memory 双指标',
            hint: '使用 vim hpa.yaml 创建文件',
            checkCondition: (_state, history) => history.some(cmd => 
                /vim\s+.*hpa.*\.yaml/.test(cmd) || /cat.*hpa.*\.yaml/.test(cmd)
            )
        },
        {
            id: 'apply-hpa',
            description: '应用 HPA 配置',
            hint: '使用 kubectl apply -f hpa.yaml',
            checkCondition: (state) => state.hpas.some(h => 
                h.spec.scaleTargetRef.name === 'api-server' &&
                h.spec.metrics && h.spec.metrics.length > 1
            )
        }
    ],
    hints: [
        'HPA v2 支持多个 metrics 配置',
        'behavior 字段可配置扩缩容行为',
        'scaleDown.stabilizationWindowSeconds 防止频繁缩容',
        'scaleUp.policies 可设置扩容速率限制'
    ],
    rewards: { xp: 180 }
};

// ========== 第十八章：Ingress 入口控制 ==========

const scenario18_1: Scenario = {
    id: '18-1',
    title: 'Ingress 基础',
    description: '使用 Ingress 暴露 HTTP 服务',
    story: `"我们有多个微服务，每个都用 NodePort 太乱了。" 运维说。

"Ingress 可以在一个入口点暴露多个服务，还支持域名和路径路由。"

"就像一个智能的反向代理，根据请求路由到不同的后端服务。"`,
    difficulty: 'medium',
    initialState: {
        services: [
            {
                apiVersion: 'v1',
                kind: 'Service',
                metadata: { name: 'frontend-svc', namespace: 'default' },
                spec: {
                    type: 'ClusterIP',
                    selector: { app: 'frontend' },
                    ports: [{ port: 80, targetPort: 3000 }]
                }
            },
            {
                apiVersion: 'v1',
                kind: 'Service',
                metadata: { name: 'api-svc', namespace: 'default' },
                spec: {
                    type: 'ClusterIP',
                    selector: { app: 'api' },
                    ports: [{ port: 80, targetPort: 8080 }]
                }
            }
        ],
        pods: [
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'frontend-pod', namespace: 'default', labels: { app: 'frontend' } },
                spec: { containers: [{ name: 'frontend', image: 'frontend:v1' }], nodeName: 'node01' },
                status: { phase: 'Running', podIP: '10.244.1.60' }
            },
            {
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: { name: 'api-pod', namespace: 'default', labels: { app: 'api' } },
                spec: { containers: [{ name: 'api', image: 'api:v1' }], nodeName: 'node02' },
                status: { phase: 'Running', podIP: '10.244.2.60' }
            }
        ]
    },
    objectives: [
        {
            id: 'view-services',
            description: '查看现有的 Service',
            hint: '使用 kubectl get svc',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+get\s+(services?|svc)/.test(cmd)
            )
        },
        {
            id: 'create-ingress',
            description: '创建 Ingress，将 / 路由到 frontend-svc，/api 路由到 api-svc',
            hint: '创建 Ingress YAML 并 apply',
            checkCondition: (state) => state.ingresses.some(ing => 
                ing.spec.rules?.some(r => r.http?.paths?.length && r.http.paths.length >= 2)
            )
        },
        {
            id: 'view-ingress',
            description: '查看 Ingress 配置',
            hint: '使用 kubectl get ingress 或 kubectl describe ingress',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+(get|describe)\s+(ingress|ing)/.test(cmd)
            )
        }
    ],
    hints: [
        'Ingress 需要 Ingress Controller（如 nginx-ingress）才能工作',
        'spec.rules 定义路由规则',
        'path 支持 Prefix 和 Exact 匹配类型',
        'kubectl get ing 是 kubectl get ingress 的简写'
    ],
    rewards: { xp: 150 }
};

const scenario18_2: Scenario = {
    id: '18-2',
    title: 'Ingress TLS 配置',
    description: '为 Ingress 配置 HTTPS',
    story: `"我们的网站需要 HTTPS！" 安全团队强调。

"Ingress 支持 TLS 终止，我们需要创建包含证书的 Secret，然后在 Ingress 中引用它。"`,
    difficulty: 'hard',
    initialState: {
        services: [
            {
                apiVersion: 'v1',
                kind: 'Service',
                metadata: { name: 'web-svc', namespace: 'default' },
                spec: {
                    type: 'ClusterIP',
                    selector: { app: 'web' },
                    ports: [{ port: 80, targetPort: 8080 }]
                }
            }
        ],
        ingresses: [
            {
                apiVersion: 'networking.k8s.io/v1',
                kind: 'Ingress',
                metadata: { name: 'web-ingress', namespace: 'default' },
                spec: {
                    rules: [{
                        host: 'www.example.com',
                        http: {
                            paths: [{
                                path: '/',
                                pathType: 'Prefix',
                                backend: { service: { name: 'web-svc', port: { number: 80 } } }
                            }]
                        }
                    }]
                },
                status: {
                    loadBalancer: { ingress: [{ ip: '203.0.113.10' }] }
                }
            }
        ]
    },
    objectives: [
        {
            id: 'create-tls-secret',
            description: '创建 TLS 类型的 Secret（包含证书）',
            hint: '使用 kubectl create secret tls <name> --cert=<cert> --key=<key>',
            checkCondition: (state) => state.secrets.some(s => s.type === 'kubernetes.io/tls')
        },
        {
            id: 'update-ingress-tls',
            description: '更新 Ingress，添加 TLS 配置',
            hint: '在 Ingress spec 中添加 tls 字段',
            checkCondition: (state) => state.ingresses.some(ing => 
                ing.spec.tls && ing.spec.tls.length > 0
            )
        },
        {
            id: 'verify-ingress',
            description: '验证 Ingress TLS 配置',
            hint: '使用 kubectl describe ingress',
            checkCondition: (_state, history) => history.some(cmd => 
                /kubectl\s+describe\s+(ingress|ing)/.test(cmd)
            )
        }
    ],
    hints: [
        'kubectl create secret tls my-tls --cert=tls.crt --key=tls.key',
        'Ingress spec.tls 配置 TLS 终止',
        'tls.secretName 引用包含证书的 Secret',
        'tls.hosts 指定使用该证书的域名'
    ],
    rewards: { xp: 180 }
};

// ========== 导出所有关卡 ==========

export const allScenarios: Scenario[] = [
    scenario1_1,
    scenario1_2,
    scenario1_3,
    scenario2_1,
    scenario2_2,
    scenario3_1,
    scenario3_2,
    scenario4_1,
    scenario5_1,
    scenario6_1,
    scenario6_2,
    scenario7_1,
    scenario7_2,
    scenario8_1,
    scenario8_2,
    scenario9_1,
    scenario10_1,
    scenario11_1,
    scenario11_2,
    scenario12_1,
    scenario13_1,
    scenario13_2,
    scenario14_1,
    scenario14_2,
    // 新增关卡
    scenario15_1,
    scenario15_2,
    scenario16_1,
    scenario17_1,
    scenario17_2,
    scenario18_1,
    scenario18_2,
    // CKA 认证考试模拟（16道真题）
    ...ckaScenarios,
];

export const getScenarioById = (id: string): Scenario | undefined => {
    return allScenarios.find(s => s.id === id);
};
