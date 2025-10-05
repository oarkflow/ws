import React, { useState, useEffect } from 'react';
import { Video, AlertCircle } from 'lucide-react';

interface SetupScreenProps {
    onJoinCall: (settings: {
        roomId: string;
        displayName: string;
        authToken: string;
        audioEnabled: boolean;
        videoEnabled: boolean;
    }) => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onJoinCall }) => {
    const [authToken, setAuthToken] = useState('');
    const [roomId, setRoomId] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const [hasAudioDevice, setHasAudioDevice] = useState(true);
    const [hasVideoDevice, setHasVideoDevice] = useState(true);

    // Check for available media devices on mount
    useEffect(() => {
        checkMediaDevices();
    }, []);

    const checkMediaDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(device => device.kind === 'audioinput');
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            setHasAudioDevice(audioDevices.length > 0);
            setHasVideoDevice(videoDevices.length > 0);

            if (audioDevices.length === 0) {
                setAudioEnabled(false);
                setMediaError('No microphone detected');
            }
            if (videoDevices.length === 0) {
                setVideoEnabled(false);
                if (!mediaError) {
                    setMediaError('No camera detected');
                }
            }
        } catch (error) {
            console.error('Error enumerating devices:', error);
            setMediaError('Unable to access media devices');
        }
    };

    const generateRoomId = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    const handleJoinCall = async () => {
        if (!displayName.trim()) {
            setMediaError('Please enter your display name');
            return;
        }

        setIsConnecting(true);
        setMediaError(null);

        try {
            // Test media access before joining
            if (audioEnabled || videoEnabled) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: audioEnabled,
                        video: videoEnabled
                    });
                    // Stop test stream
                    stream.getTracks().forEach(track => track.stop());
                } catch (error) {
                    console.error('Media access error:', error);
                    setMediaError('Unable to access camera/microphone. Please check permissions.');
                    setIsConnecting(false);
                    return;
                }
            }

            const finalRoomId = roomId.trim() || generateRoomId();
            const finalAuthToken = authToken.trim() || 'demo-token';

            onJoinCall({
                roomId: finalRoomId,
                displayName: displayName.trim(),
                authToken: finalAuthToken,
                audioEnabled,
                videoEnabled
            });
        } catch (error) {
            console.error('Failed to join call:', error);
            setMediaError('Failed to join call. Please try again.');
            setIsConnecting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 dark:bg-gray-900">
            <div className="bg-slate-800 dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Video className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">WebRTC Call Center</h1>
                    <p className="text-slate-400">Join or create a video call</p>
                </div>

                {/* Authentication */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Authentication Token <span className="text-slate-500">(optional for demo)</span>
                    </label>
                    <input
                        type="password"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        placeholder="Leave empty for demo"
                        className="w-full px-4 py-3 bg-slate-700 dark:bg-gray-700 border border-slate-600 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500"
                    />
                </div>

                {/* Room Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Room ID</label>
                    <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        placeholder="Enter room ID or create new"
                        className="w-full px-4 py-3 bg-slate-700 dark:bg-gray-700 border border-slate-600 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Leave empty to create a new room</p>
                </div>

                {/* Display Name */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        className="w-full px-4 py-3 bg-slate-700 dark:bg-gray-700 border border-slate-600 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500"
                    />
                </div>

                {/* Media Settings */}
                <div className="mb-8">
                    <h3 className="text-sm font-medium text-slate-300 mb-3">Media Settings</h3>
                    {mediaError && (
                        <div className="mb-3 p-3 bg-red-900/20 border border-red-600/50 rounded-lg flex items-start space-x-2">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-red-400">{mediaError}</span>
                        </div>
                    )}
                    <div className="space-y-3">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={audioEnabled}
                                onChange={(e) => setAudioEnabled(e.target.checked)}
                                disabled={!hasAudioDevice}
                                className="mr-3"
                            />
                            <span className="text-sm">
                                Enable microphone
                                {!hasAudioDevice && <span className="text-red-400 ml-2">(No device found)</span>}
                            </span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={videoEnabled}
                                onChange={(e) => setVideoEnabled(e.target.checked)}
                                disabled={!hasVideoDevice}
                                className="mr-3"
                            />
                            <span className="text-sm">
                                Enable camera
                                {!hasVideoDevice && <span className="text-red-400 ml-2">(No device found)</span>}
                            </span>
                        </label>
                    </div>
                </div>

                {/* Join Button */}
                <button
                    onClick={handleJoinCall}
                    disabled={isConnecting || !displayName.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
                >
                    {isConnecting ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Connecting...
                        </>
                    ) : (
                        <>
                            <Video className="w-5 h-5 inline mr-2" />
                            Join Call
                        </>
                    )}
                </button>

                {/* Status */}
                {isConnecting && (
                    <div className="mt-4 text-center text-sm text-slate-400">
                        Connecting...
                    </div>
                )}
            </div>
        </div>
    );
};

export default SetupScreen;
