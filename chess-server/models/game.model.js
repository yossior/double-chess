const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  white: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  black: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  
  // Game state
  fen: { type: String, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  moves: [{ type: String }], // Array of moves in algebraic notation
  
  // Clock times in milliseconds
  whiteMs: { type: Number, default: 300000 },
  blackMs: { type: Number, default: 300000 },
  increment: { type: Number, default: 2000 }, // Increment per move in ms
  
  // Game result
  result: {
    type: String,
    enum: ['checkmate', 'draw', 'resignation', 'timeout', 'stalemate'],
    default: null
  },
  winner: {
    type: String,
    enum: ['white', 'black', null],
    default: null
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Game', gameSchema);
