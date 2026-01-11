/**
 * CKA 认证考试模拟 - 16 道真题复�?
 * 
 * 考试注意事项:
 * - 每次考试记得做完每一题后 exit �?base 节点，再继续下一�?
 * - 以下题解步骤省略了这最后一�?
 */

import type { Scenario } from '../scenarios';

// 导入所�?CKA 关卡
import { cka01Hpa } from './cka-01-hpa';
import { cka02Ingress } from './cka-02-ingress';
import { cka03Sidecar } from './cka-03-sidecar';
import { cka04StorageClass } from './cka-04-storageclass';
import { cka05Service } from './cka-05-service';
import { cka06PriorityClass } from './cka-06-priorityclass';
import { cka07ArgoCD } from './cka-07-argocd';
import { cka08PVC } from './cka-08-pvc';
import { cka09Gateway } from './cka-09-gateway';
import { cka10NetworkPolicy } from './cka-10-networkpolicy';
import { cka11CRD } from './cka-11-crd';
import { cka12ConfigMap } from './cka-12-configmap';
import { cka13Calico } from './cka-13-calico';
import { cka14Resources } from './cka-14-resources';
import { cka15Etcd } from './cka-15-etcd';
import { cka16CriDocker } from './cka-16-cri-docker';

// 导出所�?CKA 场景
export const ckaScenarios: Scenario[] = [
    cka01Hpa,
    cka02Ingress,
    cka03Sidecar,
    cka04StorageClass,
    cka05Service,
    cka06PriorityClass,
    cka07ArgoCD,
    cka08PVC,
    cka09Gateway,
    cka10NetworkPolicy,
    cka11CRD,
    cka12ConfigMap,
    cka13Calico,
    cka14Resources,
    cka15Etcd,
    cka16CriDocker,
];

// 按ID获取CKA场景
export const getCKAScenarioById = (id: string): Scenario | undefined => {
    return ckaScenarios.find(s => s.id === id);
};

// CKA 考试元数�?
export const CKA_EXAM_INFO = {
    title: 'CKA 认证考试模拟',
    description: '完整复刻 16 �?CKA 真题，包含详细提示和解题步骤',
    totalQuestions: 16,
    passingScore: 66, // CKA 及格分数�?66%
    timeLimit: 120, // 考试时间 120 分钟
    version: '2024-11',
};
