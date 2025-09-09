export class WebSocketConnection {
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
        this.userId = null;
        this.userAlias = null;
        this.lastFileMetadata = null;
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

    sendFile(file, recipientId = null, topic = null) {
        if (!file) return this;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send file metadata first
            const metadata = {
                t: 10, // MsgFile
                filename: file.name,
                size: file.size
            };
            if (recipientId) {
                metadata.to = recipientId;
            }
            if (topic) {
                metadata.topic = topic;
            }
            this.ws.send(JSON.stringify(metadata));

            // Then send the binary data
            const reader = new FileReader();
            reader.onload = (event) => {
                const arrayBuffer = event.target.result;
                this.ws.send(arrayBuffer);
                this.emit('file_sent', { filename: file.name, size: file.size, recipientId, topic });
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
