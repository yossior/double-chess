const express = require("express");
const router = express.Router();
const { getUsers, getUser, getMe, getUserGames, login, register, googleLogin, forgotPassword } = require('../controllers/user.controller');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

/**
 * Public routes
 */
router.post('/login', login);
router.post('/register', register);
router.post('/google', googleLogin);
router.post('/forgot-password', forgotPassword);

/**
 * Protected routes (authentication required)
 */
router.get('/', authenticate, requireAdmin, getUsers);
router.get('/me', authenticate, getMe);
router.get('/:id/games', authenticate, getUserGames);
router.get('/:id', authenticate, getUser);

module.exports = router;
