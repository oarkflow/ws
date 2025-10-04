import React, { useState } from 'react';
import SetupScreen from './SetupScreen';
import CallScreen from './CallScreen';

interface User {
    id: string;
    name: string;
    email: string;
    avatar: string;
    alias?: string;
}

interface CallAppProps {
    user: User;
    token: string;
    wsConnection: any; // WebSocket hook
    userToken: string; // Actual user token
}

const CallApp: React.FC<CallAppProps> = ({ user: _user, token: _token, wsConnection, userToken }) => {
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
                wsConnection={wsConnection}
                userToken={userToken}
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
