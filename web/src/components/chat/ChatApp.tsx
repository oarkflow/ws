import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast, ToastContainer } from '../common/Toast';
import Sidebar from './Sidebar';
import MainContent from './MainContent';

const ChatApp: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentUserAlias, setCurrentUserAlias] = useState('');
    const [messageType, setMessageType] = useState<'broadcast' | 'direct' | 'topic'>('broadcast');
    const [selectedRecipient, setSelectedRecipient] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');

    const { toasts, showToast, closeToast } = useToast();

    const {
        isConnected,
        users,
        subscriptions,
        messages,
        currentUser,
        isTyping,
        connect,
        disconnect,
        sendMessage,
        sendFile,
        setAlias,
        subscribe,
        unsubscribe,
        sendTyping,
        sendPing,
        requestUserList,
        clearMessages
    } = useWebSocket('ws://localhost:8080/ws', 'mysecrettoken');

    // Show toast notifications for connection state changes
    useEffect(() => {
        if (isConnected) {
            showToast('Connected to WebSocket server', 'success');
            requestUserList();
        } else {
            showToast('Disconnected from server', 'warning');
        }
    }, [isConnected]);

    // Update current user alias when it changes
    useEffect(() => {
        if (currentUser) {
            setCurrentUserAlias(currentUser.alias);
        }
    }, [currentUser]);

    // Show toast for system events
    useEffect(() => {
        // Check for system messages
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.event === 'system') {
            if (lastMessage.data && lastMessage.data.type === 'user_connected') {
                showToast(`${lastMessage.data.alias || 'A user'} joined`, 'info');
            } else if (lastMessage.data && lastMessage.data.type === 'user_disconnected') {
                showToast(`${lastMessage.data.alias || 'A user'} left`, 'info');
            } else if (lastMessage.data && lastMessage.data.type === 'alias_change') {
                showToast(`User changed name to ${lastMessage.data.newAlias}`, 'info');
            }
        }
    }, [messages]);

    const handleConnect = () => {
        connect();
    };

    const handleDisconnect = () => {
        disconnect();
    };

    const handleSetAlias = (alias: string) => {
        setCurrentUserAlias(alias);
        setAlias(alias);
    };

    const handleSendMessage = (message: string) => {
        sendMessage(message, messageType, selectedRecipient, selectedTopic);
        // Add message to local state for immediate display
        // Note: In a real implementation, you'd wait for server confirmation
    };

    const handleSendFile = (file: File) => {
        if (messageType === 'direct' && selectedRecipient) {
            sendFile(file, selectedRecipient);
        } else if (messageType === 'topic' && selectedTopic) {
            sendFile(file, undefined, selectedTopic);
        } else {
            sendFile(file);
        }
    }; const handleSubscribe = (topic: string) => {
        subscribe(topic);
    };

    const handleUnsubscribe = (topic: string) => {
        unsubscribe(topic);
    };

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    return (
        <div className="h-screen bg-slate-50 flex flex-col lg:flex-row relative overflow-hidden">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden animate-in fade-in duration-300"
                    onClick={toggleSidebar}
                />
            )}

            {/* Sidebar */}
            <div className={`h-full transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } lg:translate-x-0 lg:relative lg:flex-shrink-0`}>
                <Sidebar
                    isOpen={sidebarOpen}
                    isConnected={isConnected}
                    users={users}
                    subscriptions={subscriptions}
                    currentUserAlias={currentUserAlias}
                    currentUserId={currentUser?.id}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onSetAlias={handleSetAlias}
                    onSubscribe={handleSubscribe}
                    onUnsubscribe={handleUnsubscribe}
                    onUserSelect={setSelectedRecipient}
                    onRefreshUsers={requestUserList}
                    onClose={toggleSidebar}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <MainContent
                    isConnected={isConnected}
                    messages={messages}
                    messageType={messageType}
                    selectedRecipient={selectedRecipient}
                    selectedTopic={selectedTopic}
                    users={users}
                    subscriptions={subscriptions}
                    isTyping={isTyping}
                    onToggleSidebar={toggleSidebar}
                    onMessageTypeChange={setMessageType}
                    onRecipientChange={setSelectedRecipient}
                    onTopicChange={setSelectedTopic}
                    onSendMessage={handleSendMessage}
                    onSendFile={handleSendFile}
                    onClearMessages={clearMessages}
                    onPing={sendPing}
                    onSendTyping={sendTyping}
                />
            </div>

            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} onClose={closeToast} />
        </div>
    );
};

export default ChatApp;
