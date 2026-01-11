# Kubernetes Web 模拟器

一个基于Web的Kubernetes学习工具，做着玩的项目。在浏览器里模拟kubectl命令操作，方便学习和练习K8s相关知识。

## 主要功能

- **终端界面**：基于xterm.js的仿真终端
- **命令补全**：支持kubectl命令、资源类型和名称的Tab补全
- **交互式学习**：通过实际操作来学习Kubernetes概念  
- **集群模拟**：前端模拟的Kubernetes集群环境
- **kubectl支持**：常用kubectl命令的基本实现
- **纯静态部署**：不需要后端服务，随便找个Web服务器就能跑

## 如何运行

### 开发环境

确保你的机器上已经安装了Node.js (建议16+版本)，然后：

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:5173` 就可以看到效果了。

### 部署

如果你想把这个项目部署到线上：

```bash
# 构建生产版本
npm run build
```

构建完成后，`dist/` 目录里就是所有需要的静态文件。把这些文件扔到任何Web服务器上就行，比如Nginx、Apache，或者直接用GitHub Pages、Vercel这类静态托管服务。

## 支持的kubectl命令

目前实现了一些常用的kubectl命令，基本够练习用：

**查看资源**
- `kubectl get nodes` - 查看集群节点
- `kubectl get pods` - 查看Pod列表  
- `kubectl get pods -A` - 查看所有命名空间的Pod
- `kubectl get deployments` - 查看Deployment
- `kubectl get services` - 查看Service

**详细信息**  
- `kubectl describe pod <name>` - 查看Pod详情
- `kubectl describe node <name>` - 查看Node详情

**创建和删除**
- `kubectl run <name> --image=<image>` - 创建Pod
- `kubectl delete pod <name>` - 删除Pod

**其他**
- `kubectl logs <pod-name>` - 查看Pod日志

还有很多命令没实现，毕竟只是个练手项目。如果你想添加新功能，欢迎提PR。

## 技术实现

用的都是比较常见的前端技术：

- **React 19 + TypeScript** - 前端框架  
- **Vite 7** - 构建工具，速度快
- **xterm.js** - 终端模拟器
- **Zustand** - 状态管理，比Redux简单
- **Tailwind CSS** - 样式框架

## 代码结构

```
src/
├── components/       # UI组件
├── engine/          # K8s模拟引擎核心代码
│   ├── cluster.ts   # 集群状态
│   ├── kubectl.ts   # 命令解析和执行
│   └── store.ts     # 状态管理
├── data/            # 一些配置和数据
├── pages/           # 页面组件
└── App.tsx          # 主入口
```

## 一些想法

这个项目其实就是想试试能不能在前端完全模拟K8s环境，让人不用搭建真实集群也能练习kubectl命令。目前实现得比较简单，很多高级功能还没做。

如果你对Kubernetes或前端开发感兴趣，欢迎一起完善这个项目。

## 许可证

MIT License - 随便用，不用客气。
