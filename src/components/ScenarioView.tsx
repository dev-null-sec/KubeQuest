import React from 'react';
import { useGameStore } from '../engine/store';
import { TerminalView } from './TerminalView';
import { VimEditor } from './VimEditor';
import { getCompletions } from '../engine/completion';
import { CheckCircle, Circle, Lightbulb, RotateCcw, Home, ArrowLeft, ChevronRight } from 'lucide-react';

interface ScenarioViewProps {
    onBackToLevelSelect: () => void;
    onBackToHome: () => void;
    onNextLevel?: () => void;
    hasNextLevel?: boolean;
}

/**
 * 场景视图组件
 * 显示关卡界面：故事、目标、提示和终端
 */
export const ScenarioView: React.FC<ScenarioViewProps> = ({ onBackToLevelSelect, onBackToHome, onNextLevel, hasNextLevel }) => {
    const currentScenario = useGameStore(state => state.currentScenario);
    const clusterState = useGameStore(state => state.clusterState);
    const fileSystem = useGameStore(state => state.fileSystem);
    const executeCommand = useGameStore(state => state.executeCommand);
    const resetScenario = useGameStore(state => state.resetScenario);
    const completedScenarios = useGameStore(state => state.completedScenarios);
    const vimMode = useGameStore(state => state.vimMode);
    const saveVim = useGameStore(state => state.saveVim);
    const closeVim = useGameStore(state => state.closeVim);

    const [showHints, setShowHints] = React.useState(false);
    const [showSuccess, setShowSuccess] = React.useState(false);
    const [practiceMode, setPracticeMode] = React.useState(false); // 继续练习模式，不再弹窗
    const [terminalKey, setTerminalKey] = React.useState(0); // 用于强制重置终端
    
    // 追踪完成状态变化的长度，只在新增完成时弹窗
    const prevCompletedCountRef = React.useRef(completedScenarios.length);

    const handleComplete = (partial: string): string[] => {
        return getCompletions(partial, clusterState, fileSystem);
    };
    
    // 包装 executeCommand，处理 vimMode 和 execMode 返回值
    const handleCommand = async (command: string): Promise<string> => {
        const result = await executeCommand(command);
        if (typeof result === 'string') {
            return result;
        }
        // 如果返回 vimMode，表示需要打开编辑器，终端不显示输出
        if ('vimMode' in result) {
            return '';
        }
        // 如果返回 execMode，显示进入容器 shell 的提示
        if ('execMode' in result) {
            return `Entering container shell on ${result.execMode.podName}...\nType 'exit' to leave.`;
        }
        return '';
    };

    // 监听场景完成状态（只在刚完成时弹窗，而非进入已完成关卡）
    React.useEffect(() => {
        if (!currentScenario || practiceMode) return;
        
        // 只在 completedScenarios 长度增加时（有新完成）才检查弹窗
        if (completedScenarios.length > prevCompletedCountRef.current) {
            // 检查当前关卡是否是刚完成的那个
            if (completedScenarios.includes(currentScenario.id)) {
                setShowSuccess(true);
            }
        }
        
        prevCompletedCountRef.current = completedScenarios.length;
    }, [currentScenario, completedScenarios, practiceMode]);

    if (!currentScenario) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-gray-400">未选择关卡</p>
            </div>
        );
    }


    const difficultyColor = {
        easy: 'text-green-400',
        medium: 'text-yellow-400',
        hard: 'text-red-400'
    }[currentScenario.difficulty];

    const difficultyText = {
        easy: '简单',
        medium: '中等',
        hard: '困难'
    }[currentScenario.difficulty];

    return (
        <div className="min-h-screen bg-gray-900 p-4">
            {/* 成功提示 */}
            {showSuccess && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gradient-to-br from-green-900 to-blue-900 p-8 rounded-lg border-2 border-green-400 max-w-md">
                        <div className="text-center">
                            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                            <h2 className="text-3xl font-bold text-white mb-2">任务完成！</h2>
                            <p className="text-gray-300 mb-4">{currentScenario.title}</p>
                            <div className="bg-black bg-opacity-30 p-4 rounded mb-4">
                                <p className="text-yellow-400 text-lg">+ {currentScenario.rewards.xp} XP</p>
                                {currentScenario.rewards.title && (
                                    <p className="text-blue-400">称号：{currentScenario.rewards.title}</p>
                                )}
                            </div>
                            <div className="flex gap-3 justify-center flex-wrap">
                                <button
                                    onClick={() => {
                                        setPracticeMode(true);
                                        setShowSuccess(false);
                                    }}
                                    className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm"
                                >
                                    继续练习
                                </button>
                                <button
                                    onClick={onBackToLevelSelect}
                                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
                                >
                                    关卡选择
                                </button>
                                {hasNextLevel && onNextLevel && (
                                    <button
                                        onClick={() => {
                                            setShowSuccess(false);
                                            setPracticeMode(false);
                                            onNextLevel();
                                        }}
                                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded text-sm flex items-center gap-1"
                                    >
                                        下一关 <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 顶部导航栏 */}
            <div className="flex items-center gap-2 mb-4">
                <button
                    onClick={onBackToHome}
                    className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded text-sm"
                >
                    <Home className="w-4 h-4" />
                    主页
                </button>
                <button
                    onClick={onBackToLevelSelect}
                    className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded text-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    关卡选择
                </button>
                {practiceMode && (
                    <span className="ml-2 text-green-400 text-sm">✓ 已通关 - 练习模式</span>
                )}
            </div>

            {/* 顶部标题栏 */}
            <div className="bg-gray-800 rounded-t-lg p-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            关卡 {currentScenario.id}: {currentScenario.title}
                        </h1>
                        <p className="text-gray-400">{currentScenario.description}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className={`${difficultyColor} font-semibold`}>[{difficultyText}]</span>
                        <span className="text-yellow-400">+{currentScenario.rewards.xp} XP</span>
                        <button
                            onClick={() => {
                                resetScenario();
                                setTerminalKey(k => k + 1);
                            }}
                            className="p-2 hover:bg-gray-700 rounded"
                            title="重置关卡"
                        >
                            <RotateCcw className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 主内容区 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                {/* 左侧：故事和目标 */}
                <div className="lg:col-span-1 space-y-4">
                    {/* 故事 */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                        <h2 className="text-xl font-semibold text-blue-400 mb-2">📖 剧情</h2>
                        <p className="text-gray-300 whitespace-pre-line leading-relaxed">
                            {currentScenario.story}
                        </p>
                    </div>

                    {/* 目标 */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                        <h2 className="text-xl font-semibold text-green-400 mb-3">🎯 目标</h2>
                        <div className="space-y-2">
                            {currentScenario.objectives.map((obj) => (
                                <div key={obj.id} className="flex items-start gap-2">
                                    {obj.completed ? (
                                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <Circle className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                                    )}
                                    <span className={obj.completed ? 'text-green-400' : 'text-gray-300'}>
                                        {obj.description}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 提示 */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                        <button
                            onClick={() => setShowHints(!showHints)}
                            className="flex items-center gap-2 text-yellow-400 hover:text-yellow-300 w-full"
                        >
                            <Lightbulb className="w-5 h-5" />
                            <span className="font-semibold">提示 ({currentScenario.hints.length})</span>
                        </button>
                        {showHints && (
                            <div className="mt-3 space-y-4">
                                {currentScenario.hints.map((hint, idx) => (
                                    <div key={idx} className="text-gray-300 text-sm pl-2 whitespace-pre-wrap font-mono bg-gray-900/50 p-3 rounded border-l-2 border-yellow-500">
                                        {hint}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 右侧：终端 */}
                <div className="lg:col-span-2">
                    <div className="bg-gray-800 p-4 rounded-lg h-[600px]">
                        <h2 className="text-xl font-semibold text-purple-400 mb-2">
                            💻 终端
                            <span className="text-sm text-gray-500 ml-2 font-normal">
                                {fileSystem.currentPath}
                            </span>
                        </h2>
                        <div className="h-[calc(100%-2rem)]">
                            <TerminalView key={terminalKey} onCommand={handleCommand} onComplete={handleComplete} />
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Vim 编辑器 */}
            {vimMode && vimMode.active && (
                <VimEditor
                    filePath={vimMode.filePath}
                    initialContent={vimMode.content}
                    onSave={saveVim}
                    onClose={closeVim}
                    isK8sResource={vimMode.isK8sResource}
                />
            )}
        </div>
    );
};
