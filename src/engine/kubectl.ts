import type { 
    ClusterState, Pod, Deployment, Service, Node, HorizontalPodAutoscaler, 
    ConfigMap, Secret, Job, CronJob, DaemonSet, StatefulSet, 
    ClusterRole, ClusterRoleBinding, Role, RoleBinding, ServiceAccount,
    StorageClass, ResourceQuota, LimitRange, PersistentVolume, PersistentVolumeClaim,
    NetworkPolicy, Ingress, GatewayClass, Gateway, HTTPRoute
} from './cluster';
import { canI } from './rbac';

type CommandResult = { output: string; newState: ClusterState };

/**
 * 执行kubectl命令并返回输出
 */
export async function executeKubectl(
    command: string,
    state: ClusterState
): Promise<CommandResult> {
    const parts = parseCommand(command);

    if (parts[0] !== 'kubectl') {
        return { output: `command not found: ${parts[0]}`, newState: state };
    }

    // 检查 ETCD 是否损坏
    if (state.etcd?.corrupted) {
        return { 
            output: `Error: couldn't get current server API group list: Get "https://127.0.0.1:6443/api?timeout=32s": dial tcp 127.0.0.1:6443: connect: connection refused
The connection to the server 127.0.0.1:6443 was refused - did you specify the right host or port?

⚠️  ETCD 数据已损坏，API Server 无法启动。
请使用 etcdctl snapshot restore 从备份恢复数据。`, 
            newState: state 
        };
    }

    // 处理 -n/--namespace 参数，找到实际的 action
    let actionIndex = 1;
    for (let i = 1; i < parts.length; i++) {
        if (parts[i] === '-n' || parts[i] === '--namespace') {
            i++; // 跳过命名空间值
            continue;
        }
        if (parts[i].startsWith('-')) {
            continue; // 跳过其他标志
        }
        actionIndex = i;
        break;
    }
    const action = parts[actionIndex];

    try {
        switch (action) {
            case 'get':
                return handleGet(parts, state);
            case 'describe':
                return handleDescribe(parts, state);
            case 'run':
                return handleRun(parts, state);
            case 'delete':
                return handleDelete(parts, state);
            case 'create':
                return handleCreate(parts, state);
            case 'logs':
                return handleLogs(parts, state);
            case 'apply':
                return handleApply(parts, state);
            case 'scale':
                return handleScale(parts, state);
            case 'expose':
                return handleExpose(parts, state);
            case 'edit':
                return handleEdit(parts, state);
            case 'label':
                return handleLabel(parts, state);
            case 'annotate':
                return handleAnnotate(parts, state);
            case 'taint':
                return handleTaint(parts, state);
            case 'cordon':
                return handleCordon(parts, state);
            case 'uncordon':
                return handleUncordon(parts, state);
            case 'drain':
                return handleDrain(parts, state);
            case 'rollout':
                return handleRollout(parts, state);
            case 'set':
                return handleSet(parts, state);
            case 'autoscale':
                return handleAutoscale(parts, state);
            case 'top':
                return handleTop(parts, state);
            case 'exec':
                return handleExec(parts, state);
            case 'port-forward':
                return handlePortForward(parts, state);
            case 'cp':
                return handleCp(parts, state);
            case 'config':
                return handleConfig(parts, state);
            case 'auth':
                return handleAuth(parts, state);
            case 'api-resources':
                return handleApiResources(state);
            case 'explain':
                return handleExplain(parts, state);
            case 'cluster-info':
                return handleClusterInfo(parts, state);
            default:
                return {
                    output: `Error: unknown command "kubectl ${action}"\nRun 'kubectl --help' for usage.`,
                    newState: state
                };
        }
    } catch (error) {
        return {
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
            newState: state
        };
    }
}

/**
 * 解析命令行，处理引号内的空格
 */
function parseCommand(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (const char of command.trim()) {
        if ((char === '"' || char === "'") && !inQuotes) {
            inQuotes = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
            inQuotes = false;
            quoteChar = '';
        } else if (char === ' ' && !inQuotes) {
            if (current) {
                parts.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }
    if (current) parts.push(current);
    return parts;
}

/**
 * kubectl get 命令处理
 */
function handleGet(parts: string[], state: ClusterState): { output: string; newState: ClusterState } {
    const flags = parseFlags(parts.slice(1));
    
    // 找到 'get' 后的第一个非 flag 参数作为资源类型
    let getIndex = parts.findIndex(p => p === 'get');
    let resource = '';
    let resourceIndex = -1;
    for (let i = getIndex + 1; i < parts.length; i++) {
        if (parts[i].startsWith('-')) {
            if (parts[i] === '-n' || parts[i] === '--namespace' || parts[i] === '-o' || parts[i] === '--output') {
                i++; // 跳过参数值
            }
            continue;
        }
        resource = parts[i];
        resourceIndex = i;
        break;
    }
    
    // name 是资源类型后的第一个非 flag 参数
    const nonFlagArgs = extractNonFlagArgs(parts.slice(resourceIndex + 1));
    const name = nonFlagArgs[0];
    
    const outputFormat = flags['o'] || flags['output'];
    const wide = outputFormat === 'wide';
    const allNs = flags['all-namespaces'] === true || flags['A'] === true;
    const showLabels = flags['show-labels'] === true;
    const namespace = String(flags['n'] || flags['namespace'] || 'default');

    // 输出为 YAML 或 JSON 格式
    if (outputFormat === 'yaml' || outputFormat === 'json') {
        const resourceObj = getResourceByName(resource, name, state, namespace);
        if (resourceObj === null) {
            return { output: `Error from server (NotFound): ${resource} "${name}" not found in namespace "${namespace}"`, newState: state };
        }
        if (resourceObj === undefined) {
            return { output: `Error: you must specify a resource name when using -o ${outputFormat}`, newState: state };
        }
        if (outputFormat === 'yaml') {
            return { output: formatAsYaml(resourceObj), newState: state };
        } else {
            return { output: JSON.stringify(resourceObj, null, 2), newState: state };
        }
    }

    switch (resource) {
        case 'nodes':
        case 'node':
            if (name) {
                const node = state.nodes.find(n => n.metadata.name === name);
                if (!node) return { output: `Error from server (NotFound): nodes "${name}" not found`, newState: state };
                return { output: formatNodeSingle(node), newState: state };
            }
            return { output: formatNodes(state.nodes, wide, showLabels), newState: state };

        case 'pods':
        case 'pod':
            // 根据 namespace 过滤 pods
            const filteredPods = allNs ? state.pods : state.pods.filter(p => (p.metadata.namespace || 'default') === namespace);
            if (name) {
                const pod = filteredPods.find(p => p.metadata.name === name);
                if (!pod) return { output: `Error from server (NotFound): pods "${name}" not found`, newState: state };
                return { output: formatPod(pod, showLabels), newState: state };
            }
            return { output: formatPods(filteredPods, allNs, wide, showLabels, namespace), newState: state };

        case 'deployments':
        case 'deployment':
        case 'deploy':
            const filteredDeps = allNs ? state.deployments : state.deployments.filter(d => (d.metadata.namespace || 'default') === namespace);
            if (name) {
                const dep = filteredDeps.find(d => d.metadata.name === name);
                if (!dep) return { output: `Error from server (NotFound): deployments.apps "${name}" not found`, newState: state };
                // 返回单个 Deployment 的信息
                return { output: formatDeployments([dep], state.pods.filter(p => p.metadata.namespace === namespace), wide), newState: state };
            }
            return { output: formatDeployments(filteredDeps, state.pods, wide), newState: state };

        case 'services':
        case 'service':
        case 'svc':
            const filteredSvcs = allNs ? state.services : state.services.filter(s => (s.metadata.namespace || 'default') === namespace);
            if (name) {
                const svc = filteredSvcs.find(s => s.metadata.name === name);
                if (!svc) return { output: `Error from server (NotFound): services "${name}" not found`, newState: state };
                return { output: formatServices([svc], wide), newState: state };
            }
            return { output: formatServices(filteredSvcs, wide), newState: state };
            
        case 'configmaps':
        case 'configmap':
        case 'cm':
            return { output: formatConfigMaps(state.configMaps), newState: state };
            
        case 'secrets':
        case 'secret':
            return { output: formatSecrets(state.secrets), newState: state };
            
        case 'namespaces':
        case 'namespace':
        case 'ns':
            return { output: formatNamespaces(state.namespaces), newState: state };
            
        case 'hpa':
        case 'horizontalpodautoscaler':
            return { output: formatHPAs(state.hpas), newState: state };
            
        // ========== 工作负载 ==========
        case 'jobs':
        case 'job':
            return { output: formatJobs(state.jobs, allNs), newState: state };
            
        case 'cronjobs':
        case 'cronjob':
        case 'cj':
            return { output: formatCronJobs(state.cronJobs, allNs), newState: state };
            
        case 'daemonsets':
        case 'daemonset':
        case 'ds':
            return { output: formatDaemonSets(state.daemonSets, allNs), newState: state };
            
        case 'statefulsets':
        case 'statefulset':
        case 'sts':
            return { output: formatStatefulSets(state.statefulSets, allNs), newState: state };
            
        // ========== RBAC ==========
        case 'roles':
        case 'role':
            return { output: formatRoles(state.roles), newState: state };
            
        case 'rolebindings':
        case 'rolebinding':
            return { output: formatRoleBindings(state.roleBindings), newState: state };
            
        case 'clusterroles':
        case 'clusterrole':
            return { output: formatClusterRoles(state.clusterRoles), newState: state };
            
        case 'clusterrolebindings':
        case 'clusterrolebinding':
            return { output: formatClusterRoleBindings(state.clusterRoleBindings), newState: state };
            
        case 'serviceaccounts':
        case 'serviceaccount':
        case 'sa':
            return { output: formatServiceAccounts(state.serviceAccounts, allNs), newState: state };
            
        // ========== 存储 ==========
        case 'persistentvolumes':
        case 'persistentvolume':
        case 'pv':
            return { output: formatPersistentVolumes(state.persistentVolumes), newState: state };
            
        case 'persistentvolumeclaims':
        case 'persistentvolumeclaim':
        case 'pvc':
            return { output: formatPersistentVolumeClaims(state.persistentVolumeClaims, allNs), newState: state };
            
        case 'storageclasses':
        case 'storageclass':
        case 'sc':
            return { output: formatStorageClasses(state.storageClasses), newState: state };
            
        // ========== 网络 ==========
        case 'ingresses':
        case 'ingress':
        case 'ing':
            return { output: formatIngresses(state.ingresses, allNs), newState: state };
            
        case 'networkpolicies':
        case 'networkpolicy':
        case 'netpol':
            return { output: formatNetworkPolicies(state.networkPolicies, allNs), newState: state };
            
        // ========== Gateway API ==========
        case 'gatewayclasses':
        case 'gatewayclass':
        case 'gc':
            return { output: formatGatewayClasses(state.gatewayClasses), newState: state };
            
        case 'gateways':
        case 'gateway':
        case 'gtw':
            return { output: formatGateways(state.gateways, allNs), newState: state };
            
        case 'httproutes':
        case 'httproute':
            return { output: formatHTTPRoutes(state.httpRoutes, allNs), newState: state };
            
        // ========== CRD ==========
        case 'crds':
        case 'crd':
        case 'customresourcedefinitions':
        case 'customresourcedefinition':
            return { output: formatCRDs(), newState: state };
            
        // ========== 策略 ==========
        case 'resourcequotas':
        case 'resourcequota':
        case 'quota':
            return { output: formatResourceQuotas(state.resourceQuotas, allNs), newState: state };
            
        case 'limitranges':
        case 'limitrange':
        case 'limits':
            return { output: formatLimitRanges(state.limitRanges, allNs), newState: state };
            
        case 'priorityclasses':
        case 'priorityclass':
        case 'pc':
            if (name) {
                const pc = state.priorityClasses.find(p => p.metadata.name === name);
                if (!pc) return { output: `Error from server (NotFound): priorityclasses.scheduling.k8s.io "${name}" not found`, newState: state };
                return { output: formatPriorityClasses([pc]), newState: state };
            }
            return { output: formatPriorityClasses(state.priorityClasses), newState: state };
            
        // ========== 事件 ==========
        case 'events':
        case 'event':
        case 'ev':
            return { output: formatEvents(state.events, allNs), newState: state };
            
        // ========== 组合查询 ==========
        case 'all':
            return { output: formatAll(state, allNs), newState: state };

        default:
            return { output: `error: the server doesn't have a resource type "${resource}"`, newState: state };
    }
}

/**
 * kubectl describe 命令处理
 */
function handleDescribe(parts: string[], state: ClusterState): { output: string; newState: ClusterState } {
    const resource = parts[2];
    const name = parts[3];

    if (!name) {
        return { output: 'Error: you must specify the type of resource to describe', newState: state };
    }

    switch (resource) {
        case 'pod':
        case 'pods':
            const pod = state.pods.find(p => p.metadata.name === name);
            if (!pod) return { output: `Error from server (NotFound): pods "${name}" not found`, newState: state };
            return { output: describePod(pod), newState: state };

        case 'node':
        case 'nodes':
            const node = state.nodes.find(n => n.metadata.name === name);
            if (!node) return { output: `Error from server (NotFound): nodes "${name}" not found`, newState: state };
            return { output: describeNode(node), newState: state };

        case 'deployment':
        case 'deployments':
        case 'deploy':
            const dep = state.deployments.find(d => d.metadata.name === name);
            if (!dep) return { output: `Error from server (NotFound): deployments.apps "${name}" not found`, newState: state };
            return { output: describeDeployment(dep, state), newState: state };

        case 'service':
        case 'services':
        case 'svc':
            const svc = state.services.find(s => s.metadata.name === name);
            if (!svc) return { output: `Error from server (NotFound): services "${name}" not found`, newState: state };
            return { output: describeService(svc, state), newState: state };

        case 'configmap':
        case 'configmaps':
        case 'cm':
            const cm = state.configMaps.find(c => c.metadata.name === name);
            if (!cm) return { output: `Error from server (NotFound): configmaps "${name}" not found`, newState: state };
            return { output: describeConfigMap(cm), newState: state };

        case 'secret':
        case 'secrets':
            const secret = state.secrets.find(s => s.metadata.name === name);
            if (!secret) return { output: `Error from server (NotFound): secrets "${name}" not found`, newState: state };
            return { output: describeSecret(secret), newState: state };

        case 'pv':
        case 'persistentvolume':
        case 'persistentvolumes':
            const pv = state.persistentVolumes.find(p => p.metadata.name === name);
            if (!pv) return { output: `Error from server (NotFound): persistentvolumes "${name}" not found`, newState: state };
            return { output: describePV(pv), newState: state };

        case 'pvc':
        case 'persistentvolumeclaim':
        case 'persistentvolumeclaims':
            const pvc = state.persistentVolumeClaims.find(p => p.metadata.name === name);
            if (!pvc) return { output: `Error from server (NotFound): persistentvolumeclaims "${name}" not found`, newState: state };
            return { output: describePVC(pvc), newState: state };

        case 'ingress':
        case 'ingresses':
        case 'ing':
            const ing = state.ingresses.find(i => i.metadata.name === name);
            if (!ing) return { output: `Error from server (NotFound): ingresses.networking.k8s.io "${name}" not found`, newState: state };
            return { output: describeIngress(ing), newState: state };

        case 'hpa':
        case 'horizontalpodautoscaler':
        case 'horizontalpodautoscalers':
            const hpa = state.hpas.find(h => h.metadata.name === name);
            if (!hpa) return { output: `Error from server (NotFound): horizontalpodautoscalers.autoscaling "${name}" not found`, newState: state };
            return { output: describeHPA(hpa), newState: state };

        case 'storageclass':
        case 'storageclasses':
        case 'sc':
            const sc = state.storageClasses.find(s => s.metadata.name === name);
            if (!sc) return { output: `Error from server (NotFound): storageclasses.storage.k8s.io "${name}" not found`, newState: state };
            return { output: describeStorageClass(sc), newState: state };

        case 'networkpolicy':
        case 'networkpolicies':
        case 'netpol':
            const np = state.networkPolicies.find(n => n.metadata.name === name);
            if (!np) return { output: `Error from server (NotFound): networkpolicies.networking.k8s.io "${name}" not found`, newState: state };
            return { output: describeNetworkPolicy(np), newState: state };

        case 'priorityclass':
        case 'priorityclasses':
        case 'pc':
            const pc = state.priorityClasses.find(p => p.metadata.name === name);
            if (!pc) return { output: `Error from server (NotFound): priorityclasses.scheduling.k8s.io "${name}" not found`, newState: state };
            return { output: describePriorityClass(pc), newState: state };

        case 'gateway':
        case 'gateways':
        case 'gw':
            const gw = state.gateways.find(g => g.metadata.name === name);
            if (!gw) return { output: `Error from server (NotFound): gateways.gateway.networking.k8s.io "${name}" not found`, newState: state };
            return { output: describeGateway(gw), newState: state };

        case 'httproute':
        case 'httproutes':
            const hr = state.httpRoutes.find(r => r.metadata.name === name);
            if (!hr) return { output: `Error from server (NotFound): httproutes.gateway.networking.k8s.io "${name}" not found`, newState: state };
            return { output: describeHTTPRoute(hr), newState: state };

        case 'sa':
        case 'serviceaccount':
        case 'serviceaccounts':
            const sa = state.serviceAccounts.find(s => s.metadata.name === name);
            if (!sa) return { output: `Error from server (NotFound): serviceaccounts "${name}" not found`, newState: state };
            return { output: describeServiceAccount(sa), newState: state };

        default:
            return { output: `error: the server doesn't have a resource type "${resource}"`, newState: state };
    }
}

/**
 * kubectl run 命令处理 - 创建一个Pod
 */
function handleRun(parts: string[], state: ClusterState): { output: string; newState: ClusterState } {
    const name = parts[2];
    const flags = parseFlags(parts.slice(2));
    const image = flags['image'];
    const dryRun = flags['dry-run'];
    const outputFormat = flags['o'] || flags['output'];

    if (!name || !image) {
        return { output: 'Error: --image is required', newState: state };
    }

    // 生成 Pod YAML
    const podYaml = `apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: ${name}
  name: ${name}
spec:
  containers:
  - image: ${image}
    name: ${name}
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: Always
status: {}`;

    // --dry-run 模式
    if (dryRun === 'client' || dryRun === 'server' || dryRun === true) {
        if (outputFormat === 'yaml') {
            return { output: podYaml, newState: state };
        }
        return { output: `pod/${name} created (dry run)`, newState: state };
    }

    // 检查是否已存在
    if (state.pods.find(p => p.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): pods "${name}" already exists`, newState: state };
    }

    const newPod: Pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
            name,
            namespace: 'default',
            labels: { run: name },
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        spec: {
            containers: [{ name, image: String(image) }],
            nodeName: state.nodes[1]?.metadata.name || 'node01'
        },
        status: {
            phase: 'Running',
            podIP: `10.244.1.${state.pods.length + 2}`,
            hostIP: '192.168.1.3'
        }
    };

    return {
        output: `pod/${name} created`,
        newState: { ...state, pods: [...state.pods, newPod] }
    };
}

/**
 * kubectl delete 命令处理
 */
function handleDelete(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const namespace = String(flags['n'] || flags['namespace'] || 'default');
    const nonFlagArgs = extractNonFlagArgs(parts);
    // nonFlagArgs: ['kubectl', 'delete', 'resourceType', 'name']
    const resource = nonFlagArgs[2];
    const name = nonFlagArgs[3];

    if (!resource) {
        return { output: 'Error: you must specify the type of resource to delete', newState: state };
    }
    if (!name && !flags['all']) {
        return { output: `Error: resource(s) were provided, but no name was specified`, newState: state };
    }

    let newState = { ...state };

    switch (resource) {
        case 'pod':
        case 'pods':
            if (flags['all']) {
                const podsInNs = newState.pods.filter(p => p.metadata.namespace === namespace);
                newState.pods = newState.pods.filter(p => p.metadata.namespace !== namespace);
                return { output: `deleted ${podsInNs.length} pods`, newState };
            }
            const podToDelete = newState.pods.find(p => p.metadata.name === name && p.metadata.namespace === namespace);
            if (!podToDelete) {
                return { output: `Error from server (NotFound): pods "${name}" not found`, newState: state };
            }
            
            // 删除 Pod
            newState.pods = newState.pods.filter(p => !(p.metadata.name === name && p.metadata.namespace === namespace));
            
            // 检查是否属于某个 Deployment，如果是则自动重建
            const podLabels = podToDelete.metadata.labels || {};
            for (const dep of newState.deployments.filter(d => d.metadata.namespace === namespace)) {
                const depLabels = dep.spec.selector.matchLabels;
                const belongsToDeployment = Object.entries(depLabels).every(([k, v]) => podLabels[k] === v);
                
                if (belongsToDeployment) {
                    // 计算当前剩余 Pod 数量
                    const currentPods = newState.pods.filter(p => {
                        const labels = p.metadata.labels || {};
                        return p.metadata.namespace === namespace && Object.entries(depLabels).every(([k, v]) => labels[k] === v);
                    });
                    
                    // 如果少于期望副本数，创建新 Pod
                    const deficit = dep.spec.replicas - currentPods.length;
                    if (deficit > 0) {
                        const newPod = createPodsForDeployment(dep, newState, 1)[0];
                        newState.pods = [...newState.pods, newPod];
                        return { 
                            output: `pod "${name}" deleted\n(Deployment ${dep.metadata.name} recreated pod ${newPod.metadata.name})`, 
                            newState 
                        };
                    }
                    break;
                }
            }
            
            return { output: `pod "${name}" deleted`, newState };

        case 'deployment':
        case 'deployments':
        case 'deploy':
            const depIndex = newState.deployments.findIndex(d => d.metadata.name === name && d.metadata.namespace === namespace);
            if (depIndex === -1) {
                return { output: `Error from server (NotFound): deployments.apps "${name}" not found`, newState: state };
            }
            const dep = newState.deployments[depIndex];
            // 删除 deployment 关联的 pods
            const depLabels = dep.spec.selector.matchLabels;
            newState.pods = newState.pods.filter(p => {
                if (p.metadata.namespace !== namespace) return true;
                const pLabels = p.metadata.labels || {};
                return !Object.entries(depLabels).every(([k, v]) => pLabels[k] === v);
            });
            newState.deployments = newState.deployments.filter(d => !(d.metadata.name === name && d.metadata.namespace === namespace));
            return { output: `deployment.apps "${name}" deleted`, newState };

        case 'service':
        case 'services':
        case 'svc':
            const svcIndex = newState.services.findIndex(s => s.metadata.name === name && s.metadata.namespace === namespace);
            if (svcIndex === -1) {
                return { output: `Error from server (NotFound): services "${name}" not found`, newState: state };
            }
            newState.services = newState.services.filter(s => !(s.metadata.name === name && s.metadata.namespace === namespace));
            return { output: `service "${name}" deleted`, newState };

        case 'configmap':
        case 'configmaps':
        case 'cm':
            const cmIndex = newState.configMaps.findIndex(c => c.metadata.name === name && c.metadata.namespace === namespace);
            if (cmIndex === -1) {
                return { output: `Error from server (NotFound): configmaps "${name}" not found`, newState: state };
            }
            newState.configMaps = newState.configMaps.filter(c => !(c.metadata.name === name && c.metadata.namespace === namespace));
            return { output: `configmap "${name}" deleted`, newState };

        case 'secret':
        case 'secrets':
            const secretIndex = newState.secrets.findIndex(s => s.metadata.name === name && s.metadata.namespace === namespace);
            if (secretIndex === -1) {
                return { output: `Error from server (NotFound): secrets "${name}" not found`, newState: state };
            }
            newState.secrets = newState.secrets.filter(s => !(s.metadata.name === name && s.metadata.namespace === namespace));
            return { output: `secret "${name}" deleted`, newState };

        case 'hpa':
        case 'horizontalpodautoscaler':
            const hpaIndex = newState.hpas.findIndex(h => h.metadata.name === name && h.metadata.namespace === namespace);
            if (hpaIndex === -1) {
                return { output: `Error from server (NotFound): horizontalpodautoscalers.autoscaling "${name}" not found`, newState: state };
            }
            newState.hpas = newState.hpas.filter(h => !(h.metadata.name === name && h.metadata.namespace === namespace));
            return { output: `horizontalpodautoscaler.autoscaling "${name}" deleted`, newState };

        case 'ingress':
        case 'ingresses':
        case 'ing':
            const ingIndex = newState.ingresses.findIndex(i => i.metadata.name === name && i.metadata.namespace === namespace);
            if (ingIndex === -1) {
                return { output: `Error from server (NotFound): ingresses.networking.k8s.io "${name}" not found`, newState: state };
            }
            newState.ingresses = newState.ingresses.filter(i => !(i.metadata.name === name && i.metadata.namespace === namespace));
            return { output: `ingress.networking.k8s.io "${name}" deleted`, newState };
            
        case 'pvc':
        case 'persistentvolumeclaim':
        case 'persistentvolumeclaims':
            const pvcIndex = newState.persistentVolumeClaims.findIndex(p => p.metadata.name === name && p.metadata.namespace === namespace);
            if (pvcIndex === -1) {
                return { output: `Error from server (NotFound): persistentvolumeclaims "${name}" not found`, newState: state };
            }
            newState.persistentVolumeClaims = newState.persistentVolumeClaims.filter(p => !(p.metadata.name === name && p.metadata.namespace === namespace));
            return { output: `persistentvolumeclaim "${name}" deleted`, newState };
            
        case 'networkpolicy':
        case 'networkpolicies':
        case 'netpol':
            const npIndex = newState.networkPolicies.findIndex(n => n.metadata.name === name && n.metadata.namespace === namespace);
            if (npIndex === -1) {
                return { output: `Error from server (NotFound): networkpolicies.networking.k8s.io "${name}" not found`, newState: state };
            }
            newState.networkPolicies = newState.networkPolicies.filter(n => !(n.metadata.name === name && n.metadata.namespace === namespace));
            return { output: `networkpolicy.networking.k8s.io "${name}" deleted`, newState };

        case 'storageclass':
        case 'storageclasses':
        case 'sc':
            const scIndex = newState.storageClasses.findIndex(s => s.metadata.name === name);
            if (scIndex === -1) {
                return { output: `Error from server (NotFound): storageclasses.storage.k8s.io "${name}" not found`, newState: state };
            }
            newState.storageClasses = newState.storageClasses.filter(s => s.metadata.name !== name);
            return { output: `storageclass.storage.k8s.io "${name}" deleted`, newState };

        case 'pv':
        case 'persistentvolume':
        case 'persistentvolumes':
            const pvIndex = newState.persistentVolumes.findIndex(p => p.metadata.name === name);
            if (pvIndex === -1) {
                return { output: `Error from server (NotFound): persistentvolumes "${name}" not found`, newState: state };
            }
            newState.persistentVolumes = newState.persistentVolumes.filter(p => p.metadata.name !== name);
            return { output: `persistentvolume "${name}" deleted`, newState };

        default:
            return { output: `error: the server doesn't have a resource type "${resource}"`, newState: state };
    }
}

/**
 * kubectl create 命令处理
 */
function handleCreate(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const nonFlagArgs = extractNonFlagArgs(parts);
    const subCommand = nonFlagArgs[2];
    
    // 处理 -f 参数（从文件创建）
    if (flags['f'] || flags['filename']) {
        // 返回特殊标记，让 store.ts 处理文件读取
        const filename = String(flags['f'] || flags['filename']);
        return { output: `__CREATE_FROM_FILE__:${filename}`, newState: state };
    }

    switch (subCommand) {
        case 'deployment':
        case 'deploy':
            return createDeployment(parts, state, flags);

        case 'service':
        case 'svc':
            return createService(parts, state, flags);

        case 'configmap':
        case 'cm':
            return createConfigMap(parts, state, flags);

        case 'secret':
            return createSecret(parts, state, flags);

        case 'namespace':
        case 'ns':
            return createNamespace(parts, state, flags);

        case 'serviceaccount':
        case 'sa':
            return createServiceAccount(parts, state, flags);

        case 'ingress':
        case 'ing':
            return createIngress(parts, state, flags);

        case 'role':
            return createRole(parts, state, flags);

        case 'rolebinding':
            return createRoleBinding(parts, state, flags);

        case 'clusterrole':
            return createClusterRole(parts, state, flags);

        case 'clusterrolebinding':
            return createClusterRoleBinding(parts, state, flags);

        default:
            return { 
                output: `Error: unknown resource type "${subCommand}"\nKnown resources: deployment, service, configmap, secret, namespace, serviceaccount, ingress, role, rolebinding, clusterrole, clusterrolebinding`, 
                newState: state 
            };
    }
}

/**
 * 创建 Deployment
 */
function createDeployment(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    const image = flags['image'];
    const replicas = parseInt(String(flags['replicas'] || '1'), 10);
    const dryRun = flags['dry-run'];
    const outputFormat = flags['o'] || flags['output'];

    if (!name) {
        return { output: 'Error: deployment name is required', newState: state };
    }
    if (!image) {
        return { output: 'Error: --image flag is required', newState: state };
    }

    const labels = { app: name };
    
    // 生成 YAML 内容
    const deploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  creationTimestamp: null
  labels:
    app: ${name}
  name: ${name}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${name}
  strategy: {}
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: ${name}
    spec:
      containers:
      - image: ${image}
        name: ${name}
        resources: {}
status: {}`;

    // --dry-run 模式：只输出，不创建资源
    if (dryRun === 'client' || dryRun === 'server' || dryRun === true) {
        if (outputFormat === 'yaml') {
            return { output: deploymentYaml, newState: state };
        } else if (outputFormat === 'json') {
            const jsonObj = {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                metadata: { creationTimestamp: null, labels: { app: name }, name },
                spec: {
                    replicas,
                    selector: { matchLabels: { app: name } },
                    strategy: {},
                    template: {
                        metadata: { creationTimestamp: null, labels: { app: name } },
                        spec: { containers: [{ image: String(image), name, resources: {} }] }
                    }
                },
                status: {}
            };
            return { output: JSON.stringify(jsonObj, null, 2), newState: state };
        }
        return { output: `deployment.apps/${name} created (dry run)`, newState: state };
    }

    // 检查是否已存在
    if (state.deployments.find(d => d.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): deployments.apps "${name}" already exists`, newState: state };
    }

    const deployment: Deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name,
            namespace: 'default',
            labels,
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        spec: {
            replicas,
            selector: { matchLabels: labels },
            template: {
                metadata: { labels },
                spec: {
                    containers: [{ name, image: String(image) }]
                }
            }
        },
        status: {
            replicas,
            readyReplicas: replicas,
            availableReplicas: replicas
        }
    };

    // 创建关联的 Pods
    const newPods = createPodsForDeployment(deployment, state, replicas);

    return {
        output: `deployment.apps/${name} created`,
        newState: {
            ...state,
            deployments: [...state.deployments, deployment],
            pods: [...state.pods, ...newPods]
        }
    };
}

/**
 * 为 Deployment 创建 Pods
 */
function createPodsForDeployment(deployment: Deployment, state: ClusterState, count: number): Pod[] {
    const pods: Pod[] = [];
    const availableNodes = state.nodes.filter(n => 
        !n.spec.unschedulable && 
        n.status.conditions.find(c => c.type === 'Ready')?.status === 'True'
    );

    for (let i = 0; i < count; i++) {
        const podName = `${deployment.metadata.name}-${generateShortUID()}`;
        const node = availableNodes[i % availableNodes.length] || availableNodes[0];
        
        pods.push({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: podName,
                namespace: deployment.metadata.namespace || 'default',
                labels: { ...deployment.spec.template.metadata.labels },
                uid: generateUID(),
                creationTimestamp: new Date().toISOString()
            },
            spec: {
                ...deployment.spec.template.spec,
                nodeName: node?.metadata.name || 'node01'
            },
            status: {
                phase: 'Running',
                podIP: `10.244.${Math.floor(Math.random() * 3) + 1}.${state.pods.length + i + 10}`,
                hostIP: node?.status.addresses[0]?.address || '192.168.1.3'
            }
        });
    }
    return pods;
}

/**
 * 创建 Service
 */
function createService(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const serviceType = parts[3]; // clusterip, nodeport, loadbalancer
    const name = flags['name'] || parts[4];
    
    if (!name) {
        return { output: 'Error: service name is required (use --name=<name>)', newState: state };
    }

    const port = parseInt(String(flags['port'] || flags['tcp'] || '80'), 10);
    const targetPort = parseInt(String(flags['target-port'] || port), 10);
    const selector = parseSelector(String(flags['selector'] || ''));

    if (state.services.find(s => s.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): services "${name}" already exists`, newState: state };
    }

    let type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' = 'ClusterIP';
    if (serviceType === 'nodeport') type = 'NodePort';
    else if (serviceType === 'loadbalancer') type = 'LoadBalancer';

    const service: Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
            name: String(name),
            namespace: 'default',
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        spec: {
            selector,
            ports: [{
                port,
                targetPort,
                nodePort: type === 'NodePort' ? 30000 + Math.floor(Math.random() * 2767) : undefined
            }],
            type,
            clusterIP: `10.96.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        }
    };

    return {
        output: `service/${name} created`,
        newState: { ...state, services: [...state.services, service] }
    };
}

/**
 * 创建 ConfigMap
 */
function createConfigMap(parts: string[], state: ClusterState, _flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: configmap name is required', newState: state };
    }
    if (state.configMaps.find(c => c.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): configmaps "${name}" already exists`, newState: state };
    }

    // 直接从 parts 解析所有 --from-literal 参数（支持多个）
    const data: Record<string, string> = {};
    for (const part of parts) {
        if (part.startsWith('--from-literal=')) {
            const literalValue = part.slice('--from-literal='.length);
            const eqIndex = literalValue.indexOf('=');
            if (eqIndex !== -1) {
                const k = literalValue.slice(0, eqIndex);
                const v = literalValue.slice(eqIndex + 1);
                if (k) data[k] = v;
            }
        }
    }

    const configMap: ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
            name,
            namespace: 'default',
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        data
    };

    return {
        output: `configmap/${name} created`,
        newState: { ...state, configMaps: [...state.configMaps, configMap] }
    };
}

/**
 * 创建 Secret
 */
function createSecret(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    // secretType: parts[3] could be generic, docker-registry, tls
    const name = parts[4] || String(flags['name'] || '');

    if (!name) {
        return { output: 'Error: secret name is required', newState: state };
    }
    if (state.secrets.find(s => s.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): secrets "${name}" already exists`, newState: state };
    }

    // 直接从 parts 解析所有 --from-literal 参数（支持多个）
    const data: Record<string, string> = {};
    for (const part of parts) {
        if (part.startsWith('--from-literal=')) {
            const literalValue = part.slice('--from-literal='.length);
            const eqIndex = literalValue.indexOf('=');
            if (eqIndex !== -1) {
                const k = literalValue.slice(0, eqIndex);
                const v = literalValue.slice(eqIndex + 1);
                if (k) data[k] = btoa(v); // base64 encode
            }
        }
    }

    const secret: Secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
            name,
            namespace: 'default',
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        type: 'Opaque',
        data
    };

    return {
        output: `secret/${name} created`,
        newState: { ...state, secrets: [...state.secrets, secret] }
    };
}

/**
 * 创建 Namespace
 */
function createNamespace(parts: string[], state: ClusterState, _flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: namespace name is required', newState: state };
    }
    if (state.namespaces.includes(name)) {
        return { output: `Error from server (AlreadyExists): namespaces "${name}" already exists`, newState: state };
    }

    return {
        output: `namespace/${name} created`,
        newState: { ...state, namespaces: [...state.namespaces, name] }
    };
}

/**
 * 创建 ServiceAccount
 */
function createServiceAccount(parts: string[], state: ClusterState, _flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: serviceaccount name is required', newState: state };
    }
    if (state.serviceAccounts.find(sa => sa.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): serviceaccounts "${name}" already exists`, newState: state };
    }

    return {
        output: `serviceaccount/${name} created`,
        newState: {
            ...state,
            serviceAccounts: [...state.serviceAccounts, {
                apiVersion: 'v1',
                kind: 'ServiceAccount',
                metadata: { name, namespace: 'default', uid: generateUID() }
            }]
        }
    };
}

/**
 * 创建 Ingress
 */
function createIngress(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: ingress name is required', newState: state };
    }

    const rule = String(flags['rule'] || '');
    // Parse rule format: host/path=service:port
    const [hostPath, servicePort] = rule.split('=');
    const [host, path] = (hostPath || '').split('/');
    const [serviceName, port] = (servicePort || '').split(':');

    return {
        output: `ingress.networking.k8s.io/${name} created`,
        newState: {
            ...state,
            ingresses: [...state.ingresses, {
                apiVersion: 'networking.k8s.io/v1',
                kind: 'Ingress',
                metadata: { name, namespace: 'default', uid: generateUID() },
                spec: {
                    rules: [{
                        host: host || undefined,
                        http: {
                            paths: [{
                                path: path ? `/${path}` : '/',
                                pathType: 'Prefix',
                                backend: {
                                    service: { name: serviceName || 'default', port: { number: parseInt(port) || 80 } }
                                }
                            }]
                        }
                    }]
                },
                status: { loadBalancer: {} }
            }]
        }
    };
}

/**
 * 创建 Role
 */
function createRole(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: role name is required', newState: state };
    }

    // 解析 --verb 和 --resource 参数
    const verbStr = String(flags['verb'] || 'get');
    const resourceStr = String(flags['resource'] || 'pods');
    const verbs = verbStr.split(',').map(v => v.trim());
    const resources = resourceStr.split(',').map(r => r.trim());

    if (state.roles.find(r => r.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): roles.rbac.authorization.k8s.io "${name}" already exists`, newState: state };
    }

    const role: Role = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'Role',
        metadata: { name, namespace: 'default', uid: generateUID() },
        rules: [{ apiGroups: [''], resources, verbs: verbs as Role['rules'][0]['verbs'] }]
    };

    return {
        output: `role.rbac.authorization.k8s.io/${name} created`,
        newState: { ...state, roles: [...state.roles, role] }
    };
}

/**
 * 创建 RoleBinding
 */
function createRoleBinding(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: rolebinding name is required', newState: state };
    }

    const roleName = String(flags['role'] || flags['clusterrole'] || '');

    if (!roleName) {
        return { output: 'Error: --role or --clusterrole is required', newState: state };
    }

    if (state.roleBindings.find(rb => rb.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): rolebindings.rbac.authorization.k8s.io "${name}" already exists`, newState: state };
    }

    const subjects: RoleBinding['subjects'] = [];
    if (flags['user']) {
        subjects.push({ kind: 'User' as const, name: String(flags['user']) });
    }
    if (flags['serviceaccount']) {
        const [ns, saName] = String(flags['serviceaccount']).includes(':') 
            ? String(flags['serviceaccount']).split(':')
            : ['default', String(flags['serviceaccount'])];
        subjects.push({ kind: 'ServiceAccount' as const, name: saName, namespace: ns });
    }

    const roleBinding: RoleBinding = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: { name, namespace: 'default', uid: generateUID() },
        roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: flags['clusterrole'] ? 'ClusterRole' : 'Role',
            name: roleName
        },
        subjects
    };

    return {
        output: `rolebinding.rbac.authorization.k8s.io/${name} created`,
        newState: { ...state, roleBindings: [...state.roleBindings, roleBinding] }
    };
}

/**
 * 创建 ClusterRole
 */
function createClusterRole(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: clusterrole name is required', newState: state };
    }

    const verbStr = String(flags['verb'] || 'get');
    const resourceStr = String(flags['resource'] || 'pods');
    const verbs = verbStr.split(',').map(v => v.trim());
    const resources = resourceStr.split(',').map(r => r.trim());

    if (state.clusterRoles.find(cr => cr.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): clusterroles.rbac.authorization.k8s.io "${name}" already exists`, newState: state };
    }

    const clusterRole: ClusterRole = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: { name, uid: generateUID() },
        rules: [{ apiGroups: [''], resources, verbs: verbs as ClusterRole['rules'][0]['verbs'] }]
    };

    return {
        output: `clusterrole.rbac.authorization.k8s.io/${name} created`,
        newState: { ...state, clusterRoles: [...state.clusterRoles, clusterRole] }
    };
}

/**
 * 创建 ClusterRoleBinding
 */
function createClusterRoleBinding(parts: string[], state: ClusterState, flags: Record<string, string | boolean>): CommandResult {
    const name = parts[3];
    if (!name) {
        return { output: 'Error: clusterrolebinding name is required', newState: state };
    }

    const roleName = String(flags['clusterrole'] || '');
    if (!roleName) {
        return { output: 'Error: --clusterrole is required', newState: state };
    }

    if (state.clusterRoleBindings.find(crb => crb.metadata.name === name)) {
        return { output: `Error from server (AlreadyExists): clusterrolebindings.rbac.authorization.k8s.io "${name}" already exists`, newState: state };
    }

    const crbSubjects: ClusterRoleBinding['subjects'] = [];
    if (flags['user']) {
        crbSubjects.push({ kind: 'User' as const, name: String(flags['user']) });
    }
    if (flags['serviceaccount']) {
        const [ns, saName] = String(flags['serviceaccount']).includes(':') 
            ? String(flags['serviceaccount']).split(':')
            : ['default', String(flags['serviceaccount'])];
        crbSubjects.push({ kind: 'ServiceAccount' as const, name: saName, namespace: ns });
    }

    const clusterRoleBinding: ClusterRoleBinding = {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: { name, uid: generateUID() },
        roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'ClusterRole',
            name: roleName
        },
        subjects: crbSubjects
    };

    return {
        output: `clusterrolebinding.rbac.authorization.k8s.io/${name} created`,
        newState: { ...state, clusterRoleBindings: [...state.clusterRoleBindings, clusterRoleBinding] }
    };
}

/**
 * kubectl logs 命令处理
 */
function handleLogs(parts: string[], state: ClusterState): { output: string; newState: ClusterState } {
    const podName = parts[2];
    const pod = state.pods.find(p => p.metadata.name === podName);

    if (!pod) {
        return { output: `Error from server (NotFound): pods "${podName}" not found`, newState: state };
    }

    const container = pod.spec.containers[0];
    const image = container?.image || 'unknown';
    const status = pod.status.phase;
    
    // 根据 Pod 状态和配置生成有意义的日志
    if (status === 'CrashLoopBackOff') {
        // 检查环境变量问题
        const emptyEnv = container?.env?.find(e => e.value === '' || e.value === undefined);
        if (emptyEnv) {
            return {
                output: `2024-12-03 03:30:15 INFO  Starting application...
2024-12-03 03:30:15 INFO  Loading configuration...
2024-12-03 03:30:15 ERROR Configuration error: Environment variable '${emptyEnv.name}' is required but empty
2024-12-03 03:30:15 ERROR Failed to connect to database: host cannot be empty
2024-12-03 03:30:15 FATAL Application failed to start
2024-12-03 03:30:15 FATAL Exit code: 1`,
                newState: state
            };
        }
        // 默认崩溃日志
        return {
            output: `2024-12-03 03:30:15 INFO  Starting application...
2024-12-03 03:30:15 ERROR Uncaught exception: Configuration validation failed
2024-12-03 03:30:15 ERROR Stack trace:
    at validateConfig (/app/config.js:42)
    at main (/app/index.js:15)
2024-12-03 03:30:15 FATAL Application crashed
2024-12-03 03:30:15 FATAL Exit code: 1`,
            newState: state
        };
    }
    
    if (status === 'ImagePullBackOff') {
        return {
            output: `Error from server: container "${container?.name || 'app'}" in pod "${podName}" is waiting to start: image can't be pulled`,
            newState: state
        };
    }
    
    if (status === 'Pending') {
        return {
            output: `Error from server: container "${container?.name || 'app'}" in pod "${podName}" is waiting to start: ContainerCreating`,
            newState: state
        };
    }
    
    if (status === 'Error' || status === 'Failed') {
        return {
            output: `2024-12-03 03:30:15 ERROR Application terminated with error
2024-12-03 03:30:15 FATAL Exit code: 1`,
            newState: state
        };
    }

    // 正常运行的日志
    const port = container?.ports?.[0]?.containerPort || 80;
    return { 
        output: `2024-12-03 03:30:00 INFO  Starting ${image}...
2024-12-03 03:30:01 INFO  Loading configuration...
2024-12-03 03:30:01 INFO  Connecting to database...
2024-12-03 03:30:02 INFO  Database connection established
2024-12-03 03:30:02 INFO  Server started successfully
2024-12-03 03:30:02 INFO  Listening on port ${port}
2024-12-03 03:30:05 INFO  Health check passed
2024-12-03 03:30:10 INFO  Ready to accept connections`, 
        newState: state 
    };
}

// ========== 格式化输出函数 ==========

function formatNodes(nodes: Node[], wide: boolean = false, showLabels: boolean = false): string {
    let header = wide
        ? 'NAME            STATUS   ROLES           AGE   VERSION   INTERNAL-IP    EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION   CONTAINER-RUNTIME'
        : 'NAME            STATUS   ROLES           AGE   VERSION';
    if (showLabels) header += '   LABELS';
    const rows = nodes.map(node => {
        const status = node.status.conditions.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady';
        const role = node.metadata.name.includes('control') ? 'control-plane' : '<none>';
        const ip = node.status.addresses[0]?.address || '<none>';
        const labels = Object.entries(node.metadata.labels || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(',') || '<none>';
        
        let row: string;
        if (wide) {
            row = `${node.metadata.name.padEnd(15)} ${status.padEnd(8)} ${role.padEnd(15)} 10d   v1.28.0   ${ip.padEnd(14)} <none>        Ubuntu 22.04 LTS     5.15.0-k8s       containerd://1.6.0`;
        } else {
            row = `${node.metadata.name.padEnd(15)} ${status.padEnd(8)} ${role.padEnd(15)} 10d   v1.28.0`;
        }
        if (showLabels) row += `   ${labels}`;
        return row;
    });
    return [header, ...rows].join('\n');
}

function formatNodeSingle(node: Node): string {
    const status = node.status.conditions.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady';
    return `NAME: ${node.metadata.name}\nSTATUS: ${status}\nROLES: ${node.metadata.name.includes('control') ? 'control-plane' : '<none>'}`;
}

function formatPods(pods: Pod[], allNamespaces: boolean = false, wide: boolean = false, showLabels: boolean = false, namespace: string = 'default'): string {
    if (pods.length === 0) {
        return `No resources found in ${namespace} namespace.`;
    }

    let header = allNamespaces
        ? 'NAMESPACE   NAME            READY   STATUS    RESTARTS   AGE'
        : 'NAME            READY   STATUS    RESTARTS   AGE';
    
    if (wide) {
        header += '   IP            NODE           NOMINATED NODE   READINESS GATES';
    }
    if (showLabels) {
        header += '   LABELS';
    }

    const rows = pods.map(pod => {
        // 计算实际容器数量
        const totalContainers = pod.spec.containers.length;
        const readyContainers = pod.status.containerStatuses?.filter(c => c.ready).length || (pod.status.phase === 'Running' ? totalContainers : 0);
        const ready = `${readyContainers}/${totalContainers}`;
        const restarts = pod.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0;
        let row = `${pod.metadata.name.padEnd(15)} ${ready.padEnd(7)} ${pod.status.phase.padEnd(9)} ${String(restarts).padEnd(10)} 10m`;
        if (wide) {
            const ip = pod.status.podIP || '<none>';
            const node = pod.spec.nodeName || '<none>';
            row += `   ${ip.padEnd(13)} ${node.padEnd(14)} <none>           <none>`;
        }
        if (showLabels) {
            const labels = pod.metadata.labels || {};
            const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',') || '<none>';
            row += `   ${labelStr}`;
        }
        return allNamespaces ? `${(pod.metadata.namespace || 'default').padEnd(11)} ${row}` : row;
    });

    return [header, ...rows].join('\n');
}

function formatPod(pod: Pod, showLabels: boolean = false): string {
    let output = `NAME: ${pod.metadata.name}\nSTATUS: ${pod.status.phase}\nIP: ${pod.status.podIP}\nNODE: ${pod.spec.nodeName || '<none>'}`;
    if (showLabels) {
        const labels = pod.metadata.labels || {};
        const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',') || '<none>';
        output += `\nLABELS: ${labelStr}`;
    }
    return output;
}

function formatDeployments(deployments: Deployment[], pods: Pod[], wide: boolean = false): string {
    if (deployments.length === 0) {
        return 'No resources found in default namespace.';
    }
    let header = 'NAME      READY   UP-TO-DATE   AVAILABLE   AGE';
    if (wide) {
        header += '   CONTAINERS   IMAGES         SELECTOR';
    }
    const rows = deployments.map(d => {
        // 动态计算实际 Pod 数量
        const labels = d.spec.selector.matchLabels;
        const matchingPods = pods.filter(p => {
            const podLabels = p.metadata.labels || {};
            return Object.entries(labels).every(([k, v]) => podLabels[k] === v);
        });
        const runningPods = matchingPods.filter(p => p.status.phase === 'Running').length;
        const totalPods = matchingPods.length;
        let row = `${d.metadata.name.padEnd(9)} ${runningPods}/${d.spec.replicas}     ${totalPods}            ${runningPods}           10m`;
        if (wide) {
            const container = d.spec.template.spec.containers[0];
            const selector = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
            row += `   ${container.name.padEnd(11)} ${container.image.padEnd(14)} ${selector}`;
        }
        return row;
    });
    return [header, ...rows].join('\n');
}

function formatServices(services: Service[], wide: boolean = false): string {
    if (services.length === 0) {
        return 'No resources found in default namespace.';
    }
    let header = 'NAME         TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE';
    if (wide) {
        header += '   SELECTOR';
    }
    const rows = services.map(s => {
        const ports = s.spec.ports.map(p => `${p.port}/${p.protocol || 'TCP'}`).join(',');
        let row = `${s.metadata.name.padEnd(12)} ${s.spec.type.padEnd(11)} ${(s.spec.clusterIP || '<none>').padEnd(12)} <none>        ${ports.padEnd(9)} 10m`;
        if (wide) {
            const selector = s.spec.selector ? Object.entries(s.spec.selector).map(([k, v]) => `${k}=${v}`).join(',') : '<none>';
            row += `   ${selector}`;
        }
        return row;
    });
    return [header, ...rows].join('\n');
}

function formatConfigMaps(configMaps: ConfigMap[]): string {
    if (configMaps.length === 0) {
        return 'No resources found in default namespace.';
    }
    const header = 'NAME         DATA   AGE';
    const rows = configMaps.map(cm => {
        const dataCount = cm.data ? Object.keys(cm.data).length : 0;
        return `${cm.metadata.name.padEnd(12)} ${String(dataCount).padEnd(6)} 10m`;
    });
    return [header, ...rows].join('\n');
}

function formatSecrets(secrets: Secret[]): string {
    if (secrets.length === 0) {
        return 'No resources found in default namespace.';
    }
    const header = 'NAME         TYPE                             DATA   AGE';
    const rows = secrets.map(s => {
        const dataCount = s.data ? Object.keys(s.data).length : 0;
        return `${s.metadata.name.padEnd(12)} ${(s.type || 'Opaque').padEnd(32)} ${String(dataCount).padEnd(6)} 10m`;
    });
    return [header, ...rows].join('\n');
}

function formatNamespaces(namespaces: string[]): string {
    const header = 'NAME              STATUS   AGE';
    const rows = namespaces.map(ns => `${ns.padEnd(17)} Active   10d`);
    return [header, ...rows].join('\n');
}

function formatHPAs(hpas: HorizontalPodAutoscaler[]): string {
    if (hpas.length === 0) {
        return 'No resources found in default namespace.';
    }
    const header = 'NAME      REFERENCE            TARGETS         MINPODS   MAXPODS   REPLICAS   AGE';
    const rows = hpas.map(h => {
        const ref = `${h.spec.scaleTargetRef.kind}/${h.spec.scaleTargetRef.name}`;
        // 从 metrics 中获取 CPU 目标
        const cpuMetric = h.spec.metrics?.find(m => m.type === 'Resource' && m.resource?.name === 'cpu');
        const target = cpuMetric?.resource?.target?.averageUtilization 
            ? `${cpuMetric.resource.target.averageUtilization}%` 
            : '<unknown>';
        return `${h.metadata.name.padEnd(9)} ${ref.padEnd(20)} ${target.padEnd(15)} ${String(h.spec.minReplicas).padEnd(9)} ${String(h.spec.maxReplicas).padEnd(9)} ${String(h.status?.currentReplicas || 0).padEnd(10)} 10m`;
    });
    return [header, ...rows].join('\n');
}

function describePod(pod: Pod): string {
    const labels = Object.entries(pod.metadata.labels || {})
        .map(([k, v]) => `${k}=${v}`)
        .join('\n              ') || '<none>';
    
    const status = pod.status.phase;
    const isHealthy = status === 'Running';
    const image = pod.spec.containers[0]?.image || 'unknown';
    
    const containers = pod.spec.containers.map(c => {
        const env = c.env?.map(e => `      ${e.name}:  ${e.value || '<set from configmap/secret>'}`).join('\n') || '      <none>';
        const mounts = c.volumeMounts?.map(m => `      ${m.mountPath} from ${m.name}`).join('\n') || '      <none>';
        
        // 资源限制和请求
        const limits = c.resources?.limits;
        const requests = c.resources?.requests;
        const limitsStr = limits ? `cpu: ${limits.cpu || '<none>'}, memory: ${limits.memory || '<none>'}` : '<none>';
        const requestsStr = requests ? `cpu: ${requests.cpu || '<none>'}, memory: ${requests.memory || '<none>'}` : '<none>';
        
        // 根据 Pod 状态决定容器状态
        let containerState = 'Running';
        let ready = 'True';
        let restartCount = 0;
        
        if (status === 'CrashLoopBackOff') {
            containerState = 'Waiting\n      Reason:        CrashLoopBackOff';
            ready = 'False';
            restartCount = 5;
        } else if (status === 'ImagePullBackOff') {
            containerState = 'Waiting\n      Reason:        ImagePullBackOff';
            ready = 'False';
        } else if (status === 'Pending') {
            containerState = 'Waiting\n      Reason:        ContainerCreating';
            ready = 'False';
        } else if (status === 'Error' || status === 'Failed') {
            containerState = 'Terminated\n      Reason:        Error\n      Exit Code:    1';
            ready = 'False';
        }
        
        return `  ${c.name}:
    Image:          ${c.image}
    Port:           ${c.ports?.[0]?.containerPort || '<none>'}
    State:          ${containerState}
    Ready:          ${ready}
    Restart Count:  ${restartCount}
    Limits:
      ${limitsStr}
    Requests:
      ${requestsStr}
    Environment:
${env}
    Mounts:
${mounts}`;
    }).join('\n');
    
    const volumes = pod.spec.volumes?.map(v => {
        if (v.configMap) return `  ${v.name}: ConfigMap (name="${v.configMap.name}")`;
        if (v.secret) return `  ${v.name}: Secret (name="${v.secret.secretName}")`;
        if (v.persistentVolumeClaim) return `  ${v.name}: PersistentVolumeClaim (claimName="${v.persistentVolumeClaim.claimName}")`;
        if (v.emptyDir) return `  ${v.name}: EmptyDir`;
        return `  ${v.name}: <unknown>`;
    }).join('\n') || '  <none>';
    
    // 根据状态生成 Events
    let events = '<none>';
    const timeAgo = (mins: number) => `${mins}m`;
    
    if (status === 'CrashLoopBackOff') {
        events = `
  Type     Reason     Age                From               Message
  ----     ------     ----               ----               -------
  Normal   Scheduled  ${timeAgo(10)}              default-scheduler  Successfully assigned default/${pod.metadata.name} to ${pod.spec.nodeName || 'node01'}
  Normal   Pulling    ${timeAgo(10)}              kubelet            Pulling image "${image}"
  Normal   Pulled     ${timeAgo(9)}               kubelet            Successfully pulled image "${image}"
  Normal   Created    ${timeAgo(9)} (x5 over ${timeAgo(10)})  kubelet            Created container ${pod.spec.containers[0]?.name || 'app'}
  Normal   Started    ${timeAgo(9)} (x5 over ${timeAgo(10)})  kubelet            Started container ${pod.spec.containers[0]?.name || 'app'}
  Warning  BackOff    ${timeAgo(1)} (x20 over ${timeAgo(8)})  kubelet            Back-off restarting failed container`;
    } else if (status === 'ImagePullBackOff') {
        events = `
  Type     Reason     Age               From               Message
  ----     ------     ----              ----               -------
  Normal   Scheduled  ${timeAgo(5)}              default-scheduler  Successfully assigned default/${pod.metadata.name} to ${pod.spec.nodeName || 'node01'}
  Normal   Pulling    ${timeAgo(5)}              kubelet            Pulling image "${image}"
  Warning  Failed     ${timeAgo(4)}              kubelet            Failed to pull image "${image}": rpc error: code = NotFound desc = failed to pull and unpack image
  Warning  Failed     ${timeAgo(4)}              kubelet            Error: ErrImagePull
  Normal   BackOff    ${timeAgo(2)} (x6 over ${timeAgo(4)})  kubelet            Back-off pulling image "${image}"
  Warning  Failed     ${timeAgo(2)} (x6 over ${timeAgo(4)})  kubelet            Error: ImagePullBackOff`;
    } else if (status === 'Pending' && !pod.spec.nodeName) {
        // 获取调度失败的具体原因
        const scheduledCondition = pod.status.conditions?.find(c => c.type === 'PodScheduled');
        const failMessage = scheduledCondition?.message || '0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 node(s) didn\'t match Pod\'s node affinity/selector.';
        events = `
  Type     Reason            Age    From               Message
  ----     ------            ----   ----               -------
  Warning  FailedScheduling  ${timeAgo(30)}   default-scheduler  ${failMessage}`;
    } else if (status === 'Pending') {
        events = `
  Type     Reason     Age    From               Message
  ----     ------     ----   ----               -------
  Normal   Scheduled  ${timeAgo(1)}   default-scheduler  Successfully assigned default/${pod.metadata.name} to ${pod.spec.nodeName || 'node01'}
  Normal   Pulling    ${timeAgo(1)}   kubelet            Pulling image "${image}"`;
    } else if (isHealthy) {
        events = `
  Type    Reason     Age    From               Message
  ----    ------     ----   ----               -------
  Normal  Scheduled  ${timeAgo(10)}   default-scheduler  Successfully assigned default/${pod.metadata.name} to ${pod.spec.nodeName || 'node01'}
  Normal  Pulling    ${timeAgo(10)}   kubelet            Pulling image "${image}"
  Normal  Pulled     ${timeAgo(9)}    kubelet            Successfully pulled image "${image}"
  Normal  Created    ${timeAgo(9)}    kubelet            Created container ${pod.spec.containers[0]?.name || 'app'}
  Normal  Started    ${timeAgo(9)}    kubelet            Started container ${pod.spec.containers[0]?.name || 'app'}`;
    }
    
    return `Name:             ${pod.metadata.name}
Namespace:        ${pod.metadata.namespace || 'default'}
Priority:         0
Service Account:  default
Node:             ${pod.spec.nodeName || '<none>'}
Start Time:       ${pod.metadata.creationTimestamp || '<unknown>'}
Labels:           ${labels}
Status:           ${status}
IP:               ${pod.status.podIP || '<none>'}
Containers:
${containers}
Volumes:
${volumes}
Events:${events}`;
}

function describeNode(node: Node): string {
    const ready = node.status.conditions.find(c => c.type === 'Ready');
    return `Name:               ${node.metadata.name}
Roles:              ${node.metadata.name.includes('control') ? 'control-plane' : '<none>'}
Conditions:
  Ready             ${ready?.status || 'Unknown'}
Capacity:
  cpu:              ${node.status.capacity.cpu}
  memory:           ${node.status.capacity.memory}
Allocatable:
  cpu:              ${node.status.allocatable.cpu}
  memory:           ${node.status.allocatable.memory}`;
}

function describeDeployment(dep: Deployment, state: ClusterState): string {
    const labels = dep.spec.selector.matchLabels;
    const pods = state.pods.filter(p => {
        const podLabels = p.metadata.labels || {};
        return Object.entries(labels).every(([k, v]) => podLabels[k] === v);
    });
    const readyPods = pods.filter(p => p.status.phase === 'Running').length;
    
    return `Name:                   ${dep.metadata.name}
Namespace:              ${dep.metadata.namespace || 'default'}
CreationTimestamp:      ${dep.metadata.creationTimestamp || '<unknown>'}
Labels:                 ${Object.entries(dep.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Selector:               ${Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',')}
Replicas:               ${dep.spec.replicas} desired | ${dep.status?.replicas || 0} updated | ${dep.status?.replicas || 0} total | ${readyPods} available | 0 unavailable
StrategyType:           RollingUpdate
Pod Template:
  Labels:  ${Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(', ')}
  Containers:
   ${dep.spec.template.spec.containers[0]?.name || 'app'}:
    Image:        ${dep.spec.template.spec.containers[0]?.image || '<none>'}
    Port:         <none>
    Host Port:    <none>
    Environment:  <none>
    Mounts:       <none>
Conditions:
  Available      True    MinimumReplicasAvailable
  Progressing    True    NewReplicaSetAvailable
Events:          <none>`;
}

function describeService(svc: Service, state: ClusterState): string {
    const selector = svc.spec.selector || {};
    const endpoints = state.pods
        .filter(p => {
            const podLabels = p.metadata.labels || {};
            return Object.entries(selector).every(([k, v]) => podLabels[k] === v);
        })
        .map(p => p.status.podIP)
        .filter(Boolean)
        .join(', ');
    
    const ports = svc.spec.ports?.map(p => `${p.port}/${p.protocol || 'TCP'}`).join(', ') || '<none>';
    const targetPorts = svc.spec.ports?.map(p => `${p.targetPort}/${p.protocol || 'TCP'}`).join(', ') || '<none>';
    
    return `Name:              ${svc.metadata.name}
Namespace:         ${svc.metadata.namespace || 'default'}
Labels:            ${Object.entries(svc.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Selector:          ${Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(',') || '<none>'}
Type:              ${svc.spec.type || 'ClusterIP'}
IP Family Policy:  SingleStack
IP Families:       IPv4
IP:                ${svc.spec.clusterIP || '<none>'}
IPs:               ${svc.spec.clusterIP || '<none>'}
Port:              <unset>  ${ports}
TargetPort:        ${targetPorts}
Endpoints:         ${endpoints || '<none>'}
Session Affinity:  None
Events:            <none>`;
}

function describeConfigMap(cm: ConfigMap): string {
    const dataEntries = Object.entries(cm.data || {})
        .map(([k, v]) => `${k}:\n----\n${v}`)
        .join('\n\n');
    
    return `Name:         ${cm.metadata.name}
Namespace:    ${cm.metadata.namespace || 'default'}
Labels:       ${Object.entries(cm.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:  <none>

Data
====
${dataEntries || '<empty>'}

BinaryData
====

Events:  <none>`;
}

function describeSecret(secret: Secret): string {
    const dataKeys = Object.entries(secret.data || {})
        .map(([k, v]) => `${k}:  ${v.length} bytes`)
        .join('\n');
    
    return `Name:         ${secret.metadata.name}
Namespace:    ${secret.metadata.namespace || 'default'}
Labels:       ${Object.entries(secret.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:  <none>

Type:  ${secret.type || 'Opaque'}

Data
====
${dataKeys || '<empty>'}`;
}

function describePV(pv: PersistentVolume): string {
    return `Name:            ${pv.metadata.name}
Labels:          ${Object.entries(pv.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:     <none>
Finalizers:      [kubernetes.io/pv-protection]
StorageClass:    ${pv.spec.storageClassName || '<none>'}
Status:          ${pv.status?.phase || 'Available'}
Claim:           <none>
Reclaim Policy:  ${pv.spec.persistentVolumeReclaimPolicy || 'Retain'}
Access Modes:    ${pv.spec.accessModes?.join(', ') || '<none>'}
VolumeMode:      Filesystem
Capacity:        ${pv.spec.capacity?.storage || '<none>'}
Node Affinity:   <none>
Message:         
Source:
    Type:          HostPath (bare host directory volume)
    Path:          ${pv.spec.hostPath?.path || '<none>'}
    HostPathType:  
Events:            <none>`;
}

function describePVC(pvc: PersistentVolumeClaim): string {
    return `Name:          ${pvc.metadata.name}
Namespace:     ${pvc.metadata.namespace || 'default'}
StorageClass:  ${pvc.spec.storageClassName || '<none>'}
Status:        ${pvc.status?.phase || 'Pending'}
Volume:        ${pvc.spec.volumeName || '<none>'}
Labels:        ${Object.entries(pvc.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:   <none>
Finalizers:    [kubernetes.io/pvc-protection]
Capacity:      ${pvc.status?.capacity?.storage || '<none>'}
Access Modes:  ${pvc.spec.accessModes?.join(', ') || '<none>'}
VolumeMode:    Filesystem
Used By:       <none>
Events:        <none>`;
}

function describeIngress(ing: Ingress): string {
    const rules = ing.spec.rules?.map(r => {
        const paths = r.http?.paths?.map(p => 
            `  ${r.host || '*'}  ${p.path || '/'}  ${p.backend?.service?.name || 'unknown'}:${p.backend?.service?.port?.number || 80}`
        ).join('\n') || '';
        return paths;
    }).join('\n') || '<none>';
    
    return `Name:             ${ing.metadata.name}
Namespace:        ${ing.metadata.namespace || 'default'}
Address:          
Ingress Class:    ${ing.spec.ingressClassName || '<none>'}
Default backend:  <default>
Rules:
  Host        Path  Backends
  ----        ----  --------
${rules}
Annotations:      <none>
Events:           <none>`;
}

function describeHPA(hpa: HorizontalPodAutoscaler): string {
    const targetRef = hpa.spec.scaleTargetRef;
    const metrics = hpa.spec.metrics?.map(m => {
        if (m.type === 'Resource' && m.resource) {
            return `${m.resource.name}: ${m.resource.target?.averageUtilization || 0}%`;
        }
        return 'unknown';
    }).join(', ') || '<none>';
    
    return `Name:                                  ${hpa.metadata.name}
Namespace:                             ${hpa.metadata.namespace || 'default'}
Labels:                                <none>
Annotations:                           <none>
CreationTimestamp:                     ${hpa.metadata.creationTimestamp || 'unknown'}
Reference:                             ${targetRef?.kind || 'Deployment'}/${targetRef?.name || 'unknown'}
Metrics:                               ${metrics}
Min replicas:                          ${hpa.spec.minReplicas || 1}
Max replicas:                          ${hpa.spec.maxReplicas || 10}
Behavior:                              ${(hpa.spec as any).behavior ? 'configured' : 'default'}
Current replicas:                      ${hpa.status?.currentReplicas || 0}
Desired replicas:                      ${hpa.status?.desiredReplicas || 0}
Events:                                <none>`;
}

function describeStorageClass(sc: StorageClass): string {
    return `Name:            ${sc.metadata.name}
IsDefaultClass:  ${sc.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true' ? 'Yes' : 'No'}
Annotations:     <none>
Provisioner:     ${sc.provisioner}
ReclaimPolicy:   ${sc.reclaimPolicy || 'Delete'}
VolumeBindingMode: ${sc.volumeBindingMode || 'Immediate'}
AllowVolumeExpansion: ${sc.allowVolumeExpansion ? 'True' : 'False'}
Events:          <none>`;
}

function describeNetworkPolicy(np: NetworkPolicy): string {
    const podSelector = np.spec.podSelector?.matchLabels 
        ? Object.entries(np.spec.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ')
        : '<none>';
    
    return `Name:         ${np.metadata.name}
Namespace:    ${np.metadata.namespace || 'default'}
Created on:   ${np.metadata.creationTimestamp || 'unknown'}
Labels:       <none>
Annotations:  <none>
Spec:
  PodSelector:     ${podSelector}
  PolicyTypes:     ${np.spec.policyTypes?.join(', ') || 'Ingress'}
  Ingress Rules:   ${np.spec.ingress?.length || 0} rule(s)
  Egress Rules:    ${np.spec.egress?.length || 0} rule(s)`;
}

function describePriorityClass(pc: any): string {
    return `Name:              ${pc.metadata.name}
Value:             ${pc.value}
GlobalDefault:     ${pc.globalDefault ? 'Yes' : 'No'}
PreemptionPolicy:  ${pc.preemptionPolicy || 'PreemptLowerPriority'}
Description:       ${pc.description || '<none>'}
Annotations:       <none>
Events:            <none>`;
}

function describeGateway(gw: Gateway): string {
    const listeners = gw.spec.listeners?.map(l => 
        `  ${l.name}  ${l.protocol}  ${l.port}  ${l.hostname || '*'}`
    ).join('\n') || '<none>';
    
    return `Name:             ${gw.metadata.name}
Namespace:        ${gw.metadata.namespace || 'default'}
Labels:           <none>
Annotations:      <none>
Gateway Class:    ${gw.spec.gatewayClassName}
Listeners:
  Name      Protocol  Port  Hostname
  ----      --------  ----  --------
${listeners}
Status:           ${gw.status?.conditions?.[0]?.status || 'Unknown'}
Events:           <none>`;
}

function describeHTTPRoute(hr: HTTPRoute): string {
    const parentRefs = hr.spec.parentRefs?.map(p => `${p.name}`).join(', ') || '<none>';
    const hostnames = hr.spec.hostnames?.join(', ') || '*';
    
    return `Name:             ${hr.metadata.name}
Namespace:        ${hr.metadata.namespace || 'default'}
Labels:           <none>
Annotations:      <none>
Parent Refs:      ${parentRefs}
Hostnames:        ${hostnames}
Rules:            ${hr.spec.rules?.length || 0} rule(s)
Events:           <none>`;
}

function describeServiceAccount(sa: ServiceAccount): string {
    return `Name:                ${sa.metadata.name}
Namespace:           ${sa.metadata.namespace || 'default'}
Labels:              <none>
Annotations:         <none>
Image pull secrets:  <none>
Mountable secrets:   <none>
Tokens:              <none>
Events:              <none>`;
}

// ========== 工具函数 ==========

function parseFlags(parts: string[]): Record<string, string | boolean> {
    const flags: Record<string, string | boolean> = {};
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('--')) {
            // 使用 indexOf 更可靠地处理 --key=value 格式
            const eqIndex = part.indexOf('=');
            if (eqIndex !== -1) {
                const key = part.slice(2, eqIndex);
                const value = part.slice(eqIndex + 1);
                flags[key] = value;
            } else {
                // --flag 没有值的情况，检查下一个参数
                const key = part.slice(2);
                const nextPart = parts[i + 1];
                if (nextPart && !nextPart.startsWith('-')) {
                    flags[key] = nextPart;
                    i++;
                } else {
                    flags[key] = true;
                }
            }
        } else if (part.startsWith('-') && part.length > 1) {
            const key = part.slice(1);
            // 检查下一个参数是否是值（不是另一个 flag）
            const nextPart = parts[i + 1];
            if (nextPart && !nextPart.startsWith('-')) {
                flags[key] = nextPart;
                i++; // 跳过下一个参数
            } else {
                flags[key] = true;
            }
        }
    }
    return flags;
}

/**
 * 从命令行参数中提取非标志参数（排除标志及其值）
 */
function extractNonFlagArgs(parts: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('--')) {
            // --key=value 格式，跳过
            if (!part.includes('=')) {
                // --flag value 格式，跳过下一个参数
                const nextPart = parts[i + 1];
                if (nextPart && !nextPart.startsWith('-')) {
                    i++;
                }
            }
        } else if (part.startsWith('-') && part.length > 1) {
            // -f value 格式，跳过下一个参数
            const nextPart = parts[i + 1];
            if (nextPart && !nextPart.startsWith('-')) {
                i++;
            }
        } else {
            // 非标志参数
            result.push(part);
        }
    }
    return result;
}

function generateUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateShortUID(): string {
    return Math.random().toString(36).substring(2, 12);
}

function parseSelector(selectorStr: string): Record<string, string> {
    const selector: Record<string, string> = {};
    if (!selectorStr) return selector;
    
    selectorStr.split(',').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) selector[key.trim()] = value.trim();
    });
    return selector;
}

/**
 * 根据资源类型和名称获取资源对象
 * 返回 null 表示找不到，undefined 表示未指定名称
 */
function getResourceByName(resourceType: string, name: string | undefined, state: ClusterState, namespace?: string): object | null | undefined {
    if (!name) return undefined;
    
    // 检查是否是 namespace 作用域的资源
    const isNamespaced = !['node', 'nodes', 'pv', 'persistentvolume', 'persistentvolumes', 
                          'storageclass', 'storageclasses', 'sc', 'clusterrole', 'clusterroles',
                          'clusterrolebinding', 'clusterrolebindings', 'namespace', 'namespaces', 'ns'].includes(resourceType);
    const ns = isNamespaced ? (namespace || 'default') : undefined;
    
    switch (resourceType) {
        case 'pod':
        case 'pods':
            return state.pods.find(p => p.metadata.name === name && (!ns || p.metadata.namespace === ns)) || null;
        case 'deployment':
        case 'deployments':
        case 'deploy':
            return state.deployments.find(d => d.metadata.name === name && (!ns || d.metadata.namespace === ns)) || null;
        case 'service':
        case 'services':
        case 'svc':
            return state.services.find(s => s.metadata.name === name && (!ns || s.metadata.namespace === ns)) || null;
        case 'configmap':
        case 'configmaps':
        case 'cm':
            return state.configMaps.find(c => c.metadata.name === name && (!ns || c.metadata.namespace === ns)) || null;
        case 'secret':
        case 'secrets':
            return state.secrets.find(s => s.metadata.name === name && (!ns || s.metadata.namespace === ns)) || null;
        case 'node':
        case 'nodes':
            return state.nodes.find(n => n.metadata.name === name) || null;
        case 'pv':
        case 'persistentvolume':
        case 'persistentvolumes':
            return state.persistentVolumes.find(p => p.metadata.name === name) || null;
        case 'pvc':
        case 'persistentvolumeclaim':
        case 'persistentvolumeclaims':
            return state.persistentVolumeClaims.find(p => p.metadata.name === name && (!ns || p.metadata.namespace === ns)) || null;
        case 'hpa':
        case 'horizontalpodautoscaler':
        case 'horizontalpodautoscalers':
            return state.hpas.find(h => h.metadata.name === name && (!ns || h.metadata.namespace === ns)) || null;
        case 'ingress':
        case 'ingresses':
        case 'ing':
            return state.ingresses.find(i => i.metadata.name === name && (!ns || i.metadata.namespace === ns)) || null;
        case 'networkpolicy':
        case 'networkpolicies':
        case 'netpol':
            return state.networkPolicies.find(np => np.metadata.name === name && (!ns || np.metadata.namespace === ns)) || null;
        default:
            return null;
    }
}

/**
 * 将对象格式化为 YAML 字符串
 */
function formatAsYaml(obj: object): string {
    const result: string[] = [];
    
    function escapeStr(s: string): string {
        if (s === '' || s.includes(':') || s.includes('#') || s.includes("'") || /^\d+$/.test(s) || s.includes('\n')) {
            return `"${s.replace(/"/g, '\\"')}"`;
        }
        return s;
    }
    
    function stringify(val: unknown): string {
        if (val === null || val === undefined) return 'null';
        if (typeof val === 'string') return escapeStr(val);
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        return String(val);
    }
    
    function writeObject(obj: Record<string, unknown>, indent: number): void {
        const pad = '  '.repeat(indent);
        for (const [key, val] of Object.entries(obj)) {
            if (val === undefined) continue;
            
            if (val === null || typeof val !== 'object') {
                result.push(`${pad}${key}: ${stringify(val)}`);
            } else if (Array.isArray(val)) {
                if (val.length === 0) {
                    result.push(`${pad}${key}: []`);
                } else {
                    result.push(`${pad}${key}:`);
                    writeArray(val, indent);
                }
            } else {
                result.push(`${pad}${key}:`);
                writeObject(val as Record<string, unknown>, indent + 1);
            }
        }
    }
    
    function writeArray(arr: unknown[], indent: number): void {
        const pad = '  '.repeat(indent);
        for (const item of arr) {
            if (item === null || typeof item !== 'object') {
                result.push(`${pad}- ${stringify(item)}`);
            } else if (Array.isArray(item)) {
                // 数组中的数组（少见）
                result.push(`${pad}-`);
                writeArray(item, indent + 1);
            } else {
                // 数组中的对象
                const entries = Object.entries(item as Record<string, unknown>);
                entries.forEach(([key, val], idx) => {
                    const lineStart = idx === 0 ? `${pad}- ` : `${pad}  `;
                    
                    if (val === null || typeof val !== 'object') {
                        result.push(`${lineStart}${key}: ${stringify(val)}`);
                    } else if (Array.isArray(val)) {
                        if (val.length === 0) {
                            result.push(`${lineStart}${key}: []`);
                        } else {
                            result.push(`${lineStart}${key}:`);
                            writeArray(val, indent + 1);
                        }
                    } else {
                        result.push(`${lineStart}${key}:`);
                        writeObject(val as Record<string, unknown>, indent + 2);
                    }
                });
            }
        }
    }
    
    writeObject(obj as Record<string, unknown>, 0);
    return result.join('\n');
}

// ========== 新增命令处理函数 ==========

/**
 * kubectl scale 命令处理
 */
function handleScale(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const namespace = String(flags['n'] || flags['namespace'] || 'default');
    const nonFlagArgs = extractNonFlagArgs(parts);
    // nonFlagArgs: ['kubectl', 'scale', 'resourceType', 'resourceName']
    const resourceType = nonFlagArgs[2];
    const resourceName = nonFlagArgs[3];
    const replicas = parseInt(String(flags['replicas']), 10);

    if (!resourceName) {
        return { output: 'Error: resource name is required', newState: state };
    }
    if (isNaN(replicas)) {
        return { output: 'Error: --replicas is required', newState: state };
    }

    switch (resourceType) {
        case 'deployment':
        case 'deployments':
        case 'deploy':
            const depIndex = state.deployments.findIndex(d => d.metadata.name === resourceName && d.metadata.namespace === namespace);
            if (depIndex === -1) {
                return { output: `Error from server (NotFound): deployments.apps "${resourceName}" not found`, newState: state };
            }

            const deployment = state.deployments[depIndex];
            const currentReplicas = deployment.spec.replicas;
            const labels = deployment.spec.selector.matchLabels;

            // 更新 deployment
            const updatedDeployment: Deployment = {
                ...deployment,
                spec: { ...deployment.spec, replicas },
                status: { ...deployment.status, replicas, readyReplicas: replicas, availableReplicas: replicas }
            };

            // 调整 pods 数量（只影响同一 namespace 的 pods）
            let newPods = state.pods.filter(p => {
                if (p.metadata.namespace !== namespace) return true;
                const podLabels = p.metadata.labels || {};
                return !Object.entries(labels).every(([k, v]) => podLabels[k] === v);
            });

            // 获取现有的 deployment pods（同一 namespace）
            const existingDepPods = state.pods.filter(p => {
                if (p.metadata.namespace !== namespace) return false;
                const podLabels = p.metadata.labels || {};
                return Object.entries(labels).every(([k, v]) => podLabels[k] === v);
            });

            if (replicas > currentReplicas) {
                // 扩容：添加新 pods
                const additionalPods = createPodsForDeployment(updatedDeployment, state, replicas - currentReplicas);
                newPods = [...newPods, ...existingDepPods, ...additionalPods];
            } else {
                // 缩容：移除多余的 pods
                newPods = [...newPods, ...existingDepPods.slice(0, replicas)];
            }

            const newDeployments = [...state.deployments];
            newDeployments[depIndex] = updatedDeployment;

            return {
                output: `deployment.apps/${resourceName} scaled`,
                newState: { ...state, deployments: newDeployments, pods: newPods }
            };

        default:
            return { output: `Error: cannot scale resource type "${resourceType}"`, newState: state };
    }
}

/**
 * kubectl expose 命令处理
 * 支持: kubectl expose deployment <name> --port=80 --type=NodePort --name=<svc-name> -n <namespace>
 */
function handleExpose(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const namespace = String(flags['n'] || flags['namespace'] || 'default');
    
    // 使用 extractNonFlagArgs 正确提取非 flag 参数
    const nonFlagArgs = extractNonFlagArgs(parts);
    // nonFlagArgs[0] = 'kubectl', nonFlagArgs[1] = 'expose', nonFlagArgs[2] = resourceType, nonFlagArgs[3] = resourceName
    const resourceType = nonFlagArgs[2];
    const resourceName = nonFlagArgs[3];

    if (!resourceType) {
        return { output: 'Error: you must specify the type of resource to expose', newState: state };
    }
    
    if (!resourceName) {
        return { output: 'Error: resource name is required', newState: state };
    }

    const serviceName = String(flags['name'] || resourceName);
    const port = parseInt(String(flags['port'] || '80'), 10);
    const targetPort = parseInt(String(flags['target-port'] || port), 10);
    const serviceType = String(flags['type'] || 'ClusterIP') as 'ClusterIP' | 'NodePort' | 'LoadBalancer';

    // 检查 Service 是否已存在（在同一 namespace 下）
    if (state.services.find(s => s.metadata.name === serviceName && s.metadata.namespace === namespace)) {
        return { output: `Error from server (AlreadyExists): services "${serviceName}" already exists`, newState: state };
    }

    let selector: Record<string, string> = {};

    switch (resourceType) {
        case 'deployment':
        case 'deployments':
        case 'deploy':
            // 按 namespace 过滤查找 Deployment
            const dep = state.deployments.find(d => 
                d.metadata.name === resourceName && 
                d.metadata.namespace === namespace
            );
            if (!dep) {
                return { output: `Error from server (NotFound): deployments.apps "${resourceName}" not found in namespace "${namespace}"`, newState: state };
            }
            selector = { ...dep.spec.selector.matchLabels };
            break;

        case 'pod':
        case 'pods':
            // 按 namespace 过滤查找 Pod
            const pod = state.pods.find(p => 
                p.metadata.name === resourceName && 
                p.metadata.namespace === namespace
            );
            if (!pod) {
                return { output: `Error from server (NotFound): pods "${resourceName}" not found in namespace "${namespace}"`, newState: state };
            }
            selector = pod.metadata.labels ? { ...pod.metadata.labels } : {};
            break;

        default:
            return { output: `Error: cannot expose resource type "${resourceType}"`, newState: state };
    }

    const service: Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
            name: serviceName,
            namespace: namespace, // 使用解析出的 namespace
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        spec: {
            selector,
            ports: [{
                port,
                targetPort,
                protocol: 'TCP',
                nodePort: serviceType === 'NodePort' ? 30000 + Math.floor(Math.random() * 2767) : undefined
            }],
            type: serviceType,
            clusterIP: `10.96.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        }
    };

    return {
        output: `service/${serviceName} exposed`,
        newState: { ...state, services: [...state.services, service] }
    };
}

/**
 * kubectl edit 命令处理
 * 支持 edit deploy/deployment/hpa 触发交互式编辑
 */
function handleEdit(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const namespace = String(flags['n'] || flags['namespace'] || 'default');
    
    // 找到 edit 后面的资源类型和名称
    let resourceType = '';
    let resourceName = '';
    let foundEdit = false;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'edit') {
            foundEdit = true;
            continue;
        }
        if (foundEdit && !parts[i].startsWith('-')) {
            if (!resourceType) {
                resourceType = parts[i];
            } else if (!resourceName) {
                resourceName = parts[i];
                break;
            }
        }
        // 跳过 flag 值
        if (parts[i] === '-n' || parts[i] === '--namespace') {
            i++;
        }
    }
    
    if (!resourceType || !resourceName) {
        return { output: 'Error: usage: kubectl edit RESOURCE NAME', newState: state };
    }
    
    // 处理 deploy/deployment
    if (resourceType === 'deploy' || resourceType === 'deployment' || resourceType === 'deployments') {
        const dep = state.deployments.find(d => d.metadata.name === resourceName && d.metadata.namespace === namespace);
        if (!dep) {
            return { output: `Error from server (NotFound): deployments.apps "${resourceName}" not found in namespace "${namespace}"`, newState: state };
        }
        
        // 返回特殊标记，让终端打开 vim 编辑器
        return {
            output: `__EDIT_RESOURCE__:deployment:${namespace}:${resourceName}`,
            newState: state
        };
    }
    
    // 处理 hpa/horizontalpodautoscaler
    if (resourceType === 'hpa' || resourceType === 'horizontalpodautoscaler' || resourceType === 'horizontalpodautoscalers') {
        const hpa = state.hpas.find(h => h.metadata.name === resourceName && h.metadata.namespace === namespace);
        if (!hpa) {
            return { output: `Error from server (NotFound): horizontalpodautoscalers.autoscaling "${resourceName}" not found in namespace "${namespace}"`, newState: state };
        }
        
        // 返回特殊标记，让终端打开 vim 编辑器
        return {
            output: `__EDIT_RESOURCE__:hpa:${namespace}:${resourceName}`,
            newState: state
        };
    }
    
    // 处理 configmap/cm
    if (resourceType === 'configmap' || resourceType === 'configmaps' || resourceType === 'cm') {
        const cm = state.configMaps.find(c => c.metadata.name === resourceName && c.metadata.namespace === namespace);
        if (!cm) {
            return { output: `Error from server (NotFound): configmaps "${resourceName}" not found in namespace "${namespace}"`, newState: state };
        }
        
        return {
            output: `__EDIT_RESOURCE__:configmap:${namespace}:${resourceName}`,
            newState: state
        };
    }
    
    // 处理 service/svc
    if (resourceType === 'service' || resourceType === 'services' || resourceType === 'svc') {
        const svc = state.services.find(s => s.metadata.name === resourceName && s.metadata.namespace === namespace);
        if (!svc) {
            return { output: `Error from server (NotFound): services "${resourceName}" not found in namespace "${namespace}"`, newState: state };
        }
        
        return {
            output: `__EDIT_RESOURCE__:service:${namespace}:${resourceName}`,
            newState: state
        };
    }
    
    return { 
        output: `Edit not supported for "${resourceType}". Supported types: deployment, hpa, configmap, service`, 
        newState: state 
    };
}

/**
 * kubectl label 命令处理
 */
function handleLabel(parts: string[], state: ClusterState): CommandResult {
    const resourceType = parts[2];
    const resourceName = parts[3];
    const labelArgs = parts.slice(4).filter(p => !p.startsWith('-'));
    const flags = parseFlags(parts.slice(4));

    if (!resourceName) {
        return { output: 'Error: resource name is required', newState: state };
    }

    const labels: Record<string, string | null> = {};
    labelArgs.forEach(arg => {
        if (arg.includes('=')) {
            const [key, value] = arg.split('=');
            labels[key] = value;
        } else if (arg.endsWith('-')) {
            labels[arg.slice(0, -1)] = null; // Remove label
        }
    });

    let newState = { ...state };

    switch (resourceType) {
        case 'node':
        case 'nodes':
            const nodeIndex = newState.nodes.findIndex(n => n.metadata.name === resourceName);
            if (nodeIndex === -1) {
                return { output: `Error from server (NotFound): nodes "${resourceName}" not found`, newState: state };
            }
            const node = { ...newState.nodes[nodeIndex] };
            node.metadata.labels = { ...node.metadata.labels };
            Object.entries(labels).forEach(([k, v]) => {
                if (v === null) delete node.metadata.labels![k];
                else node.metadata.labels![k] = v;
            });
            newState.nodes = [...newState.nodes];
            newState.nodes[nodeIndex] = node;
            return { output: `node/${resourceName} labeled`, newState };

        case 'pod':
        case 'pods':
            const podIndex = newState.pods.findIndex(p => p.metadata.name === resourceName);
            if (podIndex === -1) {
                return { output: `Error from server (NotFound): pods "${resourceName}" not found`, newState: state };
            }
            const pod = { ...newState.pods[podIndex] };
            pod.metadata.labels = { ...pod.metadata.labels };
            Object.entries(labels).forEach(([k, v]) => {
                if (v === null) delete pod.metadata.labels![k];
                else pod.metadata.labels![k] = v;
            });
            newState.pods = [...newState.pods];
            newState.pods[podIndex] = pod;
            return { output: `pod/${resourceName} labeled`, newState };

        default:
            return { output: `Error: cannot label resource type "${resourceType}"`, newState: state };
    }
}

/**
 * kubectl annotate 命令处理
 */
function handleAnnotate(parts: string[], state: ClusterState): CommandResult {
    const resourceType = parts[2];
    const resourceName = parts[3];
    return { output: `${resourceType}/${resourceName} annotated`, newState: state };
}

/**
 * kubectl taint 命令处理
 */
function handleTaint(parts: string[], state: ClusterState): CommandResult {
    const resourceType = parts[2];
    const nodeName = parts[3];
    const taintArgs = parts.slice(4).filter(p => !p.startsWith('-'));

    if (resourceType !== 'node' && resourceType !== 'nodes') {
        return { output: 'Error: taint can only be applied to nodes', newState: state };
    }

    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);
    if (nodeIndex === -1) {
        return { output: `Error from server (NotFound): nodes "${nodeName}" not found`, newState: state };
    }

    const newState = { ...state };
    const node = { ...newState.nodes[nodeIndex] };
    node.spec = { ...node.spec, taints: node.spec.taints || [] };

    taintArgs.forEach(taint => {
        if (taint.endsWith('-')) {
            // Remove taint
            const key = taint.slice(0, -1).split(':')[0].split('=')[0];
            node.spec.taints = node.spec.taints?.filter(t => t.key !== key);
        } else {
            // Add taint: key=value:effect
            const [keyValue, effect] = taint.split(':');
            const [key, value] = keyValue.split('=');
            node.spec.taints = node.spec.taints || [];
            node.spec.taints.push({ key, value: value || '', effect: effect || 'NoSchedule' });
        }
    });

    newState.nodes = [...newState.nodes];
    newState.nodes[nodeIndex] = node;

    return { output: `node/${nodeName} tainted`, newState };
}

/**
 * kubectl cordon 命令处理
 */
function handleCordon(parts: string[], state: ClusterState): CommandResult {
    const nodeName = parts[2];
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);

    if (nodeIndex === -1) {
        return { output: `Error from server (NotFound): nodes "${nodeName}" not found`, newState: state };
    }

    const newState = { ...state };
    const node = { ...newState.nodes[nodeIndex] };
    node.spec = { ...node.spec, unschedulable: true };
    newState.nodes = [...newState.nodes];
    newState.nodes[nodeIndex] = node;

    return { output: `node/${nodeName} cordoned`, newState };
}

/**
 * kubectl uncordon 命令处理
 */
function handleUncordon(parts: string[], state: ClusterState): CommandResult {
    const nodeName = parts[2];
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);

    if (nodeIndex === -1) {
        return { output: `Error from server (NotFound): nodes "${nodeName}" not found`, newState: state };
    }

    const newState = { ...state };
    const node = { ...newState.nodes[nodeIndex] };
    node.spec = { ...node.spec, unschedulable: false };
    newState.nodes = [...newState.nodes];
    newState.nodes[nodeIndex] = node;

    return { output: `node/${nodeName} uncordoned`, newState };
}

/**
 * kubectl drain 命令处理
 */
function handleDrain(parts: string[], state: ClusterState): CommandResult {
    const nodeName = parts[2];
    const flags = parseFlags(parts.slice(3));
    const nodeIndex = state.nodes.findIndex(n => n.metadata.name === nodeName);

    if (nodeIndex === -1) {
        return { output: `Error from server (NotFound): nodes "${nodeName}" not found`, newState: state };
    }

    const newState = { ...state };
    
    // Mark node as unschedulable
    const node = { ...newState.nodes[nodeIndex] };
    node.spec = { ...node.spec, unschedulable: true };
    newState.nodes = [...newState.nodes];
    newState.nodes[nodeIndex] = node;

    // Evict pods from the node (unless --delete-emptydir-data or --ignore-daemonsets)
    const evictedPods = newState.pods.filter(p => p.spec.nodeName === nodeName);
    newState.pods = newState.pods.filter(p => p.spec.nodeName !== nodeName);

    return { 
        output: `node/${nodeName} cordoned\nEvicting ${evictedPods.length} pods\nnode/${nodeName} drained`, 
        newState 
    };
}

/**
 * kubectl rollout 命令处理
 */
function handleRollout(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const namespace = String(flags['n'] || flags['namespace'] || 'default');
    
    // 找到 rollout 后的子命令、资源类型、资源名称
    const nonFlagArgs = extractNonFlagArgs(parts);
    // nonFlagArgs: ['kubectl', 'rollout', 'restart', 'deployment', 'name']
    const subCommand = nonFlagArgs[2]; // status, history, undo, restart, pause, resume
    const resourceType = nonFlagArgs[3];
    const resourceName = nonFlagArgs[4];

    if (!resourceName) {
        return { output: 'Error: resource name is required', newState: state };
    }

    switch (subCommand) {
        case 'status':
            const dep = state.deployments.find(d => d.metadata.name === resourceName && d.metadata.namespace === namespace);
            if (!dep) {
                return { output: `Error from server (NotFound): deployments "${resourceName}" not found`, newState: state };
            }
            return { 
                output: `deployment "${resourceName}" successfully rolled out\n` +
                        `${dep.status?.readyReplicas || 0}/${dep.spec.replicas} replicas are available`, 
                newState: state 
            };

        case 'restart':
            const depIndex = state.deployments.findIndex(d => d.metadata.name === resourceName && d.metadata.namespace === namespace);
            if (depIndex === -1) {
                return { output: `Error from server (NotFound): deployments "${resourceName}" not found`, newState: state };
            }
            // Simulate restart by updating creation timestamp
            const restartedDep = state.deployments[depIndex];
            const labels = restartedDep.spec.selector.matchLabels;
            
            // Remove old pods and create new ones (only in the same namespace)
            let newPods = state.pods.filter(p => {
                if (p.metadata.namespace !== namespace) return true;
                const podLabels = p.metadata.labels || {};
                return !Object.entries(labels).every(([k, v]) => podLabels[k] === v);
            });
            const freshPods = createPodsForDeployment(restartedDep, state, restartedDep.spec.replicas);
            newPods = [...newPods, ...freshPods];

            return { 
                output: `deployment.apps/${resourceName} restarted`, 
                newState: { ...state, pods: newPods }
            };

        case 'history':
            return { 
                output: `deployment.apps/${resourceName} \nREVISION  CHANGE-CAUSE\n1         <none>\n2         kubectl set image deployment/${resourceName} ...`, 
                newState: state 
            };

        case 'undo':
            return { output: `deployment.apps/${resourceName} rolled back`, newState: state };

        case 'pause':
            return { output: `deployment.apps/${resourceName} paused`, newState: state };

        case 'resume':
            return { output: `deployment.apps/${resourceName} resumed`, newState: state };

        default:
            return { output: `Error: unknown rollout subcommand "${subCommand}"`, newState: state };
    }
}

/**
 * kubectl set 命令处理
 */
function handleSet(parts: string[], state: ClusterState): CommandResult {
    const subCommand = parts[2]; // image, resources, env, selector, sa, subject
    
    switch (subCommand) {
        case 'image':
            const resourcePath = parts[3]; // deployment/name
            const imageArg = parts[4]; // container=image
            
            if (!resourcePath || !imageArg) {
                return { output: 'Error: usage: kubectl set image deployment/NAME CONTAINER=IMAGE', newState: state };
            }

            const [resType, resName] = resourcePath.split('/');
            const [container, newImage] = imageArg.split('=');

            if (resType !== 'deployment') {
                return { output: `Error: cannot set image on resource type "${resType}"`, newState: state };
            }

            const depIndex = state.deployments.findIndex(d => d.metadata.name === resName);
            if (depIndex === -1) {
                return { output: `Error from server (NotFound): deployments.apps "${resName}" not found`, newState: state };
            }

            const dep = { ...state.deployments[depIndex] };
            dep.spec = { ...dep.spec };
            dep.spec.template = { ...dep.spec.template };
            dep.spec.template.spec = { ...dep.spec.template.spec };
            dep.spec.template.spec.containers = dep.spec.template.spec.containers.map(c => 
                c.name === container ? { ...c, image: newImage } : c
            );

            const newState = { ...state };
            newState.deployments = [...state.deployments];
            newState.deployments[depIndex] = dep;

            return { output: `deployment.apps/${resName} image updated`, newState };

        case 'resources':
            return { output: 'resource requirements updated', newState: state };

        case 'env':
            // kubectl set env deploy/critical-app DB_HOST=mysql.default.svc.cluster.local
            const envResourcePath = parts[3]; // deployment/name
            const envArgs = parts.slice(4).filter(p => !p.startsWith('-'));
            
            if (!envResourcePath) {
                return { output: 'Error: usage: kubectl set env deployment/NAME KEY=VALUE', newState: state };
            }

            const [envResType, envResName] = envResourcePath.split('/');
            
            if (envResType !== 'deployment' && envResType !== 'deploy') {
                return { output: `Error: cannot set env on resource type "${envResType}"`, newState: state };
            }

            const envDepIndex = state.deployments.findIndex(d => d.metadata.name === envResName);
            if (envDepIndex === -1) {
                return { output: `Error from server (NotFound): deployments.apps "${envResName}" not found`, newState: state };
            }

            // 解析环境变量
            const envUpdates: { name: string; value: string }[] = [];
            envArgs.forEach(arg => {
                if (arg.includes('=')) {
                    const eqIndex = arg.indexOf('=');
                    envUpdates.push({
                        name: arg.substring(0, eqIndex),
                        value: arg.substring(eqIndex + 1)
                    });
                }
            });

            if (envUpdates.length === 0) {
                return { output: 'Error: at least one KEY=VALUE pair is required', newState: state };
            }

            // 更新 Deployment
            const envDep = { ...state.deployments[envDepIndex] };
            envDep.spec = { ...envDep.spec };
            envDep.spec.template = { ...envDep.spec.template };
            envDep.spec.template.spec = { ...envDep.spec.template.spec };
            envDep.spec.template.spec.containers = envDep.spec.template.spec.containers.map(c => {
                const newEnv = [...(c.env || [])];
                envUpdates.forEach(update => {
                    const existingIndex = newEnv.findIndex(e => e.name === update.name);
                    if (existingIndex >= 0) {
                        newEnv[existingIndex] = { ...newEnv[existingIndex], value: update.value };
                    } else {
                        newEnv.push({ name: update.name, value: update.value });
                    }
                });
                return { ...c, env: newEnv };
            });
            envDep.status = { ...envDep.status, readyReplicas: envDep.spec.replicas, availableReplicas: envDep.spec.replicas };

            const envNewState = { ...state };
            envNewState.deployments = [...state.deployments];
            envNewState.deployments[envDepIndex] = envDep;

            // 模拟滚动更新：删除旧 Pod，创建新 Pod
            const oldPodLabels = envDep.spec.selector.matchLabels;
            const newPods = envNewState.pods.filter(p => {
                const labels = p.metadata.labels || {};
                return !Object.entries(oldPodLabels).every(([k, v]) => labels[k] === v);
            });
            
            // 创建新的健康 Pod
            const newHash = Math.random().toString(36).substring(2, 12);
            for (let i = 0; i < envDep.spec.replicas; i++) {
                const suffix = Math.random().toString(36).substring(2, 7);
                const container = envDep.spec.template.spec.containers[0];
                newPods.push({
                    apiVersion: 'v1',
                    kind: 'Pod',
                    metadata: {
                        name: `${envResName}-${newHash}-${suffix}`,
                        namespace: 'default',
                        labels: { ...envDep.spec.template.metadata.labels, 'pod-template-hash': newHash }
                    },
                    spec: {
                        containers: [{ 
                            name: container.name, 
                            image: container.image,
                            env: container.env 
                        }],
                        nodeName: state.nodes[i % state.nodes.length]?.metadata.name || 'node01'
                    },
                    status: {
                        phase: 'Running',
                        podIP: `10.244.${i + 1}.${10 + i}`,
                        hostIP: '192.168.1.3'
                    }
                });
            }
            envNewState.pods = newPods;

            return { 
                output: `deployment.apps/${envResName} env updated\ndeployment.apps/${envResName} rolling updated`, 
                newState: envNewState 
            };

        default:
            return { output: `Error: unknown set subcommand "${subCommand}"`, newState: state };
    }
}

/**
 * kubectl autoscale 命令处理 - 创建 HPA
 */
function handleAutoscale(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts);
    const namespace = String(flags['n'] || flags['namespace'] || 'default');
    
    // 找到 autoscale 后面的资源类型和名称
    let resourceType = '';
    let resourceName = '';
    let foundAutoscale = false;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'autoscale') {
            foundAutoscale = true;
            continue;
        }
        if (foundAutoscale && !parts[i].startsWith('-')) {
            if (!resourceType) {
                resourceType = parts[i];
            } else if (!resourceName) {
                resourceName = parts[i];
                break;
            }
        }
        // 跳过 flag 值
        if (parts[i] === '-n' || parts[i] === '--namespace' || parts[i] === '--min' || 
            parts[i] === '--max' || parts[i] === '--cpu' || parts[i] === '--name') {
            i++;
        }
    }

    if (!resourceName) {
        return { output: 'Error: resource name is required', newState: state };
    }

    const minReplicas = parseInt(String(flags['min'] || '1'), 10);
    const maxReplicas = parseInt(String(flags['max'] || '10'), 10);
    const cpuValue = String(flags['cpu'] || '80');
    const cpuPercent = parseInt(cpuValue.replace('%', ''), 10);
    const hpaName = String(flags['name'] || resourceName);

    if (state.hpas.find(h => h.metadata.name === hpaName && h.metadata.namespace === namespace)) {
        return { output: `Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "${hpaName}" already exists`, newState: state };
    }

    // Verify target exists
    if (resourceType === 'deployment' || resourceType === 'deploy') {
        if (!state.deployments.find(d => d.metadata.name === resourceName && d.metadata.namespace === namespace)) {
            return { output: `Error from server (NotFound): deployments.apps "${resourceName}" not found`, newState: state };
        }
    }

    const hpa: HorizontalPodAutoscaler = {
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
            name: hpaName,
            namespace: namespace,
            uid: generateUID(),
            creationTimestamp: new Date().toISOString()
        },
        spec: {
            scaleTargetRef: {
                apiVersion: 'apps/v1',
                kind: 'Deployment',
                name: resourceName
            },
            minReplicas,
            maxReplicas,
            metrics: [{
                type: 'Resource',
                resource: {
                    name: 'cpu',
                    target: { type: 'Utilization', averageUtilization: cpuPercent }
                }
            }]
        },
        status: {
            currentReplicas: minReplicas,
            desiredReplicas: minReplicas,
            currentMetrics: [{
                type: 'Resource',
                resource: { current: { averageUtilization: 50 } }
            }]
        }
    };

    return {
        output: `horizontalpodautoscaler.autoscaling/${hpaName} autoscaled`,
        newState: { ...state, hpas: [...state.hpas, hpa] }
    };
}

/**
 * kubectl top 命令处理
 */
function handleTop(parts: string[], state: ClusterState): CommandResult {
    const resourceType = parts[2];

    switch (resourceType) {
        case 'nodes':
        case 'node':
            const nodeHeader = 'NAME            CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%';
            const nodeRows = state.nodes.map(n => {
                const cpuUsage = Math.floor(Math.random() * 500) + 100;
                const cpuPercent = Math.floor(Math.random() * 40) + 10;
                const memUsage = Math.floor(Math.random() * 2000) + 500;
                const memPercent = Math.floor(Math.random() * 50) + 20;
                return `${n.metadata.name.padEnd(15)} ${(cpuUsage + 'm').padEnd(12)} ${(cpuPercent + '%').padEnd(6)} ${(memUsage + 'Mi').padEnd(15)} ${memPercent}%`;
            });
            return { output: [nodeHeader, ...nodeRows].join('\n'), newState: state };

        case 'pods':
        case 'pod':
            if (state.pods.length === 0) {
                return { output: 'No resources found.', newState: state };
            }
            const podHeader = 'NAME                    CPU(cores)   MEMORY(bytes)';
            const podRows = state.pods.map(p => {
                const cpuUsage = Math.floor(Math.random() * 100) + 10;
                const memUsage = Math.floor(Math.random() * 200) + 50;
                return `${p.metadata.name.padEnd(23)} ${(cpuUsage + 'm').padEnd(12)} ${memUsage}Mi`;
            });
            return { output: [podHeader, ...podRows].join('\n'), newState: state };

        default:
            return { output: `Error: unknown resource type "${resourceType}"`, newState: state };
    }
}

/**
 * kubectl exec 命令处理（模拟）
 * 返回特殊标记 __EXEC_MODE__:podName 进入交互式 shell
 */
function handleExec(parts: string[], state: ClusterState): CommandResult {
    const podName = parts.find((p, i) => i > 1 && !p.startsWith('-') && p !== '--');
    
    if (!podName) {
        return { output: 'Error: pod name is required', newState: state };
    }

    const pod = state.pods.find(p => p.metadata.name === podName);
    if (!pod) {
        return { output: `Error from server (NotFound): pods "${podName}" not found`, newState: state };
    }

    // Find command after --
    const dashIndex = parts.indexOf('--');
    const command = dashIndex !== -1 ? parts.slice(dashIndex + 1).join(' ') : '';

    // 交互式 shell 模式（没有指定命令，或指定了 sh/bash）
    if (!command || command === 'sh' || command === 'bash' || command === '/bin/sh' || command === '/bin/bash') {
        // 返回特殊标记，由 store 处理进入 exec 模式
        return { output: `__EXEC_MODE__:${podName}`, newState: state };
    }

    // 单次执行命令模式 (kubectl exec pod -- command)
    if (command.includes('env') || command === 'printenv') {
        const envVars = [
            'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            `HOSTNAME=${podName}`,
            'HOME=/root'
        ];
        // 添加 Pod 中定义的环境变量（包括 ConfigMap/Secret）
        pod.spec.containers.forEach(c => {
            // 处理 envFrom - 注入整个 ConfigMap/Secret
            c.envFrom?.forEach(ef => {
                if (ef.configMapRef) {
                    const cm = state.configMaps.find(cm => cm.metadata.name === ef.configMapRef?.name);
                    if (cm?.data) {
                        Object.entries(cm.data).forEach(([k, v]) => envVars.push(`${k}=${v}`));
                    }
                }
                if (ef.secretRef) {
                    const secret = state.secrets.find(s => s.metadata.name === ef.secretRef?.name);
                    if (secret?.data) {
                        Object.entries(secret.data).forEach(([k, v]) => {
                            try { envVars.push(`${k}=${atob(v)}`); } catch { envVars.push(`${k}=${v}`); }
                        });
                    }
                }
            });
            // 处理 env - 单独的环境变量
            c.env?.forEach(e => {
                if (e.value) {
                    envVars.push(`${e.name}=${e.value}`);
                } else if (e.valueFrom?.configMapKeyRef) {
                    const cm = state.configMaps.find(cm => cm.metadata.name === e.valueFrom?.configMapKeyRef?.name);
                    if (cm?.data) {
                        const key = e.valueFrom.configMapKeyRef.key;
                        if (key && cm.data[key]) envVars.push(`${e.name}=${cm.data[key]}`);
                    }
                } else if (e.valueFrom?.secretKeyRef) {
                    const secret = state.secrets.find(s => s.metadata.name === e.valueFrom?.secretKeyRef?.name);
                    if (secret?.data) {
                        const key = e.valueFrom.secretKeyRef.key;
                        if (key && secret.data[key]) {
                            try { envVars.push(`${e.name}=${atob(secret.data[key])}`); } catch { envVars.push(`${e.name}=${secret.data[key]}`); }
                        }
                    }
                }
            });
        });
        return { output: envVars.join('\n'), newState: state };
    }
    if (command.includes('cat')) {
        return { output: '# Simulated file content\nkey=value\nconfig=true', newState: state };
    }
    if (command.includes('ls')) {
        return { output: 'bin  dev  etc  home  lib  proc  root  sys  tmp  usr  var', newState: state };
    }
    if (command === 'pwd') {
        return { output: '/', newState: state };
    }
    if (command === 'whoami') {
        return { output: 'root', newState: state };
    }

    return { output: `Executed: ${command}`, newState: state };
}

/**
 * kubectl port-forward 命令处理（模拟）
 */
function handlePortForward(parts: string[], state: ClusterState): CommandResult {
    const resource = parts[2];
    const portMapping = parts[3];

    if (!resource || !portMapping) {
        return { output: 'Error: usage: kubectl port-forward pod/NAME LOCAL_PORT:REMOTE_PORT', newState: state };
    }

    const [localPort, remotePort] = portMapping.split(':');
    return { 
        output: `Forwarding from 127.0.0.1:${localPort} -> ${remotePort || localPort}\n[Simulated - press Ctrl+C to stop]`, 
        newState: state 
    };
}

/**
 * kubectl cp 命令处理（模拟）
 */
function handleCp(parts: string[], state: ClusterState): CommandResult {
    const src = parts[2];
    const dest = parts[3];

    if (!src || !dest) {
        return { output: 'Error: usage: kubectl cp SOURCE DEST', newState: state };
    }

    return { output: `Copied ${src} to ${dest}`, newState: state };
}

/**
 * kubectl config 命令处理
 */
function handleConfig(parts: string[], state: ClusterState): CommandResult {
    const subCommand = parts[2];

    switch (subCommand) {
        case 'view':
            return { 
                output: `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: k8s-quest
contexts:
- context:
    cluster: k8s-quest
    user: admin
  name: k8s-quest
current-context: k8s-quest
users:
- name: admin
  user:
    client-certificate-data: DATA+OMITTED`, 
                newState: state 
            };

        case 'current-context':
            return { output: 'k8s-quest', newState: state };

        case 'get-contexts':
            return { output: 'CURRENT   NAME        CLUSTER     AUTHINFO   NAMESPACE\n*         k8s-quest   k8s-quest   admin      default', newState: state };

        case 'use-context':
            const contextName = parts[3];
            return { output: `Switched to context "${contextName || 'k8s-quest'}".`, newState: state };

        default:
            return { output: `Error: unknown config subcommand "${subCommand}"`, newState: state };
    }
}

/**
 * kubectl apply 命令处理
 */
function handleApply(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts.slice(2));
    const filename = flags['f'] || flags['filename'];

    if (!filename) {
        return { output: 'Error: must specify --filename/-f', newState: state };
    }

    // Simulate applying a YAML file
    const fname = String(filename);
    if (fname.includes('deployment')) {
        return { output: 'deployment.apps/my-app configured', newState: state };
    }
    if (fname.includes('service')) {
        return { output: 'service/my-service configured', newState: state };
    }
    if (fname.includes('configmap')) {
        return { output: 'configmap/my-config configured', newState: state };
    }

    return { output: `Applied configuration from ${filename}`, newState: state };
}

// ========== 新资源格式化函数 ==========

function formatJobs(jobs: Job[], _allNs: boolean): string {
    if (jobs.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME                    COMPLETIONS   DURATION   AGE';
    const rows = jobs.map(j => {
        const completions = `${j.status.succeeded || 0}/${j.spec.completions || 1}`;
        return `${j.metadata.name.padEnd(23)} ${completions.padEnd(13)} 30s        5m`;
    });
    return [header, ...rows].join('\n');
}

function formatCronJobs(cronJobs: CronJob[], _allNs: boolean): string {
    if (cronJobs.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME                    SCHEDULE       SUSPEND   ACTIVE   LAST SCHEDULE   AGE';
    const rows = cronJobs.map(cj => {
        const active = cj.status.active?.length || 0;
        return `${cj.metadata.name.padEnd(23)} ${cj.spec.schedule.padEnd(14)} ${String(cj.spec.suspend || false).padEnd(9)} ${String(active).padEnd(8)} <none>          5m`;
    });
    return [header, ...rows].join('\n');
}

function formatDaemonSets(daemonSets: DaemonSet[], _allNs: boolean): string {
    if (daemonSets.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE';
    const rows = daemonSets.map(ds => {
        const s = ds.status;
        return `${ds.metadata.name.padEnd(13)} ${String(s.desiredNumberScheduled).padEnd(9)} ${String(s.currentNumberScheduled).padEnd(9)} ${String(s.numberReady).padEnd(7)} ${String(s.updatedNumberScheduled).padEnd(12)} ${String(s.numberAvailable).padEnd(11)} <none>          5m`;
    });
    return [header, ...rows].join('\n');
}

function formatStatefulSets(statefulSets: StatefulSet[], _allNs: boolean): string {
    if (statefulSets.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          READY   AGE';
    const rows = statefulSets.map(sts => {
        return `${sts.metadata.name.padEnd(13)} ${sts.status.readyReplicas}/${sts.spec.replicas}     5m`;
    });
    return [header, ...rows].join('\n');
}

function formatRoles(roles: Role[]): string {
    if (roles.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME                    CREATED AT';
    const rows = roles.map(r => `${r.metadata.name.padEnd(23)} ${r.metadata.creationTimestamp || '2024-01-01T00:00:00Z'}`);
    return [header, ...rows].join('\n');
}

function formatRoleBindings(roleBindings: RoleBinding[]): string {
    if (roleBindings.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME                    ROLE                          AGE';
    const rows = roleBindings.map(rb => 
        `${rb.metadata.name.padEnd(23)} ${(rb.roleRef.kind + '/' + rb.roleRef.name).padEnd(29)} 5m`
    );
    return [header, ...rows].join('\n');
}

function formatClusterRoles(clusterRoles: ClusterRole[]): string {
    if (clusterRoles.length === 0) return 'No resources found.';
    const header = 'NAME                                                                   CREATED AT';
    const rows = clusterRoles.map(cr => 
        `${cr.metadata.name.padEnd(70)} ${cr.metadata.creationTimestamp || '2024-01-01T00:00:00Z'}`
    );
    return [header, ...rows].join('\n');
}

function formatClusterRoleBindings(clusterRoleBindings: ClusterRoleBinding[]): string {
    if (clusterRoleBindings.length === 0) return 'No resources found.';
    const header = 'NAME                                                   ROLE                                       AGE';
    const rows = clusterRoleBindings.map(crb => 
        `${crb.metadata.name.padEnd(54)} ${'ClusterRole/' + crb.roleRef.name.padEnd(28)} 5m`
    );
    return [header, ...rows].join('\n');
}

function formatServiceAccounts(serviceAccounts: ServiceAccount[], _allNs: boolean): string {
    if (serviceAccounts.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          SECRETS   AGE';
    const rows = serviceAccounts.map(sa => 
        `${sa.metadata.name.padEnd(13)} ${String(sa.secrets?.length || 0).padEnd(9)} 5m`
    );
    return [header, ...rows].join('\n');
}

function formatPersistentVolumes(pvs: PersistentVolume[]): string {
    if (pvs.length === 0) return 'No resources found.';
    const header = 'NAME          CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM   STORAGECLASS   AGE';
    const rows = pvs.map(pv => {
        const modes = pv.spec.accessModes.map(m => m === 'ReadWriteOnce' ? 'RWO' : m === 'ReadOnlyMany' ? 'ROX' : 'RWX').join(',');
        return `${pv.metadata.name.padEnd(13)} ${pv.spec.capacity.storage.padEnd(10)} ${modes.padEnd(14)} ${(pv.spec.persistentVolumeReclaimPolicy || 'Retain').padEnd(16)} ${pv.status.phase.padEnd(11)} ${'-'.padEnd(7)} ${(pv.spec.storageClassName || '-').padEnd(14)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatPersistentVolumeClaims(pvcs: PersistentVolumeClaim[], _allNs: boolean): string {
    if (pvcs.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          STATUS   VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE';
    const rows = pvcs.map(pvc => {
        const modes = pvc.spec.accessModes.map(m => m === 'ReadWriteOnce' ? 'RWO' : m === 'ReadOnlyMany' ? 'ROX' : 'RWX').join(',');
        return `${pvc.metadata.name.padEnd(13)} ${pvc.status.phase.padEnd(8)} ${(pvc.spec.volumeName || '-').padEnd(8)} ${(pvc.status.capacity?.storage || '-').padEnd(10)} ${modes.padEnd(14)} ${(pvc.spec.storageClassName || '-').padEnd(14)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatStorageClasses(storageClasses: StorageClass[]): string {
    if (storageClasses.length === 0) return 'No resources found.';
    const header = 'NAME                 PROVISIONER                    RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE';
    const rows = storageClasses.map(sc => {
        const isDefault = sc.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true';
        const name = isDefault ? `${sc.metadata.name} (default)` : sc.metadata.name;
        return `${name.padEnd(20)} ${sc.provisioner.padEnd(30)} ${(sc.reclaimPolicy || 'Delete').padEnd(15)} ${(sc.volumeBindingMode || 'Immediate').padEnd(22)} ${String(sc.allowVolumeExpansion || false).padEnd(22)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatIngresses(ingresses: Ingress[], _allNs: boolean): string {
    if (ingresses.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          CLASS    HOSTS       ADDRESS   PORTS   AGE';
    const rows = ingresses.map(ing => {
        const hosts = ing.spec.rules.map(r => r.host || '*').join(',');
        const ports = ing.spec.tls ? '80, 443' : '80';
        return `${ing.metadata.name.padEnd(13)} ${(ing.spec.ingressClassName || '<none>').padEnd(8)} ${hosts.padEnd(11)} ${'-'.padEnd(9)} ${ports.padEnd(7)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatNetworkPolicies(networkPolicies: NetworkPolicy[], _allNs: boolean): string {
    if (networkPolicies.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME              POD-SELECTOR   AGE';
    const rows = networkPolicies.map(np => {
        const selector = Object.entries(np.spec.podSelector.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(',') || '<none>';
        return `${np.metadata.name.padEnd(17)} ${selector.padEnd(14)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatGatewayClasses(gatewayClasses: GatewayClass[]): string {
    if (gatewayClasses.length === 0) return 'No resources found.';
    const header = 'NAME      CONTROLLER                  ACCEPTED   AGE';
    const rows = gatewayClasses.map(gc => 
        `${gc.metadata.name.padEnd(9)} ${gc.spec.controllerName.padEnd(27)} True       10d`
    );
    return [header, ...rows].join('\n');
}

function formatGateways(gateways: Gateway[], _allNs: boolean): string {
    if (gateways.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME            CLASS   ADDRESS         PROGRAMMED   AGE';
    const rows = gateways.map(gw => {
        const addr = gw.status?.addresses?.[0]?.value || '<pending>';
        const programmed = gw.status?.conditions?.find((c: { type: string; status: string }) => c.type === 'Programmed')?.status === 'True' ? 'True' : 'Unknown';
        return `${gw.metadata.name.padEnd(15)} ${gw.spec.gatewayClassName.padEnd(7)} ${addr.padEnd(15)} ${programmed.padEnd(12)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatHTTPRoutes(httpRoutes: HTTPRoute[], _allNs: boolean): string {
    if (httpRoutes.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          HOSTNAMES                 PARENTREFS         AGE';
    const rows = httpRoutes.map(hr => {
        const hostnames = hr.spec.hostnames?.join(',') || '*';
        const parentRefs = hr.spec.parentRefs.map((p: { name: string }) => p.name).join(',');
        return `${hr.metadata.name.padEnd(13)} ${hostnames.padEnd(25)} ${parentRefs.padEnd(18)} 5m`;
    });
    return [header, ...rows].join('\n');
}

function formatResourceQuotas(resourceQuotas: ResourceQuota[], _allNs: boolean): string {
    if (resourceQuotas.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          AGE   REQUEST                        LIMIT';
    const rows = resourceQuotas.map(rq => {
        const requests = Object.entries(rq.spec.hard)
            .filter(([k]) => k.startsWith('requests.'))
            .map(([k, v]) => `${k.replace('requests.', '')}=${v}`)
            .join(', ') || '-';
        const limits = Object.entries(rq.spec.hard)
            .filter(([k]) => k.startsWith('limits.'))
            .map(([k, v]) => `${k.replace('limits.', '')}=${v}`)
            .join(', ') || '-';
        return `${rq.metadata.name.padEnd(13)} 5m    ${requests.padEnd(30)} ${limits}`;
    });
    return [header, ...rows].join('\n');
}

function formatLimitRanges(limitRanges: LimitRange[], _allNs: boolean): string {
    if (limitRanges.length === 0) return 'No resources found in default namespace.';
    const header = 'NAME          CREATED AT';
    const rows = limitRanges.map(lr => 
        `${lr.metadata.name.padEnd(13)} ${lr.metadata.creationTimestamp || '2024-01-01T00:00:00Z'}`
    );
    return [header, ...rows].join('\n');
}

function formatPriorityClasses(priorityClasses: ClusterState['priorityClasses']): string {
    if (priorityClasses.length === 0) return 'No resources found.';
    const header = 'NAME                      VALUE        GLOBAL-DEFAULT   AGE';
    const rows = priorityClasses.map(pc => {
        const name = pc.metadata.name.padEnd(25);
        const value = String(pc.value).padEnd(12);
        const globalDefault = (pc.globalDefault ? 'true' : 'false').padEnd(16);
        return `${name} ${value} ${globalDefault} 10d`;
    });
    return [header, ...rows].join('\n');
}

function formatEvents(events: ClusterState['events'], _allNs: boolean): string {
    if (events.length === 0) return 'No events found.';
    const header = 'LAST SEEN   TYPE      REASON              OBJECT                          MESSAGE';
    const rows = events.slice(-20).map(e => {
        const age = '5m';
        const obj = `${e.involvedObject.kind}/${e.involvedObject.name}`;
        return `${age.padEnd(11)} ${e.type.padEnd(9)} ${e.reason.padEnd(19)} ${obj.padEnd(31)} ${e.message.substring(0, 50)}`;
    });
    return [header, ...rows].join('\n');
}

function formatAll(state: ClusterState, allNs: boolean): string {
    const sections: string[] = [];
    
    if (state.pods.length > 0) {
        sections.push('NAME                    READY   STATUS    RESTARTS   AGE');
        sections.push(...state.pods.map(p => formatPodRow(p)));
    }
    
    if (state.services.length > 0) {
        sections.push('\nNAME          TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE');
        sections.push(...state.services.map(s => 
            `${s.metadata.name.padEnd(13)} ${s.spec.type.padEnd(11)} ${(s.spec.clusterIP || '<none>').padEnd(13)} ${'<none>'.padEnd(13)} ${s.spec.ports.map(p => p.port).join(',').padEnd(9)} 5m`
        ));
    }
    
    if (state.deployments.length > 0) {
        sections.push('\nNAME          READY   UP-TO-DATE   AVAILABLE   AGE');
        sections.push(...state.deployments.map(d => 
            `${d.metadata.name.padEnd(13)} ${d.status.readyReplicas}/${d.spec.replicas}     ${d.status.replicas}            ${d.status.availableReplicas}           5m`
        ));
    }
    
    return sections.length > 0 ? sections.join('\n') : 'No resources found.';
}

function formatPodRow(p: Pod): string {
    const ready = p.status.containerStatuses?.filter(c => c.ready).length || 0;
    const total = p.spec.containers.length;
    const restarts = p.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0;
    return `${p.metadata.name.padEnd(23)} ${ready}/${total}     ${p.status.phase.padEnd(9)} ${String(restarts).padEnd(10)} 5m`;
}

// ========== 新命令处理器 ==========

/**
 * kubectl auth 命令处理
 */
function handleAuth(parts: string[], state: ClusterState): CommandResult {
    const subCommand = parts[2];
    
    if (subCommand !== 'can-i') {
        return { output: `Error: unknown auth subcommand "${subCommand}"`, newState: state };
    }
    
    // kubectl auth can-i VERB RESOURCE [--namespace=NS]
    const verb = parts[3];
    const resource = parts[4];
    const flags = parseFlags(parts.slice(5));
    const namespace = flags['namespace'] || flags['n'] || 'default';
    
    if (!verb || !resource) {
        return { output: 'Error: usage: kubectl auth can-i VERB RESOURCE', newState: state };
    }
    
    const result = canI(verb, resource, state, { namespace: String(namespace) });
    return { output: result.allowed ? 'yes' : 'no', newState: state };
}

/**
 * kubectl api-resources 命令处理
 */
function handleApiResources(state: ClusterState): CommandResult {
    const resources = `NAME                              SHORTNAMES   APIVERSION                     NAMESPACED   KIND
bindings                                       v1                             true         Binding
configmaps                        cm           v1                             true         ConfigMap
endpoints                         ep           v1                             true         Endpoints
events                            ev           v1                             true         Event
limitranges                       limits       v1                             true         LimitRange
namespaces                        ns           v1                             false        Namespace
nodes                             no           v1                             false        Node
persistentvolumeclaims            pvc          v1                             true         PersistentVolumeClaim
persistentvolumes                 pv           v1                             false        PersistentVolume
pods                              po           v1                             true         Pod
resourcequotas                    quota        v1                             true         ResourceQuota
secrets                                        v1                             true         Secret
serviceaccounts                   sa           v1                             true         ServiceAccount
services                          svc          v1                             true         Service
daemonsets                        ds           apps/v1                        true         DaemonSet
deployments                       deploy       apps/v1                        true         Deployment
replicasets                       rs           apps/v1                        true         ReplicaSet
statefulsets                      sts          apps/v1                        true         StatefulSet
cronjobs                          cj           batch/v1                       true         CronJob
jobs                                           batch/v1                       true         Job
ingresses                         ing          networking.k8s.io/v1           true         Ingress
networkpolicies                   netpol       networking.k8s.io/v1           true         NetworkPolicy
clusterrolebindings                            rbac.authorization.k8s.io/v1   false        ClusterRoleBinding
clusterroles                                   rbac.authorization.k8s.io/v1   false        ClusterRole
rolebindings                                   rbac.authorization.k8s.io/v1   true         RoleBinding
roles                                          rbac.authorization.k8s.io/v1   true         Role
storageclasses                    sc           storage.k8s.io/v1              false        StorageClass`;
    
    return { output: resources, newState: state };
}

/**
 * 格式化 CRD 列表
 */
function formatCRDs(): string {
    // 模拟常见的 CRD
    const header = 'NAME                                                  CREATED AT';
    const crds = [
        'certificates.cert-manager.io                          2024-01-01T00:00:00Z',
        'certificaterequests.cert-manager.io                   2024-01-01T00:00:00Z',
        'challenges.acme.cert-manager.io                       2024-01-01T00:00:00Z',
        'clusterissuers.cert-manager.io                        2024-01-01T00:00:00Z',
        'issuers.cert-manager.io                               2024-01-01T00:00:00Z',
        'orders.acme.cert-manager.io                           2024-01-01T00:00:00Z',
        'gateways.gateway.networking.k8s.io                    2024-01-01T00:00:00Z',
        'httproutes.gateway.networking.k8s.io                  2024-01-01T00:00:00Z',
        'gatewayclasses.gateway.networking.k8s.io              2024-01-01T00:00:00Z',
    ];
    return [header, ...crds].join('\n');
}

/**
 * kubectl explain 命令处理
 */
function handleExplain(parts: string[], state: ClusterState): CommandResult {
    const resource = parts[2];
    
    if (!resource) {
        return { output: 'You must specify the type of resource to explain.', newState: state };
    }
    
    // 解析资源路径，如 certificate.spec.subject
    const resourceParts = resource.toLowerCase().split('.');
    const resourceType = resourceParts[0];
    const fieldPath = resourceParts.slice(1);
    
    // 定义各资源的 explain 输出
    const explainData: Record<string, Record<string, string>> = {
        'certificate': {
            '': `KIND:     Certificate
VERSION:  cert-manager.io/v1

DESCRIPTION:
     A Certificate resource should be created to ensure an up to date and
     signed x509 certificate is stored in the Kubernetes Secret resource named
     in \`spec.secretName\`.

FIELDS:
   apiVersion   <string>
   kind <string>
   metadata     <Object>
   spec <Object>
   status       <Object>`,
            'spec': `KIND:     Certificate
VERSION:  cert-manager.io/v1

RESOURCE: spec <Object>

DESCRIPTION:
     Desired state of the Certificate resource.

FIELDS:
   commonName   <string>
   dnsNames     <[]string>
   duration     <string>
   isCA <boolean>
   issuerRef    <Object>
   privateKey   <Object>
   renewBefore  <string>
   secretName   <string>
   subject      <Object>
   usages       <[]string>`,
            'spec.subject': `KIND:     Certificate
VERSION:  cert-manager.io/v1

RESOURCE: subject <Object>

DESCRIPTION:
     Full X509 name specification (https://golang.org/pkg/crypto/x509/pkix/#Name).

FIELDS:
   countries            <[]string>
   localities           <[]string>
   organizationalUnits  <[]string>
   organizations        <[]string>
   postalCodes          <[]string>
   provinces            <[]string>
   serialNumber         <string>
   streetAddresses      <[]string>`
        },
        'pod': {
            '': `KIND:     Pod
VERSION:  v1

DESCRIPTION:
     Pod is a collection of containers that can run on a host.

FIELDS:
   apiVersion   <string>
   kind <string>
   metadata     <Object>
   spec <Object>
   status       <Object>`,
            'spec': `KIND:     Pod
VERSION:  v1

RESOURCE: spec <Object>

DESCRIPTION:
     Specification of the desired behavior of the pod.

FIELDS:
   containers           <[]Object> -required-
   initContainers       <[]Object>
   nodeName             <string>
   nodeSelector         <map[string]string>
   restartPolicy        <string>
   serviceAccountName   <string>
   volumes              <[]Object>`
        },
        'deployment': {
            '': `KIND:     Deployment
VERSION:  apps/v1

DESCRIPTION:
     Deployment enables declarative updates for Pods and ReplicaSets.

FIELDS:
   apiVersion   <string>
   kind <string>
   metadata     <Object>
   spec <Object>
   status       <Object>`,
            'spec': `KIND:     Deployment
VERSION:  apps/v1

RESOURCE: spec <Object>

FIELDS:
   minReadySeconds      <integer>
   paused               <boolean>
   progressDeadlineSeconds      <integer>
   replicas             <integer>
   revisionHistoryLimit <integer>
   selector             <Object> -required-
   strategy             <Object>
   template             <Object> -required-`
        },
        'gateway': {
            '': `KIND:     Gateway
VERSION:  gateway.networking.k8s.io/v1

DESCRIPTION:
     Gateway represents an instance of a service-traffic handling infrastructure.

FIELDS:
   apiVersion   <string>
   kind <string>
   metadata     <Object>
   spec <Object>
   status       <Object>`,
            'spec': `KIND:     Gateway
VERSION:  gateway.networking.k8s.io/v1

RESOURCE: spec <Object>

FIELDS:
   addresses    <[]Object>
   gatewayClassName     <string> -required-
   listeners    <[]Object> -required-`
        },
        'httproute': {
            '': `KIND:     HTTPRoute
VERSION:  gateway.networking.k8s.io/v1

DESCRIPTION:
     HTTPRoute provides a way to route HTTP requests.

FIELDS:
   apiVersion   <string>
   kind <string>
   metadata     <Object>
   spec <Object>
   status       <Object>`,
            'spec': `KIND:     HTTPRoute
VERSION:  gateway.networking.k8s.io/v1

RESOURCE: spec <Object>

FIELDS:
   hostnames    <[]string>
   parentRefs   <[]Object> -required-
   rules        <[]Object>`
        }
    };
    
    const resourceData = explainData[resourceType];
    if (!resourceData) {
        return { output: `error: the server doesn't have a resource type "${resourceType}"`, newState: state };
    }
    
    const fieldKey = fieldPath.join('.');
    const output = resourceData[fieldKey] || resourceData[''] || `error: field "${fieldKey}" does not exist`;
    
    return { output, newState: state };
}

/**
 * kubectl cluster-info 命令处理
 */
function handleClusterInfo(parts: string[], state: ClusterState): CommandResult {
    const subCommand = parts[2];
    
    if (subCommand === 'dump') {
        // 模拟 cluster-info dump 输出，包含重要配置信息
        const output = `Cluster info dump written to stdout

=== Cluster Configuration ===
{
  "kind": "ConfigMap",
  "apiVersion": "v1",
  "metadata": {
    "name": "kubeadm-config",
    "namespace": "kube-system"
  },
  "data": {
    "ClusterConfiguration": "apiServer:\\n  extraArgs:\\n    authorization-mode: Node,RBAC\\n  timeoutForControlPlane: 4m0s\\napiVersion: kubeadm.k8s.io/v1beta3\\ncontrollerManager:\\n  extraArgs:\\n    cluster-cidr: 192.168.0.0/16\\n    service-cluster-ip-range: 10.96.0.0/12\\n    cluster-name: kubernetes\\nkind: ClusterConfiguration\\nkubernetesVersion: v1.28.0\\nnetworking:\\n  dnsDomain: cluster.local\\n  podSubnet: 192.168.0.0/16\\n  serviceSubnet: 10.96.0.0/12"
  }
}

=== kube-controller-manager Configuration ===
spec:
  containers:
  - command:
    - kube-controller-manager
    - --allocate-node-cidrs=true
    - --cluster-cidr=192.168.0.0/16
    - --cluster-name=kubernetes
    - --service-cluster-ip-range=10.96.0.0/12
    - --cluster-signing-cert-file=/etc/kubernetes/pki/ca.crt
    - --cluster-signing-key-file=/etc/kubernetes/pki/ca.key
    - --controllers=*,bootstrapsigner,tokencleaner
    - --kubeconfig=/etc/kubernetes/controller-manager.conf
    - --leader-elect=true
    - --root-ca-file=/etc/kubernetes/pki/ca.crt
    - --service-account-private-key-file=/etc/kubernetes/pki/sa.key
    - --use-service-account-credentials=true

=== Namespaces ===
default
kube-system
kube-public
kube-node-lease

=== Nodes ===
${state.nodes.map(n => `${n.metadata.name} (${n.status.conditions.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady'})`).join('\n')}

=== Pods in kube-system ===
coredns-5dd5756b68-abcde   1/1     Running   0          10d
etcd-control-plane          1/1     Running   0          10d
kube-apiserver-control-plane 1/1     Running   0          10d
kube-controller-manager-control-plane 1/1     Running   0          10d
kube-proxy-xxxxx            1/1     Running   0          10d
kube-scheduler-control-plane 1/1     Running   0          10d
calico-node-xxxxx           1/1     Running   0          10d
calico-kube-controllers-xxx 1/1     Running   0          10d

=== Services ===
kubernetes   ClusterIP   10.96.0.1   <none>   443/TCP   10d

=== Events ===
(Recent events would be listed here)`;
        return { output, newState: state };
    }
    
    // 默认的 cluster-info 输出
    const output = `Kubernetes control plane is running at https://127.0.0.1:6443
CoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.`;
    
    return { output, newState: state };
}
