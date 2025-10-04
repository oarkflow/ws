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
    alias?: string;
}

interface ChatAppProps {
    user: User;
    token: string;
    wsConnection: any; // WebSocket hook
    userToken: string; // Actual user token
}

const ChatApp: React.FC<ChatAppProps> = ({ user, token, wsConnection, userToken }) => {
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
        clearMessages,
        wsRef
    } = wsConnection;


    // Show toast notifications for connection state changes
    useEffect(() => {
        if (isConnected) {
            requestUserList();
        }
    }, [isConnected]);

    // Set alias immediately when component mounts (user data is available from login)
    useEffect(() => {
        // Use name from login, or email if no name, or fallback to existing alias
        const displayAlias = user.name || user.email || user.alias || `User-${user.id.substring(0, 8)}`;
        console.log('🔄 SETTING ALIAS FROM LOGIN USER:', displayAlias, 'from:', { name: user.name, email: user.email, alias: user.alias });
        setCurrentUserAlias(displayAlias);

        // Set alias on WebSocket when connected
        if (isConnected) {
            setAlias(displayAlias);
        }
    }, [user.name, user.email, user.alias, setAlias, isConnected]);

    // Update current user alias when it changes
    useEffect(() => {
        console.log('🔄 CHATAPP CURRENT USER CHANGED:', currentUser);
        console.log('🔄 CURRENT USER ID:', currentUser?.id);
        if (currentUser) {
            setCurrentUserAlias(currentUser.alias);
            console.log('✅ SET ALIAS TO:', currentUser.alias);
        } else {
            console.log('❌ CURRENT USER IS NULL');
        }
    }, [currentUser]);

    // Show toast for system events and handle call invitations
    useEffect(() => {
        const ws = wsRef.current;
        if (!ws) return;
        ws.on("direct", (lastMessage: any) => {
            try {
                // Handle nested message structure from WebSocket
                let messageData = lastMessage.data;

                // If data contains a message field (nested structure), parse it
                if (messageData && typeof messageData === 'object' && messageData.message) {
                    messageData = typeof messageData.message === 'string' ? JSON.parse(messageData.message) : messageData.message;
                } else if (typeof messageData === 'string') {
                    messageData = JSON.parse(messageData);
                }

                console.log('🔍 Checking message data:', messageData);

                if (messageData?.type === 'call_invitation') {
                    console.log('🔴 INCOMING CALL DETECTED:', messageData, currentUser);
                    // Check if this call is for the current user
                    const isForCurrentUser = messageData.recipientId === currentUser?.id ||
                        (!messageData.recipientId && messageData.callerId !== currentUser?.id);

                    if (isForCurrentUser) {
                        // Incoming call - show dialog (don't add to messages)
                        console.log('🔴 INCOMING CALL DETECTED:', messageData);
                        console.log('Current user ID:', currentUser?.id);
                        console.log('Recipient ID:', messageData.recipientId);
                        console.log('Caller ID:', messageData.callerId);
                        setIncomingCall({
                            id: messageData.roomId,
                            callerName: messageData.callerName || 'Unknown Caller',
                            callerId: messageData.callerId,
                            type: messageData.callType
                        });
                        showToast(`📞 Incoming ${messageData.callType} call from ${messageData.callerName || 'Unknown'}`, 'info');
                        return; // Don't add to regular messages
                    }
                } else if (messageData && messageData.type === 'call_accepted' && outgoingCall) {
                    // Call was accepted, start the call (don't add to messages)
                    console.log('Call accepted by recipient:', messageData);
                    setOutgoingCall(null);
                    setCurrentCall({
                        roomId: messageData.roomId,
                        type: messageData.callType,
                        participants: [currentUser?.id || '', messageData.accepterId]
                    });
                    showToast('Call accepted!', 'success');
                    return; // Don't add to regular messages
                } else if (messageData && messageData.type === 'call_rejected' && outgoingCall) {
                    // Call was rejected (don't add to messages)
                    setOutgoingCall(null);
                    showToast('Call was rejected', 'info');
                    return; // Don't add to regular messages
                } else if (messageData && messageData.type === 'call_cancelled' && incomingCall) {
                    // Call was cancelled (don't add to messages)
                    setIncomingCall(null);
                    showToast('Call was cancelled', 'info');
                    return; // Don't add to regular messages
                }
            } catch (e) {
                console.log('Error parsing message data:', e);
                // Not a JSON message or check if it's a plain text call invitation
                if (typeof lastMessage.data === 'string' && lastMessage.data.includes('call_invitation')) {
                    try {
                        const data = JSON.parse(lastMessage.data);
                        if (data.type === 'call_invitation' && data.callerId !== currentUser?.id) {
                            console.log('Incoming call detected from plain text:', data);
                            setIncomingCall({
                                id: data.roomId,
                                callerName: data.callerName || 'Unknown Caller',
                                callerId: data.callerId,
                                type: data.callType
                            });
                            showToast(`Incoming ${data.callType} call from ${data.callerName || 'Unknown'}`, 'info');
                            return; // Don't add to regular messages
                        }
                    } catch (parseError) {
                        console.log('Failed to parse call invitation:', parseError);
                    }
                }
            }
        })
        // Check for system messages
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.event === 'system') {
            if (lastMessage.data && lastMessage.data.type === 'user_connected') {
                showToast(`${lastMessage.data.alias || 'A user'} joined`, 'info');
            } else if (lastMessage.data && lastMessage.data.type === 'user_disconnected') {
                showToast(`${lastMessage.data.alias || 'A user'} left`, 'info');
            }
        }
    }, [messages, currentUser, outgoingCall, incomingCall, wsRef]);

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

        // Get the actual display name (prefer login user name over WebSocket alias)
        const actualDisplayName = user.name || user.email || currentUserAlias || `User-${currentUser?.id?.substring(0, 8)}`;
        console.log('📞 STARTING CALL - Display name:', actualDisplayName, 'from login user:', user.name, 'WebSocket alias:', currentUserAlias);

        // Immediately show outgoing call dialog
        setOutgoingCall({ recipientId, type });
        console.log('📞 OUTGOING CALL DIALOG SHOWN for:', type, 'call to:', recipientId);

        // Send call invitation to recipient
        const callData = {
            type: 'call_invitation',
            callType: type,
            roomId: roomId,
            callerId: currentUser?.id,
            callerName: actualDisplayName,
            recipientId: recipientId,
            timestamp: Date.now()
        };

        console.log('Sending call invitation:', callData);

        // Send via WebSocket to the recipient
        sendMessage(JSON.stringify(callData), 'direct', recipientId);
    };

    const handleAcceptCall = (_callId: string) => {
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

    const handleRejectCall = (_callId: string) => {
        if (!incomingCall) return;

        console.log('Rejecting call - ensuring media cleanup');

        // Stop any existing media streams from previous calls
        if (currentCall) {
            setCurrentCall(null);
        }

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

        console.log('Cancelling call - ensuring media cleanup');

        // Stop any existing media streams from previous calls
        if (currentCall) {
            setCurrentCall(null);
        }

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
        console.log('Call ended - ensuring complete cleanup');

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
                    currentUserId={currentUser?.id || 'disconnected'}
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
                    currentUserId={currentUser?.id || 'connecting...'}
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
                        displayName={user.name || user.email || currentUserAlias}
                        authToken={userToken}
                        onLeaveCall={handleLeaveCall}
                        wsConnection={wsConnection}
                        userToken={userToken}
                    />
                </div>
            )}

            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} onClose={closeToast} />
        </div>
    );
};

export default ChatApp;
