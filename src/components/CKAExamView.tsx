import React from 'react';
import { useGameStore } from '../engine/store';
import { TerminalView } from './TerminalView';
import { VimEditor } from './VimEditor';
import { getCompletions } from '../engine/completion';
import { ChevronRight, Clock, AlertTriangle, Trophy, CheckCircle, XCircle } from 'lucide-react';
import type { Scenario } from '../data/scenarios';

interface CKAExamViewProps {
    scenarios: Scenario[];
    onBack: () => void;
}

interface ExamResult {
    questionIndex: number;
    title: string;
    passed: boolean;
    objectivesTotal: number;
    objectivesPassed: number;
}

/**
 * CKA 模拟考试视图
 * - 连续16道题目
 * - 无提示，无完成标记
 * - 用户确认后下一题
 * - 最后统一评分
 */
export const CKAExamView: React.FC<CKAExamViewProps> = ({ scenarios, onBack }) => {
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [examStarted, setExamStarted] = React.useState(false);
    const [examFinished, setExamFinished] = React.useState(false);
    const [results, setResults] = React.useState<ExamResult[]>([]);
    const [startTime, setStartTime] = React.useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = React.useState(0);

    const loadScenario = useGameStore(state => state.loadScenario);
    const clusterState = useGameStore(state => state.clusterState);
    const commandHistory = useGameStore(state => state.commandHistory);
    const fileSystem = useGameStore(state => state.fileSystem);
    const executeCommand = useGameStore(state => state.executeCommand);
    const vimMode = useGameStore(state => state.vimMode);
    const saveVim = useGameStore(state => state.saveVim);
    const closeVim = useGameStore(state => state.closeVim);
    const currentScenario = useGameStore(state => state.currentScenario);

    // 计时器
    React.useEffect(() => {
        if (examStarted && !examFinished && startTime) {
            const timer = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [examStarted, examFinished, startTime]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleComplete = (partial: string): string[] => {
        return getCompletions(partial, clusterState, fileSystem);
    };

    const handleCommand = async (command: string): Promise<string> => {
        const result = await executeCommand(command);
        if (typeof result === 'string') {
            return result;
        }
        return '';
    };

    const startExam = () => {
        setExamStarted(true);
        setStartTime(new Date());
        setCurrentIndex(0);
        setResults([]);
        loadScenario(scenarios[0]);
    };

    const checkCurrentQuestion = (): ExamResult => {
        const scenario = scenarios[currentIndex];
        let passedCount = 0;
        
        for (const obj of scenario.objectives) {
            if (obj.checkCondition(clusterState, commandHistory)) {
                passedCount++;
            }
        }

        return {
            questionIndex: currentIndex,
            title: scenario.title,
            passed: passedCount === scenario.objectives.length,
            objectivesTotal: scenario.objectives.length,
            objectivesPassed: passedCount
        };
    };

    const handleNextQuestion = () => {
        // 检查当前题目并保存结果
        const result = checkCurrentQuestion();
        setResults(prev => [...prev, result]);

        if (currentIndex < scenarios.length - 1) {
            // 加载下一题
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            loadScenario(scenarios[nextIndex]);
        } else {
            // 考试结束
            setExamFinished(true);
        }
    };

    const calculateScore = () => {
        const passed = results.filter(r => r.passed).length;
        const total = results.length;
        const score = Math.round((passed / total) * 100);
        return { passed, total, score };
    };

    // 开始界面
    if (!examStarted) {
        return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
                <div className="max-w-2xl w-full bg-gray-800 rounded-xl p-8 text-center">
                    <AlertTriangle className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
                    <h1 className="text-3xl font-bold text-white mb-4">CKA 模拟考试</h1>
                    <div className="text-gray-300 mb-6 space-y-2">
                        <p>📝 共 <span className="text-yellow-400 font-bold">16</span> 道题目</p>
                        <p>⏱️ 真实考试时间 <span className="text-yellow-400 font-bold">120</span> 分钟</p>
                        <p>🎯 及格线 <span className="text-yellow-400 font-bold">66</span> 分</p>
                    </div>
                    <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
                        <h3 className="text-red-400 font-semibold mb-2">⚠️ 考试规则</h3>
                        <ul className="text-red-300 text-sm text-left space-y-1">
                            <li>• 考试过程中<strong>不显示提示</strong>和任务完成状态</li>
                            <li>• 自己确认完成后点击"下一题"按钮</li>
                            <li>• 无法返回修改之前的题目</li>
                            <li>• 完成所有题目后统一评分</li>
                        </ul>
                    </div>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={onBack}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg"
                        >
                            返回
                        </button>
                        <button
                            onClick={startExam}
                            className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-lg font-bold"
                        >
                            开始考试
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 结果界面
    if (examFinished) {
        const { passed, total, score } = calculateScore();
        const isPassed = score >= 66;

        return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
                <div className="max-w-3xl w-full bg-gray-800 rounded-xl p-8">
                    <div className="text-center mb-8">
                        {isPassed ? (
                            <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-4" />
                        ) : (
                            <XCircle className="w-24 h-24 text-red-500 mx-auto mb-4" />
                        )}
                        <h1 className={`text-4xl font-bold mb-2 ${isPassed ? 'text-green-400' : 'text-red-400'}`}>
                            {isPassed ? '🎉 恭喜通过！' : '😔 未通过'}
                        </h1>
                        <div className="text-6xl font-bold text-white my-4">{score} 分</div>
                        <p className="text-gray-400">
                            完成 {passed}/{total} 题 | 用时 {formatTime(elapsedTime)} | 及格线 66 分
                        </p>
                    </div>

                    <div className="bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto">
                        <h3 className="text-white font-semibold mb-3">详细结果</h3>
                        <div className="space-y-2">
                            {results.map((r, idx) => (
                                <div 
                                    key={idx}
                                    className={`flex items-center justify-between p-3 rounded ${
                                        r.passed ? 'bg-green-900/30 border border-green-600' : 'bg-red-900/30 border border-red-600'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {r.passed ? (
                                            <CheckCircle className="w-5 h-5 text-green-500" />
                                        ) : (
                                            <XCircle className="w-5 h-5 text-red-500" />
                                        )}
                                        <span className="text-white">
                                            #{idx + 1} {r.title.replace(/^CKA 第\d+题[：:]\s*/, '')}
                                        </span>
                                    </div>
                                    <span className={`text-sm ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                                        {r.objectivesPassed}/{r.objectivesTotal}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 text-center">
                        <button
                            onClick={onBack}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-3 rounded-lg font-bold"
                        >
                            返回 CKA 菜单
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 考试进行中
    if (!currentScenario) {
        return <div className="text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            {/* 顶部状态栏 */}
            <header className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <span className="text-purple-400 font-bold">CKA 模拟考试</span>
                    <span className="bg-gray-700 px-3 py-1 rounded text-white">
                        第 {currentIndex + 1} / {scenarios.length} 题
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-gray-300">
                        <Clock className="w-5 h-5" />
                        <span className="font-mono">{formatTime(elapsedTime)}</span>
                    </div>
                    <button
                        onClick={handleNextQuestion}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded flex items-center gap-2 font-semibold"
                    >
                        {currentIndex < scenarios.length - 1 ? '下一题' : '提交考试'}
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* 主内容区 */}
            <div className="flex-1 flex">
                {/* 左侧：题目描述 */}
                <div className="w-1/3 p-4 overflow-y-auto border-r border-gray-700">
                    <h2 className="text-xl font-bold text-purple-400 mb-3">
                        #{currentIndex + 1}. {currentScenario.title.replace(/^CKA 第\d+题[：:]\s*/, '')}
                    </h2>
                    
                    {/* 故事/场景描述 */}
                    <div className="bg-gray-800 p-4 rounded-lg mb-4">
                        <h3 className="text-yellow-400 font-semibold mb-2">📋 任务描述</h3>
                        <p className="text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
                            {currentScenario.story}
                        </p>
                    </div>

                    {/* 目标列表 - 不显示完成状态 */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                        <h3 className="text-blue-400 font-semibold mb-2">🎯 任务目标</h3>
                        <ul className="space-y-2">
                            {currentScenario.objectives.map((obj, idx) => (
                                <li key={obj.id} className="flex items-start gap-2 text-gray-300 text-sm">
                                    <span className="text-gray-500">{idx + 1}.</span>
                                    <span>{obj.description}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* 注意：考试模式下不显示提示 */}
                </div>

                {/* 右侧：终端 */}
                <div className="flex-1 p-4">
                    <div className="h-full bg-gray-800 rounded-lg overflow-hidden">
                        <TerminalView onCommand={handleCommand} onComplete={handleComplete} />
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
