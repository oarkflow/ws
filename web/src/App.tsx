import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { MessageCircle, Video } from 'lucide-react';
import ChatApp from './components/chat/ChatApp';
import CallApp from './components/call/CallApp';
import './App.css';

function Navigation() {
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
    return (
        <Router>
            <div className="min-h-screen bg-slate-50">
                {/* Navigation */}
                <Navigation />

                {/* Routes */}
                <main>
                    <Routes>
                        <Route path="/" element={<ChatApp />} />
                        <Route path="/call" element={<CallApp />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;
