import { useState } from 'react';

export default function PlayBot({ onStartGame, onBack, initialSkillLevel = 5, initialPlayerColor = 'w', initialIsUnbalanced = true }) {
  const [selectedColor, setSelectedColor] = useState(initialPlayerColor);
  const [skillLevel, setSkillLevel] = useState(initialSkillLevel);
  const [isUnbalanced, setIsUnbalanced] = useState(initialIsUnbalanced);

  const handleStartGame = () => {
    onStartGame({
      color: selectedColor,
      skillLevel,
      isUnbalanced
    });
  };

  return (
    <div className="bg-slate-800 rounded-xl shadow-xl p-5 w-80 border border-slate-700">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Play vs Bot</h2>
        <button 
          onClick={onBack}
          className="text-slate-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Color Selection */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Your Color
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedColor('w')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                selectedColor === 'w' 
                  ? 'bg-slate-200 text-slate-900' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              ⚪ White
            </button>
            <button
              onClick={() => setSelectedColor('b')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                selectedColor === 'b' 
                  ? 'bg-slate-900 text-white ring-1 ring-slate-500' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              ⚫ Black
            </button>
          </div>
        </div>

        {/* Game Variant */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Variant
          </label>
          <div className="space-y-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="gameMode"
                checked={isUnbalanced}
                onChange={() => setIsUnbalanced(true)}
                className="w-3.5 h-3.5 text-slate-500 bg-slate-700 border-slate-600"
              />
              <div className="ml-2">
                <span className="text-sm text-slate-200">Unbalanced</span>
                <span className="text-xs text-slate-500 ml-1">· White starts with 2 moves</span>
              </div>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="gameMode"
                checked={!isUnbalanced}
                onChange={() => setIsUnbalanced(false)}
                className="w-3.5 h-3.5 text-slate-500 bg-slate-700 border-slate-600"
              />
              <div className="ml-2">
                <span className="text-sm text-slate-200">Balanced</span>
                <span className="text-xs text-slate-500 ml-1">· White starts with 1 move</span>
              </div>
            </label>
          </div>
        </div>

        {/* Bot Strength */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-medium text-slate-400">Bot Strength</label>
            <span className="text-xs text-slate-300">{skillLevel}/10</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={skillLevel}
            onChange={(e) => setSkillLevel(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-slate-400"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>Beginner</span>
            <span>Master</span>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartGame}
          className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg transition-all"
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
