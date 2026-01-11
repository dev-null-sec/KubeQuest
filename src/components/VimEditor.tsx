import React, { useState, useEffect, useRef, useCallback } from 'react';

interface VimEditorProps {
    filePath: string;
    initialContent: string;
    onSave: (content: string) => void;
    onClose: () => void;
    isK8sResource?: boolean;
}

type VimMode = 'normal' | 'insert' | 'command';

/**
 * 简易 Vim 编辑器组件
 */
export const VimEditor: React.FC<VimEditorProps> = ({
    filePath,
    initialContent,
    onSave,
    onClose,
    isK8sResource
}) => {
    const [content, setContent] = useState(initialContent);
    const [mode, setMode] = useState<VimMode>('normal');
    const [commandBuffer, setCommandBuffer] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [cursorLine, setCursorLine] = useState(0);
    const [cursorCol, setCursorCol] = useState(0);
    const [modified, setModified] = useState(false);
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const lines = content.split('\n');
    
    // 聚焦到编辑器
    useEffect(() => {
        containerRef.current?.focus();
    }, []);
    
    // 显示状态消息
    const showStatus = useCallback((msg: string, duration = 2000) => {
        setStatusMessage(msg);
        if (duration > 0) {
            setTimeout(() => setStatusMessage(''), duration);
        }
    }, []);
    
    // 执行 Vim 命令
    const executeCommand = useCallback((cmd: string) => {
        switch (cmd) {
            case 'w':
                onSave(content);
                setModified(false);
                showStatus(`"${filePath}" written`);
                break;
            case 'q':
                if (modified) {
                    showStatus('E37: No write since last change (add ! to override)');
                } else {
                    onClose();
                }
                break;
            case 'q!':
                onClose();
                break;
            case 'wq':
            case 'x':
                onSave(content);
                onClose();
                break;
            case 'wq!':
                onSave(content);
                onClose();
                break;
            default:
                if (cmd.match(/^\d+$/)) {
                    // 跳转到行号
                    const lineNum = Math.min(parseInt(cmd) - 1, lines.length - 1);
                    setCursorLine(Math.max(0, lineNum));
                    setCursorCol(0);
                } else {
                    showStatus(`E492: Not an editor command: ${cmd}`);
                }
        }
        setCommandBuffer('');
    }, [content, modified, onSave, onClose, filePath, lines.length, showStatus]);
    
    // 处理键盘事件
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (mode === 'command') {
            if (e.key === 'Enter') {
                executeCommand(commandBuffer);
                setMode('normal');
            } else if (e.key === 'Escape') {
                setCommandBuffer('');
                setMode('normal');
            } else if (e.key === 'Backspace') {
                if (commandBuffer.length === 0) {
                    setMode('normal');
                } else {
                    setCommandBuffer(prev => prev.slice(0, -1));
                }
            } else if (e.key.length === 1) {
                setCommandBuffer(prev => prev + e.key);
            }
            e.preventDefault();
            return;
        }
        
        if (mode === 'insert') {
            if (e.key === 'Escape') {
                setMode('normal');
                e.preventDefault();
                return;
            }
            // 插入模式下让 textarea 处理输入
            return;
        }
        
        // Normal 模式
        e.preventDefault();
        
        switch (e.key) {
            case 'i':
                setMode('insert');
                setTimeout(() => textareaRef.current?.focus(), 0);
                break;
            case 'a':
                setCursorCol(prev => Math.min(prev + 1, lines[cursorLine]?.length || 0));
                setMode('insert');
                setTimeout(() => textareaRef.current?.focus(), 0);
                break;
            case 'o':
                // 在下方插入新行
                const newLines1 = [...lines];
                newLines1.splice(cursorLine + 1, 0, '');
                setContent(newLines1.join('\n'));
                setCursorLine(cursorLine + 1);
                setCursorCol(0);
                setMode('insert');
                setModified(true);
                setTimeout(() => textareaRef.current?.focus(), 0);
                break;
            case 'O':
                // 在上方插入新行
                const newLines2 = [...lines];
                newLines2.splice(cursorLine, 0, '');
                setContent(newLines2.join('\n'));
                setCursorCol(0);
                setMode('insert');
                setModified(true);
                setTimeout(() => textareaRef.current?.focus(), 0);
                break;
            case 'h':
            case 'ArrowLeft':
                setCursorCol(prev => Math.max(0, prev - 1));
                break;
            case 'l':
            case 'ArrowRight':
                setCursorCol(prev => Math.min(prev + 1, (lines[cursorLine]?.length || 1) - 1));
                break;
            case 'j':
            case 'ArrowDown':
                setCursorLine(prev => Math.min(prev + 1, lines.length - 1));
                break;
            case 'k':
            case 'ArrowUp':
                setCursorLine(prev => Math.max(0, prev - 1));
                break;
            case 'g':
                if (e.shiftKey) {
                    // G - 跳到最后一行
                    setCursorLine(lines.length - 1);
                } else {
                    // gg - 跳到第一行 (需要双击，这里简化处理)
                    setCursorLine(0);
                }
                break;
            case '0':
            case 'Home':
                setCursorCol(0);
                break;
            case '$':
            case 'End':
                setCursorCol(Math.max(0, (lines[cursorLine]?.length || 1) - 1));
                break;
            case 'x':
                // 删除当前字符
                if (lines[cursorLine]?.length > 0) {
                    const newLines = [...lines];
                    const line = newLines[cursorLine];
                    newLines[cursorLine] = line.slice(0, cursorCol) + line.slice(cursorCol + 1);
                    setContent(newLines.join('\n'));
                    setModified(true);
                }
                break;
            case 'd':
                // dd - 删除整行 (简化：单次 d 删除行)
                if (lines.length > 1) {
                    const newLines = lines.filter((_, i) => i !== cursorLine);
                    setContent(newLines.join('\n'));
                    setCursorLine(prev => Math.min(prev, newLines.length - 1));
                    setModified(true);
                } else {
                    setContent('');
                    setModified(true);
                }
                break;
            case 'u':
                // 撤销 - 简化版本：恢复初始内容
                setContent(initialContent);
                setModified(false);
                showStatus('Changes undone');
                break;
            case ':':
                setMode('command');
                setCommandBuffer('');
                break;
            case 'Escape':
                setCommandBuffer('');
                break;
        }
    }, [mode, commandBuffer, cursorLine, cursorCol, lines, content, initialContent, executeCommand, showStatus]);
    
    // 处理 textarea 输入变化
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
        setModified(true);
    };
    
    // 批量缩进/取消缩进选中的行
    const indentSelectedLines = (indent: boolean) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        if (start === end) {
            // 没有选中文本，只缩进当前行
            const textBefore = content.substring(0, start);
            const lineStart = textBefore.lastIndexOf('\n') + 1;
            const lineEnd = content.indexOf('\n', start);
            const actualLineEnd = lineEnd === -1 ? content.length : lineEnd;
            const currentLine = content.substring(lineStart, actualLineEnd);
            
            let newLine: string;
            let cursorOffset: number;
            
            if (indent) {
                newLine = '  ' + currentLine;
                cursorOffset = 2;
            } else {
                if (currentLine.startsWith('  ')) {
                    newLine = currentLine.substring(2);
                    cursorOffset = -2;
                } else if (currentLine.startsWith(' ')) {
                    newLine = currentLine.substring(1);
                    cursorOffset = -1;
                } else {
                    return; // 没有缩进可以移除
                }
            }
            
            const newContent = content.substring(0, lineStart) + newLine + content.substring(actualLineEnd);
            setContent(newContent);
            setModified(true);
            
            // 恢复光标位置
            setTimeout(() => {
                const newPos = Math.max(lineStart, start + cursorOffset);
                textarea.selectionStart = newPos;
                textarea.selectionEnd = newPos;
            }, 0);
            return;
        }
        
        // 有选中文本，批量处理选中的行
        const textBefore = content.substring(0, start);
        const firstLineStart = textBefore.lastIndexOf('\n') + 1;
        
        const lastLineEndSearch = content.indexOf('\n', end);
        const lastLineEnd = lastLineEndSearch === -1 ? content.length : lastLineEndSearch;
        
        const selectedBlock = content.substring(firstLineStart, lastLineEnd);
        const selectedLines = selectedBlock.split('\n');
        
        let newLines: string[];
        if (indent) {
            // 增加缩进
            newLines = selectedLines.map(line => '  ' + line);
        } else {
            // 减少缩进
            newLines = selectedLines.map(line => {
                if (line.startsWith('  ')) return line.substring(2);
                if (line.startsWith(' ')) return line.substring(1);
                return line;
            });
        }
        
        const newContent = content.substring(0, firstLineStart) + newLines.join('\n') + content.substring(lastLineEnd);
        setContent(newContent);
        setModified(true);
        
        // 恢复选择范围
        setTimeout(() => {
            textarea.selectionStart = firstLineStart;
            textarea.selectionEnd = firstLineStart + newLines.join('\n').length;
        }, 0);
    };
    
    // 处理 textarea 键盘事件（insert 模式）
    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Ctrl+] 增加缩进，Ctrl+[ 减少缩进
        if (e.ctrlKey && e.key === ']') {
            e.preventDefault();
            indentSelectedLines(true);
        } else if (e.ctrlKey && e.key === '[') {
            e.preventDefault();
            indentSelectedLines(false);
        }
    };
    
    // 同步光标位置
    const handleTextareaKeyUp = () => {
        if (textareaRef.current) {
            const pos = textareaRef.current.selectionStart;
            const textBefore = content.substring(0, pos);
            const linesBefore = textBefore.split('\n');
            setCursorLine(linesBefore.length - 1);
            setCursorCol(linesBefore[linesBefore.length - 1].length);
        }
    };
    
    // 获取模式显示文本
    const getModeText = () => {
        switch (mode) {
            case 'insert': return '-- INSERT --';
            case 'command': return ':' + commandBuffer;
            default: return '';
        }
    };
    
    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 bg-[#1e1e1e] z-50 flex flex-col font-mono text-sm"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {/* 标题栏 */}
            <div className="bg-gray-800 px-4 py-1 text-gray-400 flex justify-between items-center border-b border-gray-700">
                <span>
                    {isK8sResource ? '🔧 ' : '📄 '}
                    {filePath}
                    {modified && ' [+]'}
                </span>
                <span className="text-xs">
                    {isK8sResource ? 'Kubernetes Resource Editor' : 'VIM - K8s Quest'}
                </span>
            </div>
            
            {/* 编辑区域 */}
            <div className="flex-1 flex overflow-hidden">
                {/* 行号 */}
                <div className="bg-gray-900 text-gray-500 text-right pr-2 pl-2 select-none border-r border-gray-700 overflow-hidden">
                    {lines.map((_, i) => (
                        <div 
                            key={i} 
                            className={`leading-6 ${i === cursorLine ? 'text-yellow-400' : ''}`}
                        >
                            {i + 1}
                        </div>
                    ))}
                </div>
                
                {/* 内容区域 */}
                <div className="flex-1 relative overflow-auto bg-[#1e1e1e]">
                    {mode === 'insert' ? (
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={handleTextChange}
                            onKeyUp={handleTextareaKeyUp}
                            onKeyDown={handleTextareaKeyDown}
                            className="absolute inset-0 w-full h-full bg-transparent text-gray-200 resize-none outline-none p-2 leading-6"
                            spellCheck={false}
                            autoFocus
                        />
                    ) : (
                        <div className="p-2 text-gray-200 whitespace-pre leading-6">
                            {lines.map((line, lineIndex) => (
                                <div key={lineIndex} className="relative">
                                    {line.split('').map((char, charIndex) => (
                                        <span
                                            key={charIndex}
                                            className={
                                                lineIndex === cursorLine && charIndex === cursorCol
                                                    ? 'bg-gray-400 text-black'
                                                    : ''
                                            }
                                        >
                                            {char}
                                        </span>
                                    ))}
                                    {lineIndex === cursorLine && cursorCol >= line.length && (
                                        <span className="bg-gray-400 text-black">&nbsp;</span>
                                    )}
                                    {line === '' && lineIndex !== cursorLine && <span>&nbsp;</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            {/* 状态栏 */}
            <div className="bg-gray-800 border-t border-gray-700 flex">
                <div className="flex-1 px-2 py-1 text-white">
                    {mode === 'command' ? (
                        <span className="text-white">:{commandBuffer}<span className="animate-pulse">|</span></span>
                    ) : (
                        <span className={mode === 'insert' ? 'text-green-400' : 'text-gray-400'}>
                            {getModeText()}
                        </span>
                    )}
                    {statusMessage && <span className="text-yellow-400 ml-4">{statusMessage}</span>}
                </div>
                <div className="px-4 py-1 text-gray-400">
                    {cursorLine + 1},{cursorCol + 1}
                </div>
            </div>
            
            {/* 帮助提示 */}
            {mode === 'normal' && !statusMessage && (
                <div className="absolute bottom-8 right-4 text-xs text-gray-500">
                    i:插入 | :w保存 | :q退出 | :wq保存退出 | Ctrl+]:缩进 | Ctrl+[:取消缩进
                </div>
            )}
        </div>
    );
};
