const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameId: { type: String, unique: true, sparse: true, index: true }, // Custom game ID for temp games
  white: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  whiteSessionId: { type: String, required: false, default: null }, // Session ID if white is guest
  black: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  blackSessionId: { type: String, required: false, default: null }, // Session ID if black is guest
  
  // Game state
  fen: { type: String, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  moves: [{ type: String }], // Array of moves in algebraic notation
  isUnbalanced: { type: Boolean, default: true },
  
  // Clock times in milliseconds
  whiteMs: { type: Number, default: 300000 },
  blackMs: { type: Number, default: 300000 },
  increment: { type: Number, default: 2000 }, // Increment per move in ms
  
  // Game status
  status: {
    type: String,
    enum: ['waiting', 'in_progress', 'completed'],
    default: 'waiting'
  },
  
  // Game result (only if completed)
  result: {
    type: String,
    enum: ['checkmate', 'draw', 'resignation', 'timeout', 'stalemate', null],
    default: null
  },
  winner: {
    type: String,
    enum: ['white', 'black', null],
    default: null
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Game', gameSchema);
