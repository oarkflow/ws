class WebSocketConnection {
    constructor(url, options = {}) {
        this.url = url;
        this.ws = null;
        this.eventHandlers = {};
        this.subscriptions = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectInterval = options.reconnectInterval || 1000;
        this.autoReconnect = options.autoReconnect !== false;
        this.token = options.token || 'mysecrettoken';
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return this;
        }

        try {
            const url = this.url + (this.url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(this.token);
            this.ws = new WebSocket(url);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = (event) => {
                this.reconnectAttempts = 0;
                this.emit('open', event);
            };

            this.ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Handle binary data (file)
                    this.emit('file_received', { data: event.data });
                } else {
                    this.handleMessage(event.data);
                }
            };

            this.ws.onclose = (event) => {
                this.emit('close', event);
                if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    setTimeout(() => {
                        this.reconnectAttempts++;
                        this.emit('reconnecting', { attempt: this.reconnectAttempts });
                        this.connect();
                    }, this.reconnectInterval * this.reconnectAttempts);
                }
            };

            this.ws.onerror = (event) => {
                this.emit('error', event);
            };

        } catch (error) {
            this.emit('error', error);
        }

        return this;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        return this;
    }

    subscribe(topic) {
        if (!topic) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 4, // MsgSubscribe
                topic: topic
            });
            this.ws.send(message);
            this.subscriptions.add(topic);
            this.emit('subscribed', { topic });
        } else {
            // Queue subscription for when connection opens
            this.once('open', () => this.subscribe(topic));
        }

        return this;
    }

    unsubscribe(topic) {
        if (!topic) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 5, // MsgUnsubscribe
                topic: topic
            });
            this.ws.send(message);
            this.subscriptions.delete(topic);
            this.emit('unsubscribed', { topic });
        }

        return this;
    }

    publish(topic, data) {
        if (!topic || !data) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 1, // MsgBroadcast
                topic: topic,
                data: data
            });
            this.ws.send(message);
            this.emit('published', { topic, data });
        }

        return this;
    }

    sendDirectMessage(recipientId, data) {
        if (!recipientId || !data) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 12, // MsgDirect
                to: recipientId,
                data: data
            });
            this.ws.send(message);
            this.emit('direct_sent', { recipientId, data });
        }

        return this;
    }

    sendThreadMessage(threadId, replyTo, data, recipientId = null) {
        if (!threadId || !data) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 13, // MsgThread
                threadId: threadId,
                replyTo: replyTo,
                to: recipientId,
                data: data
            });
            this.ws.send(message);
            this.emit('thread_sent', { threadId, replyTo, recipientId, data });
        }

        return this;
    }

    requestUserList() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 14 // MsgUserList
            });
            this.ws.send(message);
        }
        return this;
    }

    setAlias(alias) {
        if (!alias) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 15, // MsgSetAlias
                data: { alias: alias }
            });
            this.ws.send(message);
            this.emit('alias_set', { alias });
        }

        return this;
    }

    sendTyping(isTyping) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 11, // MsgTyping
                data: { typing: isTyping }
            });
            this.ws.send(message);
        }
        return this;
    }

    sendFile(file, recipientId = null) {
        if (!file) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const arrayBuffer = event.target.result;
                const message = {
                    t: 10, // MsgFile
                    filename: file.name,
                    size: file.size,
                    data: arrayBuffer
                };
                if (recipientId) {
                    message.to = recipientId;
                }
                this.ws.send(JSON.stringify(message));
                this.emit('file_sent', { filename: file.name, size: file.size, recipientId });
            };
            reader.readAsArrayBuffer(file);
        }
        return this;
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
        return this;
    }

    once(event, handler) {
        const onceHandler = (...args) => {
            this.off(event, onceHandler);
            handler.apply(this, args);
        };
        return this.on(event, onceHandler);
    }

    off(event, handler) {
        if (this.eventHandlers[event]) {
            if (handler) {
                const index = this.eventHandlers[event].indexOf(handler);
                if (index > -1) {
                    this.eventHandlers[event].splice(index, 1);
                }
            } else {
                delete this.eventHandlers[event];
            }
        }
        return this;
    }

    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error('Event handler error:', error);
                }
            });
        }
        return this;
    }

    handleMessage(data) {
        try {
            // Try to parse as JSON first
            const parsed = JSON.parse(data);

            // Check if it's compact format (has 't' field)
            if (parsed.t !== undefined) {
                // Convert compact message to readable format
                const readableMsg = this.convertCompactToReadable(parsed);
                this.emit(readableMsg.event, readableMsg);
                this.emit('message', readableMsg);
            } else if (parsed.event) {
                // Legacy format
                this.emit(parsed.event, parsed);
                this.emit('message', parsed);
            } else {
                this.emit('message', { data: parsed });
            }
        } catch (e) {
            // Handle as plain text (backward compatibility)
            if (typeof data === 'string' && data.startsWith('subscribed:')) {
                const topic = data.substring(11);
                this.emit('subscription_confirmed', { topic });
            } else if (typeof data === 'string' && data.startsWith('unsubscribed:')) {
                const topic = data.substring(13);
                this.emit('unsubscription_confirmed', { topic });
            } else {
                this.emit('message', { data });
            }
        }
    }

    convertCompactToReadable(compactMsg) {
        const typeMap = {
            1: 'broadcast',
            2: 'private',
            3: 'system',
            4: 'subscribe',
            5: 'unsubscribe',
            6: 'ping',
            7: 'pong',
            8: 'error',
            9: 'ack',
            10: 'file',
            11: 'typing',
            12: 'direct',
            13: 'thread',
            14: 'user_list',
            15: 'set_alias'
        };

        return {
            event: typeMap[compactMsg.t] || 'unknown',
            topic: compactMsg.topic,
            to: compactMsg.to,
            data: compactMsg.data,
            code: compactMsg.code,
            id: compactMsg.id,
            threadId: compactMsg.threadId,
            replyTo: compactMsg.replyTo,
            from: compactMsg.from
        };
    }

    getSubscriptions() {
        return Array.from(this.subscriptions);
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// Global instance for the test interface
let wscon = null;

// Test interface functions
function initializeWebSocket() {
    wscon = new WebSocketConnection('ws://localhost:8080/ws', {
        token: 'mysecrettoken',
        autoReconnect: true,
        maxReconnectAttempts: 5
    });

    // Set up event handlers
    wscon.on('open', () => {
        logMessage('Connected to WebSocket server', 'received');
        updateStatus(true);
    });

    wscon.on('close', () => {
        logMessage('Disconnected from WebSocket server', 'error');
        updateStatus(false);
    });

    wscon.on('error', (error) => {
        logMessage('WebSocket error: ' + JSON.stringify(error), 'error');
    });

    wscon.on('reconnecting', (data) => {
        logMessage(`Reconnecting... (attempt ${data.attempt})`, 'received');
    });

    wscon.on('message', (data) => {
        logMessage('Received: ' + JSON.stringify(data), 'received');
    });

    wscon.on('subscribed', (data) => {
        logMessage(`Subscribed to topic: ${data.topic}`, 'received');
    });

    wscon.on('unsubscribed', (data) => {
        logMessage(`Unsubscribed from topic: ${data.topic}`, 'received');
    });

    wscon.on('published', (data) => {
        logMessage(`Published to ${data.topic}: ${JSON.stringify(data.data)}`, 'sent');
    });

    wscon.on('welcome', (data) => {
        logMessage(`👋 Welcome! Connected as ${data.id}`, 'received');
    });

    wscon.on('pong', (data) => {
        logMessage(`🏓 Pong received`, 'received');
    });

    wscon.on('heartbeat', (data) => {
        logMessage(`💓 ${data.connections} clients online`, 'received');
    });

    wscon.on('ack', (data) => {
        if (data.action) {
            logMessage(`✅ ${data.action}`, 'received');
        } else {
            logMessage(`✅ Acknowledged`, 'received');
        }
    });

    wscon.on('broadcast', (data) => {
        if (data.data && typeof data.data === 'object' && data.data.message) {
            logMessage(`📢 ${data.data.message}`, 'received');
        } else {
            logMessage(`📢 Broadcast received`, 'received');
        }
    });

    wscon.on('test_broadcast_response', (data) => {
        logMessage(`🧪 Test broadcast response`, 'received');
    });

    wscon.on('system', (data) => {
        if (data.data && typeof data.data === 'object') {
            if (data.data.type === 'alias_change') {
                logMessage(`👤 ${data.data.message}`, 'received');
                // Refresh user list after alias change
                setTimeout(() => refreshUserList(), 500);
            } else if (data.data.type === 'announcement') {
                logMessage(`📣 ${data.data.message}`, 'received');
            } else if (data.data.message) {
                logMessage(`� ${data.data.message}`, 'received');
            } else {
                logMessage(`🔧 System: ${JSON.stringify(data.data)}`, 'received');
            }
        } else {
            logMessage(`🔧 System: ${JSON.stringify(data)}`, 'received');
        }
    });

    wscon.on('file_sent', (data) => {
        const size = formatFileSize(data.size);
        const recipient = data.recipientId ? ` to ${data.recipientId}` : ' (broadcast)';
        logMessage(`📤 File sent: ${data.filename} (${size})${recipient}`, 'sent');
    });

    wscon.on('file_received', (data) => {
        const blob = new Blob([data.data]);
        const url = URL.createObjectURL(blob);
        const size = formatFileSize(data.data.byteLength);
        logFileMessage(`📎 File received: ${size}`, 'received', url, 'Download File');
    });

    wscon.on('typing', (data) => {
        if (data.data && data.data.typing) {
            showTypingIndicator();
        }
    });

    // Handle offline messages (messages received after reconnection)
    wscon.on('message', (data) => {
        if (data.offline && data.timestamp) {
            const offlineTime = new Date(data.timestamp * 1000);
            logMessage(`📬 [Offline] ${JSON.stringify(data)} (sent: ${offlineTime.toLocaleString()})`, 'received');
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
        if (data.from && data.data && data.data.message) {
            logMessage(`💬 [DM from ${data.from}] ${data.data.message}`, 'received');
        } else if (data.from) {
            logMessage(`💬 [DM from ${data.from}] ${JSON.stringify(data.data)}`, 'received');
        } else {
            logMessage(`💬 [DM] ${JSON.stringify(data)}`, 'received');
        }
    });

    wscon.on('direct_sent', (data) => {
        const recipientName = document.querySelector(`[data-user-id="${data.recipientId}"]`);
        const name = recipientName ? recipientName.textContent : data.recipientId;
        logMessage(`💬 DM sent to ${name}: ${data.data.message}`, 'sent');
    });

    // Actually connect to the WebSocket server
    wscon.connect();
}

const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const aliasInput = document.getElementById('aliasInput');
const setAliasBtn = document.getElementById('setAliasBtn');
const messageInput = document.getElementById('messageInput');
const messageType = document.getElementById('messageType');
const recipientSelect = document.getElementById('recipientSelect');
const sendBtn = document.getElementById('sendBtn');
const pingBtn = document.getElementById('pingBtn');
const userListBtn = document.getElementById('userListBtn');
const userCount = document.getElementById('userCount');
const userList = document.getElementById('userList');
const logContainer = document.getElementById('logContainer');

// Additional elements for legacy functionality (may not exist)
const subscribeBtn = document.getElementById('subscribeBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const publishBtn = document.getElementById('publishBtn');
const broadcastBtn = document.getElementById('broadcastBtn');
const sendFileBtn = document.getElementById('sendFileBtn');
const topicInput = document.getElementById('topicInput');
const fileInput = document.getElementById('fileInput');
const recipientInput = document.getElementById('recipientInput');

// Typing detection
let typingTimer;
const typingDelay = 1000; // 1 second delay

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

function logMessage(message, type = 'received') {
    const div = document.createElement('div');
    div.className = `log-message ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function logFileMessage(message, type = 'received', fileUrl = null, buttonText = 'Download') {
    const div = document.createElement('div');
    div.className = `log-message ${type} file-message`;

    const textSpan = document.createElement('span');
    textSpan.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    if (fileUrl) {
        const button = document.createElement('button');
        button.textContent = buttonText;
        button.className = 'file-download-btn';
        button.onclick = () => {
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = 'received_file';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        div.appendChild(textSpan);
        div.appendChild(button);
    } else {
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    }

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.style.display = 'block';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 3000);
    }
}

function showUploadingIndicator() {
    const indicator = document.getElementById('uploadingIndicator');
    if (indicator) {
        indicator.style.display = 'block';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 5000);
    }
}

function updateStatus(connected) {
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        setAliasBtn.disabled = false;
        sendBtn.disabled = false;
        pingBtn.disabled = false;
        userListBtn.disabled = false;
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        setAliasBtn.disabled = true;
        sendBtn.disabled = true;
        pingBtn.disabled = true;
        userListBtn.disabled = true;
        userCount.textContent = '0';
        userList.innerHTML = '';
        recipientSelect.innerHTML = '<option value="">Select recipient...</option>';
    }
}

function updateUserList(users) {
    userCount.textContent = users.length;
    userList.innerHTML = '';
    recipientSelect.innerHTML = '<option value="">Select recipient...</option>';

    users.forEach(user => {
        // Add to user list
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.textContent = user.alias;
        userDiv.dataset.userId = user.id;
        userDiv.onclick = () => selectUser(user.id);
        userList.appendChild(userDiv);

        // Add to recipient select
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.alias;
        recipientSelect.appendChild(option);
    });
}

function selectUser(userId) {
    // Remove selected class from all users
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selected class to clicked user
    const selectedUser = document.querySelector(`[data-user-id="${userId}"]`);
    if (selectedUser) {
        selectedUser.classList.add('selected');
        recipientSelect.value = userId;
        messageType.value = 'direct';
        toggleRecipientSelect();
    }
}

function toggleRecipientSelect() {
    if (messageType.value === 'direct') {
        recipientSelect.style.display = 'inline-block';
    } else {
        recipientSelect.style.display = 'none';
        recipientSelect.value = '';
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('selected');
        });
    }
}

function refreshUserList() {
    if (wscon && wscon.ws.readyState === WebSocket.OPEN) {
        wscon.ws.send(JSON.stringify({ t: 14 })); // MsgUserList = 14
        logMessage('Requested user list from server', 'sent');
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
    const type = messageType.value;

    if (!message) {
        alert('Please enter a message');
        return;
    }

    if (wscon) {
        if (type === 'direct') {
            const recipientId = recipientSelect.value;
            if (!recipientId) {
                alert('Please select a recipient');
                return;
            }
            wscon.sendDirectMessage(recipientId, { message: message });
        } else {
            wscon.publish('general', { message: message });
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

function unsubscribe() {
    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic');
        return;
    }
    if (wscon) {
        wscon.unsubscribe(topic);
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

function ping() {
    if (wscon) {
        const message = JSON.stringify({
            t: 6, // MsgPing
            data: { timestamp: Date.now() }
        });
        wscon.ws.send(message);
        logMessage('Sent ping to server', 'sent');
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
        logMessage('Sent broadcast test', 'sent');
    }
}

function sendFile() {
    const file = fileInput.files[0];
    const recipientId = recipientInput.value.trim() || null;
    if (!file) {
        alert('Please select a file');
        return;
    }
    if (wscon) {
        showUploadingIndicator();
        wscon.sendFile(file, recipientId);
        // Clear the file input
        fileInput.value = '';
        recipientInput.value = '';
    }
}

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
setAliasBtn.addEventListener('click', setAlias);
messageType.addEventListener('change', toggleRecipientSelect);
sendBtn.addEventListener('click', sendMessage);
pingBtn.addEventListener('click', () => {
    if (wscon) {
        wscon.ws.send(JSON.stringify({ t: 6, data: { timestamp: Date.now() } }));
        logMessage('Sent ping to server', 'sent');
    }
});
userListBtn.addEventListener('click', refreshUserList);

// Legacy event listeners (only if elements exist)
if (subscribeBtn) subscribeBtn.addEventListener('click', subscribe);
if (unsubscribeBtn) unsubscribeBtn.addEventListener('click', unsubscribe);
if (publishBtn) publishBtn.addEventListener('click', publish);
if (broadcastBtn) broadcastBtn.addEventListener('click', testBroadcast);
if (sendFileBtn) sendFileBtn.addEventListener('click', sendFile);

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

// Initialize status
updateStatus(false);
