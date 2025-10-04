import React, { useState, useRef } from 'react';
import { Menu, MessageSquare, Trash2, Zap, Globe, User, Hash, Send, Upload, Phone, Video, PhoneOff } from 'lucide-react';

interface User {
    id: string;
    alias?: string;
    name?: string;
    email?: string;
    avatar?: string;
}

interface WebSocketMessage {
    event: string;
    topic?: string;
    to?: string;
    data?: any;
    code?: number;
    id?: string;
    threadId?: string;
    replyTo?: string;
    from?: string;
    timestamp?: Date;
}

interface MainContentProps {
    isConnected: boolean;
    messages: WebSocketMessage[];
    messageType: 'broadcast' | 'direct' | 'topic';
    selectedRecipient: string;
    selectedTopic: string;
    users: User[];
    subscriptions: string[];
    isTyping: boolean;
    currentUserId?: string;
    onToggleSidebar: () => void;
    onMessageTypeChange: (type: 'broadcast' | 'direct' | 'topic') => void;
    onRecipientChange: (recipient: string) => void;
    onTopicChange: (topic: string) => void;
    onSendMessage: (message: string) => void;
    onSendFile: (file: File) => void;
    onClearMessages: () => void;
    onPing: () => void;
    onSendTyping: (isTyping: boolean) => void;
    onStartCall?: (type: 'audio' | 'video', recipientId: string) => void;
}

const MainContent: React.FC<MainContentProps> = ({
    isConnected,
    messages,
    messageType,
    selectedRecipient,
    selectedTopic,
    users,
    subscriptions,
    isTyping,
    currentUserId,
    onToggleSidebar,
    onMessageTypeChange,
    onRecipientChange,
    onTopicChange,
    onSendMessage,
    onSendFile,
    onClearMessages,
    onPing,
    onSendTyping,
    onStartCall
}) => {
    const [messageInput, setMessageInput] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingTimerRef = useRef<number | null>(null);
    const typingDelay = 1000; // 1 second delay

    // Calculate message stats
    const messageStats = {
        total: messages.length,
        broadcast: messages.filter(m => m.event === 'broadcast').length,
        direct: messages.filter(m => m.event === 'direct').length,
        topic: messages.filter(m => m.event === 'topic' || m.event === 'published').length,
        file: messages.filter(m => m.event === 'file').length
    };

    const handleSendMessage = () => {
        if (messageInput.trim()) {
            onSendMessage(messageInput.trim());
            setMessageInput('');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMessageInput(e.target.value);

        // Typing detection
        if (isConnected) {
            onSendTyping(true);

            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }

            typingTimerRef.current = window.setTimeout(() => {
                onSendTyping(false);
            }, typingDelay);
        }
    };

    const handleInputBlur = () => {
        if (isConnected) {
            onSendTyping(false);
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }
        }
    };

    const handleSendFile = () => {
        if (selectedFile) {
            onSendFile(selectedFile);
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const getMessageTypeIcon = (event: string) => {
        switch (event) {
            case 'broadcast':
                return <Globe className="w-4 h-4" />;
            case 'direct':
                return <User className="w-4 h-4" />;
            case 'published':
            case 'topic':
                return <Hash className="w-4 h-4" />;
            case 'file':
                return <MessageSquare className="w-4 h-4" />;
            default:
                return <MessageSquare className="w-4 h-4" />;
        }
    };

    const getMessageTypeColor = (event: string) => {
        switch (event) {
            case 'broadcast':
                return 'text-blue-600 bg-blue-100';
            case 'direct':
                return 'text-green-600 bg-green-100';
            case 'published':
            case 'topic':
                return 'text-purple-600 bg-purple-100';
            case 'system':
                return 'text-gray-600 bg-gray-100';
            case 'file':
                return 'text-orange-600 bg-orange-100';
            default:
                return 'text-slate-600 bg-slate-100';
        }
    };

    const getMessageContent = (message: WebSocketMessage) => {
        if (message.data && typeof message.data === 'object' && message.data.message) {
            return message.data.message;
        } else if (message.data && typeof message.data === 'string') {
            return message.data;
        } else if (message.event === 'file') {
            const filename = message.data?.filename || 'Unknown file';
            const size = message.data?.size || 0;
            const downloadUrl = message.data?.downloadUrl;
            const formatSize = (bytes: number) => {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            };

            if (downloadUrl) {
                return (
                    <div className="flex items-center space-x-2">
                        <span>📎 {filename} ({formatSize(size)})</span>
                        <button
                            onClick={() => {
                                const a = document.createElement('a');
                                a.href = downloadUrl;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                            }}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors"
                        >
                            Download
                        </button>
                    </div>
                );
            } else {
                return `📎 File: ${filename} (${formatSize(size)})`;
            }
        }
        return message.data || 'Unknown message';
    };

    return (
        <div className="flex-1 h-full">
            {/* Top Navigation */}
            <nav className="bg-white shadow-sm border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                        <button
                            onClick={onToggleSidebar}
                            className="lg:hidden text-slate-600 hover:text-slate-800 transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex items-center space-x-3">
                            <h2 className="text-lg sm:text-xl font-semibold text-slate-800">Dashboard</h2>
                            {currentUserId && currentUserId !== 'connecting...' && (
                                <div className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg">
                                    ID: {currentUserId}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center space-x-3 sm:space-x-4">

                        {/* Call buttons for direct messages */}
                        {messageType === 'direct' && selectedRecipient && onStartCall && (
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => onStartCall('audio', selectedRecipient)}
                                    className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Audio call"
                                >
                                    <Phone className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => onStartCall('video', selectedRecipient)}
                                    className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Video call"
                                >
                                    <Video className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        <div className="hidden md:flex items-center space-x-2 text-sm text-slate-600">
                            <div className="w-4 h-4" /> {/* Activity icon placeholder */}
                            <span>Real-time updates active</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-xs sm:text-sm text-slate-600">{isConnected ? 'Live' : 'Offline'}</span>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Dashboard */}
            <div className="p-6 space-y-6">

                {/* Messages */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-semibold text-slate-800 flex items-center">
                            <MessageSquare className="w-5 h-5 mr-2 text-slate-600" />
                            Messages
                        </h3>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={onClearMessages}
                                className="px-3 py-1 text-slate-600 hover:text-slate-800 text-sm"
                            >
                                <Trash2 className="w-4 h-4 inline mr-1" />
                                Clear
                            </button>
                            <button
                                onClick={onPing}
                                disabled={!isConnected}
                                className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                                <Zap className="w-4 h-4 inline mr-1" />
                                Ping
                            </button>
                        </div>
                    </div>

                    {/* Message Log */}
                    <div className="h-80 overflow-y-auto bg-slate-50 rounded-lg p-4 space-y-3 mb-6">
                        {messages.length === 0 ? (
                            <div className="text-center text-slate-500 py-8">
                                No messages yet. Connect and start chatting!
                            </div>
                        ) : (
                            messages.map((message) => (
                                <div key={message.id || Math.random()} className="flex items-start space-x-3">
                                    <div className={`p-2 rounded-lg ${getMessageTypeColor(message.event)}`}>
                                        {getMessageTypeIcon(message.event)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-2 mb-1">
                                            <span className="text-sm font-medium text-slate-700">
                                                {message.from || 'System'}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {message.timestamp ? message.timestamp.toLocaleTimeString() : new Date().toLocaleTimeString()}
                                            </span>
                                            {message.topic && (
                                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                                    #{message.topic}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-slate-600">{getMessageContent(message)}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Typing Indicator */}
                    {isTyping && (
                        <div className="text-xs italic text-slate-500 text-center py-2 fade-in">
                            Someone is typing...
                        </div>
                    )}

                    {/* Message Composer */}
                    <div className="border-t border-slate-200 pt-6">
                        {/* Message Type Selector */}
                        <div className="mb-4">
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => onMessageTypeChange('broadcast')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${messageType === 'broadcast'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    <Globe className="w-4 h-4 inline mr-1" />
                                    Broadcast
                                </button>
                                <button
                                    onClick={() => onMessageTypeChange('direct')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${messageType === 'direct'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    <User className="w-4 h-4 inline mr-1" />
                                    Direct
                                </button>
                                <button
                                    onClick={() => onMessageTypeChange('topic')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${messageType === 'topic'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    <Hash className="w-4 h-4 inline mr-1" />
                                    Topic
                                </button>
                            </div>
                        </div>

                        {/* Message Input */}
                        <div className="mb-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="text"
                                    value={messageInput}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Type your message..."
                                    className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                {messageType === 'direct' && (
                                    <select
                                        value={selectedRecipient}
                                        onChange={(e) => onRecipientChange(e.target.value)}
                                        className="px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Select recipient...</option>
                                        {users.map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {user.alias}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {messageType === 'topic' && (
                                    <select
                                        value={selectedTopic}
                                        onChange={(e) => onTopicChange(e.target.value)}
                                        className="px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Select topic...</option>
                                        {subscriptions.map((topic) => (
                                            <option key={topic} value={topic}>
                                                #{topic}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!isConnected || !messageInput.trim()}
                                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send className="w-4 h-4 inline mr-1" />
                                    Send
                                </button>
                            </div>
                        </div>

                        {/* File Upload */}
                        <div className="border-t border-slate-200 pt-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Send File
                                </label>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        onChange={handleFileSelect}
                                        className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                                    />
                                    <button
                                        onClick={handleSendFile}
                                        disabled={!isConnected || !selectedFile}
                                        className="px-4 sm:px-6 py-3 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Upload className="w-4 h-4 inline mr-1" />
                                        <span className="hidden sm:inline">Send File</span>
                                    </button>
                                </div>
                                {selectedFile && (
                                    <p className="mt-2 text-sm text-slate-600">
                                        Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default MainContent;
