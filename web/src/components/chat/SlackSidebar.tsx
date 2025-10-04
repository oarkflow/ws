import React, { useState } from 'react';
import { Hash, MessageCircle, Plus, ChevronDown, ChevronRight, Users, Wifi, WifiOff } from 'lucide-react';
import type { Thread } from '../../types/thread';
import type { User } from '../../hooks/useWebSocket';

interface SlackSidebarProps {
    isConnected: boolean;
    threads: Thread[];
    activeThread: Thread | null;
    users: User[];
    currentUserId?: string;
    workspaceName: string;
    currentUserAlias: string;
    onThreadSelect: (thread: Thread) => void;
    onCreateChannel: () => void;
    onUserSelect: (userId: string) => void;
    onConnect: () => void;
    onDisconnect: () => void;
}

const SlackSidebar: React.FC<SlackSidebarProps> = ({
    isConnected,
    threads,
    activeThread,
    users,
    currentUserId,
    workspaceName,
    currentUserAlias,
    onThreadSelect,
    onCreateChannel,
    onUserSelect,
    onConnect,
    onDisconnect
}) => {
    const [channelsExpanded, setChannelsExpanded] = useState(true);
    const [directMessagesExpanded, setDirectMessagesExpanded] = useState(true);

    // Separate threads by type
    const broadcastThread = threads.find(t => t.type === 'broadcast');
    const channelThreads = threads.filter(t => t.type === 'topic');
    const directThreads = threads.filter(t => t.type === 'direct');

    // Get users who don't have a DM thread yet
    const usersWithoutThread = users.filter(user => {
        if (user.id === currentUserId) return false;
        return !directThreads.some(thread => thread.recipientId === user.id);
    });

    const handleUserClick = (userId: string) => {
        // Check if thread exists for this user
        const existingThread = directThreads.find(t => t.recipientId === userId);
        if (existingThread) {
            onThreadSelect(existingThread);
        } else {
            // Create new DM thread
            onUserSelect(userId);
        }
    };

    return (
        <div className="h-full w-64 bg-purple-900 text-white flex flex-col">
            {/* Workspace Header */}
            <div className="p-4 border-b border-purple-800">
                <div className="flex items-center justify-between mb-3">
                    <h1 className="text-lg font-bold truncate">{workspaceName}</h1>
                    <div className="flex items-center space-x-1">
                        {isConnected ? (
                            <button
                                onClick={onDisconnect}
                                className="p-1 hover:bg-purple-800 rounded transition-colors"
                                title="Disconnect"
                            >
                                <Wifi className="w-4 h-4 text-green-400" />
                            </button>
                        ) : (
                            <button
                                onClick={onConnect}
                                className="p-1 hover:bg-purple-800 rounded transition-colors"
                                title="Connect"
                            >
                                <WifiOff className="w-4 h-4 text-red-400" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-sm text-purple-300 truncate">
                    {currentUserAlias}
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Broadcast / All Messages */}
                {broadcastThread && (
                    <div className="px-2 py-2">
                        <button
                            onClick={() => onThreadSelect(broadcastThread)}
                            className={`w-full flex items-center space-x-2 px-3 py-2 rounded hover:bg-purple-800 transition-colors ${activeThread?.id === broadcastThread.id ? 'bg-purple-700' : ''
                                }`}
                        >
                            <MessageCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="flex-1 text-left truncate">{broadcastThread.name}</span>
                            {(broadcastThread.unreadCount || 0) > 0 && (
                                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                    {broadcastThread.unreadCount}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                {/* Channels Section */}
                <div className="px-2 py-2">
                    <div className="w-full flex items-center space-x-2 px-2 py-1 text-sm font-semibold text-purple-300">
                        <button
                            onClick={() => setChannelsExpanded(!channelsExpanded)}
                            className="flex items-center space-x-2 flex-1 hover:text-white transition-colors"
                        >
                            {channelsExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                            <span className="text-left">Channels</span>
                        </button>
                        <button
                            onClick={onCreateChannel}
                            className="p-1 hover:bg-purple-800 hover:text-white rounded transition-colors"
                            title="Create channel"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {channelsExpanded && (
                        <div className="mt-1 space-y-0.5">
                            {channelThreads.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-purple-400">
                                    No channels yet
                                </div>
                            ) : (
                                channelThreads.map(thread => (
                                    <button
                                        key={thread.id}
                                        onClick={() => onThreadSelect(thread)}
                                        className={`w-full flex items-center space-x-2 px-3 py-2 rounded hover:bg-purple-800 transition-colors ${activeThread?.id === thread.id ? 'bg-purple-700' : ''
                                            }`}
                                    >
                                        <Hash className="w-4 h-4 flex-shrink-0 text-purple-300" />
                                        <span className="flex-1 text-left text-sm truncate">
                                            {thread.topicName || thread.name}
                                        </span>
                                        {(thread.unreadCount || 0) > 0 && (
                                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                                {thread.unreadCount}
                                            </span>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Direct Messages Section */}
                <div className="px-2 py-2">
                    <button
                        onClick={() => setDirectMessagesExpanded(!directMessagesExpanded)}
                        className="w-full flex items-center space-x-2 px-2 py-1 text-sm font-semibold text-purple-300 hover:text-white transition-colors"
                    >
                        {directMessagesExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        <span className="flex-1 text-left">Direct Messages</span>
                        <span className="text-xs bg-purple-800 px-2 py-0.5 rounded-full">
                            {users.filter(u => u.id !== currentUserId).length}
                        </span>
                    </button>

                    {directMessagesExpanded && (
                        <div className="mt-1 space-y-0.5">
                            {/* Existing DM threads */}
                            {directThreads.map(thread => {
                                const user = users.find(u => u.id === thread.recipientId);
                                return (
                                    <button
                                        key={thread.id}
                                        onClick={() => onThreadSelect(thread)}
                                        className={`w-full flex items-center space-x-2 px-3 py-2 rounded hover:bg-purple-800 transition-colors ${activeThread?.id === thread.id ? 'bg-purple-700' : ''
                                            }`}
                                    >
                                        <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
                                        <span className="flex-1 text-left text-sm truncate">
                                            {user?.alias || thread.name}
                                        </span>
                                        {(thread.unreadCount || 0) > 0 && (
                                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                                {thread.unreadCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}

                            {/* Available users without threads */}
                            {usersWithoutThread.length > 0 && (
                                <>
                                    <div className="px-3 py-2 text-xs text-purple-400 font-semibold">
                                        <Users className="w-3 h-3 inline mr-1" />
                                        Available Users
                                    </div>
                                    {usersWithoutThread.map(user => (
                                        <button
                                            key={user.id}
                                            onClick={() => handleUserClick(user.id)}
                                            className="w-full flex items-center space-x-2 px-3 py-2 rounded hover:bg-purple-800 transition-colors opacity-70 hover:opacity-100"
                                        >
                                            <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
                                            <span className="flex-1 text-left text-sm truncate">
                                                {user.alias || user.id}
                                            </span>
                                        </button>
                                    ))}
                                </>
                            )}

                            {users.filter(u => u.id !== currentUserId).length === 0 && (
                                <div className="px-3 py-2 text-sm text-purple-400">
                                    No users online
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Connection Status Footer */}
            <div className="p-3 border-t border-purple-800 text-xs">
                <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-purple-300">
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default SlackSidebar;
