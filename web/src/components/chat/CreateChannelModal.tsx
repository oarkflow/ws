import React, { useState } from 'react';
import { X, Hash } from 'lucide-react';

interface CreateChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (channelName: string) => void;
}

const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
    isOpen,
    onClose,
    onCreate
}) => {
    const [channelName, setChannelName] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate channel name
        const trimmedName = channelName.trim();
        if (!trimmedName) {
            setError('Channel name is required');
            return;
        }

        if (trimmedName.length < 2) {
            setError('Channel name must be at least 2 characters');
            return;
        }

        if (trimmedName.length > 80) {
            setError('Channel name must be less than 80 characters');
            return;
        }

        // Remove spaces and special characters except hyphens and underscores
        const sanitizedName = trimmedName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

        onCreate(sanitizedName);
        setChannelName('');
        setError('');
        onClose();
    };

    const handleClose = () => {
        setChannelName('');
        setError('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <h2 className="text-xl font-semibold text-slate-900">Create a channel</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-4">
                        <label htmlFor="channelName" className="block text-sm font-medium text-slate-700 mb-2">
                            Channel name
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Hash className="w-5 h-5 text-slate-400" />
                            </div>
                            <input
                                type="text"
                                id="channelName"
                                value={channelName}
                                onChange={(e) => {
                                    setChannelName(e.target.value);
                                    setError('');
                                }}
                                placeholder="e.g. general, random, announcements"
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autoFocus
                            />
                        </div>
                        {error && (
                            <p className="mt-2 text-sm text-red-600">{error}</p>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                            Channels are where conversations happen around a topic. Use a name that is easy to find and understand.
                        </p>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateChannelModal;
