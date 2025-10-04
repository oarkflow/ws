import React, { useState, useEffect, useRef } from 'react';
import { ThreadProvider, useThreadContext } from '../../contexts/ThreadContext';
import type { Thread, ThreadMessage } from '../../types/thread';
import SlackSidebar from './SlackSidebar';
import ThreadHeader from './ThreadHeader';
import MessageThread from './MessageThread';
import MessageInput from './MessageInput';
import CreateChannelModal from './CreateChannelModal';
import CallScreen from '../call/CallScreen';
import DirectCallModal from '../call/DirectCallModal';
import { useToast, ToastContainer } from '../common/Toast';

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
    wsConnection: any;
    userToken: string;
}

const ChatAppContent: React.FC<ChatAppProps> = ({ user, wsConnection, userToken }) => {
    const {
        activeThread,
        threads,
        setActiveThread,
        addThread,
        addMessage,
        getThreadMessages
    } = useThreadContext();

    const {
        isConnected,
        users,
        messages,
        currentUser,
        isTyping,
        connect,
        disconnect,
        sendMessage,
        sendFile,
        setAlias,
        subscribe,
        sendTyping,
        requestUserList,
        wsRef
    } = wsConnection;

    const [currentUserAlias, setCurrentUserAlias] = useState('');
    const [showCreateChannel, setShowCreateChannel] = useState(false);

    // Call-related state
    const [currentCall, setCurrentCall] = useState<{ roomId: string; type: 'audio' | 'video'; participants: string[] } | null>(null);
    const [outgoingCall, setOutgoingCall] = useState<{ recipientId: string; type: 'audio' | 'video' } | null>(null);
    const [incomingCall, setIncomingCall] = useState<{ id: string; callerName: string; callerId: string; type: 'audio' | 'video' } | null>(null);

    const { toasts, showToast, closeToast } = useToast();

    // Track processed message IDs to prevent duplicates
    const processedMessageIds = useRef(new Set<string>());

    // Listen to direct WebSocket events for call handling
    useEffect(() => {
        const ws = wsRef.current;
        if (!ws) return;

        const handleDirectMessage = (lastMessage: any) => {
            try {
                let messageData = lastMessage.data;

                // Only parse as JSON if it's a call message (contains type field when parsed)
                if (messageData && typeof messageData === 'object' && messageData.message) {
                    // messageData.message might be a string that needs parsing, or already an object
                    if (typeof messageData.message === 'string') {
                        // Only parse if it looks like JSON
                        if (messageData.message.trim().startsWith('{') || messageData.message.trim().startsWith('[')) {
                            try {
                                messageData = JSON.parse(messageData.message);
                            } catch {
                                // Not valid JSON, keep as is
                                return;
                            }
                        } else {
                            // Plain text in message field, not a call message
                            return;
                        }
                    } else {
                        messageData = messageData.message;
                    }
                } else if (typeof messageData === 'string') {
                    // Direct string data, only try to parse if it looks like JSON
                    if (messageData.trim().startsWith('{') || messageData.trim().startsWith('[')) {
                        try {
                            messageData = JSON.parse(messageData);
                        } catch {
                            // Not JSON, keep as string (regular text message)
                            return;
                        }
                    } else {
                        // Plain text message, not a call message
                        return;
                    }
                }

                if (messageData?.type === 'call_invitation') {
                    const isForCurrentUser = messageData.recipientId === currentUser?.id ||
                        (!messageData.recipientId && messageData.callerId !== currentUser?.id);

                    if (isForCurrentUser) {
                        setIncomingCall({
                            id: messageData.roomId,
                            callerName: messageData.callerName || 'Unknown Caller',
                            callerId: messageData.callerId,
                            type: messageData.callType
                        });
                        showToast(`📞 Incoming ${messageData.callType} call from ${messageData.callerName || 'Unknown'}`, 'info');
                    }
                } else if (messageData && messageData.type === 'call_accepted' && outgoingCall) {
                    setOutgoingCall(null);
                    setCurrentCall({
                        roomId: messageData.roomId,
                        type: messageData.callType,
                        participants: [currentUser?.id || '', messageData.accepterId]
                    });
                    showToast('Call accepted!', 'success');
                } else if (messageData && messageData.type === 'call_rejected' && outgoingCall) {
                    setOutgoingCall(null);
                    showToast('Call was rejected', 'info');
                } else if (messageData && messageData.type === 'call_cancelled' && incomingCall) {
                    setIncomingCall(null);
                    showToast('Call was cancelled', 'info');
                }
            } catch (e) {
                console.log('Error parsing call message:', e);
            }
        };

        ws.on('direct', handleDirectMessage);

        return () => {
            ws.off('direct', handleDirectMessage);
        };
    }, [wsRef, currentUser, outgoingCall, incomingCall, showToast]);

    // Set alias from user data
    useEffect(() => {
        const displayAlias = user.name || user.email || user.alias || `User-${user.id.substring(0, 8)}`;
        setCurrentUserAlias(displayAlias);
        if (isConnected) {
            setAlias(displayAlias);
        }
    }, [user.name, user.email, user.alias, setAlias, isConnected, user.id]);

    // Update alias when current user changes
    useEffect(() => {
        if (currentUser) {
            setCurrentUserAlias(currentUser.alias);
        }
    }, [currentUser]);

    // Request user list on connect
    useEffect(() => {
        if (isConnected) {
            requestUserList();
        }
    }, [isConnected, requestUserList]);

    // Process incoming WebSocket messages and organize by thread
    useEffect(() => {
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];
        const messageId = lastMessage.id || `msg-${lastMessage.timestamp}-${lastMessage.from}`;

        // Skip if already processed
        if (processedMessageIds.current.has(messageId)) {
            return;
        }

        // Mark as processed
        processedMessageIds.current.add(messageId);

        // Determine thread ID based on message type
        let threadId = 'broadcast';
        let threadType: 'broadcast' | 'direct' | 'topic' = 'broadcast';
        let threadName = 'All Messages';
        let recipientId: string | undefined;
        let topicName: string | undefined;

        // Check for direct messages (including file messages sent directly)
        if (lastMessage.event === 'direct' || (lastMessage.event === 'file' && lastMessage.to)) {
            // Direct message
            // For DM threads, we need to identify the OTHER person (not ourselves)

            const senderAlias = lastMessage.from;
            const messageRecipientId = lastMessage.to;

            // Check if WE are the sender by comparing with our alias or ID
            const isFromCurrentUser = senderAlias === currentUser?.alias ||
                senderAlias === currentUser?.id ||
                senderAlias === currentUserAlias;

            // Determine who the OTHER person is (not the current user)
            let otherUserId: string;
            let otherUserName: string;

            if (isFromCurrentUser) {
                // We sent this message, so the other person is the recipient
                otherUserId = messageRecipientId || '';
                const recipientUser = users.find((u: any) => u.id === otherUserId);
                otherUserName = recipientUser?.alias || otherUserId || 'Unknown User';
            } else {
                // We received this message, so the other person is the sender
                const senderUser = users.find((u: any) => u.alias === senderAlias || u.id === senderAlias);
                otherUserId = senderUser?.id || senderAlias;
                otherUserName = senderUser?.alias || senderAlias || 'Unknown User';
            }

            // Create consistent thread ID using the other person's ID
            threadId = `dm-${otherUserId}`;
            threadType = 'direct';
            threadName = otherUserName;
            recipientId = otherUserId;
        } else if (lastMessage.event === 'topic' || lastMessage.event === 'published' || (lastMessage.event === 'file' && lastMessage.topic)) {
            // Topic/Channel message (including file messages in topics)
            threadId = `topic-${lastMessage.topic}`;
            threadType = 'topic';
            threadName = lastMessage.topic || 'Unknown Channel';
            topicName = lastMessage.topic;
        }

        // Ensure thread exists
        const existingThread = threads.find(t => t.id === threadId);
        if (!existingThread && threadId !== 'broadcast') {
            const newThread: Thread = {
                id: threadId,
                type: threadType,
                name: threadName,
                recipientId,
                topicName,
                unreadCount: 0
            };
            addThread(newThread);
        }

        // Skip call messages from being added to chat - they're handled by the direct event listener
        const isCallMessage = (msgData: any) => {
            try {
                let messageData = msgData;
                if (messageData && typeof messageData === 'object' && messageData.message) {
                    messageData = typeof messageData.message === 'string' ? JSON.parse(messageData.message) : messageData.message;
                } else if (typeof messageData === 'string') {
                    messageData = JSON.parse(messageData);
                }
                return messageData && messageData.type && (
                    messageData.type === 'call_invitation' ||
                    messageData.type === 'call_accepted' ||
                    messageData.type === 'call_rejected' ||
                    messageData.type === 'call_cancelled'
                );
            } catch (e) {
                return false;
            }
        };

        if (lastMessage.event === 'direct' && isCallMessage(lastMessage.data)) {
            return; // Don't add call messages to chat history
        }

        // Create thread message
        const threadMessage: ThreadMessage = {
            id: messageId,
            threadId,
            from: lastMessage.from || 'system',
            fromAlias: lastMessage.from || 'System', // from already contains the alias
            content: getMessageContent(lastMessage),
            timestamp: lastMessage.timestamp || new Date(),
            type: lastMessage.event === 'file' ? 'file' : lastMessage.event === 'system' ? 'system' : 'text',
            fileUrl: lastMessage.downloadUrl || lastMessage.data?.downloadUrl, // Check top level first (for file_received event)
            fileName: lastMessage.data?.filename || lastMessage.filename,
            fileSize: lastMessage.data?.size || lastMessage.size
        };

        addMessage(threadId, threadMessage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages]);

    const getMessageContent = (message: any): string => {
        if (message.event === 'file') {
            // For file messages, return filename or 'File'
            return message.data?.filename || message.fileName || 'File';
        } else if (message.data && typeof message.data === 'object' && message.data.message) {
            return message.data.message;
        } else if (message.data && typeof message.data === 'string') {
            return message.data;
        } else if (typeof message.data === 'object') {
            // If data is an object, try to extract text representation
            return JSON.stringify(message.data);
        }
        return message.data || 'Unknown message';
    };

    const handleThreadSelect = (thread: Thread) => {
        setActiveThread(thread);
    };

    const handleCreateChannel = () => {
        setShowCreateChannel(true);
    };

    const handleChannelCreated = (channelName: string) => {
        // Subscribe to the new channel
        subscribe(channelName);

        // Create thread for the channel
        const newThread: Thread = {
            id: `topic-${channelName}`,
            type: 'topic',
            name: channelName,
            topicName: channelName,
            unreadCount: 0
        };
        addThread(newThread);
        setActiveThread(newThread);
        showToast(`Channel #${channelName} created!`, 'success');
    };

    const handleUserSelect = (userId: string) => {
        // Create or switch to DM thread with user
        const threadId = `dm-${userId}`;
        const existingThread = threads.find(t => t.id === threadId);

        if (existingThread) {
            setActiveThread(existingThread);
        } else {
            const otherUser = users.find((u: any) => u.id === userId);
            const newThread: Thread = {
                id: threadId,
                type: 'direct',
                name: otherUser?.alias || userId,
                recipientId: userId,
                unreadCount: 0
            };
            addThread(newThread);
            setActiveThread(newThread);
        }
    };

    const handleSendMessage = (message: string, file?: File) => {
        if (!activeThread) return;

        if (activeThread.type === 'broadcast') {
            if (message) {
                sendMessage(message, 'broadcast');
            }
            if (file) {
                sendFile(file);
            }
        } else if (activeThread.type === 'direct' && activeThread.recipientId) {
            if (message) {
                sendMessage(message, 'direct', activeThread.recipientId);
            }
            if (file) {
                sendFile(file, activeThread.recipientId);
            }
        } else if (activeThread.type === 'topic' && activeThread.topicName) {
            if (message) {
                sendMessage(message, 'topic', undefined, activeThread.topicName);
            }
            if (file) {
                sendFile(file, undefined, activeThread.topicName);
            }
        }
    };

    const handleStartCall = (type: 'audio' | 'video') => {
        if (!activeThread) return;

        const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const actualDisplayName = user.name || user.email || currentUserAlias;

        if (activeThread.type === 'direct' && activeThread.recipientId) {
            // Direct call
            setOutgoingCall({ recipientId: activeThread.recipientId, type });

            const callData = {
                type: 'call_invitation',
                callType: type,
                roomId: roomId,
                callerId: currentUser?.id,
                callerName: actualDisplayName,
                recipientId: activeThread.recipientId,
                timestamp: Date.now()
            };

            sendMessage(JSON.stringify(callData), 'direct', activeThread.recipientId);
        } else if (activeThread.type === 'topic' || activeThread.type === 'broadcast') {
            // Group call - immediately start
            setCurrentCall({
                roomId,
                type,
                participants: [currentUser?.id || '']
            });
            showToast(`Started ${type} call in ${activeThread.name}`, 'success');
        }
    };

    const handleAcceptCall = () => {
        if (!incomingCall) return;

        setIncomingCall(null);
        setCurrentCall({
            roomId: incomingCall.id,
            type: incomingCall.type,
            participants: [currentUser?.id || '', incomingCall.callerId]
        });

        const acceptData = {
            type: 'call_accepted',
            callType: incomingCall.type,
            roomId: incomingCall.id,
            accepterId: currentUser?.id,
            accepterName: currentUserAlias
        };

        sendMessage(JSON.stringify(acceptData), 'direct', incomingCall.callerId);
    };

    const handleRejectCall = () => {
        if (!incomingCall) return;

        const rejectData = {
            type: 'call_rejected',
            rejecterId: currentUser?.id,
            rejecterName: currentUserAlias
        };

        sendMessage(JSON.stringify(rejectData), 'direct', incomingCall.callerId);
        setIncomingCall(null);
    };

    const handleCancelCall = () => {
        if (!outgoingCall) return;

        const cancelData = {
            type: 'call_cancelled',
            callerId: currentUser?.id,
            callerName: currentUserAlias
        };

        sendMessage(JSON.stringify(cancelData), 'direct', outgoingCall.recipientId);
        setOutgoingCall(null);
    };

    const handleLeaveCall = () => {
        setCurrentCall(null);
        setOutgoingCall(null);
    };

    const activeThreadMessages = activeThread ? getThreadMessages(activeThread.id) : [];

    return (
        <div className="h-screen w-screen bg-slate-50 flex overflow-hidden">
            {/* Sidebar */}
            <SlackSidebar
                isConnected={isConnected}
                threads={threads}
                activeThread={activeThread}
                users={users}
                currentUserId={currentUser?.id}
                workspaceName="Chat Workspace"
                currentUserAlias={currentUserAlias}
                onThreadSelect={handleThreadSelect}
                onCreateChannel={handleCreateChannel}
                onUserSelect={handleUserSelect}
                onConnect={connect}
                onDisconnect={disconnect}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <ThreadHeader
                    thread={activeThread}
                    isConnected={isConnected}
                    onStartAudioCall={() => handleStartCall('audio')}
                    onStartVideoCall={() => handleStartCall('video')}
                />

                <MessageThread
                    messages={activeThreadMessages}
                    currentUserId={currentUser?.id}
                    isTyping={isTyping}
                />

                <MessageInput
                    onSendMessage={handleSendMessage}
                    onTyping={sendTyping}
                    isConnected={isConnected}
                    placeholder={activeThread ? `Message ${activeThread.name}` : 'Select a conversation'}
                />
            </div>

            {/* Modals */}
            <CreateChannelModal
                isOpen={showCreateChannel}
                onClose={() => setShowCreateChannel(false)}
                onCreate={handleChannelCreated}
            />

            {/* Call Modals */}
            {outgoingCall && (
                <DirectCallModal
                    isOpen={true}
                    type="outgoing"
                    callerName={currentUserAlias}
                    onReject={handleCancelCall}
                />
            )}

            {incomingCall && (
                <DirectCallModal
                    isOpen={true}
                    type="incoming"
                    callerName={incomingCall.callerName}
                    onAccept={handleAcceptCall}
                    onReject={handleRejectCall}
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

const ChatApp: React.FC<ChatAppProps> = (props) => {
    return (
        <ThreadProvider>
            <ChatAppContent {...props} />
        </ThreadProvider>
    );
};

export default ChatApp;
