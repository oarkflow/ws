import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast, ToastContainer } from '../common/Toast';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import CallScreen from '../call/CallScreen';
import DirectCallModal from '../call/DirectCallModal';

interface User {
    id: string;
    name: string;
    email: string;
    avatar: string;
}

interface ChatAppProps {
    user: User;
    token: string;
}

const ChatApp: React.FC<ChatAppProps> = ({ user, token }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentUserAlias, setCurrentUserAlias] = useState('');
    const [messageType, setMessageType] = useState<'broadcast' | 'direct' | 'topic'>('broadcast');
    const [selectedRecipient, setSelectedRecipient] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');

    // Call-related state
    const [currentCall, setCurrentCall] = useState<{ roomId: string; type: 'audio' | 'video'; participants: string[] } | null>(null);
    const [outgoingCall, setOutgoingCall] = useState<{ recipientId: string; type: 'audio' | 'video' } | null>(null);
    const [incomingCall, setIncomingCall] = useState<{ id: string; callerName: string; callerId: string; type: 'audio' | 'video' } | null>(null);

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
    } = useWebSocket('ws://localhost:8080/ws', token);

    // Remove auto-connect - manage connections manually only

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

    // Show toast for system events and handle call invitations
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

        // Handle call invitations and responses
        if (lastMessage && lastMessage.event === 'direct') {
            try {
                const data = typeof lastMessage.data === 'string' ? JSON.parse(lastMessage.data) : lastMessage.data;

                if (data.type === 'call_invitation' && data.callerId !== currentUser?.id) {
                    // Incoming call - show dialog
                    console.log('Incoming call detected:', data);
                    setIncomingCall({
                        id: data.roomId,
                        callerName: data.callerName,
                        callerId: data.callerId,
                        type: data.callType
                    });
                    showToast(`Incoming ${data.callType} call from ${data.callerName}`, 'info');
                } else if (data.type === 'call_accepted' && outgoingCall) {
                    // Call was accepted, start the call
                    console.log('Call accepted by recipient:', data);
                    setOutgoingCall(null);
                    setCurrentCall({
                        roomId: data.roomId,
                        type: data.callType,
                        participants: [currentUser?.id || '', data.accepterId]
                    });
                    showToast('Call accepted!', 'success');
                } else if (data.type === 'call_rejected' && outgoingCall) {
                    // Call was rejected
                    setOutgoingCall(null);
                    showToast('Call was rejected', 'info');
                } else if (data.type === 'call_cancelled' && incomingCall) {
                    // Call was cancelled
                    setIncomingCall(null);
                    showToast('Call was cancelled', 'info');
                }
            } catch (e) {
                // Not a JSON message, check if it's a plain text call invitation
                if (typeof lastMessage.data === 'string' && lastMessage.data.includes('call_invitation')) {
                    try {
                        const data = JSON.parse(lastMessage.data);
                        if (data.type === 'call_invitation' && data.callerId !== currentUser?.id) {
                            console.log('Incoming call detected from plain text:', data);
                            setIncomingCall({
                                id: data.roomId,
                                callerName: data.callerName,
                                callerId: data.callerId,
                                type: data.callType
                            });
                            showToast(`Incoming ${data.callType} call from ${data.callerName}`, 'info');
                        }
                    } catch (parseError) {
                        console.log('Failed to parse call invitation:', parseError);
                    }
                }
            }
        }
    }, [messages, currentUser, outgoingCall, incomingCall]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log('ChatApp unmounting - cleaning up any active calls');
            // Ensure any active calls are cleaned up
            if (currentCall) {
                setCurrentCall(null);
            }
            if (outgoingCall) {
                setOutgoingCall(null);
            }
            if (incomingCall) {
                setIncomingCall(null);
            }
        };
    }, []);

    const handleConnect = () => {
        if (!isConnected) {
            connect();
        }
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

    const handleStartCall = (type: 'audio' | 'video', recipientId: string) => {
        // Generate a unique room ID for the call
        const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setOutgoingCall({ recipientId, type });

        // Send call invitation to recipient
        const callData = {
            type: 'call_invitation',
            callType: type,
            roomId: roomId,
            callerId: currentUser?.id,
            callerName: currentUserAlias,
            recipientId: recipientId,
            timestamp: Date.now()
        };

        console.log('Sending call invitation:', callData);

        // Send via WebSocket to the recipient
        sendMessage(JSON.stringify(callData), 'direct', recipientId);
    };

    const handleAcceptCall = (callId: string) => {
        if (!incomingCall) return;

        console.log('Accepting call:', incomingCall);

        // Clear the incoming call dialog
        setIncomingCall(null);

        // Start the call using the room ID from the invitation
        setCurrentCall({
            roomId: incomingCall.id,
            type: incomingCall.type,
            participants: [currentUser?.id || '', incomingCall.callerId]
        });

        // Send acceptance back to caller
        const acceptData = {
            type: 'call_accepted',
            callType: incomingCall.type,
            roomId: incomingCall.id,
            accepterId: currentUser?.id,
            accepterName: currentUserAlias
        };

        console.log('Sending call acceptance:', acceptData);
        sendMessage(JSON.stringify(acceptData), 'direct', incomingCall.callerId);
    };

    const handleRejectCall = (callId: string) => {
        if (!incomingCall) return;

        setIncomingCall(null);

        // Send rejection back to caller
        const rejectData = {
            type: 'call_rejected',
            rejecterId: currentUser?.id,
            rejecterName: currentUserAlias
        };

        sendMessage(JSON.stringify(rejectData), 'direct', incomingCall.callerId);
    };

    const handleCancelCall = () => {
        if (!outgoingCall) return;

        setOutgoingCall(null);

        // Send cancellation to recipient
        const cancelData = {
            type: 'call_cancelled',
            callerId: currentUser?.id,
            callerName: currentUserAlias
        };

        sendMessage(JSON.stringify(cancelData), 'direct', outgoingCall.recipientId);
    };

    const handleLeaveCall = () => {
        // Stop any outgoing call state
        setOutgoingCall(null);

        // Clear current call state
        setCurrentCall(null);

        // Force a cleanup delay to ensure WebRTC has time to cleanup
        setTimeout(() => {
            // Additional cleanup if needed
            console.log('Call ended and cleaned up');
        }, 100);
    };

    return (
        <div className="h-screen w-screen bg-slate-50 flex relative overflow-hidden">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={toggleSidebar}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed lg:static top-0 left-0 h-full w-full lg:w-80 bg-white shadow-xl border-r border-slate-200 z-50 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } lg:translate-x-0`}>
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
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 relative">
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
                    onStartCall={handleStartCall}
                />
            </main>

            {/* Outgoing Call Modal */}
            {outgoingCall && (
                <DirectCallModal
                    isOpen={true}
                    type="outgoing"
                    callerName={currentUserAlias}
                    onReject={handleCancelCall}
                />
            )}

            {/* Incoming Call Modal */}
            {incomingCall && (
                <DirectCallModal
                    isOpen={true}
                    type="incoming"
                    callerName={incomingCall.callerName}
                    onAccept={() => handleAcceptCall(incomingCall.id)}
                    onReject={() => handleRejectCall(incomingCall.id)}
                />
            )}

            {/* Active Call Screen */}
            {currentCall && (
                <div className="fixed inset-0 bg-slate-900 z-50">
                    <CallScreen
                        roomId={currentCall.roomId}
                        displayName={currentUserAlias}
                        authToken="demo-token"
                        onLeaveCall={handleLeaveCall}
                    />
                </div>
            )}

            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} onClose={closeToast} />
        </div>
    );
};

export default ChatApp;
