import React, { useState } from 'react';
import SetupScreen from './SetupScreen';
import CallScreen from './CallScreen';

const CallApp: React.FC = () => {
    const [inCall, setInCall] = useState(false);
    const [roomId, setRoomId] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [authToken, setAuthToken] = useState('demo-token');

    const handleJoinCall = (settings: {
        roomId: string;
        displayName: string;
        authToken: string;
        audioEnabled: boolean;
        videoEnabled: boolean;
    }) => {
        setRoomId(settings.roomId);
        setDisplayName(settings.displayName);
        setAuthToken(settings.authToken);
        setInCall(true);
    };

    const handleLeaveCall = () => {
        setInCall(false);
    };

    if (inCall) {
        return (
            <CallScreen
                roomId={roomId}
                displayName={displayName}
                authToken={authToken}
                onLeaveCall={handleLeaveCall}
            />
        );
    }

    return (
        <SetupScreen
            onJoinCall={handleJoinCall}
        />
    );
};

export default CallApp;
