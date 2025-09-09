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

    sendFile(file, recipientId = null) {
        if (!file) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send metadata first
            const metadata = {
                t: 10, // MsgFile
                data: {
                    filename: file.name,
                    size: file.size,
                    type: file.type
                }
            };
            if (recipientId) {
                metadata.to = recipientId;
            }
            this.ws.send(JSON.stringify(metadata));

            // Then send the binary data
            const reader = new FileReader();
            reader.onload = (event) => {
                this.ws.send(event.target.result);
                this.emit('file_sent', { filename: file.name, size: file.size, recipientId });
            };
            reader.readAsArrayBuffer(file);
        }

        return this;
    }

    sendTyping(isTyping = true) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 11, // MsgTyping
                data: { typing: isTyping }
            });
            this.ws.send(message);
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
            11: 'typing'
        };

        return {
            event: typeMap[compactMsg.t] || 'unknown',
            topic: compactMsg.topic,
            to: compactMsg.to,
            data: compactMsg.data,
            code: compactMsg.code,
            id: compactMsg.id
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
    wscon = new WebSocketConnection('wss://localhost:8080/ws', {
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

    wscon.on('announcement', (data) => {
        if (data.data && typeof data.data === 'object' && data.data.message) {
            logMessage(`📣 ${data.data.message}`, 'received');
        } else {
            logMessage(`📣 Announcement`, 'received');
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
}

const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const subscribeBtn = document.getElementById('subscribeBtn');
const unsubscribeBtn = document.getElementById('unsubscribeBtn');
const publishBtn = document.getElementById('publishBtn');
const pingBtn = document.getElementById('pingBtn');
const broadcastBtn = document.getElementById('broadcastBtn');
const sendFileBtn = document.getElementById('sendFileBtn');
const topicInput = document.getElementById('topicInput');
const messageInput = document.getElementById('messageInput');
const fileInput = document.getElementById('fileInput');
const recipientInput = document.getElementById('recipientInput');
const logContainer = document.getElementById('logContainer');

function updateStatus(connected) {
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        subscribeBtn.disabled = false;
        unsubscribeBtn.disabled = false;
        publishBtn.disabled = false;
        pingBtn.disabled = false;
        broadcastBtn.disabled = false;
        sendFileBtn.disabled = false;
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        subscribeBtn.disabled = true;
        unsubscribeBtn.disabled = true;
        publishBtn.disabled = true;
        pingBtn.disabled = true;
        broadcastBtn.disabled = true;
        sendFileBtn.disabled = true;
    }
}

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

function connect() {
    if (!wscon) {
        initializeWebSocket();
    }
    wscon.connect();
}

function disconnect() {
    if (wscon) {
        wscon.disconnect();
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
subscribeBtn.addEventListener('click', subscribe);
unsubscribeBtn.addEventListener('click', unsubscribe);
publishBtn.addEventListener('click', publish);
pingBtn.addEventListener('click', ping);
broadcastBtn.addEventListener('click', testBroadcast);
sendFileBtn.addEventListener('click', sendFile);

// Typing indicators
let typingTimer;
messageInput.addEventListener('input', () => {
    if (wscon && wscon.isConnected()) {
        wscon.sendTyping(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            wscon.sendTyping(false);
        }, 1000);
    }
});

messageInput.addEventListener('blur', () => {
    if (wscon && wscon.isConnected()) {
        wscon.sendTyping(false);
        clearTimeout(typingTimer);
    }
});

// Initialize status
updateStatus(false);

// Example usage in console:
// wscon.subscribe('news').on('message', (data) => console.log(data));
// wscon.on('open', () => console.log('Connected!'));
// wscon.publish('chat', 'Hello World');
