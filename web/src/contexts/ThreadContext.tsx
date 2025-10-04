import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Thread, ThreadMessage } from '../types/thread';

interface ThreadContextType {
    activeThread: Thread | null;
    threads: Thread[];
    threadMessages: Map<string, ThreadMessage[]>;
    setActiveThread: (thread: Thread | null) => void;
    addThread: (thread: Thread) => void;
    removeThread: (threadId: string) => void;
    addMessage: (threadId: string, message: ThreadMessage) => void;
    getThreadMessages: (threadId: string) => ThreadMessage[];
    updateThread: (threadId: string, updates: Partial<Thread>) => void;
    markThreadAsRead: (threadId: string) => void;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export const useThreadContext = () => {
    const context = useContext(ThreadContext);
    if (!context) {
        throw new Error('useThreadContext must be used within a ThreadProvider');
    }
    return context;
};

interface ThreadProviderProps {
    children: ReactNode;
}

export const ThreadProvider: React.FC<ThreadProviderProps> = ({ children }) => {
    const [activeThread, setActiveThreadState] = useState<Thread | null>(null);
    const [threads, setThreads] = useState<Thread[]>([
        {
            id: 'broadcast',
            type: 'broadcast',
            name: 'All Messages',
            unreadCount: 0
        }
    ]);
    const [threadMessages, setThreadMessages] = useState<Map<string, ThreadMessage[]>>(new Map());

    const markThreadAsRead = useCallback((threadId: string) => {
        setThreads(prev => prev.map(thread =>
            thread.id === threadId ? { ...thread, unreadCount: 0 } : thread
        ));
    }, []);

    const setActiveThread = useCallback((thread: Thread | null) => {
        setActiveThreadState(thread);
        // Mark as read when opening a thread
        if (thread) {
            markThreadAsRead(thread.id);
        }
    }, [markThreadAsRead]);

    const addThread = useCallback((thread: Thread) => {
        setThreads(prev => {
            // Check if thread already exists
            const exists = prev.find(t => t.id === thread.id);
            if (exists) {
                return prev;
            }
            return [...prev, thread];
        });
    }, []);

    const removeThread = useCallback((threadId: string) => {
        setThreads(prev => prev.filter(t => t.id !== threadId));
        setThreadMessages(prev => {
            const newMap = new Map(prev);
            newMap.delete(threadId);
            return newMap;
        });
    }, []);

    const addMessage = useCallback((threadId: string, message: ThreadMessage) => {
        setThreadMessages(prev => {
            const newMap = new Map(prev);
            const messages = newMap.get(threadId) || [];

            // Check if message already exists to prevent duplicates
            const messageExists = messages.some(m => m.id === message.id);
            if (messageExists) {
                return prev;
            }

            newMap.set(threadId, [...messages, message]);
            return newMap;
        });

        // Update thread last message info
        setThreads(prev => prev.map(thread => {
            if (thread.id === threadId) {
                // Get preview text based on message type
                let previewText = '';
                if (message.type === 'file') {
                    previewText = `📎 ${message.fileName || 'File'}`;
                } else if (typeof message.content === 'string') {
                    previewText = message.content.substring(0, 50);
                } else {
                    previewText = 'Message';
                }

                return {
                    ...thread,
                    lastMessage: previewText,
                    lastMessageTime: message.timestamp,
                    unreadCount: activeThread?.id === threadId ? 0 : (thread.unreadCount || 0) + 1
                };
            }
            return thread;
        }));
    }, [activeThread]);

    const getThreadMessages = useCallback((threadId: string): ThreadMessage[] => {
        return threadMessages.get(threadId) || [];
    }, [threadMessages]);

    const updateThread = useCallback((threadId: string, updates: Partial<Thread>) => {
        setThreads(prev => prev.map(thread =>
            thread.id === threadId ? { ...thread, ...updates } : thread
        ));
    }, []);

    const value: ThreadContextType = {
        activeThread,
        threads,
        threadMessages,
        setActiveThread,
        addThread,
        removeThread,
        addMessage,
        getThreadMessages,
        updateThread,
        markThreadAsRead
    };

    return (
        <ThreadContext.Provider value={value}>
            {children}
        </ThreadContext.Provider>
    );
};
