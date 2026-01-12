import { useState, useEffect } from 'react';
import './App.css'
import BoardWrapper from './components/BoardWrapper.jsx';
import { logSiteVisit } from './utils/stats.js';

function App() {

  // Log site visit on mount
  useEffect(() => {
    logSiteVisit();
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
