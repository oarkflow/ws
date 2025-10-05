import React, { useState, useRef, useEffect } from 'react';
import { Settings, MessageCircle, PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, Circle, X } from 'lucide-react';
import { useWebRTC, MSG_TYPES } from '../../hooks/useWebRTC';
import { getAudioToneManager } from '../../utils/audioTones';
import ErrorModal from '../common/ErrorModal';

interface CallScreenProps {
    roomId: string;
    displayName: string;
    authToken: string;
    onLeaveCall: () => void;
    wsConnection: any; // WebSocket hook
    userToken?: string; // Actual user token for WebRTC
}

const CallScreen: React.FC<CallScreenProps> = ({
    roomId,
    displayName,
    authToken,
    onLeaveCall,
    wsConnection,
    userToken
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

    const audioManager = useRef(getAudioToneManager());

    const {
        localStream,
        participants,
        isConnected,
        isMuted: webrtcIsMuted,
        isVideoOff: webrtcIsVideoOff,
        isScreenSharing: webrtcIsScreenSharing,
        isRecording: webrtcIsRecording,
        connect,
        disconnect,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        toggleRecording: webrtcToggleRecording,
        sendChatMessage,
        sendSignalingMessage,
        chatMessages
    } = useWebRTC();

    // Handle call ended by remote participant
    useEffect(() => {
        const handleCallEnded = () => {
            console.log('🎥 CallScreen: Call ended by remote participant');
            // Auto-leave the call
            setTimeout(() => {
                onLeaveCall();
            }, 1000); // Give time for user to see what happened
        };

        // Listen for call ended event (this would need to be added to useWebRTC hook)
        window.addEventListener('webrtc-call-ended', handleCallEnded);

        return () => {
            window.removeEventListener('webrtc-call-ended', handleCallEnded);
        };
    }, [onLeaveCall]);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        console.log('🎥 CallScreen: Connecting to WebRTC room:', roomId);
        // Connect to WebRTC room using shared WebSocket connection
        connect(roomId, displayName, wsConnection.wsRef.current?.ws, userToken);

        // Resume audio context on user interaction
        audioManager.current.resume();

        return () => {
            console.log('🎥 CallScreen: FORCE cleaning up - disconnecting WebRTC');
            // FORCE disable all tracks first before disconnect
            if (localStream) {
                const tracks = localStream.getTracks();
                console.log('🎥 FORCE cleanup - stopping', tracks.length, 'tracks');
                tracks.forEach((track: MediaStreamTrack) => {
                    console.log('🎥 FORCE cleanup disabling track:', track.kind, track.label, 'readyState:', track.readyState);
                    track.enabled = false;
                    track.stop();
                    console.log('🎥 Track stopped, new readyState:', track.readyState);
                });
            }
            disconnect();
            audioManager.current.stopAllTones();
        };
    }, [roomId, displayName, authToken]); // Remove function dependencies to prevent infinite loop

    useEffect(() => {
        // Set local video stream
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // Play success tone when connected
    useEffect(() => {
        if (isConnected) {
            audioManager.current.playSuccessTone();
        }
    }, [isConnected]);

    // Sync local states with WebRTC hook states
    useEffect(() => {
        setIsMuted(webrtcIsMuted);
    }, [webrtcIsMuted]);

    useEffect(() => {
        setIsVideoOff(webrtcIsVideoOff);
    }, [webrtcIsVideoOff]);

    useEffect(() => {
        setIsScreenSharing(webrtcIsScreenSharing);
    }, [webrtcIsScreenSharing]);

    useEffect(() => {
        setIsRecording(webrtcIsRecording);
    }, [webrtcIsRecording]);

    const handleToggleMute = () => {
        toggleMute();
    };

    const handleToggleVideo = () => {
        toggleVideo();
    };

    const handleToggleScreenShare = () => {
        toggleScreenShare();
    };

    const handleSendChatMessage = () => {
        if (chatInput.trim()) {
            sendChatMessage(chatInput.trim());
            setChatInput('');
        }
    };

    const handleLeaveCall = () => {
        console.log('🎥 User initiated call leave - sending leave message and cleaning up');
        audioManager.current.playEndCallTone();

        // Send leave message to notify other participants
        console.log('🎥 Sending LEAVE message to backend');
        sendSignalingMessage(MSG_TYPES.LEAVE, {});

        // FORCE disable all tracks first
        if (localStream) {
            localStream.getTracks().forEach((track: MediaStreamTrack) => {
                console.log('🎥 FORCE disabling track:', track.kind, track.label);
                track.enabled = false;
                track.stop();
            });
        }

        // Disconnect WebRTC
        disconnect();

        setTimeout(() => {
            onLeaveCall();
        }, 600); // Wait for tone to finish
    };

    const handleToggleRecording = () => {
        webrtcToggleRecording();
    };

    const toggleChat = () => {
        setChatOpen(!chatOpen);
    };

    const toggleParticipants = () => {
        setParticipantsOpen(!participantsOpen);
    };

    const handleChatKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSendChatMessage();
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 dark:bg-gray-900 text-white dark:text-gray-100">
            {/* Header */}
            <div className="bg-slate-800 dark:bg-gray-800 border-b border-slate-700 dark:border-gray-700 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full animate-pulse ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-sm text-slate-300 dark:text-gray-400">Room: <span className="font-mono">{roomId}</span></span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="text-sm text-slate-300 dark:text-gray-400">
                            {participants.length + 1} participant{participants.length !== 0 ? 's' : ''}
                        </div>
                        <button
                            onClick={toggleParticipants}
                            className="p-2 text-slate-400 dark:text-gray-500 hover:text-white dark:hover:text-gray-100 transition-colors"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Video Area */}
            <div className="flex-1 relative">
                {/* Remote Videos Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 h-full">
                    {participants.length === 0 ? (
                        <div className="bg-slate-700 dark:bg-gray-700 rounded-lg flex items-center justify-center min-h-[200px]">
                            <span className="text-slate-400 dark:text-gray-500">Waiting for participants...</span>
                        </div>
                    ) : (
                        participants.map((participant) => (
                            <div key={participant.id} className="bg-slate-700 dark:bg-gray-700 rounded-lg overflow-hidden">
                                {participant.stream ? (
                                    <video
                                        autoPlay
                                        playsInline
                                        className="w-full h-full object-cover"
                                        ref={(el) => {
                                            if (el && participant.stream) {
                                                el.srcObject = participant.stream;
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <span className="text-slate-400 dark:text-gray-500">Connecting...</span>
                                    </div>
                                )}
                                <div className="absolute bottom-2 left-2 text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                                    {participant.displayName}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Local Video (Picture-in-Picture) */}
                <div className="absolute bottom-32 right-6 w-48 h-36 bg-slate-800 rounded-lg overflow-hidden shadow-lg border border-slate-700">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                        {displayName} (You)
                    </div>
                </div>

                {/* Screen Share */}
                {isScreenSharing && (
                    <div className="absolute inset-6 bg-black rounded-lg overflow-hidden">
                        <video
                            ref={screenVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-contain"
                        />
                        <div className="absolute top-4 right-4">
                            <button
                                onClick={handleToggleScreenShare}
                                className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Control Bar */}
            <div className="bg-slate-800 border-t border-slate-700 px-6 py-4">
                <div className="flex items-center justify-center space-x-4">
                    {/* Audio Control */}
                    <button
                        onClick={handleToggleMute}
                        className="control-btn bg-slate-700 hover:bg-slate-600 p-4 rounded-full transition-colors"
                    >
                        {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>

                    {/* Video Control */}
                    <button
                        onClick={handleToggleVideo}
                        className="control-btn bg-slate-700 hover:bg-slate-600 p-4 rounded-full transition-colors"
                    >
                        {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                    </button>

                    {/* Screen Share */}
                    <button
                        onClick={handleToggleScreenShare}
                        className={`control-btn p-4 rounded-full transition-colors ${isScreenSharing ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                    >
                        <Monitor className="w-6 h-6" />
                    </button>

                    {/* Recording */}
                    <button
                        onClick={handleToggleRecording}
                        className={`control-btn p-4 rounded-full transition-colors ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                    >
                        <Circle className={`w-6 h-6 ${isRecording ? 'text-white animate-pulse' : ''}`} />
                    </button>

                    {/* Chat Toggle */}
                    <button
                        onClick={toggleChat}
                        className={`control-btn p-4 rounded-full transition-colors ${chatOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                    >
                        <MessageCircle className="w-6 h-6" />
                    </button>

                    {/* Hang Up */}
                    <button
                        onClick={handleLeaveCall}
                        className="control-btn bg-red-600 hover:bg-red-700 p-4 rounded-full transition-colors"
                    >
                        <PhoneOff className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Chat Panel */}
            {chatOpen && (
                <div className="absolute right-0 top-0 h-full w-80 bg-slate-800 border-l border-slate-700 flex flex-col">
                    {/* Chat Header */}
                    <div className="p-4 border-b border-slate-700">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Chat</h3>
                            <button
                                onClick={toggleChat}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {chatMessages.map((msg) => (
                            <div key={msg.id} className="bg-slate-700 rounded-lg p-3">
                                <div className="flex items-center space-x-2 mb-1">
                                    <span className="text-sm font-medium text-blue-400">{msg.sender}</span>
                                    <span className="text-xs text-slate-400">
                                        {msg.timestamp.toLocaleTimeString()}
                                    </span>
                                </div>
                                <p className="text-sm text-white">{msg.message}</p>
                            </div>
                        ))}
                    </div>

                    {/* Message Input */}
                    <div className="p-4 border-t border-slate-700">
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyPress={handleChatKeyPress}
                                placeholder="Type a message..."
                                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                                onClick={handleSendChatMessage}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Participants Panel */}
            {participantsOpen && (
                <div className="absolute left-0 top-0 h-full w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
                    {/* Participants Header */}
                    <div className="p-4 border-b border-slate-700">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Participants</h3>
                            <button
                                onClick={toggleParticipants}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Participants List */}
                    <div className="flex-1 p-4">
                        <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                    <span className="text-sm font-medium text-white">
                                        {displayName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <span className="text-sm text-white">{displayName} (You)</span>
                            </div>
                            {participants.map((participant) => (
                                <div key={participant.id} className="flex items-center space-x-3">
                                    <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
                                        <span className="text-sm font-medium text-white">
                                            {participant.displayName.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <span className="text-sm text-white">{participant.displayName}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Error Modal */}
            {errorModal && (
                <ErrorModal
                    isOpen={true}
                    title={errorModal.title}
                    message={errorModal.message}
                    onClose={() => setErrorModal(null)}
                />
            )}
        </div>
    );
};

export default CallScreen;
