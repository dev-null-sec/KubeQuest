import React from 'react';
import { Home } from './pages/Home';
import { LevelSelect } from './pages/LevelSelect';
import { ScenarioView } from './components/ScenarioView';
import { CKAExamView } from './components/CKAExamView';
import { TerminalView } from './components/TerminalView';
import { VimEditor } from './components/VimEditor';
import { useGameStore } from './engine/store';
import { getCompletions } from './engine/completion';
import { getScenarioById, allScenarios } from './data/scenarios';
import { ckaScenarios } from './data/cka';
import { Play, FileText, CheckCircle } from 'lucide-react';

type Page = 'home' | 'level-select' | 'scenario' | 'sandbox' | 'cka-menu' | 'cka-practice' | 'cka-exam';
type ScenarioSource = 'story' | 'cka-practice';

function App() {
  const [currentPage, setCurrentPage] = React.useState<Page>('home');
  const [scenarioSource, setScenarioSource] = React.useState<ScenarioSource>('story');
  const loadScenario = useGameStore(state => state.loadScenario);
  const executeCommand = useGameStore(state => state.executeCommand);
  const clusterState = useGameStore(state => state.clusterState);
  const fileSystem = useGameStore(state => state.fileSystem);
  const vimMode = useGameStore(state => state.vimMode);
  const saveVim = useGameStore(state => state.saveVim);
  const closeVim = useGameStore(state => state.closeVim);
  const currentScenario = useGameStore(state => state.currentScenario);
  const completedScenarios = useGameStore(state => state.completedScenarios);
  
  // 包装 executeCommand，处理 vimMode 返回值
  const handleCommand = async (command: string): Promise<string> => {
    const result = await executeCommand(command);
    if (typeof result === 'string') {
      return result;
    }
    return '';
  };

  const handleSelectMode = (mode: 'story' | 'sandbox' | 'tower') => {
    if (mode === 'story') {
      setCurrentPage('level-select');
    } else if (mode === 'sandbox') {
      setCurrentPage('sandbox');
    } else if (mode === 'tower') {
      setCurrentPage('cka-menu');
    }
  };

  const handleSelectLevel = (scenarioId: string) => {
    const scenario = getScenarioById(scenarioId);
    if (scenario) {
      loadScenario(scenario);
      setScenarioSource('story');
      setCurrentPage('scenario');
    }
  };

  const handleSelectCKALevel = (scenarioId: string) => {
    const scenario = ckaScenarios.find(s => s.id === scenarioId);
    if (scenario) {
      loadScenario(scenario);
      setScenarioSource('cka-practice');
      setCurrentPage('scenario');
    }
  };

  const handleBackFromScenario = () => {
    if (scenarioSource === 'cka-practice') {
      setCurrentPage('cka-practice');
    } else {
      setCurrentPage('level-select');
    }
  };

  // 获取下一关
  const getNextScenario = () => {
    if (!currentScenario) return null;
    const scenarios = scenarioSource === 'cka-practice' ? ckaScenarios : allScenarios;
    const currentIndex = scenarios.findIndex(s => s.id === currentScenario.id);
    if (currentIndex >= 0 && currentIndex < scenarios.length - 1) {
      return scenarios[currentIndex + 1];
    }
    return null;
  };

  const handleNextLevel = () => {
    const nextScenario = getNextScenario();
    if (nextScenario) {
      loadScenario(nextScenario);
    }
  };

  const hasNextLevel = !!getNextScenario();

  const handleComplete = (partial: string): string[] => {
    return getCompletions(partial, clusterState, fileSystem);
  };

  // 渲染当前页面
  switch (currentPage) {
    case 'home':
      return <Home onSelectMode={handleSelectMode} />;

    case 'level-select':
      return (
        <LevelSelect
          onSelectLevel={handleSelectLevel}
          onBack={() => setCurrentPage('home')}
        />
      );

    case 'scenario':
      return (
        <ScenarioView
          onBackToLevelSelect={handleBackFromScenario}
          onBackToHome={() => setCurrentPage('home')}
          onNextLevel={handleNextLevel}
          hasNextLevel={hasNextLevel}
        />
      );

    case 'sandbox':
      return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
          <header className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 mb-2">
              沙盒模式
            </h1>
            <p className="text-gray-400">
              自由练习 kubectl 和 Linux 命令
              <span className="text-gray-500 ml-2">[{fileSystem.currentPath}]</span>
            </p>
            <button
              onClick={() => setCurrentPage('home')}
              className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            >
              ← 返回主页
            </button>
          </header>

          <main className="w-full max-w-4xl h-[600px]">
            <TerminalView onCommand={handleCommand} onComplete={handleComplete} />
          </main>
          
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

    case 'cka-menu':
      return (
        <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
          <header className="mb-12 text-center">
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-4">
              CKA 认证备考
            </h1>
            <p className="text-gray-400 mb-6">
              16道CKA真题完整复刻 | 及格线: 66分 | 考试时间: 120分钟
            </p>
            <button
              onClick={() => setCurrentPage('home')}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            >
              ← 返回主页
            </button>
          </header>

          <div className="max-w-2xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 练习模式 */}
            <div
              onClick={() => setCurrentPage('cka-practice')}
              className="bg-gradient-to-br from-blue-900 to-blue-700 p-8 rounded-xl cursor-pointer hover:scale-105 transition-transform border-2 border-blue-400 shadow-lg hover:shadow-blue-400/50"
            >
              <FileText className="w-16 h-16 text-blue-200 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">练习模式</h2>
              <p className="text-blue-100 mb-4">
                自由选择题目练习，有详细提示和任务完成标记
              </p>
              <ul className="text-blue-200 text-sm space-y-1">
                <li>• 查看详细解题步骤</li>
                <li>• 实时任务完成检测</li>
                <li>• 可随时切换题目</li>
              </ul>
              <div className="mt-6 text-center">
                <span className="bg-blue-500 px-4 py-2 rounded font-semibold text-white">
                  开始练习 →
                </span>
              </div>
            </div>

            {/* 模拟考试 */}
            <div
              onClick={() => setCurrentPage('cka-exam')}
              className="bg-gradient-to-br from-red-900 to-red-700 p-8 rounded-xl cursor-pointer hover:scale-105 transition-transform border-2 border-red-400 shadow-lg hover:shadow-red-400/50"
            >
              <Play className="w-16 h-16 text-red-200 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">模拟考试</h2>
              <p className="text-red-100 mb-4">
                连续完成16道题目，无提示，最后统一评分
              </p>
              <ul className="text-red-200 text-sm space-y-1">
                <li>• 无任务完成提示</li>
                <li>• 自己确认后下一题</li>
                <li>• 结束后统一评分</li>
              </ul>
              <div className="mt-6 text-center">
                <span className="bg-red-500 px-4 py-2 rounded font-semibold text-white">
                  开始考试 →
                </span>
              </div>
            </div>
          </div>
        </div>
      );

    case 'cka-practice':
      return (
        <div className="min-h-screen bg-gray-900 p-6">
          <header className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
              CKA 练习模式
            </h1>
            <p className="text-gray-400 mb-4">
              选择题目进行练习，查看详细提示和解题步骤
            </p>
            <button
              onClick={() => setCurrentPage('cka-menu')}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            >
              ← 返回
            </button>
          </header>

          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ckaScenarios.map((scenario, index) => {
              const isCompleted = completedScenarios.includes(scenario.id);
              return (
                <div
                  key={scenario.id}
                  onClick={() => handleSelectCKALevel(scenario.id)}
                  className={`p-4 rounded-lg cursor-pointer hover:scale-105 transition-transform border-2 relative ${
                    isCompleted ? 'bg-gray-800/50 border-green-400' :
                    scenario.difficulty === 'easy' ? 'bg-green-900/50 border-green-500 hover:bg-green-800/50' :
                    scenario.difficulty === 'medium' ? 'bg-yellow-900/50 border-yellow-500 hover:bg-yellow-800/50' :
                    'bg-red-900/50 border-red-500 hover:bg-red-800/50'
                  }`}
                >
                  {isCompleted && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-2xl font-bold ${isCompleted ? 'text-green-400' : 'text-white'}`}>#{index + 1}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      isCompleted ? 'bg-green-600' :
                      scenario.difficulty === 'easy' ? 'bg-green-600' :
                      scenario.difficulty === 'medium' ? 'bg-yellow-600' :
                      'bg-red-600'
                    } text-white`}>
                      {isCompleted ? '已完成' : scenario.difficulty === 'easy' ? '简单' : scenario.difficulty === 'medium' ? '中等' : '困难'}
                    </span>
                  </div>
                  <h3 className={`font-semibold text-sm mb-1 truncate ${isCompleted ? 'text-green-300' : 'text-white'}`}>
                    {scenario.title.replace(/^CKA 第\d+题[：:]\s*/, '')}
                  </h3>
                  <p className="text-gray-400 text-xs truncate">{scenario.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      );

    case 'cka-exam':
      return (
        <CKAExamView
          scenarios={ckaScenarios}
          onBack={() => setCurrentPage('cka-menu')}
        />
      );

    default:
      return <Home onSelectMode={handleSelectMode} />;
  }
}

export default App;
