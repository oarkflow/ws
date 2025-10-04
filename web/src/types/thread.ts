export interface Thread {
    id: string;
    type: 'broadcast' | 'direct' | 'topic';
    name: string;
    recipientId?: string; // For direct messages
    topicName?: string; // For topic/channel
    lastMessage?: string;
    lastMessageTime?: Date;
    unreadCount?: number;
}

export interface ThreadMessage {
    id: string;
    threadId: string;
    from: string;
    fromAlias?: string;
    content: string;
    timestamp: Date;
    type: 'text' | 'file' | 'system';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
}

export interface ActiveThread {
    thread: Thread | null;
    messages: ThreadMessage[];
}
