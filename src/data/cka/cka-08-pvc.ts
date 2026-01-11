/**
 * CKA 第八题：PVC
 * 
 * 考点：PersistentVolumeClaim 创建、PV 绑定、Deployment 挂载
 */

import type { Scenario } from '../scenarios';
import type { ClusterState } from '../../engine/cluster';

const initialState: Partial<ClusterState> = {
    namespaces: ['default', 'kube-system', 'mariadb'],
    persistentVolumes: [
        {
            apiVersion: 'v1',
            kind: 'PersistentVolume',
            metadata: {
                name: 'mariadb-pv',
                uid: 'mariadb-pv-uid',
                creationTimestamp: new Date().toISOString(),
            },
            spec: {
                capacity: { storage: '500Mi' },
                accessModes: ['ReadWriteOnce'],
                persistentVolumeReclaimPolicy: 'Retain',
                storageClassName: 'local-path',
                hostPath: { path: '/data/mariadb' },
            },
            status: { phase: 'Available' },
        },
    ],
    storageClasses: [
        {
            apiVersion: 'storage.k8s.io/v1',
            kind: 'StorageClass',
            metadata: { name: 'local-path', uid: 'sc-uid', creationTimestamp: new Date().toISOString() },
            provisioner: 'rancher.io/local-path',
            reclaimPolicy: 'Delete',
            volumeBindingMode: 'WaitForFirstConsumer',
        },
    ],
};

export const cka08PVC: Scenario = {
    id: 'cka-08',
    title: 'CKA 第8题：PVC 与数据持久化',
    description: '创建 PVC 并恢复 MariaDB Deployment',
    story: `您必须连接到正确的主机。不这样做可能导致零分。
[student@k8s-master1] $ ssh cka000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

mariadb namespace 中的 MariaDB Deployment 被误删除。请恢复该 Deployment 并确保数据持久性。

如下规格在 mariadb namespace 中创建名为 mariadb 的 PersistentVolumeClaim (PVC)：
• 访问模式为 ReadWriteOnce
• 存储为 250Mi

集群中现有一个 PersistentVolume。您必须使用现有的 PV。

编辑位于 ~/mariadb-deployment.yaml 的 MariaDB Deployment 文件，以使用上一步中创建的 PVC。
将更新的 Deployment 文件应用到集群。确保 MariaDB Deployment 正在运行且稳定。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    difficulty: 'medium',
    objectives: [
        {
            id: 'create-pvc',
            description: '创建名为 mariadb 的 PVC，访问模式 ReadWriteOnce，存储 250Mi',
            hint: '创建 pvc.yaml 并 kubectl apply',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                return state.persistentVolumeClaims.some(pvc => 
                    pvc.metadata.name === 'mariadb' &&
                    pvc.metadata.namespace === 'mariadb' &&
                    pvc.spec.accessModes?.includes('ReadWriteOnce') &&
                    pvc.spec.resources?.requests?.storage === '250Mi'
                );
            },
        },
        {
            id: 'create-deployment',
            description: '创建使用 PVC 的 MariaDB Deployment',
            hint: '修改 ~/mariadb-deployment.yaml 添加 volume 配置',
            checkCondition: (state: ClusterState, _commandHistory: string[]) => {
                const deploy = state.deployments.find(d => 
                    d.metadata.name === 'mariadb' && 
                    d.metadata.namespace === 'mariadb'
                );
                if (!deploy) {
                    console.log('[CKA-08] Deployment not found');
                    return false;
                }
                const volumes = deploy.spec.template.spec.volumes || [];
                console.log('[CKA-08] Deployment volumes:', JSON.stringify(volumes));
                const result = volumes.some(v => v.persistentVolumeClaim?.claimName === 'mariadb');
                console.log('[CKA-08] Check result:', result);
                return result;
            },
        },
    ],
    initialState,
    initialFiles: {
        'mariadb-deployment.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: mariadb
  namespace: mariadb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mariadb
  template:
    metadata:
      labels:
        app: mariadb
    spec:
      containers:
      - name: mariadb
        image: mariadb:11.1.2
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: "secret"
        volumeMounts:
        - name: mariadb-data
          mountPath: /var/lib/mysql
      volumes:
      - name: mariadb-data
        persistentVolumeClaim:
          claimName: "wrong-pvc-name"
`,
    },
    hints: [
        `📖 解题步骤：

1️⃣ 检查 PV 的 StorageClass
kubectl get pv

2️⃣ 创建 PVC
官方文档搜"配置 Pod 以使用 PersistentVolume 作为存储"
参考链接：https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/

vim pvc.yaml

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mariadb
  namespace: mariadb
spec:
  storageClassName: local-path
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 250Mi

kubectl apply -f pvc.yaml

3️⃣ 修改 Deployment 文件
vim ~/mariadb-deployment.yaml

修改 volumes 部分的 claimName 为正确的 PVC 名称：
      volumes:
      - name: mariadb-data
        persistentVolumeClaim:
          claimName: "mariadb"  # 将 wrong-pvc-name 改为 mariadb

4️⃣ 应用 Deployment
kubectl apply -f ~/mariadb-deployment.yaml

5️⃣ 检查
kubectl -n mariadb get pod`,
        
        `💡 关键知识点：
• PVC 必须与 PV 的 storageClassName 匹配才能绑定
• accessModes 决定挂载方式
• volumeBindingMode: WaitForFirstConsumer 会延迟绑定直到 Pod 调度`,
    ],
    rewards: {
        xp: 100,
        badges: ['pvc-master'],
    },
};
