// WebRTC Call Client
class WebRTCCallClient {
    constructor() {
        this.ws = null;
        this.peerConnections = new Map();
        this.localStream = null;
        this.roomId = null;
        this.participantId = null;
        this.isMuted = false;
        this.isVideoEnabled = true;
        this.isRecording = false;
        this.isScreenSharing = false;
        this.screenStream = null;
        this.directCallId = null;
        this.directCallState = null; // null, 'calling', 'ringing', 'active'
        this.directCallPeer = null;

        // Audio context for tones
        this.audioContext = null;
        this.currentTone = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.checkMediaSupport();
        this.initAudioContext();
    }

    bindEvents() {
        // Setup screen events
        document.getElementById('joinBtn').addEventListener('click', () => this.joinCall());
        document.getElementById('authToken').addEventListener('input', () => this.validateJoinButton());
        document.getElementById('displayName').addEventListener('input', () => this.validateJoinButton());

        // Call control events
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('videoBtn').addEventListener('click', () => this.toggleVideo());
        document.getElementById('screenShareBtn').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('hangUpBtn').addEventListener('click', () => this.hangUp());

        // Chat events
        document.getElementById('chatToggleBtn').addEventListener('click', () => this.toggleChat());
        document.getElementById('closeChatBtn').addEventListener('click', () => this.toggleChat());
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Participants panel
        document.getElementById('closeParticipantsBtn').addEventListener('click', () => this.toggleParticipants());

        // Error modal
        document.getElementById('closeErrorBtn').addEventListener('click', () => this.hideErrorModal());

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.toggleParticipants());
    }

    validateJoinButton() {
        const name = document.getElementById('displayName').value.trim();
        const joinBtn = document.getElementById('joinBtn');

        joinBtn.disabled = !name;
    }

    async checkMediaSupport() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasAudio = devices.some(device => device.kind === 'audioinput');
            const hasVideo = devices.some(device => device.kind === 'videoinput');

            document.getElementById('audioEnabled').disabled = !hasAudio;
            document.getElementById('videoEnabled').disabled = !hasVideo;

            if (!hasAudio) document.getElementById('audioEnabled').checked = false;
            if (!hasVideo) document.getElementById('videoEnabled').checked = false;
        } catch (error) {
            console.warn('Could not enumerate devices:', error);
        }
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            // Resume audio context on user interaction
            document.addEventListener('click', () => {
                if (this.audioContext && this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
            }, { once: true });
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    async playTone(frequency, duration = 1000, type = 'sine') {
        if (!this.audioContext) return;

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.stopTone();

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration / 1000);

        this.currentTone = oscillator;
    }

    stopTone() {
        if (this.currentTone) {
            try {
                this.currentTone.stop();
            } catch (error) {
                // Tone might already be stopped
            }
            this.currentTone = null;
        }
    }

    playCallingTone() {
        // Play calling tone (repeated beeps)
        const playBeep = () => {
            if (this.directCallState === 'calling') {
                this.playTone(800, 200);
                setTimeout(playBeep, 2000);
            }
        };
        playBeep();
    }

    playRingtone() {
        // Play ringtone (alternating frequencies)
        const playRing = () => {
            if (this.directCallState === 'ringing') {
                this.playTone(800, 500);
                setTimeout(() => {
                    if (this.directCallState === 'ringing') {
                        this.playTone(1200, 500);
                        setTimeout(playRing, 2000);
                    }
                }, 500);
            }
        };
        playRing();
    }

    playEndTone() {
        // Play end call tone (descending tone)
        this.playTone(800, 300);
        setTimeout(() => this.playTone(600, 300), 150);
        setTimeout(() => this.playTone(400, 500), 300);
    }

    async joinCall() {
        const authToken = document.getElementById('authToken').value.trim() || 'demo-token';
        const roomId = document.getElementById('roomId').value.trim() || this.generateRoomId();
        const displayName = document.getElementById('displayName').value.trim();
        const audioEnabled = document.getElementById('audioEnabled').checked;
        const videoEnabled = document.getElementById('videoEnabled').checked;

        if (!displayName) {
            this.showError('Please enter your display name');
            return;
        }

        try {
            this.showSetupStatus('Connecting...');

            // Get user media
            const constraints = {
                audio: audioEnabled,
                video: videoEnabled ? { width: 1280, height: 720 } : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Connect to signaling server
            await this.connectToSignalingServer();

            // Authenticate first
            this.sendSignalingMessage('auth', {
                token: authToken
            });

            // Join room
            this.roomId = roomId;
            this.sendSignalingMessage('join', {
                room: roomId,
                display_name: displayName,
                capabilities: {
                    audio: audioEnabled,
                    video: videoEnabled
                }
            });

            // Switch to call screen
            document.getElementById('setupScreen').classList.add('hidden');
            document.getElementById('callScreen').classList.remove('hidden');
            document.getElementById('currentRoomId').textContent = roomId;

            // Setup local video after screen switch
            const localVideo = document.getElementById('localVideo');
            if (!localVideo) {
                console.error('Local video element not found');
                throw new Error('Local video element not found');
            }
            localVideo.srcObject = this.localStream;
            console.log('Local video srcObject set, tracks:', this.localStream.getVideoTracks().length);

            // Add event listeners for debugging
            localVideo.addEventListener('loadedmetadata', () => {
                console.log('Local video metadata loaded');
            });

            localVideo.addEventListener('canplay', () => {
                console.log('Local video can play');
            });

            localVideo.addEventListener('play', () => {
                console.log('Local video started playing');
            });

            localVideo.addEventListener('error', (e) => {
                console.error('Local video error:', e);
            });

            // Ensure video plays after screen switch (handle autoplay restrictions)
            localVideo.play().catch(error => {
                console.warn('Local video autoplay failed:', error);
                // Try again after a short delay
                setTimeout(() => {
                    localVideo.play().catch(e => console.error('Local video play failed:', e));
                }, 100);
            });            // Ensure video is visible
            localVideo.style.display = 'block';
            localVideo.style.visibility = 'visible';

            // Connect to signaling server
            await this.connectToSignalingServer();

            // Authenticate first
            this.sendSignalingMessage('auth', {
                token: authToken
            });

            // Join room
            this.roomId = roomId;
            this.sendSignalingMessage('join', {
                room: roomId,
                display_name: displayName,
                capabilities: {
                    audio: audioEnabled,
                    video: videoEnabled
                }
            });

            // Switch to call screen
            document.getElementById('setupScreen').classList.add('hidden');
            document.getElementById('callScreen').classList.remove('hidden');
            document.getElementById('currentRoomId').textContent = roomId;

            // Ensure video plays after screen switch (handle autoplay restrictions)
            localVideo.play().catch(error => {
                console.warn('Local video autoplay failed:', error);
                // Try again after a short delay
                setTimeout(() => {
                    localVideo.play().catch(e => console.error('Local video play failed:', e));
                }, 100);
            });

            this.showToast('Joined call successfully!', 'success');

        } catch (error) {
            console.error('Failed to join call:', error);
            const errorMessage = error.message || 'Unknown error occurred';
            this.showError('Failed to join call: ' + errorMessage);

            // Clean up on error
            this.cleanup();
        }
    }

    async connectToSignalingServer() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;

            console.log('Connecting to WebSocket:', wsUrl);
            this.ws = new WebSocket(wsUrl);

            let connectionTimeout;

            this.ws.onopen = () => {
                console.log('Connected to signaling server');
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                }
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    this.handleSignalingMessage(JSON.parse(event.data));
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = (event) => {
                console.log('Disconnected from signaling server:', event.code, event.reason);
                this.ws = null;
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                }
                this.handleDisconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.ws = null;
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                }
                reject(new Error('WebSocket connection failed'));
            };

            // Timeout after 10 seconds
            connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                    console.error('WebSocket connection timeout');
                    if (this.ws) {
                        this.ws.close();
                        this.ws = null;
                    }
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    handleSignalingMessage(message) {
        console.log('Received signaling message:', message);

        // Handle backend's unified message format
        let messageType;
        let payload;

        if (message.t !== undefined) {
            // Backend format: { t: numeric_type, data: payload }
            messageType = this.msgTypeToString(message.t);
            payload = message.data || {};
        } else {
            // Frontend format: { type: string_type, payload: payload }
            messageType = message.type;
            payload = message.payload || {};
        }

        switch (messageType) {
            case 'joined':
                this.handleJoined(payload);
                break;
            case 'peer-joined':
                this.handlePeerJoined(payload);
                break;
            case 'peer-left':
                this.handlePeerLeft(payload);
                break;
            case 'offer':
                this.handleOffer(payload, message.from || payload.from);
                break;
            case 'answer':
                this.handleAnswer(payload, message.from || payload.from);
                break;
            case 'ice-candidate':
                this.handleIceCandidate(payload, message.from || payload.from);
                break;
            case 'mute':
            case 'unmute':
                this.handleMuteStatus(payload, message.from || payload.from);
                break;
            case 'call-state-changed':
                this.handleCallStateChanged(payload);
                break;
            case 'recording-started':
                this.handleRecordingStarted(payload);
                break;
            case 'recording-finished':
                this.handleRecordingFinished(payload);
                break;
            case 'direct-call-invite':
                this.handleDirectCallInvite(payload);
                break;
            case 'direct-call-accept':
                this.handleDirectCallAccept(payload);
                break;
            case 'direct-call-reject':
                this.handleDirectCallReject(payload);
                break;
            case 'direct-call-end':
                this.handleDirectCallEnd(payload);
                break;
            case 'direct-call-ringing':
                this.handleDirectCallRinging(payload);
                break;
            case 'ack':
                // Handle acknowledgment messages
                if (payload.status === 'authenticated') {
                    console.log('Authenticated successfully');
                }
                break;
            case 'error':
                this.showError(payload.message || 'Unknown error');
                break;
            default:
                console.log('Unknown message type:', messageType);
        }
    }

    msgTypeToString(msgType) {
        const typeMap = {
            16: 'auth',
            17: 'join',
            18: 'offer',
            19: 'answer',
            20: 'ice-candidate',
            21: 'mute',
            22: 'unmute',
            23: 'hold',
            24: 'dtmf',
            25: 'joined',
            26: 'peer-joined',
            27: 'peer-left',
            28: 'call-state-changed',
            29: 'recording-started',
            30: 'recording-finished',
            31: 'direct-call-invite',
            32: 'direct-call-accept',
            33: 'direct-call-reject',
            34: 'direct-call-end',
            35: 'direct-call-ringing',
            8: 'error',
            9: 'ack'
        };
        return typeMap[msgType] || 'unknown';
    }

    handleJoined(payload) {
        this.participantId = payload.participant_id;
        this.updateRoomState(payload.room_state);
        console.log('Joined room with participant ID:', this.participantId);
    }

    handlePeerJoined(payload) {
        const participant = payload.participant;
        this.addParticipant(participant);
        this.createPeerConnection(participant.id);
        this.showToast(`${participant.display_name} joined the call`, 'success');
    }

    handlePeerLeft(payload) {
        const participantId = payload.participant_id;
        this.removeParticipant(participantId);
        this.removePeerConnection(participantId);
        this.showToast('A participant left the call', 'warning');
    }

    async handleOffer(payload, fromId) {
        try {
            const peerConnection = this.getOrCreatePeerConnection(fromId);
            await peerConnection.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: payload.sdp
            }));

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.sendSignalingMessage('answer', {
                sdp: answer.sdp,
                call_id: payload.call_id
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(payload, fromId) {
        try {
            const peerConnection = this.peerConnections.get(fromId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: payload.sdp
                }));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(payload, fromId) {
        try {
            const peerConnection = this.peerConnections.get(fromId);
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate({
                    candidate: payload.candidate,
                    sdpMid: payload.sdpMid,
                    sdpMLineIndex: payload.sdpMLineIndex
                }));
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    handleMuteStatus(payload, fromId) {
        // Update UI to show mute status
        const participantElement = document.querySelector(`[data-participant-id="${fromId}"]`);
        if (participantElement) {
            const mutedIndicator = participantElement.querySelector('.muted-indicator');
            if (payload.muted) {
                if (!mutedIndicator) {
                    const indicator = document.createElement('div');
                    indicator.className = 'muted-indicator';
                    indicator.innerHTML = '<i data-lucide="mic-off" class="w-3 h-3"></i>';
                    participantElement.appendChild(indicator);
                    lucide.createIcons();
                }
            } else {
                if (mutedIndicator) {
                    mutedIndicator.remove();
                }
            }
        }
    }

    handleCallStateChanged(payload) {
        // Handle call state changes
        console.log('Call state changed:', payload);
    }

    handleRecordingStarted(payload) {
        this.isRecording = true;
        this.updateRecordingUI();
        this.showToast('Recording started', 'success');
    }

    handleRecordingFinished(payload) {
        this.isRecording = false;
        this.updateRecordingUI();
        this.showToast('Recording finished', 'success');
    }

    makeDirectCall(targetUserId, targetName) {
        if (this.directCallState) {
            this.showError('Already in a call');
            return;
        }

        this.directCallId = this.generateMessageId();
        this.directCallState = 'calling';
        this.directCallPeer = targetUserId;

        this.sendSignalingMessage('direct-call-invite', {
            target_user_id: targetUserId,
            caller_name: this.getCurrentUserName(),
            call_id: this.directCallId
        });

        this.showOutgoingCallModal(targetName);
    }

    acceptDirectCall() {
        if (this.directCallState !== 'ringing' || !this.directCallId) return;

        this.stopTone();
        this.sendSignalingMessage('direct-call-accept', {
            call_id: this.directCallId
        });

        this.hideIncomingCallModal();
        this.directCallState = 'active';
        this.showToast('Call accepted!', 'success');
        // Start WebRTC connection for direct call
        this.startDirectCallConnection();
    }

    rejectDirectCall() {
        if (this.directCallState !== 'ringing' || !this.directCallId) return;

        this.stopTone();
        this.sendSignalingMessage('direct-call-reject', {
            call_id: this.directCallId
        });

        this.hideIncomingCallModal();
        this.directCallState = null;
        this.directCallId = null;
    }

    endDirectCall() {
        if (!this.directCallState || !this.directCallId) return;

        this.stopTone();
        this.sendSignalingMessage('direct-call-end', {
            call_id: this.directCallId
        });

        this.endDirectCallLocally();
    }

    endDirectCallLocally() {
        this.directCallState = null;
        this.directCallId = null;
        this.directCallPeer = null;
        this.hideIncomingCallModal();
        this.hideOutgoingCallModal();
        // Clean up WebRTC connections for direct call
        this.cleanupDirectCallConnections();
    }

    startDirectCallConnection() {
        // Initialize WebRTC connection for direct call
        // This would be similar to the room-based connection but for direct peer
        console.log('Starting direct call connection...');
    }

    cleanupDirectCallConnections() {
        // Clean up any direct call specific connections
        console.log('Cleaning up direct call connections...');
    }

    getCurrentUserName() {
        // Get current user's display name
        return document.getElementById('displayName').value || 'Anonymous';
    }

    createPeerConnection(participantId) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        // Add local tracks
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Handle remote tracks
        peerConnection.ontrack = (event) => {
            this.addRemoteVideo(participantId, event.streams[0]);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage('ice-candidate', {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Peer connection state for ${participantId}:`, peerConnection.connectionState);
        };

        this.peerConnections.set(participantId, peerConnection);

        // Create offer if we're the initiator
        if (participantId > this.participantId) {
            this.createAndSendOffer(participantId);
        }
    }

    async createAndSendOffer(participantId) {
        try {
            const peerConnection = this.peerConnections.get(participantId);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.sendSignalingMessage('offer', {
                sdp: offer.sdp,
                call_id: this.roomId
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    getOrCreatePeerConnection(participantId) {
        if (!this.peerConnections.has(participantId)) {
            this.createPeerConnection(participantId);
        }
        return this.peerConnections.get(participantId);
    }

    removePeerConnection(participantId) {
        const peerConnection = this.peerConnections.get(participantId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(participantId);
        }

        // Remove remote video
        const remoteVideo = document.getElementById(`remote-video-${participantId}`);
        if (remoteVideo) {
            remoteVideo.remove();
        }
    }

    addRemoteVideo(participantId, stream) {
        const remoteVideos = document.getElementById('remoteVideos');

        // Check if video element already exists
        let videoElement = document.getElementById(`remote-video-${participantId}`);
        if (!videoElement) {
            const container = document.createElement('div');
            container.className = 'video-container';
            container.setAttribute('data-participant-id', participantId);

            videoElement = document.createElement('video');
            videoElement.id = `remote-video-${participantId}`;
            videoElement.autoplay = true;
            videoElement.playsinline = true;

            const participantInfo = document.createElement('div');
            participantInfo.className = 'participant-info';
            participantInfo.textContent = `Participant ${participantId}`;

            container.appendChild(videoElement);
            container.appendChild(participantInfo);
            remoteVideos.appendChild(container);
        }

        videoElement.srcObject = stream;
    }

    addParticipant(participant) {
        const participantsList = document.getElementById('participantsList');

        const participantElement = document.createElement('div');
        participantElement.className = 'participant-item';
        participantElement.setAttribute('data-participant-id', participant.id);

        participantElement.innerHTML = `
            <div class="avatar">${participant.display_name.charAt(0).toUpperCase()}</div>
            <div class="info">
                <div class="name">${participant.display_name}</div>
                <div class="role">${participant.role}</div>
            </div>
            <button class="call-participant-btn bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg ml-2"
                    data-user-id="${participant.user_id}"
                    data-user-name="${participant.display_name}">
                <i data-lucide="phone" class="w-4 h-4"></i>
            </button>
        `;

        participantsList.appendChild(participantElement);

        // Add event listener for call button
        const callBtn = participantElement.querySelector('.call-participant-btn');
        callBtn.addEventListener('click', (e) => {
            const userId = e.currentTarget.getAttribute('data-user-id');
            const userName = e.currentTarget.getAttribute('data-user-name');
            this.makeDirectCall(userId, userName);
        });

        this.updateParticipantCount();
        lucide.createIcons();
    }

    removeParticipant(participantId) {
        const participantElement = document.querySelector(`[data-participant-id="${participantId}"]`);
        if (participantElement) {
            participantElement.remove();
        }
        this.updateParticipantCount();
    }

    updateParticipantCount() {
        const count = document.querySelectorAll('.participant-item').length + 1; // +1 for self
        document.getElementById('participantCount').textContent = count;
    }

    updateRoomState(roomState) {
        // Clear existing participants
        document.getElementById('participantsList').innerHTML = '';

        // Add all participants
        roomState.participants.forEach(participant => {
            this.addParticipant(participant);
        });

        // Create peer connections for existing participants
        roomState.participants.forEach(participant => {
            if (participant.id !== this.participantId) {
                this.createPeerConnection(participant.id);
            }
        });
    }

    sendSignalingMessage(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                const message = {
                    t: this.stringToMsgType(type), // Use numeric type that backend expects
                    data: payload,
                    id: this.generateMessageId()
                };
                this.ws.send(JSON.stringify(message));
                console.log('Sent signaling message:', type, message);
            } catch (error) {
                console.error('Error sending WebSocket message:', error);
                this.showError('Failed to send message to server');
            }
        } else {
            console.warn('WebSocket not connected, cannot send message:', type);
        }
    }

    stringToMsgType(type) {
        const typeMap = {
            'auth': 16,
            'join': 17,
            'offer': 18,
            'answer': 19,
            'ice-candidate': 20,
            'mute': 21,
            'unmute': 22,
            'hold': 23,
            'dtmf': 24,
            'leave': 27, // Using peer-left type for leave
            'direct-call-invite': 31,
            'direct-call-accept': 32,
            'direct-call-reject': 33,
            'direct-call-end': 34,
        };
        return typeMap[type] || 3; // Default to system message
    }

    async toggleMute() {
        if (!this.localStream) return;

        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) return;

        this.isMuted = !this.isMuted;
        audioTracks.forEach(track => {
            track.enabled = !this.isMuted;
        });

        // Update UI
        const muteBtn = document.getElementById('muteBtn');
        if (!muteBtn) return;
        const icon = muteBtn.querySelector('i');
        if (!icon) return;

        if (this.isMuted) {
            muteBtn.classList.add('bg-red-600');
            muteBtn.classList.remove('bg-slate-700');
            icon.setAttribute('data-lucide', 'mic-off');
        } else {
            muteBtn.classList.remove('bg-red-600');
            muteBtn.classList.add('bg-slate-700');
            icon.setAttribute('data-lucide', 'mic');
        }

        lucide.createIcons();

        // Send signaling message
        this.sendSignalingMessage(this.isMuted ? 'mute' : 'unmute', {
            call_id: this.roomId,
            track: 'audio'
        });
    }

    async toggleVideo() {
        if (!this.localStream) return;

        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length === 0) return;

        this.isVideoEnabled = !this.isVideoEnabled;
        videoTracks.forEach(track => {
            track.enabled = this.isVideoEnabled;
        });

        // Update UI
        const videoBtn = document.getElementById('videoBtn');
        if (!videoBtn) return;
        const icon = videoBtn.querySelector('i');
        if (!icon) return;

        if (!this.isVideoEnabled) {
            videoBtn.classList.add('bg-red-600');
            videoBtn.classList.remove('bg-slate-700');
            icon.setAttribute('data-lucide', 'video-off');
        } else {
            videoBtn.classList.remove('bg-red-600');
            videoBtn.classList.add('bg-slate-700');
            icon.setAttribute('data-lucide', 'video');
        }

        lucide.createIcons();
    }

    async toggleScreenShare() {
        if (this.isScreenSharing) {
            this.stopScreenShare();
        } else {
            await this.startScreenShare();
        }
    }

    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen' },
                audio: false
            });

            // Add screen track to all peer connections
            const screenTrack = this.screenStream.getVideoTracks()[0];
            this.peerConnections.forEach(peerConnection => {
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            });

            // Setup screen video
            const screenVideo = document.getElementById('screenVideo');
            screenVideo.srcObject = this.screenStream;

            // Show screen share container
            document.getElementById('screenShareContainer').classList.remove('hidden');

            this.isScreenSharing = true;
            this.updateScreenShareUI();

            // Handle screen share stop
            screenTrack.onended = () => {
                this.stopScreenShare();
            };

        } catch (error) {
            console.error('Error starting screen share:', error);
            this.showError('Failed to start screen sharing');
        }
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Switch back to camera for all peer connections
        const videoTrack = this.localStream.getVideoTracks()[0];
        this.peerConnections.forEach(peerConnection => {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
        });

        // Hide screen share container
        document.getElementById('screenShareContainer').classList.add('hidden');

        this.isScreenSharing = false;
        this.updateScreenShareUI();
    }

    updateScreenShareUI() {
        const screenShareBtn = document.getElementById('screenShareBtn');

        if (this.isScreenSharing) {
            screenShareBtn.classList.add('bg-green-600');
            screenShareBtn.classList.remove('bg-slate-700');
        } else {
            screenShareBtn.classList.remove('bg-green-600');
            screenShareBtn.classList.add('bg-slate-700');
        }
    }

    toggleRecording() {
        this.isRecording = !this.isRecording;
        this.updateRecordingUI();

        // Send signaling message
        const messageType = this.isRecording ? 'recording-started' : 'recording-finished';
        this.sendSignalingMessage(messageType, {
            call_id: this.roomId
        });
    }

    updateRecordingUI() {
        const recordBtn = document.getElementById('recordBtn');
        if (!recordBtn) return;
        const icon = recordBtn.querySelector('i');
        if (!icon) return;

        if (this.isRecording) {
            recordBtn.classList.add('bg-red-600');
            recordBtn.classList.remove('bg-slate-700');
            icon.setAttribute('data-lucide', 'stop-circle');

            // Add recording indicator to local video
            const indicator = document.createElement('div');
            indicator.className = 'recording-indicator';
            indicator.innerHTML = '<i data-lucide="circle" class="w-3 h-3 mr-1"></i> REC';
            document.getElementById('localVideoContainer').appendChild(indicator);
            lucide.createIcons();
        } else {
            recordBtn.classList.remove('bg-red-600');
            recordBtn.classList.add('bg-slate-700');
            icon.setAttribute('data-lucide', 'circle');

            // Remove recording indicator
            const indicator = document.getElementById('localVideoContainer').querySelector('.recording-indicator');
            if (indicator) {
                indicator.remove();
            }
        }

        lucide.createIcons();
    }

    toggleChat() {
        const chatPanel = document.getElementById('chatPanel');
        const isVisible = !chatPanel.classList.contains('hidden');

        if (isVisible) {
            chatPanel.classList.add('hidden');
        } else {
            chatPanel.classList.remove('hidden');
            document.getElementById('chatInput').focus();
        }
    }

    toggleParticipants() {
        const participantsPanel = document.getElementById('participantsPanel');
        const isVisible = !participantsPanel.classList.contains('hidden');

        if (isVisible) {
            participantsPanel.classList.add('hidden');
        } else {
            participantsPanel.classList.remove('hidden');
        }
    }

    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message) return;

        // Add message to local chat
        this.addChatMessage('You', message, true);

        // Send via signaling (you might want to implement a separate chat protocol)
        // For now, we'll just show it locally
        input.value = '';
    }

    addChatMessage(sender, message, isOwn = false) {
        const chatMessages = document.getElementById('chatMessages');

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${isOwn ? 'own' : 'other'}`;
        messageElement.innerHTML = `
            <div class="font-semibold text-xs mb-1">${sender}</div>
            <div>${message}</div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    hangUp() {
        // End direct call if active
        if (this.directCallState) {
            this.endDirectCall();
        }

        // Send leave message for room call
        if (this.roomId) {
            this.sendSignalingMessage('leave', {
                call_id: this.roomId
            });
        }

        // Clean up
        this.cleanup();

        // Switch back to setup screen
        document.getElementById('callScreen').classList.add('hidden');
        document.getElementById('setupScreen').classList.remove('hidden');

        this.showToast('Call ended', 'warning');
    }

    handleDisconnect() {
        // End direct call if active
        if (this.directCallState) {
            this.endDirectCall();
            this.showToast('Call disconnected', 'error');
        } else {
            this.showError('Disconnected from server');
        }

        this.cleanup();
        document.getElementById('callScreen').classList.add('hidden');
        document.getElementById('setupScreen').classList.remove('hidden');
    }

    cleanup() {
        // Stop any playing tones
        this.stopTone();

        // End direct call if active
        if (this.directCallState) {
            this.endDirectCall();
        }

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Close peer connections
        this.peerConnections.forEach(peerConnection => {
            peerConnection.close();
        });
        this.peerConnections.clear();

        // Stop local media
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Stop screen sharing
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Clear UI
        document.getElementById('remoteVideos').innerHTML = '';
        document.getElementById('participantsList').innerHTML = '';
        document.getElementById('chatMessages').innerHTML = '';
        document.getElementById('participantCount').textContent = '1';

        // Reset direct call state
        this.directCallId = null;
        this.directCallState = null;
        this.directCallPeer = null;
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    showSetupStatus(message) {
        const statusElement = document.getElementById('setupStatus');
        statusElement.textContent = message;
        statusElement.classList.remove('hidden');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.remove('hidden');
    }

    hideErrorModal() {
        document.getElementById('errorModal').classList.add('hidden');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="flex items-center">
                <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info'}" class="w-5 h-5 mr-2"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Direct Call Methods
    makeDirectCall(targetUserId, targetName) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showError('Not connected to server');
            return;
        }

        this.directCallId = this.generateMessageId();
        this.directCallState = 'calling';
        this.directCallPeer = targetUserId;

        this.sendSignalingMessage('direct-call-invite', {
            target_user_id: targetUserId,
            caller_name: this.getCurrentUserName(),
            call_id: this.directCallId
        });

        this.showOutgoingCallModal(targetName);
    }

    acceptDirectCall() {
        if (!this.directCallId) return;

        this.sendSignalingMessage('direct-call-accept', {
            call_id: this.directCallId
        });

        this.directCallState = 'active';
        this.hideIncomingCallModal();
        this.showToast('Call accepted!', 'success');
        this.startDirectCallConnection();
    }

    rejectDirectCall() {
        if (!this.directCallId) return;

        this.sendSignalingMessage('direct-call-reject', {
            call_id: this.directCallId
        });

        this.endDirectCall();
        this.hideIncomingCallModal();
    }

    endDirectCall() {
        if (this.directCallId) {
            this.sendSignalingMessage('direct-call-end', {
                call_id: this.directCallId
            });
        }

        this.directCallState = null;
        this.directCallId = null;
        this.directCallPeer = null;
        this.hideOutgoingCallModal();
        this.hideIncomingCallModal();

        // Clean up WebRTC
        this.cleanupDirectCall();
    }

    startDirectCallConnection() {
        // For direct calls, create a peer connection with the other party
        // This is similar to room-based but with only one peer
        if (this.directCallPeer) {
            this.createPeerConnection(this.directCallPeer);
        }
    }

    cleanupDirectCall() {
        // Clean up peer connections for direct call
        if (this.directCallPeer) {
            this.removePeerConnection(this.directCallPeer);
        }
    }

    getCurrentUserName() {
        // Get current user's display name
        const displayName = document.getElementById('displayName');
        return displayName ? displayName.value.trim() || 'Anonymous' : 'Anonymous';
    }

    showIncomingCallModal(callerName) {
        let modal = document.getElementById('incomingCallModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'incomingCallModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4">
                    <div class="text-center">
                        <div class="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="phone" class="w-8 h-8 text-white"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-white mb-2">Incoming Call</h3>
                        <p class="text-slate-300 mb-6">${callerName} is calling you</p>
                        <div class="flex space-x-4">
                            <button id="rejectCallBtn" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold">
                                <i data-lucide="phone-off" class="w-5 h-5 inline mr-2"></i>
                                Reject
                            </button>
                            <button id="acceptCallBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold">
                                <i data-lucide="phone" class="w-5 h-5 inline mr-2"></i>
                                Accept
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add event listeners
            document.getElementById('acceptCallBtn').addEventListener('click', () => this.acceptDirectCall());
            document.getElementById('rejectCallBtn').addEventListener('click', () => this.rejectDirectCall());

            lucide.createIcons();
        }
        modal.classList.remove('hidden');
    }

    hideIncomingCallModal() {
        const modal = document.getElementById('incomingCallModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showOutgoingCallModal(targetName) {
        let modal = document.getElementById('outgoingCallModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'outgoingCallModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4">
                    <div class="text-center">
                        <div class="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i data-lucide="phone" class="w-8 h-8 text-white"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-white mb-2">Calling...</h3>
                        <p class="text-slate-300 mb-6">${targetName}</p>
                        <button id="cancelCallBtn" class="bg-red-600 hover:bg-red-700 text-white py-3 px-6 rounded-lg font-semibold">
                            <i data-lucide="phone-off" class="w-5 h-5 inline mr-2"></i>
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add event listener
            document.getElementById('cancelCallBtn').addEventListener('click', () => this.endDirectCall());

            lucide.createIcons();
        }
        modal.classList.remove('hidden');
    }

    hideOutgoingCallModal() {
        const modal = document.getElementById('outgoingCallModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
}

// Initialize the call client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WebRTCCallClient();
});
