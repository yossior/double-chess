import { useState } from 'react';
import './App.css'
import BoardWrapper from './components/BoardWrapper.jsx';
import AuthModal from './components/Auth/AuthModal.jsx';
import HistoryView from './components/HistoryView.jsx';
import { useUser } from './context/UserContext.jsx';

function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [view, setView] = useState('game'); // 'game' or 'history'
  const { user, logout } = useUser();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Chess</h1>
            <nav className="flex gap-4">
              <button 
                onClick={() => setView('game')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${view === 'game' ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
              >
                Play
              </button>
              {user && (
                <button 
                  onClick={() => setView('history')}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${view === 'history' ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                >
                  History
                </button>
              )}
            </nav>
          </div>
          <div>
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-gray-700 dark:text-gray-300">Welcome, {user.username}</span>
                <button
                  onClick={logout}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {view === 'game' ? <BoardWrapper /> : <HistoryView />}
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}

export default App
