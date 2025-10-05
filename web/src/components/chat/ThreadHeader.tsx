import React from 'react';
import { Hash, MessageCircle, Phone, Video, Users, Info } from 'lucide-react';
import type { Thread } from '../../types/thread';

interface ThreadHeaderProps {
    thread: Thread | null;
    isConnected: boolean;
    onStartAudioCall?: () => void;
    onStartVideoCall?: () => void;
}

const ThreadHeader: React.FC<ThreadHeaderProps> = ({
    thread,
    isConnected,
    onStartAudioCall,
    onStartVideoCall
}) => {
    if (!thread) {
        return (
            <div className="h-16 bg-white dark:bg-gray-50 border-b border-gray-200 dark:border-gray-700 flex items-center px-6">
                <div className="text-gray-500 dark:text-gray-400">Select a conversation to start messaging</div>
            </div>
        );
    }

    const getThreadIcon = () => {
        switch (thread.type) {
            case 'broadcast':
                return <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
            case 'topic':
                return <Hash className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
            case 'direct':
                return <div className="w-2 h-2 bg-green-400 rounded-full" />;
            default:
                return null;
        }
    };

    const getThreadName = () => {
        if (thread.type === 'topic' && thread.topicName) {
            return thread.topicName;
        }
        return thread.name;
    };

    const getThreadDescription = () => {
        switch (thread.type) {
            case 'broadcast':
                return 'Company-wide announcements and updates';
            case 'topic':
                return `Channel: #${thread.topicName || thread.name}`;
            case 'direct':
                return 'Direct message';
            default:
                return '';
        }
    };

    const showCallButtons = isConnected && (thread.type === 'direct' || thread.type === 'topic' || thread.type === 'broadcast');

    return (
        <div className="h-16 bg-white dark:bg-gray-50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
            <div className="flex items-center space-x-3">
                {getThreadIcon()}
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{getThreadName()}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{getThreadDescription()}</p>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                {showCallButtons && (
                    <>
                        <button
                            onClick={onStartAudioCall}
                            disabled={!isConnected}
                            className="p-2 text-gray-600 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Start audio call"
                        >
                            <Phone className="w-5 h-5" />
                        </button>
                        <button
                            onClick={onStartVideoCall}
                            disabled={!isConnected}
                            className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Start video call"
                        >
                            <Video className="w-5 h-5" />
                        </button>
                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
                    </>
                )}

                {thread.type === 'topic' && (
                    <button
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        title="Channel details"
                    >
                        <Users className="w-5 h-5" />
                    </button>
                )}

                <button
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    title="Thread details"
                >
                    <Info className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default ThreadHeader;
