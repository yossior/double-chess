const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  white: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  black: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Game state
  fen: { type: String, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  moves: [{ type: String }], // Array of moves in algebraic notation
  
  // Clock times in milliseconds
  whiteMs: { type: Number, default: 300000 },
  blackMs: { type: Number, default: 300000 },
  increment: { type: Number, default: 2000 }, // Increment per move in ms
  
  // Game status
  status: {
    type: String,
    enum: ['waiting', 'active', 'completed', 'abandoned'],
    default: 'waiting'
  },
  result: {
    type: String,
    enum: ['white_win', 'black_win', 'draw', 'abandoned'],
    default: null
  },
  resultReason: {
    type: String,
    enum: ['checkmate', 'resignation', 'timeout', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule'],
    default: null
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Game', gameSchema);
