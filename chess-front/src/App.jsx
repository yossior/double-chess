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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      <main className="w-full">
        {view === 'game' ? <BoardWrapper /> : <HistoryView />}
      </main>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}

export default App
