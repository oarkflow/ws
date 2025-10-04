import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketMessage {
    event: string;
    topic?: string;
    to?: string;
    data?: any;
    code?: number;
    id?: string;
    threadId?: string;
    replyTo?: string;
    from?: string;
    timestamp?: Date;
}

export interface User {
    id: string;
    alias: string;
}

export interface WebSocketHook {
    isConnected: boolean;
    users: User[];
    subscriptions: string[];
    messages: WebSocketMessage[];
    currentUser: User | null;
    isTyping: boolean;
    wsRef: React.MutableRefObject<WebSocketConnection | null>;
    connect: () => void;
    disconnect: () => void;
    sendMessage: (message: string, type: 'broadcast' | 'direct' | 'topic', recipient?: string, topic?: string) => void;
    sendFile: (file: File, recipient?: string, topic?: string) => void;
    setAlias: (alias: string) => void;
    subscribe: (topic: string) => void;
    unsubscribe: (topic: string) => void;
    sendTyping: (isTyping: boolean) => void;
    sendPing: () => void;
    requestUserList: () => void;
    clearMessages: () => void;
    onCallMessage?: (callback: (data: any) => void) => void;
}

class WebSocketConnection {
    private ws: WebSocket | null = null;
    private eventHandlers: { [key: string]: Function[] } = {};
    private subscriptions = new Set<string>();
    private token: string;
    private url: string;
    public userId: string | null = null;
    public userAlias: string | null = null;
    public lastFileMetadata: any = null;
    private fileDownloadUrls: Map<string, string> = new Map();

    constructor(url: string, token?: string) {
        this.url = url;
        this.token = token || '';
    }

    connect(url?: string) {
        const connectUrl = url || this.url;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            let wsUrl = connectUrl;
            if (this.token) {
                wsUrl += (connectUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(this.token);
            }
            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = (event) => {
                this.emit('open', event);
            };

            this.ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    this.handleFileReceived(event.data);
                } else {
                    this.handleMessage(event.data);
                }
            };

            this.ws.onclose = (event) => {
                this.emit('close', event);
                // Auto-reconnect is disabled - no automatic reconnection
            };

            this.ws.onerror = (event) => {
                this.emit('error', event);
            };

        } catch (error) {
            this.emit('error', error);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    subscribe(topic: string) {
        if (!topic) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 4, // MsgSubscribe
                topic: topic
            });
            this.ws.send(message);
            this.subscriptions.add(topic);
            this.emit('subscribed', { topic });
        }
    }

    unsubscribe(topic: string) {
        if (!topic) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 5, // MsgUnsubscribe
                topic: topic
            });
            this.ws.send(message);
            this.subscriptions.delete(topic);
            this.emit('unsubscribed', { topic });
        }
    }

    sendBroadcast(data: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 1, // MsgBroadcast
                data: data
            });
            this.ws.send(message);
            this.emit('broadcast_sent', { data });
        }
    }

    publish(topic: string, data: any) {
        if (!topic || !data) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 1, // MsgBroadcast
                topic: topic,
                data: data
            });
            this.ws.send(message);
            this.emit('published', { topic, data });
        }
    }

    sendDirectMessage(recipientId: string, data: any) {
        if (!recipientId || !data) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 12, // MsgDirect
                to: recipientId,
                data: data
            });
            this.ws.send(message);
            this.emit('direct_sent', { recipientId, data });
        }
    }

    requestUserList() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 14 // MsgUserList
            });
            this.ws.send(message);
        }
    }

    setAlias(alias: string) {
        if (!alias) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 15, // MsgSetAlias
                data: { alias: alias }
            });
            this.ws.send(message);
            this.emit('alias_set', { alias });
        }
    }

    sendTyping(isTyping: boolean) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 11, // MsgTyping
                data: { typing: isTyping }
            });
            this.ws.send(message);
        }
    }

    sendPing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                t: 6, // MsgPing
                data: { timestamp: Date.now() }
            });
            this.ws.send(message);
            this.emit('ping_sent', { timestamp: Date.now() });
        }
    }

    sendFile(file: File, recipientId?: string, topic?: string) {
        if (!file) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const metadata: any = {
                t: 10, // MsgFile
                filename: file.name,
                size: file.size
            };
            if (recipientId) metadata.to = recipientId;
            if (topic) metadata.topic = topic;

            this.ws.send(JSON.stringify(metadata));

            const reader = new FileReader();
            reader.onload = (event) => {
                const arrayBuffer = event.target!.result as ArrayBuffer;
                this.ws!.send(arrayBuffer);
                this.emit('file_sent', { filename: file.name, size: file.size, recipientId, topic });
            };
            reader.readAsArrayBuffer(file);
        }
    }

    on(event: string, handler: Function) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    off(event: string, handler?: Function) {
        if (this.eventHandlers[event]) {
            if (handler) {
                this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
            } else {
                delete this.eventHandlers[event];
            }
        }
    }

    private emit(event: string, data: any) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error('Event handler error:', error);
                }
            });
        }
    }

    private handleFileReceived(data: ArrayBuffer) {
        if (this.lastFileMetadata) {
            const metadata = this.lastFileMetadata;
            const blob = new Blob([data]);
            const url = URL.createObjectURL(blob);

            // Store the download URL
            const fileId = `${metadata.filename}_${Date.now()}`;
            this.fileDownloadUrls.set(fileId, url);

            // Emit file received event with download URL
            this.emit('file_received', {
                ...metadata,
                downloadUrl: url,
                fileId: fileId
            });

            // Clear the stored metadata
            this.lastFileMetadata = null;
        } else {
            // Fallback if no metadata
            const blob = new Blob([data]);
            const url = URL.createObjectURL(blob);
            const fileId = `received_file_${Date.now()}`;
            this.fileDownloadUrls.set(fileId, url);

            this.emit('file_received', {
                filename: 'received_file',
                size: data.byteLength,
                downloadUrl: url,
                fileId: fileId
            });
        }
    }

    private handleMessage(data: string) {
        try {
            const parsed = JSON.parse(data);

            if (parsed.t !== undefined) {
                const readableMsg = this.convertCompactToReadable(parsed);
                this.emit(readableMsg.event, readableMsg);
                this.emit('message', readableMsg);
            } else if (parsed.event) {
                this.emit(parsed.event, parsed);
                this.emit('message', parsed);
            } else {
                this.emit('message', { data: parsed });
            }
        } catch (e) {
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

    private convertCompactToReadable(compactMsg: any): WebSocketMessage {
        const typeMap: { [key: number]: string } = {
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

export function useWebSocket(url: string, token?: string): WebSocketHook {
    const [isConnected, setIsConnected] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [subscriptions, setSubscriptions] = useState<string[]>([]);
    const [messages, setMessages] = useState<WebSocketMessage[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isTyping, setIsTyping] = useState(false);
    const wsRef = useRef<WebSocketConnection | null>(null);

    useEffect(() => {
        wsRef.current = new WebSocketConnection(url, token);

        const ws = wsRef.current;

        ws.on('open', () => {
            setIsConnected(true);
        });

        ws.on('close', () => {
            setIsConnected(false);
        });

        ws.on('user_list', (data: any) => {
            if (data.data && Array.isArray(data.data.users)) {
                setUsers(data.data.users);
            }
        });

        ws.on('subscription_confirmed', (data: any) => {
            setSubscriptions(prev => [...prev, data.topic]);
        });

        ws.on('unsubscription_confirmed', (data: any) => {
            setSubscriptions(prev => prev.filter(topic => topic !== data.topic));
        });

        // Handle incoming messages
        ws.on('broadcast', (data: any) => {
            const message: WebSocketMessage = {
                ...data,
                event: 'broadcast',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, message]);
        });

        ws.on('direct', (data: any) => {
            const isCallMessage = (msgData: any) => {
                try {
                    let messageData = msgData;

                    // If data is an object with a message field, check that too
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
                    // Check if it's a string containing call_invitation
                    if (typeof msgData === 'string' && msgData.includes('call_invitation')) {
                        return true;
                    }
                    return false;
                }
            };

            // Handle call messages - emit them for WebRTC hook to handle
            if (isCallMessage(data.data)) {
                // Emit call message for WebRTC hook to handle through a custom event
                window.dispatchEvent(new CustomEvent('websocket-call-message', { detail: data }));
            } else {
                // Add regular direct messages to chat
                const message: WebSocketMessage = {
                    ...data,
                    event: 'direct',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, message]);
            }
        });

        ws.on('published', (data: any) => {
            const message: WebSocketMessage = {
                ...data,
                event: 'topic',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, message]);
        });

        ws.on('file', (data: any) => {
            ws.lastFileMetadata = data;
        });

        ws.on('file_received', (data: any) => {
            const message: WebSocketMessage = {
                ...data,
                event: 'file',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, message]);
        });

        ws.on('system', (data: any) => {
            console.log('🔍 SYSTEM MESSAGE RECEIVED:', data, 'at', new Date().toISOString());
            if (data.data && data.data.type === 'welcome') {
                if (data.data.id) {
                    // Set current user with the socket ID, use alias if available, otherwise use a default
                    const userAlias = data.data.alias || `User-${data.data.id.substring(0, 8)}`;
                    const user = { id: data.data.id, alias: userAlias };
                    console.log('✅ SETTING CURRENT USER:', user);
                    setCurrentUser(user);
                } else {
                    console.log('❌ No ID in welcome message, available data:', Object.keys(data.data || {}));
                }
            } else {
                console.log('📨 Other system message:', data.data?.type);
            }
            const message: WebSocketMessage = {
                ...data,
                event: 'system',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, message]);
        });

        ws.on('typing', (data: any) => {
            if (data.data && data.data.typing) {
                setIsTyping(true);
                // Auto-hide typing indicator after 3 seconds
                setTimeout(() => {
                    setIsTyping(false);
                }, 3000);
            }
        });
        ws.connect();
        return () => {
            ws.disconnect();
        };
    }, [url, token]);

    const connect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.connect(url);
        }
    }, [url]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.disconnect();
        }
    }, []);

    const sendMessage = useCallback((message: string, type: 'broadcast' | 'direct' | 'topic', recipient?: string, topic?: string) => {
        if (!wsRef.current) return;

        // Create message object for local state
        const messageObj: WebSocketMessage = {
            event: type,
            data: { message },
            timestamp: new Date(),
            from: currentUser?.id
        };

        if (type === 'direct' && recipient) {
            messageObj.to = recipient;
        } else if (type === 'topic' && topic) {
            messageObj.topic = topic;
        }

        // Add to local messages immediately for better UX
        setMessages(prev => [...prev, messageObj]);

        if (type === 'broadcast') {
            // For broadcast, use the broadcast message type
            wsRef.current.sendBroadcast({ message });
        } else if (type === 'direct' && recipient) {
            wsRef.current.sendDirectMessage(recipient, { message });
        } else if (type === 'topic' && topic) {
            wsRef.current.publish(topic, { message });
        }
    }, [currentUser]);

    const sendFile = useCallback((file: File, recipient?: string, topic?: string) => {
        if (wsRef.current) {
            // Create file message object for local state
            const fileMessage: WebSocketMessage = {
                event: 'file',
                data: {
                    filename: file.name,
                    size: file.size
                },
                timestamp: new Date(),
                from: currentUser?.id
            };

            if (recipient) {
                fileMessage.to = recipient;
            }
            if (topic) {
                fileMessage.topic = topic;
            }

            // Add to local messages immediately
            setMessages(prev => [...prev, fileMessage]);

            wsRef.current.sendFile(file, recipient, topic);
        }
    }, [currentUser]);

    const setAlias = useCallback((alias: string) => {
        if (wsRef.current) {
            wsRef.current.setAlias(alias);
        }
    }, []);

    const subscribe = useCallback((topic: string) => {
        if (wsRef.current) {
            wsRef.current.subscribe(topic);
        }
    }, []);

    const unsubscribe = useCallback((topic: string) => {
        if (wsRef.current) {
            wsRef.current.unsubscribe(topic);
        }
    }, []);

    const sendTyping = useCallback((isTyping: boolean) => {
        if (wsRef.current) {
            wsRef.current.sendTyping(isTyping);
        }
    }, []);

    const sendPing = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.sendPing();
        }
    }, []);

    const requestUserList = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.requestUserList();
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return {
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
    };
}
