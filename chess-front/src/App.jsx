import { useEffect } from 'react'
import './App.css'
import BoardWrapper from './components/BoardWrapper.jsx';

// Generate or retrieve session ID
function getSessionId() {
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

function App() {
  // Log site visit on mount
  useEffect(() => {
    const sessionId = getSessionId();
    const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
    
    fetch(`${apiBase}/api/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, url: window.location.href })
    }).catch(err => console.warn('Failed to log visit:', err));
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      <main className="w-full">
        <BoardWrapper />
      </main>
    </div>
  )
}

export default App
