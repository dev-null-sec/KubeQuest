import React from 'react';
import { useGameStore } from '../engine/store';
import { allScenarios } from '../data/scenarios';
import { CheckCircle, Lock, Star, Home } from 'lucide-react';

interface LevelSelectProps {
    onSelectLevel: (scenarioId: string) => void;
    onBack: () => void;
}

/**
 * 关卡选择页面
 */
export const LevelSelect: React.FC<LevelSelectProps> = ({ onSelectLevel, onBack }) => {
    const completedScenarios = useGameStore(state => state.completedScenarios);
    const playerXP = useGameStore(state => state.playerXP);
    const playerLevel = useGameStore(state => state.playerLevel);

    return (
        <div className="min-h-screen bg-gray-900 p-8">
            {/* 顶部玩家信息 */}
            <div className="max-w-6xl mx-auto mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
                        >
                            <Home className="w-5 h-5" /> 返回主页
                        </button>
                        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 mb-2">
                            剧情模式
                        </h1>
                        <p className="text-gray-400">选择一个关卡开始挑战</p>
                    </div>
                    <div className="bg-gray-800 px-6 py-3 rounded-lg border border-gray-700">
                        <div className="text-sm text-gray-400">等级</div>
                        <div className="text-2xl font-bold text-yellow-400">Lv.{playerLevel}</div>
                        <div className="text-sm text-gray-400 mt-1">{playerXP} XP</div>
                    </div>
                </div>
            </div>

            {/* 关卡网格 */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allScenarios.map((scenario, index) => {
                    const isCompleted = completedScenarios.includes(scenario.id);
                    const isLocked = index > 0 && !completedScenarios.includes(allScenarios[index - 1].id);

                    const difficultyColor = {
                        easy: 'text-green-400 border-green-400',
                        medium: 'text-yellow-400 border-yellow-400',
                        hard: 'text-red-400 border-red-400'
                    }[scenario.difficulty];

                    const difficultyText = {
                        easy: '简单',
                        medium: '中等',
                        hard: '困难'
                    }[scenario.difficulty];

                    return (
                        <div
                            key={scenario.id}
                            className={`
                bg-gray-800 rounded-lg border-2 overflow-hidden transition-all
                ${isLocked ? 'opacity-50 cursor-not-allowed border-gray-700' :
                                    isCompleted ? 'border-green-400 hover:shadow-lg hover:shadow-green-400/50' :
                                        `${difficultyColor} hover:shadow-lg cursor-pointer`}
              `}
                            onClick={() => !isLocked && onSelectLevel(scenario.id)}
                        >
                            {/* 卡片头部 */}
                            <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold text-white">{scenario.id}</span>
                                        {isCompleted && <CheckCircle className="w-6 h-6 text-green-400" />}
                                        {isLocked && <Lock className="w-6 h-6 text-gray-500" />}
                                    </div>
                                    <span className={`text-sm px-2 py-1 rounded ${difficultyColor} border`}>
                                        {difficultyText}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">{scenario.title}</h3>
                                <p className="text-gray-400 text-sm">{scenario.description}</p>
                            </div>

                            {/* 卡片内容 */}
                            <div className="p-4">
                                {/* 目标预览 */}
                                <div className="mb-3">
                                    <div className="text-sm text-gray-400 mb-2">目标 ({scenario.objectives.length})</div>
                                    <div className="space-y-1">
                                        {scenario.objectives.slice(0, 2).map(obj => (
                                            <div key={obj.id} className="text-sm text-gray-300 truncate">
                                                • {obj.description}
                                            </div>
                                        ))}
                                        {scenario.objectives.length > 2 && (
                                            <div className="text-sm text-gray-500">
                                                ...还有 {scenario.objectives.length - 2} 个目标
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 奖励 */}
                                <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <Star className="w-4 h-4 text-yellow-400" />
                                        <span className="text-yellow-400 font-semibold">+{scenario.rewards.xp} XP</span>
                                    </div>
                                    {!isLocked && !isCompleted && (
                                        <span className="text-blue-400 text-sm">开始挑战 →</span>
                                    )}
                                    {isCompleted && (
                                        <span className="text-green-400 text-sm">重新挑战 →</span>
                                    )}
                                    {isLocked && (
                                        <span className="text-gray-500 text-sm">🔒 已锁定</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 返回按钮 */}
            <div className="max-w-6xl mx-auto mt-8">
                <button
                    onClick={onBack}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded"
                >
                    ← 返回主页
                </button>
            </div>
        </div>
    );
};
