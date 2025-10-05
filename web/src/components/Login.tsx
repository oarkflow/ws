import React, { useState } from 'react';
import { MessageCircle, User, Users } from 'lucide-react';

interface User {
    id: string;
    name: string;
    email: string;
    avatar: string;
    alias?: string;
}

interface LoginProps {
    onLogin: (user: User, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Demo users
    const demoUsers: User[] = [
        {
            id: 'user1',
            name: 'Alice Johnson',
            email: 'alice@example.com',
            avatar: 'A'
        },
        {
            id: 'user2',
            name: 'Bob Smith',
            email: 'bob@example.com',
            avatar: 'B'
        }
    ];

    const handleUserSelect = (user: User) => {
        setSelectedUser(user);
    };

    const handleLogin = () => {
        if (selectedUser) {
            // Generate unique token for the user
            const token = `token_${selectedUser.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Auto-set alias to name, or email if no name
            const autoAlias = selectedUser.name || selectedUser.email || selectedUser.id;

            // Create user object with auto-set alias
            const userWithAlias = {
                ...selectedUser,
                alias: autoAlias
            };

            console.log('🔐 LOGIN USER:', userWithAlias);
            onLogin(userWithAlias, token);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MessageCircle className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">WebSocket Chat</h1>
                    <p className="text-gray-600 dark:text-gray-400">Choose a demo user to continue</p>
                </div>

                {/* User Selection */}
                <div className="space-y-4 mb-8">
                    {demoUsers.map((user) => (
                        <div
                            key={user.id}
                            onClick={() => handleUserSelect(user)}
                            className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${selectedUser?.id === user.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <div className="flex items-center space-x-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold ${selectedUser?.id === user.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}>
                                    {user.avatar}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{user.name}</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                                </div>
                                <div className={`w-4 h-4 rounded-full border-2 ${selectedUser?.id === user.id
                                    ? 'border-blue-500 bg-blue-500'
                                    : 'border-gray-300'
                                    }`}>
                                    {selectedUser?.id === user.id && (
                                        <div className="w-full h-full rounded-full bg-white scale-50"></div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Login Button */}
                <button
                    onClick={handleLogin}
                    disabled={!selectedUser}
                    className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all ${selectedUser
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                        : 'bg-gray-300 cursor-not-allowed'
                        }`}
                >
                    {selectedUser ? `Continue as ${selectedUser.name}` : 'Select a user to continue'}
                </button>

                {/* Demo Info */}
                <div className="mt-6 text-center">
                    <div className="inline-flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg">
                        <Users className="w-4 h-4" />
                        <span>Demo Mode - 2 Users Available</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
