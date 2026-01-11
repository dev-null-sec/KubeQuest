export interface K8sResource {
    apiVersion: string;
    kind: string;
    metadata: {
        name: string;
        namespace?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        uid?: string;
        creationTimestamp?: string;
        generation?: number;
        resourceVersion?: string;
        ownerReferences?: { apiVersion: string; kind: string; name: string; uid: string }[];
    };
}

// ========== 容器定义 ==========
export interface Container {
    name: string;
    image: string;
    command?: string[];
    args?: string[];
    ports?: { containerPort: number; protocol?: string; name?: string }[];
    env?: { name: string; value?: string; valueFrom?: { configMapKeyRef?: { name: string; key: string }; secretKeyRef?: { name: string; key: string }; fieldRef?: { fieldPath: string } } }[];
    envFrom?: { configMapRef?: { name: string }; secretRef?: { name: string } }[];
    volumeMounts?: { name: string; mountPath: string; subPath?: string; readOnly?: boolean }[];
    resources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
    };
    livenessProbe?: Probe;
    readinessProbe?: Probe;
    startupProbe?: Probe;
    securityContext?: ContainerSecurityContext;
    imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
    terminationMessagePath?: string;
    terminationMessagePolicy?: string;
    workingDir?: string;
    stdin?: boolean;
    stdinOnce?: boolean;
    tty?: boolean;
}

export interface Probe {
    httpGet?: { path: string; port: number; scheme?: string };
    tcpSocket?: { port: number };
    exec?: { command: string[] };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
    successThreshold?: number;
    failureThreshold?: number;
}

export interface ContainerSecurityContext {
    runAsUser?: number;
    runAsGroup?: number;
    runAsNonRoot?: boolean;
    readOnlyRootFilesystem?: boolean;
    allowPrivilegeEscalation?: boolean;
    privileged?: boolean;
    capabilities?: { add?: string[]; drop?: string[] };
}

// ========== 调度相关 ==========
export interface NodeSelector {
    [key: string]: string;
}

export interface NodeAffinity {
    requiredDuringSchedulingIgnoredDuringExecution?: {
        nodeSelectorTerms: { matchExpressions?: LabelSelectorRequirement[]; matchFields?: LabelSelectorRequirement[] }[];
    };
    preferredDuringSchedulingIgnoredDuringExecution?: {
        weight: number;
        preference: { matchExpressions?: LabelSelectorRequirement[]; matchFields?: LabelSelectorRequirement[] };
    }[];
}

export interface PodAffinity {
    requiredDuringSchedulingIgnoredDuringExecution?: PodAffinityTerm[];
    preferredDuringSchedulingIgnoredDuringExecution?: { weight: number; podAffinityTerm: PodAffinityTerm }[];
}

export interface PodAffinityTerm {
    labelSelector?: { matchLabels?: Record<string, string>; matchExpressions?: LabelSelectorRequirement[] };
    topologyKey: string;
    namespaces?: string[];
}

export interface LabelSelectorRequirement {
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';
    values?: string[];
}

export interface Toleration {
    key?: string;
    operator?: 'Equal' | 'Exists';
    value?: string;
    effect?: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
    tolerationSeconds?: number;
}

export interface Taint {
    key: string;
    value?: string;
    effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

// ========== Volume 定义 ==========
export interface Volume {
    name: string;
    emptyDir?: { medium?: string; sizeLimit?: string };
    hostPath?: { path: string; type?: string };
    configMap?: { name: string; items?: { key: string; path: string }[]; defaultMode?: number };
    secret?: { secretName: string; items?: { key: string; path: string }[]; defaultMode?: number };
    persistentVolumeClaim?: { claimName: string; readOnly?: boolean };
    projected?: { sources: { configMap?: { name: string }; secret?: { name: string }; serviceAccountToken?: { path: string; expirationSeconds?: number } }[] };
}

// ========== Pod ==========
export interface Pod extends K8sResource {
    kind: 'Pod';
    spec: {
        containers: Container[];
        initContainers?: Container[];
        nodeName?: string;
        nodeSelector?: NodeSelector;
        affinity?: {
            nodeAffinity?: NodeAffinity;
            podAffinity?: PodAffinity;
            podAntiAffinity?: PodAffinity;
        };
        tolerations?: Toleration[];
        serviceAccountName?: string;
        automountServiceAccountToken?: boolean;
        volumes?: Volume[];
        restartPolicy?: 'Always' | 'OnFailure' | 'Never';
        terminationGracePeriodSeconds?: number;
        dnsPolicy?: 'ClusterFirst' | 'Default' | 'ClusterFirstWithHostNet' | 'None';
        hostNetwork?: boolean;
        hostPID?: boolean;
        hostIPC?: boolean;
        securityContext?: {
            runAsUser?: number;
            runAsGroup?: number;
            fsGroup?: number;
            runAsNonRoot?: boolean;
            supplementalGroups?: number[];
        };
        priorityClassName?: string;
        priority?: number;
        schedulerName?: string;
    };
    status: {
        phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown' | 'CrashLoopBackOff' | 'Error' | 'ImagePullBackOff' | 'ContainerCreating';
        podIP?: string;
        hostIP?: string;
        conditions?: { type: string; status: string; reason?: string; message?: string; lastTransitionTime?: string }[];
        containerStatuses?: {
            name: string;
            ready: boolean;
            restartCount: number;
            state: { running?: { startedAt: string }; waiting?: { reason: string; message?: string }; terminated?: { exitCode: number; reason?: string } };
            lastState?: { terminated?: { exitCode: number; reason?: string; finishedAt?: string } };
            image: string;
            imageID: string;
        }[];
        startTime?: string;
        qosClass?: 'Guaranteed' | 'Burstable' | 'BestEffort';
    };
}

export interface Node extends K8sResource {
    kind: 'Node';
    status: {
        addresses: { type: string; address: string }[];
        conditions: { type: string; status: string; message?: string }[];
        capacity: Record<string, string>;
        allocatable: Record<string, string>;
    };
    spec: {
        taints?: { key: string; value: string; effect: string }[];
        unschedulable?: boolean;
    };
}

export interface Deployment extends K8sResource {
    kind: 'Deployment';
    spec: {
        replicas: number;
        selector: { matchLabels: Record<string, string> };
        progressDeadlineSeconds?: number;
        revisionHistoryLimit?: number;
        strategy?: {
            type: 'RollingUpdate' | 'Recreate';
            rollingUpdate?: {
                maxSurge?: string | number;
                maxUnavailable?: string | number;
            };
        };
        template: {
            metadata: { 
                labels: Record<string, string>;
                annotations?: Record<string, string>;
                creationTimestamp?: string | null;
            };
            spec: Pod['spec'];
        };
    };
    status?: {
        availableReplicas?: number;
        readyReplicas?: number;
        replicas?: number;
        updatedReplicas?: number;
        observedGeneration?: number;
        conditions?: {
            type: string;
            status: string;
            reason?: string;
            message?: string;
            lastTransitionTime?: string;
            lastUpdateTime?: string;
        }[];
    };
}

export interface Service extends K8sResource {
    kind: 'Service';
    spec: {
        selector: Record<string, string>;
        ports: { port: number; targetPort: number; nodePort?: number; protocol?: string; name?: string }[];
        type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
        clusterIP?: string;
    };
}

export interface ConfigMap extends K8sResource {
    kind: 'ConfigMap';
    data: Record<string, string>;
    immutable?: boolean;
}

export interface Secret extends K8sResource {
    kind: 'Secret';
    type: 'Opaque' | 'kubernetes.io/service-account-token' | 'kubernetes.io/dockerconfigjson' | 'kubernetes.io/tls';
    data: Record<string, string>;
}

export interface PersistentVolume extends K8sResource {
    kind: 'PersistentVolume';
    spec: {
        capacity: { storage: string };
        accessModes: ('ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany')[];
        persistentVolumeReclaimPolicy: 'Retain' | 'Recycle' | 'Delete';
        storageClassName?: string;
        hostPath?: { path: string };
        nfs?: { server: string; path: string };
    };
    status: {
        phase: 'Available' | 'Bound' | 'Released' | 'Failed';
    };
}

export interface PersistentVolumeClaim extends K8sResource {
    kind: 'PersistentVolumeClaim';
    spec: {
        accessModes: ('ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany')[];
        resources: { requests: { storage: string } };
        storageClassName?: string;
        volumeName?: string;
    };
    status: {
        phase: 'Pending' | 'Bound' | 'Lost';
        capacity?: { storage: string };
    };
}

export interface Ingress extends K8sResource {
    kind: 'Ingress';
    spec: {
        ingressClassName?: string;
        rules: {
            host?: string;
            http: {
                paths: {
                    path: string;
                    pathType: 'Prefix' | 'Exact' | 'ImplementationSpecific';
                    backend: {
                        service: { name: string; port: { number: number } };
                    };
                }[];
            };
        }[];
        tls?: { hosts: string[]; secretName: string }[];
    };
    status: {
        loadBalancer: { ingress?: { ip?: string; hostname?: string }[] };
    };
}

export interface NetworkPolicy extends K8sResource {
    kind: 'NetworkPolicy';
    spec: {
        podSelector: { matchLabels: Record<string, string> };
        policyTypes: ('Ingress' | 'Egress')[];
        ingress?: {
            from?: { podSelector?: { matchLabels: Record<string, string> }; namespaceSelector?: { matchLabels: Record<string, string> } }[];
            ports?: { protocol: string; port: number }[];
        }[];
        egress?: {
            to?: { podSelector?: { matchLabels: Record<string, string> } }[];
            ports?: { protocol: string; port: number }[];
        }[];
    };
}

// ========== Gateway API ==========
export interface GatewayClass extends K8sResource {
    apiVersion: 'gateway.networking.k8s.io/v1';
    kind: 'GatewayClass';
    spec: {
        controllerName: string;
        description?: string;
    };
}

export interface Gateway extends K8sResource {
    apiVersion: 'gateway.networking.k8s.io/v1';
    kind: 'Gateway';
    spec: {
        gatewayClassName: string;
        listeners: {
            name: string;
            hostname?: string;
            port: number;
            protocol: 'HTTP' | 'HTTPS' | 'TLS' | 'TCP' | 'UDP';
            tls?: {
                mode?: 'Terminate' | 'Passthrough';
                certificateRefs?: { name: string; kind?: string; group?: string }[];
            };
            allowedRoutes?: { namespaces?: { from: 'All' | 'Same' | 'Selector'; selector?: { matchLabels: Record<string, string> } } };
        }[];
        addresses?: { type: string; value: string }[];
    };
    status?: {
        addresses?: { type: string; value: string }[];
        conditions?: { type: string; status: string; reason?: string; message?: string }[];
        listeners?: { name: string; attachedRoutes: number; conditions: { type: string; status: string }[] }[];
    };
}

export interface HTTPRoute extends K8sResource {
    apiVersion: 'gateway.networking.k8s.io/v1';
    kind: 'HTTPRoute';
    spec: {
        parentRefs: { name: string; namespace?: string; sectionName?: string }[];
        hostnames?: string[];
        rules: {
            matches?: {
                path?: { type: 'Exact' | 'PathPrefix' | 'RegularExpression'; value: string };
                headers?: { name: string; value: string; type?: 'Exact' | 'RegularExpression' }[];
                method?: string;
            }[];
            filters?: { type: string; requestRedirect?: { scheme?: string; hostname?: string; port?: number; statusCode?: number } }[];
            backendRefs?: { name: string; port: number; weight?: number }[];
        }[];
    };
    status?: {
        parents: { parentRef: { name: string }; controllerName: string; conditions: { type: string; status: string }[] }[];
    };
}

export interface HorizontalPodAutoscaler extends K8sResource {
    kind: 'HorizontalPodAutoscaler';
    spec: {
        scaleTargetRef: {
            apiVersion: string;
            kind: string;
            name: string;
        };
        minReplicas: number;
        maxReplicas: number;
        metrics?: {
            type: 'Resource' | 'Pods' | 'Object';
            resource?: { name: string; target: { type: string; averageUtilization?: number } };
        }[];
    };
    status: {
        currentReplicas: number;
        desiredReplicas: number;
        currentMetrics?: { type: string; resource?: { current: { averageUtilization: number } } }[];
    };
}

export interface Role extends K8sResource {
    kind: 'Role';
    rules: {
        apiGroups: string[];
        resources: string[];
        verbs: string[];
        resourceNames?: string[];
    }[];
}

export interface RoleBinding extends K8sResource {
    kind: 'RoleBinding';
    roleRef: {
        apiGroup: string;
        kind: 'Role' | 'ClusterRole';
        name: string;
    };
    subjects: {
        kind: 'User' | 'Group' | 'ServiceAccount';
        name: string;
        namespace?: string;
    }[];
}

export interface ServiceAccount extends K8sResource {
    kind: 'ServiceAccount';
    secrets?: { name: string }[];
    imagePullSecrets?: { name: string }[];
}

// ========== ClusterRole / ClusterRoleBinding (集群级 RBAC) ==========
export interface ClusterRole extends K8sResource {
    kind: 'ClusterRole';
    rules: {
        apiGroups: string[];
        resources: string[];
        verbs: ('get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete' | '*')[];
        resourceNames?: string[];
    }[];
    aggregationRule?: {
        clusterRoleSelectors: { matchLabels: Record<string, string> }[];
    };
}

export interface ClusterRoleBinding extends K8sResource {
    kind: 'ClusterRoleBinding';
    roleRef: {
        apiGroup: string;
        kind: 'ClusterRole';
        name: string;
    };
    subjects: {
        kind: 'User' | 'Group' | 'ServiceAccount';
        name: string;
        namespace?: string;
        apiGroup?: string;
    }[];
}

// ========== StorageClass ==========
export interface StorageClass extends K8sResource {
    kind: 'StorageClass';
    provisioner: string;
    parameters?: Record<string, string>;
    reclaimPolicy?: 'Retain' | 'Delete';
    volumeBindingMode?: 'Immediate' | 'WaitForFirstConsumer';
    allowVolumeExpansion?: boolean;
}

// ========== Job / CronJob ==========
export interface Job extends K8sResource {
    kind: 'Job';
    spec: {
        template: {
            metadata?: { labels?: Record<string, string> };
            spec: Pod['spec'];
        };
        backoffLimit?: number;
        completions?: number;
        parallelism?: number;
        activeDeadlineSeconds?: number;
        ttlSecondsAfterFinished?: number;
    };
    status: {
        active?: number;
        succeeded?: number;
        failed?: number;
        startTime?: string;
        completionTime?: string;
        conditions?: { type: string; status: string; reason?: string; message?: string }[];
    };
}

export interface CronJob extends K8sResource {
    kind: 'CronJob';
    spec: {
        schedule: string;
        jobTemplate: {
            spec: Job['spec'];
        };
        concurrencyPolicy?: 'Allow' | 'Forbid' | 'Replace';
        suspend?: boolean;
        successfulJobsHistoryLimit?: number;
        failedJobsHistoryLimit?: number;
        startingDeadlineSeconds?: number;
    };
    status: {
        active?: { name: string; namespace: string }[];
        lastScheduleTime?: string;
        lastSuccessfulTime?: string;
    };
}

// ========== DaemonSet / StatefulSet ==========
export interface DaemonSet extends K8sResource {
    kind: 'DaemonSet';
    spec: {
        selector: { matchLabels: Record<string, string> };
        template: {
            metadata: { labels: Record<string, string> };
            spec: Pod['spec'];
        };
        updateStrategy?: { type: 'RollingUpdate' | 'OnDelete'; rollingUpdate?: { maxUnavailable?: number | string } };
    };
    status: {
        currentNumberScheduled: number;
        desiredNumberScheduled: number;
        numberAvailable: number;
        numberReady: number;
        numberMisscheduled: number;
        updatedNumberScheduled: number;
    };
}

export interface StatefulSet extends K8sResource {
    kind: 'StatefulSet';
    spec: {
        replicas: number;
        selector: { matchLabels: Record<string, string> };
        serviceName: string;
        template: {
            metadata: { labels: Record<string, string> };
            spec: Pod['spec'];
        };
        volumeClaimTemplates?: {
            metadata: { name: string };
            spec: PersistentVolumeClaim['spec'];
        }[];
        updateStrategy?: { type: 'RollingUpdate' | 'OnDelete'; rollingUpdate?: { partition?: number } };
        podManagementPolicy?: 'OrderedReady' | 'Parallel';
    };
    status: {
        replicas: number;
        readyReplicas: number;
        currentReplicas: number;
        updatedReplicas?: number;
        availableReplicas?: number;
    };
}

// ========== ResourceQuota / LimitRange (策略) ==========
export interface ResourceQuota extends K8sResource {
    kind: 'ResourceQuota';
    spec: {
        hard: {
            'requests.cpu'?: string;
            'requests.memory'?: string;
            'limits.cpu'?: string;
            'limits.memory'?: string;
            'pods'?: string;
            'services'?: string;
            'secrets'?: string;
            'configmaps'?: string;
            'persistentvolumeclaims'?: string;
            'count/deployments.apps'?: string;
            [key: string]: string | undefined;
        };
        scopes?: ('Terminating' | 'NotTerminating' | 'BestEffort' | 'NotBestEffort')[];
    };
    status?: {
        hard: Record<string, string>;
        used: Record<string, string>;
    };
}

export interface LimitRange extends K8sResource {
    kind: 'LimitRange';
    spec: {
        limits: {
            type: 'Pod' | 'Container' | 'PersistentVolumeClaim';
            default?: { cpu?: string; memory?: string };
            defaultRequest?: { cpu?: string; memory?: string };
            min?: { cpu?: string; memory?: string };
            max?: { cpu?: string; memory?: string };
            maxLimitRequestRatio?: { cpu?: string; memory?: string };
        }[];
    };
}

// ========== PriorityClass (调度优先级) ==========
export interface PriorityClass extends K8sResource {
    kind: 'PriorityClass';
    value: number;
    globalDefault?: boolean;
    preemptionPolicy?: 'PreemptLowerPriority' | 'Never';
    description?: string;
}

// ========== ETCD 状态模拟 ==========
export interface ETCDMember {
    id: string;
    name: string;
    peerURLs: string[];
    clientURLs: string[];
    status: 'healthy' | 'unhealthy' | 'unknown';
    isLeader: boolean;
    dbSize: number; // bytes
    dbSizeInUse: number;
}

export interface ETCDCluster {
    members: ETCDMember[];
    version: string;
    clusterID: string;
    // 备份状态
    backups: {
        name: string;
        timestamp: string;
        size: number;
        path: string;
    }[];
    // 是否损坏（用于恢复关卡）
    corrupted?: boolean;
}

// ========== 系统组件状态 ==========
export interface SystemComponent {
    name: 'kube-apiserver' | 'kube-scheduler' | 'kube-controller-manager' | 'etcd' | 'kubelet' | 'kube-proxy' | 'coredns';
    status: 'Running' | 'Stopped' | 'Error' | 'Unknown';
    node: string;
    message?: string;
    lastHeartbeat?: string;
}

// ========== 集群状态 ==========
export interface ClusterState {
    // 核心资源
    nodes: Node[];
    pods: Pod[];
    deployments: Deployment[];
    services: Service[];
    namespaces: string[];
    
    // 配置资源
    configMaps: ConfigMap[];
    secrets: Secret[];
    
    // 存储资源
    persistentVolumes: PersistentVolume[];
    persistentVolumeClaims: PersistentVolumeClaim[];
    storageClasses: StorageClass[];
    
    // 网络资源
    ingresses: Ingress[];
    networkPolicies: NetworkPolicy[];
    
    // Gateway API
    gatewayClasses: GatewayClass[];
    gateways: Gateway[];
    httpRoutes: HTTPRoute[];
    
    // 自动扩缩容
    hpas: HorizontalPodAutoscaler[];
    
    // RBAC
    roles: Role[];
    roleBindings: RoleBinding[];
    clusterRoles: ClusterRole[];
    clusterRoleBindings: ClusterRoleBinding[];
    serviceAccounts: ServiceAccount[];
    
    // 工作负载
    jobs: Job[];
    cronJobs: CronJob[];
    daemonSets: DaemonSet[];
    statefulSets: StatefulSet[];
    
    // 策略
    resourceQuotas: ResourceQuota[];
    limitRanges: LimitRange[];
    priorityClasses: PriorityClass[];
    
    // 系统状态
    etcd: ETCDCluster;
    systemComponents: SystemComponent[];
    
    // 事件日志
    events: K8sEvent[];
    
    // 当前用户上下文 (用于 RBAC)
    currentContext: {
        user: string;
        groups: string[];
        serviceAccount?: { name: string; namespace: string };
    };
}

export interface K8sEvent {
    type: 'Normal' | 'Warning';
    reason: string;
    message: string;
    involvedObject: { kind: string; name: string; namespace?: string };
    timestamp: string;
    count?: number;
    firstTimestamp?: string;
    lastTimestamp?: string;
    source?: { component: string; host?: string };
}

export const initialClusterState: ClusterState = {
    nodes: [
        {
            apiVersion: 'v1',
            kind: 'Node',
            metadata: { name: 'control-plane', labels: { 'kubernetes.io/hostname': 'control-plane', 'node-role.kubernetes.io/control-plane': '' } },
            status: {
                addresses: [{ type: 'InternalIP', address: '192.168.1.2' }],
                conditions: [{ type: 'Ready', status: 'True' }],
                capacity: { cpu: '4', memory: '8Gi', pods: '110' },
                allocatable: { cpu: '4', memory: '8Gi', pods: '110' }
            },
            spec: {}
        },
        {
            apiVersion: 'v1',
            kind: 'Node',
            metadata: { name: 'node01', labels: { 'kubernetes.io/hostname': 'node01' } },
            status: {
                addresses: [{ type: 'InternalIP', address: '192.168.1.3' }],
                conditions: [{ type: 'Ready', status: 'True' }],
                capacity: { cpu: '2', memory: '4Gi', pods: '110' },
                allocatable: { cpu: '2', memory: '4Gi', pods: '110' }
            },
            spec: {}
        },
        {
            apiVersion: 'v1',
            kind: 'Node',
            metadata: { name: 'node02', labels: { 'kubernetes.io/hostname': 'node02' } },
            status: {
                addresses: [{ type: 'InternalIP', address: '192.168.1.4' }],
                conditions: [{ type: 'Ready', status: 'True' }],
                capacity: { cpu: '2', memory: '4Gi', pods: '110' },
                allocatable: { cpu: '2', memory: '4Gi', pods: '110' }
            },
            spec: {}
        }
    ],
    pods: [],
    deployments: [],
    services: [
        {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: { name: 'kubernetes', namespace: 'default' },
            spec: {
                selector: {},
                ports: [{ port: 443, targetPort: 6443 }],
                type: 'ClusterIP',
                clusterIP: '10.96.0.1'
            }
        }
    ],
    namespaces: ['default', 'kube-system', 'kube-public', 'kube-node-lease'],
    configMaps: [],
    secrets: [],
    persistentVolumes: [],
    persistentVolumeClaims: [],
    storageClasses: [
        {
            apiVersion: 'storage.k8s.io/v1',
            kind: 'StorageClass',
            metadata: { name: 'standard', annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' } },
            provisioner: 'kubernetes.io/no-provisioner',
            volumeBindingMode: 'WaitForFirstConsumer'
        }
    ],
    ingresses: [],
    networkPolicies: [],
    gatewayClasses: [
        {
            apiVersion: 'gateway.networking.k8s.io/v1',
            kind: 'GatewayClass',
            metadata: { name: 'nginx' },
            spec: { controllerName: 'k8s.io/ingress-nginx' }
        }
    ],
    gateways: [],
    httpRoutes: [],
    hpas: [],
    roles: [],
    roleBindings: [],
    clusterRoles: [
        {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'ClusterRole',
            metadata: { name: 'cluster-admin' },
            rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }]
        },
        {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'ClusterRole',
            metadata: { name: 'view' },
            rules: [
                { apiGroups: [''], resources: ['pods', 'services', 'configmaps', 'secrets', 'persistentvolumeclaims'], verbs: ['get', 'list', 'watch'] },
                { apiGroups: ['apps'], resources: ['deployments', 'daemonsets', 'statefulsets'], verbs: ['get', 'list', 'watch'] }
            ]
        },
        {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'ClusterRole',
            metadata: { name: 'edit' },
            rules: [
                { apiGroups: [''], resources: ['pods', 'services', 'configmaps', 'secrets', 'persistentvolumeclaims'], verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'] },
                { apiGroups: ['apps'], resources: ['deployments', 'daemonsets', 'statefulsets'], verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'] }
            ]
        }
    ],
    clusterRoleBindings: [
        {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'ClusterRoleBinding',
            metadata: { name: 'cluster-admin-binding' },
            roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'cluster-admin' },
            subjects: [{ kind: 'User', name: 'kubernetes-admin' }]
        }
    ],
    serviceAccounts: [
        {
            apiVersion: 'v1',
            kind: 'ServiceAccount',
            metadata: { name: 'default', namespace: 'default' }
        },
        {
            apiVersion: 'v1',
            kind: 'ServiceAccount',
            metadata: { name: 'default', namespace: 'kube-system' }
        }
    ],
    jobs: [],
    cronJobs: [],
    daemonSets: [
        {
            apiVersion: 'apps/v1',
            kind: 'DaemonSet',
            metadata: { name: 'kube-proxy', namespace: 'kube-system' },
            spec: {
                selector: { matchLabels: { 'k8s-app': 'kube-proxy' } },
                template: {
                    metadata: { labels: { 'k8s-app': 'kube-proxy' } },
                    spec: { containers: [{ name: 'kube-proxy', image: 'registry.k8s.io/kube-proxy:v1.28.0' }] }
                }
            },
            status: {
                currentNumberScheduled: 3,
                desiredNumberScheduled: 3,
                numberAvailable: 3,
                numberReady: 3,
                numberMisscheduled: 0,
                updatedNumberScheduled: 3
            }
        }
    ],
    statefulSets: [],
    resourceQuotas: [],
    limitRanges: [],
    priorityClasses: [
        {
            apiVersion: 'scheduling.k8s.io/v1',
            kind: 'PriorityClass',
            metadata: { name: 'system-cluster-critical' },
            value: 2000000000,
            globalDefault: false,
            description: 'Used for system critical pods that must run in the cluster.'
        },
        {
            apiVersion: 'scheduling.k8s.io/v1',
            kind: 'PriorityClass',
            metadata: { name: 'system-node-critical' },
            value: 2000001000,
            globalDefault: false,
            description: 'Used for system critical pods that must not be moved from their current node.'
        }
    ],
    etcd: {
        members: [
            {
                id: 'a1b2c3d4e5f6',
                name: 'control-plane',
                peerURLs: ['https://192.168.1.2:2380'],
                clientURLs: ['https://192.168.1.2:2379'],
                status: 'healthy',
                isLeader: true,
                dbSize: 4194304,
                dbSizeInUse: 2097152
            }
        ],
        version: '3.5.9',
        clusterID: 'k8s-quest-etcd-cluster',
        backups: []
    },
    systemComponents: [
        { name: 'kube-apiserver', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() },
        { name: 'kube-scheduler', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() },
        { name: 'kube-controller-manager', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() },
        { name: 'etcd', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() },
        { name: 'kubelet', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() },
        { name: 'kubelet', status: 'Running', node: 'node01', lastHeartbeat: new Date().toISOString() },
        { name: 'kubelet', status: 'Running', node: 'node02', lastHeartbeat: new Date().toISOString() },
        { name: 'kube-proxy', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() },
        { name: 'coredns', status: 'Running', node: 'control-plane', lastHeartbeat: new Date().toISOString() }
    ],
    events: [],
    currentContext: {
        user: 'kubernetes-admin',
        groups: ['system:masters', 'system:authenticated']
    }
};
