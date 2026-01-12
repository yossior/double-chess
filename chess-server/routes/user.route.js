const express = require("express");
const router = express.Router();
const { getMe, getUserGames } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Protected routes (authentication required)
 */
router.get('/me', authenticate, getMe);
router.get('/:id/games', authenticate, getUserGames);

module.exports = router;
