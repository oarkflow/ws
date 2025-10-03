import { useState, useRef, useEffect, useCallback } from 'react';

export interface Participant {
    id: string;
    displayName: string;
    stream?: MediaStream;
    isMuted: boolean;
    isVideoOff: boolean;
}

export interface ChatMessage {
    id: string;
    sender: string;
    message: string;
    timestamp: Date;
}

export interface WebRTCHook {
    localStream: MediaStream | null;
    participants: Participant[];
    isConnected: boolean;
    isMuted: boolean;
    isVideoOff: boolean;
    isScreenSharing: boolean;
    isRecording: boolean;
    roomId: string | null;
    participantId: string | null;
    chatMessages: ChatMessage[];
    connect: (roomId: string, displayName: string, authToken?: string) => Promise<void>;
    disconnect: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    toggleScreenShare: () => void;
    toggleRecording: () => void;
    sendChatMessage: (message: string) => void;
}

// WebRTC message types (16-35 for call-specific)
const MSG_TYPES = {
    AUTH: 16,
    JOIN: 17,
    OFFER: 18,
    ANSWER: 19,
    ICE_CANDIDATE: 20,
    MUTE: 21,
    UNMUTE: 22,
    HOLD: 23,
    DTMF: 24,
    JOINED: 25,
    PEER_JOINED: 26,
    PEER_LEFT: 27,
    CALL_STATE_CHANGED: 28,
    RECORDING_STARTED: 29,
    RECORDING_FINISHED: 30,
    DIRECT_CALL_INVITE: 31,
    DIRECT_CALL_ACCEPT: 32,
    DIRECT_CALL_REJECT: 33,
    DIRECT_CALL_END: 34,
    DIRECT_CALL_RINGING: 35,
    CHAT: 36, // Custom for in-call chat
};

class WebRTCManager {
    private ws: WebSocket | null = null;
    private peerConnections = new Map<string, RTCPeerConnection>();
    private localStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private participantId: string | null = null;
    private displayName: string;
    private roomId: string | null = null;
    private eventHandlers: { [key: string]: Function[] } = {};
    private participants = new Map<string, Participant>();
    private chatMessages: ChatMessage[] = [];
    private isMuted = false;
    private isVideoOff = false;
    private isScreenSharing = false;
    private isRecording = false;

    // ICE servers configuration
    private iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ];

    constructor() {
        this.displayName = '';
    }

    async connect(roomId: string, displayName: string, authToken = 'demo-token') {
        this.displayName = displayName;
        this.roomId = roomId;

        try {
            // Get local media stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { width: 1280, height: 720, facingMode: 'user' }
            });

            this.emit('local_stream_ready', this.localStream);

            // Connect to signaling server
            const wsUrl = `ws://localhost:8080/ws?token=${encodeURIComponent(authToken)}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.emit('connected', { roomId });
                // Authenticate
                this.sendSignalingMessage(MSG_TYPES.AUTH, { token: authToken });
                // Join room
                this.sendSignalingMessage(MSG_TYPES.JOIN, {
                    room: roomId,
                    display_name: displayName,
                    capabilities: {
                        audio: true,
                        video: true
                    }
                });
            };

            this.ws.onmessage = (event) => {
                this.handleSignalingMessage(JSON.parse(event.data));
            };

            this.ws.onclose = () => {
                this.emit('disconnected');
            };

            this.ws.onerror = (error) => {
                this.emit('error', error);
            };

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    disconnect() {
        console.log('WebRTC disconnect called - cleaning up all media streams');

        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        // Stop screen sharing if active
        if (this.isScreenSharing) {
            this.stopScreenShare();
        }

        // Close all peer connections
        this.peerConnections.forEach((pc, id) => {
            console.log('Closing peer connection:', id);
            pc.close();
        });
        this.peerConnections.clear();

        // Stop local stream tracks immediately
        if (this.localStream) {
            console.log('Stopping local stream tracks:', this.localStream.getTracks().length);
            this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
                console.log('Stopping track:', track.kind, track.label);
                track.stop();
            });
            this.localStream = null;
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.participants.clear();
        this.emit('disconnected');
    }

    private sendSignalingMessage(type: number, data: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ t: type, data }));
        }
    }

    private handleSignalingMessage(message: any) {
        const type = message.t;
        const data = message.data;

        switch (type) {
            case MSG_TYPES.JOINED:
                this.handleJoined(data);
                break;
            case MSG_TYPES.PEER_JOINED:
                this.handlePeerJoined(data);
                break;
            case MSG_TYPES.PEER_LEFT:
                this.handlePeerLeft(data);
                break;
            case MSG_TYPES.OFFER:
                this.handleOffer(data, message.from);
                break;
            case MSG_TYPES.ANSWER:
                this.handleAnswer(data, message.from);
                break;
            case MSG_TYPES.ICE_CANDIDATE:
                this.handleIceCandidate(data, message.from);
                break;
            case MSG_TYPES.MUTE:
                this.handlePeerMute(message.from);
                break;
            case MSG_TYPES.UNMUTE:
                this.handlePeerUnmute(message.from);
                break;
            case MSG_TYPES.CHAT:
                this.handleChatMessage(data);
                break;
            case MSG_TYPES.RECORDING_STARTED:
                this.emit('recording_started', data);
                break;
            case MSG_TYPES.RECORDING_FINISHED:
                this.emit('recording_finished', data);
                break;
        }
    }

    private handleJoined(data: any) {
        this.participantId = data.participant_id;
        this.emit('joined', { participantId: data.participant_id, roomState: data.room_state });

        // Create peer connections for existing participants
        if (data.room_state && data.room_state.participants) {
            data.room_state.participants.forEach((p: any) => {
                if (p.id !== this.participantId) {
                    this.participants.set(p.id, {
                        id: p.id,
                        displayName: p.display_name,
                        isMuted: false,
                        isVideoOff: false
                    });
                }
            });
        }

        this.emit('participants_updated', Array.from(this.participants.values()));
    }

    private handlePeerJoined(data: any) {
        const participant = data.participant;
        this.participants.set(participant.id, {
            id: participant.id,
            displayName: participant.display_name,
            isMuted: false,
            isVideoOff: false
        });

        // Create peer connection and send offer
        this.createPeerConnection(participant.id, true);
        this.emit('participants_updated', Array.from(this.participants.values()));
    }

    private handlePeerLeft(data: any) {
        const participantId = data.participant_id;
        this.participants.delete(participantId);

        const pc = this.peerConnections.get(participantId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(participantId);
        }

        this.emit('participants_updated', Array.from(this.participants.values()));
    }

    private createPeerConnection(participantId: string, createOffer = false) {
        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections.set(participantId, pc);

        // Add local stream tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            const participant = this.participants.get(participantId);
            if (participant) {
                participant.stream = event.streams[0];
                this.emit('stream_received', { participantId, stream: event.streams[0] });
                this.emit('participants_updated', Array.from(this.participants.values()));
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage(MSG_TYPES.ICE_CANDIDATE, {
                    candidate: event.candidate.toJSON(),
                    target_id: participantId
                });
            }
        };

        // Create offer if initiator
        if (createOffer) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    this.sendSignalingMessage(MSG_TYPES.OFFER, {
                        sdp: pc.localDescription?.sdp,
                        target_id: participantId
                    });
                })
                .catch(error => this.emit('error', error));
        }

        return pc;
    }

    private async handleOffer(data: any, fromId: string) {
        let pc = this.peerConnections.get(fromId);
        if (!pc) {
            pc = this.createPeerConnection(fromId, false);
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: data.sdp
            }));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendSignalingMessage(MSG_TYPES.ANSWER, {
                sdp: answer.sdp,
                target_id: fromId
            });
        } catch (error) {
            this.emit('error', error);
        }
    }

    private async handleAnswer(data: any, fromId: string) {
        const pc = this.peerConnections.get(fromId);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: data.sdp
                }));
            } catch (error) {
                this.emit('error', error);
            }
        }
    }

    private async handleIceCandidate(data: any, fromId: string) {
        const pc = this.peerConnections.get(fromId);
        if (pc && data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                this.emit('error', error);
            }
        }
    }

    private handlePeerMute(fromId: string) {
        const participant = this.participants.get(fromId);
        if (participant) {
            participant.isMuted = true;
            this.emit('participants_updated', Array.from(this.participants.values()));
        }
    }

    private handlePeerUnmute(fromId: string) {
        const participant = this.participants.get(fromId);
        if (participant) {
            participant.isMuted = false;
            this.emit('participants_updated', Array.from(this.participants.values()));
        }
    }

    private handleChatMessage(data: any) {
        const chatMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: data.sender || 'Unknown',
            message: data.message,
            timestamp: new Date()
        };
        this.chatMessages.push(chatMessage);
        this.emit('chat_message', chatMessage);
    }

    toggleMute() {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.isMuted = !audioTrack.enabled;

            // Notify peers
            this.sendSignalingMessage(
                this.isMuted ? MSG_TYPES.MUTE : MSG_TYPES.UNMUTE,
                {}
            );

            this.emit('mute_changed', this.isMuted);
        }
    }

    toggleVideo() {
        if (!this.localStream) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.isVideoOff = !videoTrack.enabled;
            this.emit('video_changed', this.isVideoOff);
        }
    }

    async toggleScreenShare() {
        if (this.isScreenSharing) {
            this.stopScreenShare();
        } else {
            await this.startScreenShare();
        }
    }

    private async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: 1920, height: 1080 },
                audio: false
            });

            this.isScreenSharing = true;
            this.emit('screen_share_started', this.screenStream);

            // Replace video track in all peer connections
            const screenTrack = this.screenStream.getVideoTracks()[0];
            this.peerConnections.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            });

            // Handle screen share stop
            screenTrack.onended = () => {
                this.stopScreenShare();
            };

        } catch (error) {
            this.emit('error', error);
        }
    }

    private stopScreenShare() {
        if (!this.screenStream) return;

        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
        this.isScreenSharing = false;

        // Revert to camera video
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            this.peerConnections.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }
            });
        }

        this.emit('screen_share_stopped');
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    private startRecording() {
        if (!this.localStream) return;

        try {
            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(this.localStream, {
                mimeType: 'video/webm;codecs=vp9'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                this.emit('recording_ready', { url, blob });
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.emit('recording_started');

            // Notify server
            this.sendSignalingMessage(MSG_TYPES.RECORDING_STARTED, {});
        } catch (error) {
            this.emit('error', error);
        }
    }

    private stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.emit('recording_stopped');

            // Notify server
            this.sendSignalingMessage(MSG_TYPES.RECORDING_FINISHED, {});
        }
    }

    sendChatMessage(message: string) {
        this.sendSignalingMessage(MSG_TYPES.CHAT, {
            message,
            sender: this.displayName
        });

        // Add to local messages
        const chatMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: this.displayName,
            message,
            timestamp: new Date()
        };
        this.chatMessages.push(chatMessage);
        this.emit('chat_message', chatMessage);
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
                const index = this.eventHandlers[event].indexOf(handler);
                if (index > -1) {
                    this.eventHandlers[event].splice(index, 1);
                }
            } else {
                delete this.eventHandlers[event];
            }
        }
    }

    private emit(event: string, data?: any) {
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

    getState() {
        return {
            isMuted: this.isMuted,
            isVideoOff: this.isVideoOff,
            isScreenSharing: this.isScreenSharing,
            isRecording: this.isRecording,
            participantId: this.participantId,
            roomId: this.roomId
        };
    }
}

export function useWebRTC(): WebRTCHook {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [participantId, setParticipantId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    const managerRef = useRef<WebRTCManager | null>(null);

    useEffect(() => {
        managerRef.current = new WebRTCManager();
        const manager = managerRef.current;

        manager.on('local_stream_ready', (stream: MediaStream) => {
            setLocalStream(stream);
        });

        manager.on('connected', (data: any) => {
            setIsConnected(true);
            setRoomId(data.roomId);
        });

        manager.on('disconnected', () => {
            setIsConnected(false);
            setLocalStream(null);
        });

        manager.on('joined', (data: any) => {
            setParticipantId(data.participantId);
        });

        manager.on('participants_updated', (participantsList: Participant[]) => {
            setParticipants([...participantsList]);
        });

        manager.on('mute_changed', (muted: boolean) => {
            setIsMuted(muted);
        });

        manager.on('video_changed', (videoOff: boolean) => {
            setIsVideoOff(videoOff);
        });

        manager.on('screen_share_started', () => {
            setIsScreenSharing(true);
        });

        manager.on('screen_share_stopped', () => {
            setIsScreenSharing(false);
        });

        manager.on('recording_started', () => {
            setIsRecording(true);
        });

        manager.on('recording_stopped', () => {
            setIsRecording(false);
        });

        manager.on('chat_message', (message: ChatMessage) => {
            setChatMessages(prev => [...prev, message]);
        });

        return () => {
            manager.disconnect();
        };
    }, []);

    const connect = useCallback(async (roomId: string, displayName: string, authToken?: string) => {
        if (managerRef.current) {
            await managerRef.current.connect(roomId, displayName, authToken);
        }
    }, []);

    const disconnect = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.disconnect();
        }
    }, []);

    const toggleMute = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.toggleMute();
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.toggleVideo();
        }
    }, []);

    const toggleScreenShare = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.toggleScreenShare();
        }
    }, []);

    const toggleRecording = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.toggleRecording();
        }
    }, []);

    const sendChatMessage = useCallback((message: string) => {
        if (managerRef.current) {
            managerRef.current.sendChatMessage(message);
        }
    }, []);

    return {
        localStream,
        participants,
        isConnected,
        isMuted,
        isVideoOff,
        isScreenSharing,
        isRecording,
        roomId,
        participantId,
        chatMessages,
        connect,
        disconnect,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        toggleRecording,
        sendChatMessage
    };
}
