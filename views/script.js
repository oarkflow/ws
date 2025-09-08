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

            this.ws.onopen = (event) => {
                this.reconnectAttempts = 0;
                this.emit('open', event);
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
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
            if (data.startsWith('subscribed:')) {
                const topic = data.substring(11);
                this.emit('subscription_confirmed', { topic });
            } else if (data.startsWith('unsubscribed:')) {
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
            9: 'ack'
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
        logMessage(`Server welcome: ${data.message}`, 'received');
    });

    wscon.on('pong', (data) => {
        logMessage(`Pong received: ${JSON.stringify(data)}`, 'received');
    });

    wscon.on('heartbeat', (data) => {
        logMessage(`Heartbeat: ${data.connections} connections`, 'received');
    });

    wscon.on('ack', (data) => {
        logMessage(`Server acknowledged: ${JSON.stringify(data)}`, 'received');
    });

    wscon.on('broadcast', (data) => {
        logMessage(`Broadcast received: ${JSON.stringify(data)}`, 'received');
    });

    wscon.on('test_broadcast_response', (data) => {
        logMessage(`Test broadcast response: ${JSON.stringify(data)}`, 'received');
    });

    wscon.on('announcement', (data) => {
        logMessage(`Announcement: ${JSON.stringify(data)}`, 'received');
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
const topicInput = document.getElementById('topicInput');
const messageInput = document.getElementById('messageInput');
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
    }
}

function logMessage(message, type = 'received') {
    const div = document.createElement('div');
    div.className = `log-message ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
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

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
subscribeBtn.addEventListener('click', subscribe);
unsubscribeBtn.addEventListener('click', unsubscribe);
publishBtn.addEventListener('click', publish);
pingBtn.addEventListener('click', ping);
broadcastBtn.addEventListener('click', testBroadcast);

// Initialize status
updateStatus(false);

// Example usage in console:
// wscon.subscribe('news').on('message', (data) => console.log(data));
// wscon.on('open', () => console.log('Connected!'));
// wscon.publish('chat', 'Hello World');
