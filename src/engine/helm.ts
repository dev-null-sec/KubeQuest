import type { ClusterState } from './cluster';

type CommandResult = { output: string; newState: ClusterState };

// 模拟的 Helm 仓库
const helmRepos: Map<string, string> = new Map([
    ['stable', 'https://charts.helm.sh/stable'],
    ['bitnami', 'https://charts.bitnami.com/bitnami'],
]);

// 模拟的 Helm Charts
const helmCharts: Record<string, Record<string, { version: string; appVersion: string; description: string }>> = {
    'argo': {
        'argo-cd': { version: '7.7.3', appVersion: '2.13.2', description: 'A Helm chart for Argo CD, a declarative, GitOps continuous delivery tool for Kubernetes.' }
    },
    'bitnami': {
        'nginx': { version: '15.0.0', appVersion: '1.25.0', description: 'NGINX Open Source is a web server.' },
        'mariadb': { version: '14.0.0', appVersion: '11.1.2', description: 'MariaDB is a fast, reliable, and scalable SQL database.' },
        'wordpress': { version: '18.0.0', appVersion: '6.4.0', description: 'WordPress is a popular blogging tool.' }
    }
};

/**
 * 执行 helm 命令
 */
export async function executeHelm(
    command: string,
    state: ClusterState
): Promise<CommandResult> {
    const parts = parseCommand(command);
    
    if (parts[0] !== 'helm') {
        return { output: `command not found: ${parts[0]}`, newState: state };
    }
    
    const action = parts[1];
    
    switch (action) {
        case 'repo':
            return handleRepo(parts, state);
        case 'search':
            return handleSearch(parts, state);
        case 'template':
            return handleTemplate(parts, state);
        case 'install':
            return handleInstall(parts, state);
        case 'uninstall':
            return handleUninstall(parts, state);
        case 'list':
        case 'ls':
            return handleList(parts, state);
        case 'upgrade':
            return handleUpgrade(parts, state);
        case 'rollback':
            return handleRollback(parts, state);
        case 'status':
            return handleStatus(parts, state);
        case 'version':
            return { output: 'version.BuildInfo{Version:"v3.13.0", GitCommit:"abc123", GitTreeState:"clean", GoVersion:"go1.21.0"}', newState: state };
        case '--help':
        case 'help':
            return { output: getHelmHelp(), newState: state };
        default:
            return { output: `Error: unknown command "${action}" for "helm"`, newState: state };
    }
}

function parseCommand(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    
    for (const char of command) {
        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuote) {
            inQuote = false;
            quoteChar = '';
        } else if (char === ' ' && !inQuote) {
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

function parseFlags(parts: string[]): Record<string, string> {
    const flags: Record<string, string> = {};
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('--')) {
            const [key, value] = part.includes('=') 
                ? part.slice(2).split('=') 
                : [part.slice(2), parts[i + 1] || 'true'];
            flags[key] = value;
            if (!part.includes('=') && parts[i + 1] && !parts[i + 1].startsWith('-')) {
                i++;
            }
        } else if (part.startsWith('-') && part.length === 2) {
            flags[part.slice(1)] = parts[i + 1] || 'true';
            if (parts[i + 1] && !parts[i + 1].startsWith('-')) {
                i++;
            }
        }
    }
    return flags;
}

function handleRepo(parts: string[], state: ClusterState): CommandResult {
    const subCommand = parts[2];
    
    switch (subCommand) {
        case 'add': {
            const repoName = parts[3];
            const repoUrl = parts[4];
            if (!repoName || !repoUrl) {
                return { output: 'Error: "helm repo add" requires 2 arguments\n\nUsage:\n  helm repo add [NAME] [URL] [flags]', newState: state };
            }
            helmRepos.set(repoName, repoUrl);
            return { output: `"${repoName}" has been added to your repositories`, newState: state };
        }
        case 'update': {
            const repos = Array.from(helmRepos.keys());
            const output = repos.map(r => `Hang tight while we grab the latest from your chart repositories...\n...Successfully got an update from the "${r}" chart repository`).join('\n');
            return { output: output + '\nUpdate Complete. ⎈Happy Helming!⎈', newState: state };
        }
        case 'list': {
            const header = 'NAME            URL';
            const rows = Array.from(helmRepos.entries()).map(([name, url]) => 
                `${name.padEnd(15)} ${url}`
            );
            return { output: [header, ...rows].join('\n'), newState: state };
        }
        case 'remove':
        case 'rm': {
            const repoName = parts[3];
            if (!repoName) {
                return { output: 'Error: "helm repo remove" requires 1 argument\n\nUsage:\n  helm repo remove [REPO] [flags]', newState: state };
            }
            if (helmRepos.has(repoName)) {
                helmRepos.delete(repoName);
                return { output: `"${repoName}" has been removed from your repositories`, newState: state };
            }
            return { output: `Error: no repo named "${repoName}" found`, newState: state };
        }
        default:
            return { output: 'Error: unknown repo subcommand', newState: state };
    }
}

function handleSearch(parts: string[], state: ClusterState): CommandResult {
    const subCommand = parts[2];
    const query = parts[3] || '';
    
    if (subCommand !== 'repo' && subCommand !== 'hub') {
        return { output: 'Error: search requires a subcommand: hub or repo', newState: state };
    }
    
    const results: string[] = ['NAME                            CHART VERSION   APP VERSION     DESCRIPTION'];
    
    for (const [repo, charts] of Object.entries(helmCharts)) {
        for (const [chartName, info] of Object.entries(charts)) {
            const fullName = `${repo}/${chartName}`;
            if (!query || fullName.includes(query) || chartName.includes(query)) {
                results.push(`${fullName.padEnd(31)} ${info.version.padEnd(15)} ${info.appVersion.padEnd(15)} ${info.description.substring(0, 40)}...`);
            }
        }
    }
    
    return { output: results.join('\n'), newState: state };
}

function handleTemplate(parts: string[], state: ClusterState): CommandResult {
    const releaseName = parts[2];
    const chartRef = parts[3];
    const flags = parseFlags(parts.slice(4));
    
    if (!releaseName || !chartRef) {
        return { output: 'Error: "helm template" requires at least 2 arguments\n\nUsage:\n  helm template [NAME] [CHART] [flags]', newState: state };
    }
    
    // 解析 --set 参数
    const setValues: Record<string, string> = {};
    for (let i = 4; i < parts.length; i++) {
        if (parts[i] === '--set' && parts[i + 1]) {
            const [key, value] = parts[i + 1].split('=');
            setValues[key] = value;
        }
    }
    
    // 根据 chart 生成模拟的模板输出
    const version = flags['version'] || '7.7.3';
    const namespace = flags['namespace'] || flags['n'] || 'default';
    
    // 模拟 Argo CD 的模板输出
    if (chartRef.includes('argo-cd')) {
        const installCRDs = setValues['crds.install'] !== 'false';
        
        let output = `---
# Source: argo-cd/templates/argocd-configs/argocd-cm.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: argocd-cm
    app.kubernetes.io/instance: ${releaseName}
    app.kubernetes.io/component: server
    app.kubernetes.io/part-of: argocd
data: {}
---
# Source: argo-cd/templates/argocd-application-controller/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${releaseName}-argocd-application-controller
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: argocd-application-controller
  template:
    spec:
      containers:
      - name: application-controller
        image: quay.io/argoproj/argocd:v2.13.2
---
# Source: argo-cd/templates/argocd-server/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${releaseName}-argocd-server
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: argocd-server
  template:
    spec:
      containers:
      - name: server
        image: quay.io/argoproj/argocd:v2.13.2`;

        if (installCRDs) {
            output = `---
# Source: argo-cd/crds/application.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: applications.argoproj.io
spec:
  group: argoproj.io
  names:
    kind: Application
    listKind: ApplicationList
    plural: applications
    shortNames:
    - app
    singular: application
` + output;
        }
        
        return { output, newState: state };
    }
    
    // 通用模板输出
    return { 
        output: `---
# Source: ${chartRef}/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${releaseName}
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${releaseName}
  template:
    metadata:
      labels:
        app: ${releaseName}
    spec:
      containers:
      - name: ${releaseName}
        image: nginx:latest
---
# Source: ${chartRef}/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ${releaseName}
  namespace: ${namespace}
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: ${releaseName}`,
        newState: state 
    };
}

function handleInstall(parts: string[], state: ClusterState): CommandResult {
    const releaseName = parts[2];
    const chartRef = parts[3];
    const flags = parseFlags(parts.slice(4));
    
    if (!releaseName || !chartRef) {
        return { output: 'Error: "helm install" requires at least 2 arguments\n\nUsage:\n  helm install [NAME] [CHART] [flags]', newState: state };
    }
    
    const namespace = String(flags['namespace'] || flags['n'] || 'default');
    const version = flags['version'] || 'latest';
    
    // 确保命名空间存在
    const newState = { ...state };
    if (!newState.namespaces.includes(namespace)) {
        newState.namespaces = [...newState.namespaces, namespace];
    }
    
    // 根据 chart 类型创建相应的资源
    const chartName = chartRef.split('/').pop() || releaseName;
    createHelmResources(newState, releaseName, chartName, namespace);
    
    return { 
        output: `NAME: ${releaseName}
LAST DEPLOYED: ${new Date().toUTCString()}
NAMESPACE: ${namespace}
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
Chart ${chartRef} (version ${version}) has been installed.

Get the application URL by running these commands:
  kubectl --namespace ${namespace} port-forward svc/${releaseName} 8080:80`,
        newState 
    };
}

/**
 * 根据 helm chart 创建模拟资源
 */
function createHelmResources(state: ClusterState, releaseName: string, chartName: string, namespace: string): void {
    const now = new Date().toISOString();
    const randomSuffix = () => Math.random().toString(36).substring(2, 7);
    
    // 根据不同的 chart 创建不同的资源
    if (chartName.includes('argo-cd') || chartName.includes('argocd')) {
        // ArgoCD 的典型组件
        const components = [
            'server',
            'repo-server', 
            'application-controller',
            'applicationset-controller',
            'notifications-controller',
            'redis'
        ];
        
        components.forEach(comp => {
            const podName = `${releaseName}-${comp}-${randomSuffix()}`;
            state.pods.push({
                apiVersion: 'v1',
                kind: 'Pod',
                metadata: {
                    name: podName,
                    namespace,
                    uid: crypto.randomUUID?.() || randomSuffix(),
                    creationTimestamp: now,
                    labels: {
                        'app.kubernetes.io/name': chartName,
                        'app.kubernetes.io/instance': releaseName,
                        'app.kubernetes.io/component': comp
                    }
                },
                spec: {
                    containers: [{
                        name: comp,
                        image: `quay.io/argoproj/argocd:v2.9.0`
                    }],
                    nodeName: 'node01'
                },
                status: {
                    phase: 'Running',
                    conditions: [{ type: 'Ready', status: 'True' }],
                    containerStatuses: [{
                        name: comp,
                        ready: true,
                        restartCount: 0,
                        state: { running: { startedAt: now } }
                    }]
                }
            } as any);
        });
        
        // 创建 service
        state.services.push({
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
                name: `${releaseName}-server`,
                namespace,
                uid: crypto.randomUUID?.() || randomSuffix(),
                creationTimestamp: now,
                labels: {
                    'app.kubernetes.io/name': chartName,
                    'app.kubernetes.io/instance': releaseName
                }
            },
            spec: {
                type: 'ClusterIP',
                ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
                selector: {
                    'app.kubernetes.io/name': chartName,
                    'app.kubernetes.io/component': 'server'
                }
            }
        } as any);
    } else {
        // 通用 chart：创建一个基本的 pod 和 service
        const podName = `${releaseName}-${randomSuffix()}`;
        state.pods.push({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: podName,
                namespace,
                uid: crypto.randomUUID?.() || randomSuffix(),
                creationTimestamp: now,
                labels: {
                    'app.kubernetes.io/name': chartName,
                    'app.kubernetes.io/instance': releaseName
                }
            },
            spec: {
                containers: [{
                    name: chartName,
                    image: `${chartName}:latest`
                }],
                nodeName: 'node01'
            },
            status: {
                phase: 'Running',
                conditions: [{ type: 'Ready', status: 'True' }],
                containerStatuses: [{
                    name: chartName,
                    ready: true,
                    restartCount: 0,
                    state: { running: { startedAt: now } }
                }]
            }
        } as any);
        
        state.services.push({
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
                name: releaseName,
                namespace,
                uid: crypto.randomUUID?.() || randomSuffix(),
                creationTimestamp: now,
                labels: {
                    'app.kubernetes.io/name': chartName,
                    'app.kubernetes.io/instance': releaseName
                }
            },
            spec: {
                type: 'ClusterIP',
                ports: [{ port: 80, targetPort: 80, protocol: 'TCP' }],
                selector: {
                    'app.kubernetes.io/instance': releaseName
                }
            }
        } as any);
    }
}

function handleUninstall(parts: string[], state: ClusterState): CommandResult {
    const releaseName = parts[2];
    const flags = parseFlags(parts.slice(3));
    
    if (!releaseName) {
        return { output: 'Error: "helm uninstall" requires at least 1 argument\n\nUsage:\n  helm uninstall RELEASE_NAME [...] [flags]', newState: state };
    }
    
    const namespace = flags['namespace'] || flags['n'] || 'default';
    
    return { 
        output: `release "${releaseName}" uninstalled`,
        newState: state 
    };
}

function handleList(parts: string[], state: ClusterState): CommandResult {
    const flags = parseFlags(parts.slice(2));
    const allNamespaces = flags['all-namespaces'] === 'true' || flags['A'] === 'true';
    
    const header = 'NAME                    NAMESPACE       REVISION        UPDATED                                 STATUS          CHART                   APP VERSION';
    // 模拟一些已安装的 releases
    const releases = [
        'ingress-nginx          ingress-nginx   1               2024-01-01 00:00:00.000000 +0000 UTC    deployed        ingress-nginx-4.8.0     1.9.4',
    ];
    
    return { output: [header, ...releases].join('\n'), newState: state };
}

function handleUpgrade(parts: string[], state: ClusterState): CommandResult {
    const releaseName = parts[2];
    const chartRef = parts[3];
    const flags = parseFlags(parts.slice(4));
    
    if (!releaseName || !chartRef) {
        return { output: 'Error: "helm upgrade" requires at least 2 arguments\n\nUsage:\n  helm upgrade [RELEASE] [CHART] [flags]', newState: state };
    }
    
    const namespace = flags['namespace'] || flags['n'] || 'default';
    
    return { 
        output: `Release "${releaseName}" has been upgraded. Happy Helming!
NAME: ${releaseName}
LAST DEPLOYED: ${new Date().toUTCString()}
NAMESPACE: ${namespace}
STATUS: deployed
REVISION: 2`,
        newState: state 
    };
}

function handleRollback(parts: string[], state: ClusterState): CommandResult {
    const releaseName = parts[2];
    const revision = parts[3] || '1';
    
    if (!releaseName) {
        return { output: 'Error: "helm rollback" requires at least 1 argument\n\nUsage:\n  helm rollback <RELEASE> [REVISION] [flags]', newState: state };
    }
    
    return { 
        output: `Rollback was a success! Happy Helming!`,
        newState: state 
    };
}

function handleStatus(parts: string[], state: ClusterState): CommandResult {
    const releaseName = parts[2];
    const flags = parseFlags(parts.slice(3));
    
    if (!releaseName) {
        return { output: 'Error: "helm status" requires 1 argument\n\nUsage:\n  helm status RELEASE_NAME [flags]', newState: state };
    }
    
    const namespace = flags['namespace'] || flags['n'] || 'default';
    
    return { 
        output: `NAME: ${releaseName}
LAST DEPLOYED: ${new Date().toUTCString()}
NAMESPACE: ${namespace}
STATUS: deployed
REVISION: 1
TEST SUITE: None`,
        newState: state 
    };
}

function getHelmHelp(): string {
    return `The Kubernetes package manager

Common actions for Helm:

- helm search:        search for charts
- helm pull:          download a chart to your local directory to view
- helm install:       upload the chart to Kubernetes
- helm list:          list releases of charts

Usage:
  helm [command]

Available Commands:
  completion  generate autocompletion scripts for the specified shell
  create      create a new chart with the given name
  dependency  manage a chart's dependencies
  env         helm client environment information
  get         download extended information of a named release
  help        Help about any command
  history     fetch release history
  install     install a chart
  lint        examine a chart for possible issues
  list        list releases
  package     package a chart directory into a chart archive
  plugin      install, list, or uninstall Helm plugins
  pull        download a chart from a repository
  push        push a chart to remote
  registry    login to or logout from a registry
  repo        add, list, remove, update, and index chart repositories
  rollback    roll back a release to a previous revision
  search      search for a keyword in charts
  show        show information of a chart
  status      display the status of the named release
  template    locally render templates
  test        run tests for a release
  uninstall   uninstall a release
  upgrade     upgrade a release
  verify      verify that a chart at the given path has been signed and is valid
  version     print the client version information

Flags:
  -h, --help   help for helm

Use "helm [command] --help" for more information about a command.`;
}
