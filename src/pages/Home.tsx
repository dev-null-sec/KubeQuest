import React from 'react';
import { Trophy, BookOpen, Swords } from 'lucide-react';

interface HomeProps {
    onSelectMode: (mode: 'story' | 'sandbox' | 'tower') => void;
}

/**
 * 主页 - 游戏模式选择
 */
export const Home: React.FC<HomeProps> = ({ onSelectMode }) => {
    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
            {/* 标题 */}
            <header className="mb-12 text-center">
                <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 mb-4">
                    Kubernetes 模拟器
                </h1>
                <p className="text-2xl text-gray-400">Web端练习环境</p>
                <p className="text-gray-500 mt-2">在浏览器里练习kubectl命令和Kubernetes概念</p>
            </header>

            {/* 模式选择 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
                {/* 引导练习 */}
                <div
                    onClick={() => onSelectMode('story')}
                    className="bg-gradient-to-br from-blue-900 to-blue-700 p-8 rounded-xl cursor-pointer hover:scale-105 transition-transform border-2 border-blue-400 shadow-lg hover:shadow-blue-400/50"
                >
                    <BookOpen className="w-16 h-16 text-blue-200 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">引导练习</h2>
                    <p className="text-blue-100 mb-4">
                        按步骤学习Kubernetes基础概念和操作
                    </p>
                    <ul className="text-blue-200 text-sm space-y-1">
                        <li>• 分步练习教程</li>
                        <li>• 基础到进阶</li>
                        <li>• 实际操作演示</li>
                    </ul>
                    <div className="mt-6 text-center">
                        <span className="bg-blue-500 px-4 py-2 rounded font-semibold text-white">
                            开始学习 →
                        </span>
                    </div>
                </div>

                {/* 沙盒模式 */}
                <div
                    onClick={() => onSelectMode('sandbox')}
                    className="bg-gradient-to-br from-green-900 to-green-700 p-8 rounded-xl cursor-pointer hover:scale-105 transition-transform border-2 border-green-400 shadow-lg hover:shadow-green-400/50"
                >
                    <Swords className="w-16 h-16 text-green-200 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">沙盒模式</h2>
                    <p className="text-green-100 mb-4">
                        自由练习kubectl命令，随意创建和管理集群资源
                    </p>
                    <ul className="text-green-200 text-sm space-y-1">
                        <li>• 完整的kubectl命令支持</li>
                        <li>• Tab键智能补全</li>
                        <li>• 无限制自由探索</li>
                    </ul>
                    <div className="mt-6 text-center">
                        <span className="bg-green-500 px-4 py-2 rounded font-semibold text-white">
                            自由练习 →
                        </span>
                    </div>
                </div>

                {/* CKA 题目练习 */}
                <div
                    onClick={() => onSelectMode('tower')}
                    className="bg-gradient-to-br from-purple-900 to-purple-700 p-8 rounded-xl cursor-pointer hover:scale-105 transition-transform border-2 border-purple-400 shadow-lg hover:shadow-purple-400/50"
                >
                    <Trophy className="w-16 h-16 text-purple-200 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">CKA 练习</h2>
                    <p className="text-purple-100 mb-4">
                        CKA认证相关题目练习
                    </p>
                    <ul className="text-purple-200 text-sm space-y-1">
                        <li>• CKA题目参考</li>
                        <li>• 解题思路</li>
                        <li>• 相关文档</li>
                    </ul>
                    <div className="mt-6 text-center">
                        <span className="bg-purple-500 px-4 py-2 rounded font-semibold text-white">
                            开始练习 →
                        </span>
                    </div>
                </div>
            </div>

            {/* 底部说明 */}
            <footer className="mt-12 text-center text-gray-500 text-sm">
                <p>提示：推荐从引导练习开始</p>
            </footer>
        </div>
    );
};
