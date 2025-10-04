import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { MessageCircle, Video, LogOut } from 'lucide-react';
import ChatApp from './components/chat/ChatApp';
import CallApp from './components/call/CallApp';
import Login from './components/Login';
import './App.css';

interface User {
    id: string;
    name: string;
    email: string;
    avatar: string;
    alias?: string;
}

function Navigation({ currentUser, onLogout }: { currentUser: User; onLogout: () => void }) {
    const location = useLocation();

    const isActive = (path: string) => {
        return location.pathname === path;
    };

    return (
        <nav className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <h1 className="text-2xl font-bold text-white">WebSocket Hub</h1>
                        </div>
                        {/* User Info */}
                        <div className="ml-8 flex items-center space-x-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                                    <span className="text-sm font-semibold text-blue-600">
                                        {currentUser.avatar}
                                    </span>
                                </div>
                                <div className="hidden sm:block">
                                    <p className="text-sm font-medium text-white">{currentUser.name}</p>
                                    <p className="text-xs text-blue-200">{currentUser.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={onLogout}
                                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Logout"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
                            <Link
                                to="/"
                                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${isActive('/')
                                    ? 'bg-white text-blue-600 shadow-md'
                                    : 'text-white hover:bg-white/10'
                                    }`}
                            >
                                <MessageCircle className="w-5 h-5 mr-2" />
                                Chat
                            </Link>
                            <Link
                                to="/call"
                                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${isActive('/call')
                                    ? 'bg-white text-blue-600 shadow-md'
                                    : 'text-white hover:bg-white/10'
                                    }`}
                            >
                                <Video className="w-5 h-5 mr-2" />
                                Video Call
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}

function App() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userToken, setUserToken] = useState<string>('');

    const handleLogin = (user: User, token: string) => {
        setCurrentUser(user);
        setUserToken(token);
        // Store in localStorage for persistence
        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('userToken', token);
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setUserToken('');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userToken');
    };

    // Check for existing session on app load
    React.useEffect(() => {
        const storedUser = localStorage.getItem('currentUser');
        const storedToken = localStorage.getItem('userToken');

        if (storedUser && storedToken) {
            try {
                const user = JSON.parse(storedUser);
                setCurrentUser(user);
                setUserToken(storedToken);
            } catch (error) {
                console.error('Error parsing stored user data:', error);
                localStorage.removeItem('currentUser');
                localStorage.removeItem('userToken');
            }
        }
    }, []);

    // If no user is logged in, show login screen
    if (!currentUser || !userToken) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <Router>
            <div className="min-h-screen bg-slate-50">
                {/* Navigation with User Info */}
                <Navigation currentUser={currentUser} onLogout={handleLogout} />

                {/* Routes - Pass user and token to components */}
                <main>
                    <Routes>
                        <Route path="/" element={<ChatApp user={currentUser} token={userToken} />} />
                        <Route path="/call" element={<CallApp user={currentUser} token={userToken} />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;
