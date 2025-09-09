import { WebSocketConnection } from './websocket.js';
import { formatFileSize, logMessage, logFileMessage, showTypingIndicator, updateMessageStats, showToast } from './utils.js';
import {
    updateStatus,
    updateConnectionCount,
    updateUserList,
    selectUser,
    toggleRecipientSelect,
    toggleFileRecipientSelect,
    updateSubscriptionsList,
    unsubscribeFromTopic,
    setCurrentUserInfo,
    clearCurrentUserInfo,
    setMessageType,
    updateTopicSelect,
    statusEl,
    connectBtn,
    disconnectBtn,
    aliasInput,
    setAliasBtn,
    messageInput,
    messageType,
    recipientSelect,
    topicSelect,
    sendBtn,
    pingBtn,
    userListBtn,
    userCount,
    userList,
    logContainer,
    topicInput,
    subscribeBtn,
    subscriptionsList,
    fileInput,
    fileType,
    fileRecipientSelect,
    fileTopicSelect,
    sendFileBtn
} from './ui.js';

// Typing detection
let typingTimer;
const typingDelay = 1000; // 1 second delay

// Global WebSocket connection instance
let wscon = null;

// Test interface functions
function initializeWebSocket() {
    wscon = new WebSocketConnection('ws://localhost:8080/ws', {
        token: 'mysecrettoken',
        autoReconnect: true,
        maxReconnectAttempts: 5
    });

    // Make wscon globally accessible
    window.wscon = wscon;

    // Set up event handlers
    wscon.on('open', () => {
        console.log('WebSocket connection opened successfully');
        showToast('Connected to WebSocket server', 'success');
        updateStatus(true);
        // Don't request user list here - wait for welcome message
    });

    wscon.on('close', () => {
        showToast('Disconnected from WebSocket server', 'warning');
        updateStatus(false);
    });

    wscon.on('error', (error) => {
        // Format error message properly
        let errorMessage = 'WebSocket connection error';
        if (error && typeof error === 'object' && error.message) {
            errorMessage = `WebSocket error: ${error.message}`;
        } else if (typeof error === 'string') {
            errorMessage = `WebSocket error: ${error}`;
        }
        showToast(errorMessage, 'error');
    });

    wscon.on('reconnecting', (data) => {
        showToast(`Reconnecting... (attempt ${data.attempt})`, 'warning');
        // Update status to show reconnecting state
        updateStatus(false);
    });

    wscon.on('message', (data) => {
        // Only log non-system messages with actual content to avoid cluttering the log
        // Skip messages that have specific handlers (broadcast, direct, etc.)
        const systemEvents = ['pong', 'heartbeat', 'ack', 'typing', 'file_received', 'broadcast', 'direct', 'published'];
        if (!systemEvents.includes(data.event) && !systemEvents.includes(data.t)) {
            // Only log messages that have actual meaningful content
            let shouldLog = false;
            let messageContent = '';
            let senderInfo = '';

            if (data.data && typeof data.data === 'object' && data.data.message) {
                shouldLog = true;
                messageContent = data.data.message;
                if (data.from) {
                    senderInfo = data.from;
                }
            } else if (data.data && typeof data.data === 'string' && data.data.trim()) {
                shouldLog = true;
                messageContent = data.data;
                if (data.from) {
                    senderInfo = data.from;
                }
            } else if (data.message && data.message.trim()) {
                shouldLog = true;
                messageContent = data.message;
                if (data.from) {
                    senderInfo = data.from;
                }
            }

            // Only log if we have actual content and it's not just a generic system message
            if (shouldLog && messageContent.trim() && messageContent !== 'Message received') {
                // Filter out connection-related system messages
                const systemMessages = [
                    'Connected to WebSocket server',
                    'Disconnected from WebSocket server',
                    'Connection established',
                    'Connection lost',
                    'Reconnecting',
                    'Reconnected'
                ];

                if (!systemMessages.some(sysMsg => messageContent.includes(sysMsg))) {
                    const displayName = senderInfo || 'Unknown';
                    logMessage(`${displayName}: ${messageContent}`, 'received');
                }
            }
        }
    });

    wscon.on('subscribed', (data) => {
        updateSubscriptionsList();
        updateMessageStats('topics');
    });

    wscon.on('unsubscribed', (data) => {
        updateSubscriptionsList();
    });

    wscon.on('published', (data) => {
        // Only log published messages that have actual content
        if (data.topic && data.topic !== 'general') {
            const message = data.data && data.data.message ? data.data.message : (data.data && typeof data.data === 'string' ? data.data : '');
            if (message && message.trim()) {
                // Filter out connection-related system messages
                const systemMessages = [
                    'Connected to WebSocket server',
                    'Disconnected from WebSocket server',
                    'Connection established',
                    'Connection lost',
                    'Reconnecting',
                    'Reconnected'
                ];

                if (!systemMessages.some(sysMsg => message.includes(sysMsg))) {
                    const sender = data.from || 'System';
                    logMessage(`${sender} [${data.topic}]: ${message}`, 'received');
                }
            }
        } else {
            const message = data.data && data.data.message ? data.data.message : (data.data && typeof data.data === 'string' ? data.data : '');
            if (message && message.trim()) {
                // Filter out connection-related system messages
                const systemMessages = [
                    'Connected to WebSocket server',
                    'Disconnected from WebSocket server',
                    'Connection established',
                    'Connection lost',
                    'Reconnecting',
                    'Reconnected'
                ];

                if (!systemMessages.some(sysMsg => message.includes(sysMsg))) {
                    logMessage(`Published to ${data.topic}: ${message}`, 'sent');
                }
            }
        }
    });

    wscon.on('pong', (data) => {
        // Don't log pong messages to keep the log clean
    });

    wscon.on('heartbeat', (data) => {
        // Don't log heartbeat messages to keep the log clean
        // Update connection count if needed
        if (data.connections !== undefined) {
            updateConnectionCount(data.connections);
        }
    });

    wscon.on('ack', (data) => {
        // Don't log acknowledgment messages to keep the log clean
    });

    wscon.on('broadcast', (data) => {
        let messageText = '';

        if (data.data && typeof data.data === 'object' && data.data.message) {
            messageText = data.data.message;
        } else if (data.data && typeof data.data === 'string') {
            messageText = data.data;
        } else if (data.message) {
            messageText = data.message;
        }

        // Filter out connection-related system messages
        const systemMessages = [
            'Connected to WebSocket server',
            'Disconnected from WebSocket server',
            'Connection established',
            'Connection lost',
            'Reconnecting',
            'Reconnected'
        ];

        if (messageText && messageText.trim() && !systemMessages.some(sysMsg => messageText.includes(sysMsg))) {
            const sender = data.from || 'System';
            logMessage(`${sender}: ${messageText}`, 'received');
        }
    });

    wscon.on('test_broadcast_response', (data) => {
        // Only log test responses that have actual content
        if (data && (data.message || (data.data && data.data.message))) {
            const message = data.message || data.data.message;
            if (message && message.trim()) {
                // Filter out connection-related system messages
                const systemMessages = [
                    'Connected to WebSocket server',
                    'Disconnected from WebSocket server',
                    'Connection established',
                    'Connection lost',
                    'Reconnecting',
                    'Reconnected'
                ];

                if (!systemMessages.some(sysMsg => message.includes(sysMsg))) {
                    logMessage(`🧪 Test broadcast response: ${message}`, 'received');
                }
            }
        }
    });

    wscon.on('system', (data) => {
        console.log('System message received:', data);
        if (data.data && data.data.type === 'welcome') {
            // Handle welcome message
            if (data.data.id && wscon) {
                wscon.userId = data.data.id;
                console.log('Set wscon.userId to:', wscon.userId);
            }
            if (data.data.alias && wscon) {
                wscon.userAlias = data.data.alias;
                console.log('Set wscon.userAlias to:', wscon.userAlias);
            }

            // Store current user information for proper "(Me)" display
            setCurrentUserInfo(data.data.id, data.data.alias);

            // Request user list after welcome message is processed
            setTimeout(() => {
                console.log('Requesting user list after welcome message');
                refreshUserList();
            }, 100);
        } else if (data.data && data.data.type === 'alias_change') {
            // Update current user info when alias changes
            if (window.currentUserInfo && data.data.newAlias) {
                window.currentUserInfo.alias = data.data.newAlias;
            }
            // Refresh user list after alias change
            setTimeout(() => refreshUserList(), 500);
        } else if (data.data && data.data.type === 'user_connected') {
            // Refresh user list when a user connects
            setTimeout(() => refreshUserList(), 500);
        } else if (data.data && data.data.type === 'user_disconnected') {
            // Refresh user list when a user disconnects
            setTimeout(() => refreshUserList(), 500);
        } else if (data.data && data.data.type === 'topic_list_update') {
            // Update topic select dropdown with new topic list
            updateTopicSelect(data.data.topics || []);
        } else {
            // Handle any other system messages that might contain connection notifications
            // Don't log them to the message log - they're handled by toasts
            console.log('Unhandled system message:', data);
        }
    });

    wscon.on('file_sent', (data) => {
        const size = formatFileSize(data.size);
        let recipient = ' (broadcast)';
        if (data.recipientId) {
            const recipientElement = document.querySelector(`[data-user-id="${data.recipientId}"]`);
            const name = recipientElement ? recipientElement.textContent : data.recipientId;
            recipient = ` to ${name}`;
        } else if (data.topic) {
            recipient = ` to topic ${data.topic}`;
        }
        logMessage(`📤 File sent: ${data.filename} (${size})${recipient}`, 'sent');
    });

    wscon.on('file_received', (data) => {
        if (wscon.lastFileMetadata) {
            const metadata = wscon.lastFileMetadata;
            const isFromCurrentUser = metadata.from === wscon.userId || metadata.from === wscon.userAlias;

            if (isFromCurrentUser) {
                // For files sent by current user, show as "File sent" with recipient info
                let recipientInfo = '';
                if (metadata.to) {
                    recipientInfo = ` to ${metadata.to}`;
                } else if (metadata.topic) {
                    recipientInfo = ` to topic ${metadata.topic}`;
                } else {
                    recipientInfo = ' (broadcast)';
                }
                logMessage(`📤 File sent: ${metadata.filename} (${formatFileSize(metadata.size)})${recipientInfo}`, 'sent');
            } else {
                // For files from others, show as received
                logMessage(`📎 ${metadata.from} shared: ${metadata.filename} (${formatFileSize(metadata.size)})`, 'received');
            }

            // Clear the stored metadata
            wscon.lastFileMetadata = null;
        } else {
            // Fallback if no metadata (shouldn't happen in normal flow)
            const blob = new Blob([data.data]);
            const url = URL.createObjectURL(blob);
            const size = formatFileSize(data.data.byteLength);
            const filename = data.filename || 'received_file';
            logFileMessage(`📎 File received: ${filename} (${size})`, 'received', url, 'Download');
        }
    });

    wscon.on('file', (data) => {
        if (data.filename && data.size && data.from) {
            // Store the file metadata for use in file_received handler
            wscon.lastFileMetadata = data;
            // Don't show the shared message for files sent by the current user
            // since they already see the "File sent" message
            if (data.from !== wscon.userId && data.from !== wscon.userAlias) {
                // Don't log here - let file_received handler show the consolidated message
            }
        }
    });

    wscon.on('typing', (data) => {
        // Handle typing indicators without logging to main message log
        if (data.data && data.data.typing) {
            showTypingIndicator();
        }
    });

    // Handle offline messages (messages received after reconnection)
    wscon.on('message', (data) => {
        if (data.offline && data.timestamp) {
            const offlineTime = new Date(data.timestamp * 1000);
            let messageText = '';
            let sender = data.from || 'Unknown';

            if (data.data && typeof data.data === 'object' && data.data.message) {
                messageText = data.data.message;
            } else if (data.data && typeof data.data === 'string') {
                messageText = data.data;
            } else if (data.message) {
                messageText = data.message;
            }

            if (messageText && messageText.trim()) {
                // Filter out connection-related system messages
                const systemMessages = [
                    'Connected to WebSocket server',
                    'Disconnected from WebSocket server',
                    'Connection established',
                    'Connection lost',
                    'Reconnecting',
                    'Reconnected'
                ];

                if (!systemMessages.some(sysMsg => messageText.includes(sysMsg))) {
                    logMessage(`📬 [Offline] ${sender}: ${messageText} (sent: ${offlineTime.toLocaleString()})`, 'received');
                }
            }
        }
    });

    wscon.on('user_list', (data) => {
        if (data.data && data.data.users) {
            updateUserList(data.data.users);
        } else if (data.users) {
            updateUserList(data.users);
        }
    });

    wscon.on('direct', (data) => {
        let messageText = '';

        if (data.from && data.data && data.data.message) {
            messageText = data.data.message;
        } else if (data.from && data.data && typeof data.data === 'string') {
            messageText = data.data;
        } else if (data.from && data.message) {
            messageText = data.message;
        }

        // Filter out connection-related system messages
        const systemMessages = [
            'Connected to WebSocket server',
            'Disconnected from WebSocket server',
            'Connection established',
            'Connection lost',
            'Reconnecting',
            'Reconnected'
        ];

        if (messageText && messageText.trim() && !systemMessages.some(sysMsg => messageText.includes(sysMsg))) {
            logMessage(`${data.from}: ${messageText}`, 'received');
        }
    });

    wscon.on('direct_sent', (data) => {
        const recipientElement = document.querySelector(`[data-user-id="${data.recipientId}"]`);
        const name = recipientElement ? recipientElement.textContent : data.recipientId;
    });

    // Actually connect to the WebSocket server
    wscon.connect();
}

function subscribeToTopic() {
    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic name');
        return;
    }
    if (wscon) {
        wscon.subscribe(topic);
        topicInput.value = '';
    }
}

function refreshUserList() {
    if (wscon && wscon.ws.readyState === WebSocket.OPEN) {
        wscon.ws.send(JSON.stringify({ t: 14 })); // MsgUserList = 14
    } else {
        logMessage('Cannot refresh user list: not connected', 'error');
    }
}

function setAlias() {
    const alias = aliasInput.value.trim();
    if (!alias) {
        alert('Please enter an alias');
        return;
    }
    if (wscon) {
        wscon.setAlias(alias);
        aliasInput.value = '';
    }
}

function sendMessage() {
    const message = messageInput.value.trim();
    const type = messageType.value || 'broadcast';

    if (!message) {
        alert('Please enter a message');
        return;
    }

    if (wscon) {
        // Log the sent message locally
        let recipientInfo = '';
        if (type === 'direct') {
            const recipientId = recipientSelect.value;
            if (!recipientId) {
                alert('Please select a recipient');
                return;
            }
            const recipientElement = document.querySelector(`[data-user-id="${recipientId}"]`);
            const name = recipientElement ? recipientElement.textContent : recipientId;
            recipientInfo = ` to ${name}`;
            wscon.sendDirectMessage(recipientId, { message: message });
            logMessage(`You${recipientInfo}: ${message}`, 'sent');
        } else if (type === 'topic') {
            const topic = topicSelect.value;
            if (!topic) {
                alert('Please select a topic');
                return;
            }
            recipientInfo = ` to topic ${topic}`;
            wscon.publish(topic, { message: message });
            logMessage(`You${recipientInfo}: ${message}`, 'sent');
        } else {
            wscon.publish('general', { message: message });
            logMessage(`You (broadcast): ${message}`, 'sent');
        }
        messageInput.value = '';
    }
}

function connect() {
    if (!wscon) {
        initializeWebSocket();
    }
}

function disconnect() {
    if (wscon) {
        wscon.disconnect();
        wscon = null;
        // Clear current user information on disconnect
        clearCurrentUserInfo();
        updateStatus(false);
    }
}

function subscribe() {
    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic');
        return;
    }
    if (wscon) {
        wscon.subscribe(topic);
    }
}

function publish() {
    const topic = topicInput.value.trim();
    const message = messageInput.value.trim();
    if (!topic || !message) {
        alert('Please enter both topic and message');
        return;
    }
    if (wscon) {
        wscon.publish(topic, message);
        messageInput.value = '';
        // Clear typing indicator
        wscon.sendTyping(false);
        clearTimeout(typingTimer);
    }
}

function testBroadcast() {
    if (wscon) {
        const message = JSON.stringify({
            t: 1, // MsgBroadcast
            topic: 'test',
            data: {
                message: 'This is a broadcast test from client',
                timestamp: Date.now()
            }
        });
        wscon.ws.send(message);
    }
}

function sendFile() {
    const file = fileInput.files[0];
    const type = fileType.value;

    if (!file) {
        alert('Please select a file');
        return;
    }

    if (wscon) {
        if (type === 'direct') {
            const recipientId = fileRecipientSelect.value;
            if (!recipientId) {
                alert('Please select a recipient');
                return;
            }
            wscon.sendFile(file, recipientId);
        } else if (type === 'topic') {
            const topic = fileTopicSelect.value;
            if (!topic) {
                alert('Please select a topic');
                return;
            }
            wscon.sendFile(file, null, topic);
        } else {
            wscon.sendFile(file);
        }
        fileInput.value = '';
    }
}

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
setAliasBtn.addEventListener('click', setAlias);
subscribeBtn.addEventListener('click', subscribeToTopic);

// Message type button handlers
document.querySelectorAll('.message-type-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const type = this.dataset.type;
        setMessageType(type);
    });
});

sendBtn.addEventListener('click', sendMessage);
sendFileBtn.addEventListener('click', sendFile);
fileType.addEventListener('change', toggleFileRecipientSelect);
pingBtn.addEventListener('click', () => {
    if (wscon) {
        wscon.ws.send(JSON.stringify({ t: 6, data: { timestamp: Date.now() } }));
    }
});
userListBtn.addEventListener('click', refreshUserList);

// Enter key handler for message input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Enter key handler for alias input
aliasInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        setAlias();
    }
});

// Enter key handler for topic input
topicInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        subscribeToTopic();
    }
});

// Typing detection
messageInput.addEventListener('input', function () {
    if (wscon && wscon.isConnected()) {
        wscon.sendTyping(true);

        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            wscon.sendTyping(false);
        }, typingDelay);
    }
});

messageInput.addEventListener('blur', function () {
    if (wscon && wscon.isConnected()) {
        wscon.sendTyping(false);
        clearTimeout(typingTimer);
    }
});

// Initialize status
updateStatus(false);
toggleFileRecipientSelect();

// Make functions globally accessible for HTML onclick handlers
window.unsubscribeFromTopic = unsubscribeFromTopic;
