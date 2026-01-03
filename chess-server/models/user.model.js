const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    hash: { type: String, required: true },
    games: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
    isAdmin: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);