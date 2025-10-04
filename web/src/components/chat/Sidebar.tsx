import React, { useState } from 'react';
import { MessageCircle, Users, Rss, X, Check, Wifi, WifiOff, RefreshCw, Plus } from 'lucide-react';

interface User {
    id: string;
    alias: string;
}

interface SidebarProps {
    isOpen: boolean;
    isConnected: boolean;
    users: User[];
    subscriptions: string[];
    currentUserAlias: string;
    currentUserId?: string | null;
    onConnect: () => void;
    onDisconnect: () => void;
    onSetAlias: (alias: string) => void;
    onSubscribe: (topic: string) => void;
    onUnsubscribe: (topic: string) => void;
    onUserSelect: (userId: string) => void;
    onRefreshUsers: () => void;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    isConnected,
    users,
    subscriptions,
    currentUserAlias,
    currentUserId,
    onConnect,
    onDisconnect,
    onSetAlias,
    onSubscribe,
    onUnsubscribe,
    onUserSelect,
    onRefreshUsers,
    onClose
}) => {
    const [aliasInput, setAliasInput] = useState(currentUserAlias);
    const [topicInput, setTopicInput] = useState('');

    const handleSetAlias = () => {
        if (aliasInput.trim()) {
            onSetAlias(aliasInput.trim());
        }
    };

    const handleSubscribe = () => {
        if (topicInput.trim()) {
            onSubscribe(topicInput.trim());
            setTopicInput('');
        }
    };

    const handleUserClick = (userId: string) => {
        onUserSelect(userId);
    };

    return (
        <div className={`h-full w-full lg:w-80 bg-white shadow-xl border-r border-slate-200 z-10 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:translate-x-0`}>
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-2 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                        <MessageCircle className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Chat Hub</h1>
                        <p className="text-sm text-blue-100">WebSocket Client</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="lg:hidden text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Connection Status Card */}
            <div className="p-2 border-b border-slate-200">
                <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-slate-600">Connection Status</span>
                        <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className={`text-sm font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>

                    <div className="flex space-x-2">
                        <button
                            onClick={onConnect}
                            disabled={isConnected}
                            className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Wifi className="w-4 h-4 inline mr-1" />
                            Connect
                        </button>
                        <button
                            onClick={onDisconnect}
                            disabled={!isConnected}
                            className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <WifiOff className="w-4 h-4 inline mr-1" />
                            Disconnect
                        </button>
                    </div>
                </div>
            </div>

            {/* User Profile Section */}
            <div className="p-6 border-b border-slate-200">
                <div className="flex items-center space-x-3 mb-4">
                    <div className="flex-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                value={aliasInput}
                                onChange={(e) => setAliasInput(e.target.value)}
                                placeholder="Your alias"
                                maxLength={20}
                                className="flex-1 px-3 py-1 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                                onClick={handleSetAlias}
                                disabled={!isConnected}
                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Users */}
            <div className="flex-1 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                        <Users className="w-5 h-5 mr-2 text-slate-600" />
                        Active Users
                    </h3>
                    <span className="bg-blue-100 text-blue-700 text-sm font-medium px-2 py-1 rounded-full">
                        {users.length}
                    </span>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {users.map((user) => {
                        const isCurrentUser = currentUserId && user.id === currentUserId;
                        console.log('User:', user, 'Current User ID:', currentUserId, 'Is Current:', isCurrentUser);
                        return (
                            <div
                                key={user.id}
                                onClick={() => !isCurrentUser && handleUserClick(user.id)}
                                className={`flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg transition-colors text-sm ${isCurrentUser
                                    ? 'bg-blue-50 border-blue-300'
                                    : 'cursor-pointer hover:bg-slate-50'
                                    }`}
                            >
                                <span className="truncate font-medium text-slate-800">
                                    {user.alias || user.id}
                                    {isCurrentUser && (
                                        <span className="ml-2 text-xs font-normal text-blue-600">(ME)</span>
                                    )}
                                </span>
                                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                            </div>
                        );
                    })}
                </div>

                <button
                    onClick={onRefreshUsers}
                    disabled={!isConnected}
                    className="w-full mt-4 px-3 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <RefreshCw className="w-4 h-4 inline mr-1" />
                    Refresh
                </button>
            </div>

            {/* Topic Subscriptions */}
            <div className="p-6 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                        <Rss className="w-5 h-5 mr-2 text-slate-600" />
                        Topics
                    </h3>
                </div>

                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        placeholder="Subscribe to topic"
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                        onClick={handleSubscribe}
                        disabled={!isConnected}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 min-h-[40px]">
                    {subscriptions.map((topic) => (
                        <span
                            key={topic}
                            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                        >
                            {topic}
                            <button
                                onClick={() => onUnsubscribe(topic)}
                                className="ml-1 text-blue-500 hover:text-blue-700"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            </div>

            {/* Sidebar Footer */}
            <div className="p-6 border-t border-slate-200 bg-slate-50">
                <div className="text-xs text-slate-500 text-center">
                    WebSocket Chat Client v2.0
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
