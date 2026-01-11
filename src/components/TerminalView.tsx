import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useGameStore } from '../engine/store';

interface TerminalViewProps {
    onCommand: (command: string) => Promise<string>;
    onComplete?: (partial: string) => string[];
}

export const TerminalView: React.FC<TerminalViewProps> = ({ onCommand, onComplete }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const commandRef = useRef<string>('');
    
    // 获取 exec 模式状态
    const execMode = useGameStore(state => state.execMode);
    const execModeRef = useRef(execMode);
    
    // 同步 execMode 到 ref
    useEffect(() => {
        execModeRef.current = execMode;
    }, [execMode]);

    // 命令历史
    const commandHistoryRef = useRef<string[]>([]);
    const historyIndexRef = useRef<number>(-1);
    const tempCommandRef = useRef<string>(''); // 临时保存当前正在输入的命令
    
    // 光标位置（相对于命令字符串）
    const cursorPosRef = useRef<number>(0);
    
    // 多行命令支持（反斜杠续行）
    const multilineBufferRef = useRef<string>('');

    // 使用ref保存最新的回调函数，避免因函数变化导致terminal重新挂载
    const onCommandRef = useRef(onCommand);
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onCommandRef.current = onCommand;
        onCompleteRef.current = onComplete;
    }, [onCommand, onComplete]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"JetBrains Mono", Consolas, monospace',
            fontSize: 14,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#ffffff',
            },
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        term.write('\r\n\x1b[1;34mWelcome to K8s Quest Terminal\x1b[0m\r\n');
        term.write('Type "help" for available commands.\r\n');
        term.write('\x1b[1;33mTip: Press TAB for completion, ↑↓ for history\x1b[0m\r\n\r\n');
        prompt(term);

        // 续行提示符
        const continuationPrompt = (t: Terminal) => {
            t.write('\x1b[32m> \x1b[0m');
        };

        term.onData((e: string) => {
            switch (e) {
                case '\r': // Enter
                    term.write('\r\n');
                    const currentLine = commandRef.current;
                    
                    // 检查是否以反斜杠结尾（续行）
                    if (currentLine.trimEnd().endsWith('\\')) {
                        // 去掉结尾的反斜杠，添加到缓冲区
                        const lineWithoutBackslash = currentLine.trimEnd().slice(0, -1);
                        multilineBufferRef.current += lineWithoutBackslash + ' ';
                        commandRef.current = '';
                        cursorPosRef.current = 0;
                        continuationPrompt(term);
                        break;
                    }
                    
                    // 合并多行命令
                    const fullCommand = (multilineBufferRef.current + currentLine).trim();
                    multilineBufferRef.current = ''; // 清空缓冲区
                    
                    if (fullCommand) {
                        // 添加到历史记录（避免重复的连续命令）
                        if (commandHistoryRef.current.length === 0 ||
                            commandHistoryRef.current[commandHistoryRef.current.length - 1] !== fullCommand) {
                            commandHistoryRef.current.push(fullCommand);
                        }
                        historyIndexRef.current = commandHistoryRef.current.length;
                        tempCommandRef.current = '';

                        handleCommand(fullCommand, term);
                    } else {
                        prompt(term);
                    }
                    commandRef.current = '';
                    cursorPosRef.current = 0;
                    break;

                case '\x1b[A': // 上键
                    if (commandHistoryRef.current.length > 0) {
                        // 第一次按上键时保存当前输入
                        if (historyIndexRef.current === commandHistoryRef.current.length) {
                            tempCommandRef.current = commandRef.current;
                        }

                        if (historyIndexRef.current > 0) {
                            historyIndexRef.current--;
                            const historyCmd = commandHistoryRef.current[historyIndexRef.current];

                            // 清除当前行并显示历史命令
                            term.write('\r\x1b[K');
                            prompt(term);
                            term.write(historyCmd);
                            commandRef.current = historyCmd;
                            cursorPosRef.current = historyCmd.length;
                        }
                    }
                    break;

                case '\x1b[B': // 下键
                    if (historyIndexRef.current < commandHistoryRef.current.length) {
                        historyIndexRef.current++;

                        let newCmd = '';
                        if (historyIndexRef.current === commandHistoryRef.current.length) {
                            // 回到最新的输入
                            newCmd = tempCommandRef.current;
                        } else {
                            newCmd = commandHistoryRef.current[historyIndexRef.current];
                        }

                        // 清除当前行并显示命令
                        term.write('\r\x1b[K');
                        prompt(term);
                        term.write(newCmd);
                        commandRef.current = newCmd;
                        cursorPosRef.current = newCmd.length;
                    }
                    break;
                    
                case '\x1b[D': // 左键
                    if (cursorPosRef.current > 0) {
                        cursorPosRef.current--;
                        term.write('\x1b[D'); // 移动光标向左
                    }
                    break;
                    
                case '\x1b[C': // 右键
                    if (cursorPosRef.current < commandRef.current.length) {
                        cursorPosRef.current++;
                        term.write('\x1b[C'); // 移动光标向右
                    }
                    break;
                    
                case '\x1b[H': // Home 键
                case '\x1b[1~': // Home 键 (某些终端)
                    if (cursorPosRef.current > 0) {
                        term.write(`\x1b[${cursorPosRef.current}D`);
                        cursorPosRef.current = 0;
                    }
                    break;
                    
                case '\x1b[F': // End 键
                case '\x1b[4~': // End 键 (某些终端)
                    if (cursorPosRef.current < commandRef.current.length) {
                        const moveRight = commandRef.current.length - cursorPosRef.current;
                        term.write(`\x1b[${moveRight}C`);
                        cursorPosRef.current = commandRef.current.length;
                    }
                    break;
                    
                case '\x1b[3~': // Delete 键
                    if (cursorPosRef.current < commandRef.current.length) {
                        const before = commandRef.current.slice(0, cursorPosRef.current);
                        const after = commandRef.current.slice(cursorPosRef.current + 1);
                        commandRef.current = before + after;
                        // 重写光标后的内容
                        term.write(after + ' ');
                        // 移动光标回原位
                        term.write(`\x1b[${after.length + 1}D`);
                    }
                    break;
                case '\t': // Tab - 补全（基于光标位置）
                    if (onCompleteRef.current) {
                        // 只对光标之前的内容进行补全
                        const beforeCursor = commandRef.current.slice(0, cursorPosRef.current);
                        const afterCursor = commandRef.current.slice(cursorPosRef.current);
                        
                        const completions = onCompleteRef.current(beforeCursor);
                        if (completions.length === 1) {
                            // 只有一个补全选项，直接替换光标前的内容
                            const completion = completions[0];
                            const newCommand = completion + afterCursor;
                            // 清除当前行
                            term.write('\r\x1b[K');
                            prompt(term);
                            term.write(newCommand);
                            commandRef.current = newCommand;
                            // 光标位置在补全内容末尾
                            cursorPosRef.current = completion.length;
                            // 如果有光标后的内容，移动光标回到正确位置
                            if (afterCursor.length > 0) {
                                term.write(`\x1b[${afterCursor.length}D`);
                            }
                        } else if (completions.length > 1) {
                            // 找到最长公共前缀
                            const findCommonPrefix = (strs: string[]): string => {
                                if (strs.length === 0) return '';
                                let prefix = strs[0];
                                for (let i = 1; i < strs.length; i++) {
                                    while (strs[i].indexOf(prefix) !== 0) {
                                        prefix = prefix.slice(0, -1);
                                        if (prefix === '') return '';
                                    }
                                }
                                return prefix;
                            };
                            
                            const commonPrefix = findCommonPrefix(completions);
                            
                            // 如果公共前缀比当前输入长，先补全到公共前缀
                            if (commonPrefix.length > beforeCursor.length) {
                                const newCommand = commonPrefix + afterCursor;
                                term.write('\r\x1b[K');
                                prompt(term);
                                term.write(newCommand);
                                commandRef.current = newCommand;
                                cursorPosRef.current = commonPrefix.length;
                                if (afterCursor.length > 0) {
                                    term.write(`\x1b[${afterCursor.length}D`);
                                }
                            }
                            
                            // 显示所有可能性
                            term.write('\r\n');
                            // 计算列宽
                            const maxLen = Math.max(...completions.map(c => c.trim().split(' ').pop()?.length || 0));
                            const cols = Math.floor(term.cols / (maxLen + 2)) || 1;

                            // 提取并显示补全选项（只显示最后一个单词）
                            const suggestions = completions.map(c => c.trim().split(' ').pop() || '');
                            for (let i = 0; i < suggestions.length; i++) {
                                if (i > 0 && i % cols === 0) {
                                    term.write('\r\n');
                                }
                                term.write(suggestions[i].padEnd(maxLen + 2));
                            }

                            // 重新显示提示符和当前输入
                            term.write('\r\n');
                            prompt(term);
                            term.write(commandRef.current);
                            // 移动光标回到原来的位置
                            if (afterCursor.length > 0) {
                                term.write(`\x1b[${afterCursor.length}D`);
                            }
                        }
                    }
                    break;
                case '\u007F': // Backspace
                    if (cursorPosRef.current > 0) {
                        const before = commandRef.current.slice(0, cursorPosRef.current - 1);
                        const after = commandRef.current.slice(cursorPosRef.current);
                        commandRef.current = before + after;
                        cursorPosRef.current--;
                        
                        // 移动光标向左，重写后面的内容，清除最后一个字符
                        term.write('\b' + after + ' ');
                        // 移动光标回到正确位置
                        if (after.length > 0) {
                            term.write(`\x1b[${after.length + 1}D`);
                        } else {
                            term.write('\b');
                        }
                    }
                    break;
                default:
                    if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7E)) {
                        // 在光标位置插入字符
                        const before = commandRef.current.slice(0, cursorPosRef.current);
                        const after = commandRef.current.slice(cursorPosRef.current);
                        commandRef.current = before + e + after;
                        cursorPosRef.current++;
                        
                        // 写入字符和后面的内容
                        term.write(e + after);
                        // 如果后面有内容，移动光标回到插入点之后
                        if (after.length > 0) {
                            term.write(`\x1b[${after.length}D`);
                        }
                    }
            }
        });

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
        };
    }, []); // 移除依赖，只在挂载时初始化一次

    const prompt = (term: Terminal) => {
        if (execModeRef.current?.active) {
            // 容器 shell 提示符
            term.write(`\x1b[1;36mroot@${execModeRef.current.podName}\x1b[0m:/# `);
        } else {
            // 普通提示符
            term.write('\x1b[1;32muser@k8s-quest\x1b[0m:\x1b[1;34m~\x1b[0m$ ');
        }
    };

    const handleCommand = async (cmd: string, term: Terminal) => {
        try {
            const output = await onCommandRef.current(cmd);
            // Handle newlines in output properly for xterm
            const formattedOutput = output.replace(/\n/g, '\r\n');
            if (formattedOutput) {
                term.write(formattedOutput + '\r\n');
            }
        } catch (err) {
            term.write(`\x1b[1;31mError: ${err}\x1b[0m\r\n`);
        }
        prompt(term);
    };

    return (
        <div className="w-full h-full bg-[#1e1e1e] p-2 rounded-lg overflow-hidden shadow-2xl border border-gray-700">
            <div ref={terminalRef} className="w-full h-full" />
        </div>
    );
};
