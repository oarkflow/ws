import React, { useState, useRef } from 'react';
import { Send, Paperclip, X } from 'lucide-react';

interface MessageInputProps {
    onSendMessage: (message: string, file?: File) => void;
    onTyping: (isTyping: boolean) => void;
    isConnected: boolean;
    placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
    onSendMessage,
    onTyping,
    isConnected,
    placeholder = 'Type a message...'
}) => {
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingTimerRef = useRef<number | null>(null);

    const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMessage(e.target.value);

        // Typing indicator
        if (isConnected) {
            onTyping(true);

            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }

            typingTimerRef.current = window.setTimeout(() => {
                onTyping(false);
            }, 1000);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSend = () => {
        if (!isConnected) return;

        // Can send if we have message or file
        if (message.trim() || selectedFile) {
            onSendMessage(message.trim(), selectedFile || undefined);
            setMessage('');
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            onTyping(false);
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="bg-white dark:bg-gray-50 border-t border-gray-200 dark:border-gray-700 p-4">
            {/* File Preview */}
            {selectedFile && (
                <div className="mb-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <Paperclip className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {selectedFile.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                    </div>
                    <button
                        onClick={handleRemoveFile}
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Message Input */}
            <div className="flex items-end space-x-2">
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                {/* Attach button */}
                <button
                    onClick={handleAttachClick}
                    disabled={!isConnected}
                    className="p-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    title="Attach file"
                >
                    <Paperclip className="w-6 h-6" />
                </button>

                {/* Text input */}
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={message}
                        onChange={handleMessageChange}
                        onKeyPress={handleKeyPress}
                        placeholder={placeholder}
                        disabled={!isConnected}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed bg-white dark:bg-gray-50 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    />
                </div>

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={!isConnected || (!message.trim() && !selectedFile)}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    title="Send message"
                >
                    <Send className="w-6 h-6" />
                </button>
            </div>

            {/* Hint text */}
            {!isConnected && (
                <p className="text-xs text-red-500 mt-2">
                    Not connected. Please connect to send messages.
                </p>
            )}
        </div>
    );
};

export default MessageInput;
