import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastProps {
    toast: ToastMessage;
    onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onClose(toast.id), 300);
        }, toast.duration || 3000);

        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onClose]);

    const getToastStyles = () => {
        switch (toast.type) {
            case 'success':
                return 'bg-green-500 text-white';
            case 'error':
                return 'bg-red-500 text-white';
            case 'warning':
                return 'bg-yellow-500 text-white';
            case 'info':
                return 'bg-blue-500 text-white';
            default:
                return 'bg-gray-500 text-white';
        }
    };

    const getIcon = () => {
        switch (toast.type) {
            case 'success':
                return <CheckCircle className="w-5 h-5" />;
            case 'error':
                return <XCircle className="w-5 h-5" />;
            case 'warning':
                return <AlertCircle className="w-5 h-5" />;
            case 'info':
                return <Info className="w-5 h-5" />;
            default:
                return <Info className="w-5 h-5" />;
        }
    };

    return (
        <div
            className={`${getToastStyles()} rounded-lg shadow-lg px-4 py-3 flex items-center space-x-3 min-w-[300px] max-w-md transition-all duration-300 ${isExiting ? 'opacity-0 transform translate-x-full' : 'opacity-100 transform translate-x-0'
                }`}
        >
            <div className="flex-shrink-0">
                {getIcon()}
            </div>
            <div className="flex-1 text-sm font-medium">
                {toast.message}
            </div>
            <button
                onClick={() => {
                    setIsExiting(true);
                    setTimeout(() => onClose(toast.id), 300);
                }}
                className="flex-shrink-0 text-white hover:text-gray-200 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

interface ToastContainerProps {
    toasts: ToastMessage[];
    onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
    return (
        <div className="fixed top-4 right-4 z-50 space-y-2">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onClose={onClose} />
            ))}
        </div>
    );
};

// Hook for managing toasts
export const useToast = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = (message: string, type: ToastType = 'info', duration = 3000) => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type, duration }]);
    };

    const closeToast = (id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    };

    return { toasts, showToast, closeToast };
};
