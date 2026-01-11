/**
 * 虚拟文件系统
 * 模拟 Linux 文件系统结构
 */

export interface FileNode {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: Map<string, FileNode>;
    permissions?: string;
    owner?: string;
    modifiedAt?: string;
}

export interface FileSystem {
    root: FileNode;
    currentPath: string;
    // 环境变量
    env?: Record<string, string>;
}

/**
 * 创建初始文件系统
 */
export function createInitialFileSystem(): FileSystem {
    const root: FileNode = {
        name: '/',
        type: 'directory',
        permissions: 'drwxr-xr-x',
        owner: 'root',
        children: new Map()
    };

    // 创建基本目录结构
    const homeDir = createDirectory('home');
    const userDir = createDirectory('user');
    const etcDir = createDirectory('etc');
    const kubernetesDir = createDirectory('kubernetes');
    const manifestsDir = createDirectory('manifests');
    const tmpDir = createDirectory('tmp');
    const varDir = createDirectory('var');
    const logDir = createDirectory('log');

    // /home/user 目录
    userDir.children!.set('.bashrc', createFile('.bashrc', '# ~/.bashrc\nexport PS1="\\u@k8s-quest:\\w$ "\nalias k=kubectl\nalias ll="ls -la"'));
    userDir.children!.set('.kube', createDirectory('.kube'));
    userDir.children!.get('.kube')!.children!.set('config', createFile('config', `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://kubernetes.default.svc
    certificate-authority: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  name: k8s-quest
contexts:
- context:
    cluster: k8s-quest
    user: default
  name: default
current-context: default
users:
- name: default
  user:
    token: <service-account-token>`));

    homeDir.children!.set('user', userDir);

    // /etc/kubernetes 目录
    kubernetesDir.children!.set('admin.conf', createFile('admin.conf', '# Kubernetes admin config'));
    manifestsDir.children!.set('example-pod.yaml', createFile('example-pod.yaml', `apiVersion: v1
kind: Pod
metadata:
  name: example-pod
  labels:
    app: example
spec:
  containers:
  - name: nginx
    image: nginx:latest
    ports:
    - containerPort: 80`));
    manifestsDir.children!.set('example-deployment.yaml', createFile('example-deployment.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: example-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: example
  template:
    metadata:
      labels:
        app: example
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80`));
    kubernetesDir.children!.set('manifests', manifestsDir);
    etcDir.children!.set('kubernetes', kubernetesDir);
    etcDir.children!.set('hosts', createFile('hosts', '127.0.0.1   localhost\n::1         localhost\n10.96.0.1   kubernetes.default.svc'));
    etcDir.children!.set('resolv.conf', createFile('resolv.conf', 'nameserver 10.96.0.10\nsearch default.svc.cluster.local svc.cluster.local cluster.local'));

    // /var/log 目录
    logDir.children!.set('messages', createFile('messages', '[system] K8s Quest started\n[kubelet] Node ready'));
    varDir.children!.set('log', logDir);

    // 添加到 root
    root.children!.set('home', homeDir);
    root.children!.set('etc', etcDir);
    root.children!.set('tmp', tmpDir);
    root.children!.set('var', varDir);

    return {
        root,
        currentPath: '/home/user'
    };
}

function createDirectory(name: string): FileNode {
    return {
        name,
        type: 'directory',
        permissions: 'drwxr-xr-x',
        owner: 'user',
        children: new Map(),
        modifiedAt: new Date().toISOString()
    };
}

function createFile(name: string, content: string): FileNode {
    return {
        name,
        type: 'file',
        permissions: '-rw-r--r--',
        owner: 'user',
        content,
        modifiedAt: new Date().toISOString()
    };
}

/**
 * 解析路径，返回绝对路径
 */
export function resolvePath(currentPath: string, targetPath: string): string {
    // 处理 ~ 路径
    if (targetPath === '~') {
        return '/home/user';
    }
    if (targetPath.startsWith('~/')) {
        return normalizePath('/home/user/' + targetPath.slice(2));
    }
    
    if (targetPath.startsWith('/')) {
        return normalizePath(targetPath);
    }
    
    const combined = currentPath + '/' + targetPath;
    return normalizePath(combined);
}

/**
 * 规范化路径（处理 . 和 ..）
 */
function normalizePath(path: string): string {
    const parts = path.split('/').filter(p => p && p !== '.');
    const result: string[] = [];
    
    for (const part of parts) {
        if (part === '..') {
            result.pop();
        } else {
            result.push(part);
        }
    }
    
    return '/' + result.join('/');
}

/**
 * 获取路径对应的节点
 */
export function getNode(fs: FileSystem, path: string): FileNode | null {
    const absolutePath = resolvePath(fs.currentPath, path);
    
    if (absolutePath === '/') {
        return fs.root;
    }
    
    const parts = absolutePath.split('/').filter(p => p);
    let current = fs.root;
    
    for (const part of parts) {
        if (current.type !== 'directory' || !current.children) {
            return null;
        }
        const next = current.children.get(part);
        if (!next) {
            return null;
        }
        current = next;
    }
    
    return current;
}

/**
 * 获取父目录节点
 */
export function getParentNode(fs: FileSystem, path: string): { parent: FileNode; name: string } | null {
    const absolutePath = resolvePath(fs.currentPath, path);
    const parts = absolutePath.split('/').filter(p => p);
    
    if (parts.length === 0) {
        return null; // root has no parent
    }
    
    const name = parts.pop()!;
    const parentPath = '/' + parts.join('/');
    const parent = getNode(fs, parentPath);
    
    if (!parent || parent.type !== 'directory') {
        return null;
    }
    
    return { parent, name };
}

/**
 * 创建文件或目录
 */
export function createNode(fs: FileSystem, path: string, node: FileNode): boolean {
    const result = getParentNode(fs, path);
    if (!result) return false;
    
    const { parent, name } = result;
    if (parent.children!.has(name)) return false;
    
    node.name = name;
    parent.children!.set(name, node);
    return true;
}

/**
 * 删除文件或目录
 */
export function deleteNode(fs: FileSystem, path: string): boolean {
    const result = getParentNode(fs, path);
    if (!result) return false;
    
    const { parent, name } = result;
    return parent.children!.delete(name);
}

/**
 * 复制节点（深拷贝）
 */
export function cloneNode(node: FileNode): FileNode {
    const clone: FileNode = {
        name: node.name,
        type: node.type,
        permissions: node.permissions,
        owner: node.owner,
        content: node.content,
        modifiedAt: new Date().toISOString()
    };
    
    if (node.children) {
        clone.children = new Map();
        for (const [key, child] of node.children) {
            clone.children.set(key, cloneNode(child));
        }
    }
    
    return clone;
}
