import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, File, Image, Video, Music, Archive, X } from 'lucide-react';
import type { ThreadMessage } from '../../types/thread';

interface MessageThreadProps {
    messages: ThreadMessage[];
    currentUserId?: string;
    isTyping?: boolean;
}

const MessageThread: React.FC<MessageThreadProps> = ({
    messages,
    currentUserId,
    isTyping = false
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const formatTime = (date: Date) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const handleDownload = (url: string, filename: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const getFileType = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
        const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
        const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a'];
        const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
        const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];

        if (imageExts.includes(ext)) return 'image';
        if (videoExts.includes(ext)) return 'video';
        if (audioExts.includes(ext)) return 'audio';
        if (archiveExts.includes(ext)) return 'archive';
        if (docExts.includes(ext)) return 'document';

        return 'file';
    };

    const getFileIcon = (filename: string) => {
        const type = getFileType(filename);
        const iconClass = "w-8 h-8";

        switch (type) {
            case 'image':
                return <Image className={iconClass} />;
            case 'video':
                return <Video className={iconClass} />;
            case 'audio':
                return <Music className={iconClass} />;
            case 'archive':
                return <Archive className={iconClass} />;
            case 'document':
                return <FileText className={iconClass} />;
            default:
                return <File className={iconClass} />;
        }
    };

    const isOwnMessage = (message: ThreadMessage) => {
        return currentUserId && message.from === currentUserId;
    };

    return (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-50 px-6 py-4">
            {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                        <p className="text-lg font-medium">No messages yet</p>
                        <p className="text-sm mt-2">Start the conversation by sending a message</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {messages.map((message) => {
                        const isOwn = isOwnMessage(message);

                        return (
                            <div
                                key={message.id}
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-2xl ${isOwn ? 'order-2' : 'order-1'}`}>
                                    {/* Message Header */}
                                    {!isOwn && (
                                        <div className="flex items-center space-x-2 mb-1 px-3">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {message.fromAlias || message.from}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {formatTime(message.timestamp)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Message Content */}
                                    {message.type === 'text' && (
                                        <div
                                            className={`px-4 py-2 rounded-lg ${isOwn
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                                }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap break-words">
                                                {message.content}
                                            </p>
                                        </div>
                                    )}

                                    {message.type === 'file' && (
                                        <div
                                            className={`rounded-lg border overflow-hidden ${isOwn
                                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                                }`}
                                        >
                                            {/* Image Preview */}
                                            {(() => {
                                                const fileType = getFileType(message.fileName || '');
                                                const hasUrl = !!message.fileUrl;
                                                console.log('🎨 Rendering file:', {
                                                    fileName: message.fileName,
                                                    fileType,
                                                    hasUrl,
                                                    fileUrl: message.fileUrl,
                                                    shouldShowImage: hasUrl && fileType === 'image'
                                                });
                                                return null;
                                            })()}
                                            {message.fileUrl && getFileType(message.fileName || '') === 'image' && (
                                                <div
                                                    className="cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => setPreviewImage({
                                                        url: message.fileUrl!,
                                                        name: message.fileName || 'Image'
                                                    })}
                                                >
                                                    <img
                                                        src={message.fileUrl}
                                                        alt={message.fileName || 'Attached image'}
                                                        className="max-w-sm max-h-64 w-full object-contain bg-gray-100 dark:bg-gray-800"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            )}

                                            {/* File Info */}
                                            <div className="flex items-center space-x-3 px-4 py-3">
                                                <div className="flex-shrink-0 text-gray-600 dark:text-gray-400">
                                                    {getFileIcon(message.fileName || '')}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                        {message.fileName || 'File'}
                                                    </p>
                                                    {message.fileSize && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            {formatFileSize(message.fileSize)}
                                                        </p>
                                                    )}
                                                </div>
                                                {message.fileUrl && (
                                                    <button
                                                        onClick={() =>
                                                            handleDownload(
                                                                message.fileUrl!,
                                                                message.fileName || 'download'
                                                            )
                                                        }
                                                        className="flex-shrink-0 p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                        title="Download file"
                                                    >
                                                        <Download className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {message.type === 'system' && (
                                        <div className="text-center">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                                                {message.content}
                                            </span>
                                        </div>
                                    )}

                                    {/* Own message timestamp */}
                                    {isOwn && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1 px-3">
                                            {formatTime(message.timestamp)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Typing Indicator */}
            {isTyping && (
                <div className="flex items-center space-x-2 mt-4">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 italic">Someone is typing...</span>
                </div>
            )}

            <div ref={messagesEndRef} />

            {/* Image Preview Modal */}
            {previewImage && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-w-7xl max-h-full">
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
                            title="Close preview"
                        >
                            <X className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                        </button>
                        <img
                            src={previewImage.url}
                            alt={previewImage.name}
                            className="max-w-full max-h-[90vh] object-contain"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{previewImage.name}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(previewImage.url, previewImage.name);
                                }}
                                className="ml-4 p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                                title="Download image"
                            >
                                <Download className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessageThread;
