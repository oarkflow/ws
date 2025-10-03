import React from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ErrorModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onClose: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({ isOpen, title, message, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-white">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-slate-300 mb-6">{message}</p>
                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ErrorModal;
