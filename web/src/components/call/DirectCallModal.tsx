import React from 'react';
import { Phone, PhoneOff, User } from 'lucide-react';

interface DirectCallModalProps {
    isOpen: boolean;
    type: 'incoming' | 'outgoing';
    callerName?: string;
    onAccept?: () => void;
    onReject: () => void;
}

const DirectCallModal: React.FC<DirectCallModalProps> = ({
    isOpen,
    type,
    callerName = 'Unknown',
    onAccept,
    onReject
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
                {/* Avatar */}
                <div className="flex justify-center mb-6">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center">
                        <User className="w-12 h-12 text-white" />
                    </div>
                </div>

                {/* Caller Info */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">{callerName}</h2>
                    <p className="text-slate-400">
                        {type === 'incoming' ? 'Incoming call...' : 'Calling...'}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex justify-center space-x-4">
                    {type === 'incoming' && onAccept && (
                        <button
                            onClick={onAccept}
                            className="w-16 h-16 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg"
                            title="Accept call"
                        >
                            <Phone className="w-8 h-8 text-white" />
                        </button>
                    )}
                    <button
                        onClick={onReject}
                        className="w-16 h-16 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-all transform hover:scale-110 shadow-lg"
                        title={type === 'incoming' ? 'Reject call' : 'Cancel call'}
                    >
                        <PhoneOff className="w-8 h-8 text-white" />
                    </button>
                </div>

                {/* Animation for outgoing call */}
                {type === 'outgoing' && (
                    <div className="mt-8 flex justify-center">
                        <div className="flex space-x-2">
                            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DirectCallModal;
