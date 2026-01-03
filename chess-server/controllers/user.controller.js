const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model.js');

/**
 * Get all users (admin only)
 */
const getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-hash');
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users', error: error.message });
    }
};

/**
 * Get user by ID
 */
const getUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('-hash');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch user', error: error.message });
    }
};

/**
 * Get current user (me)
 */
const getMe = async (req, res) => {
    try {
        // req.user is set by authenticate middleware
        const user = await User.findById(req.user._id).select('-hash');
        res.status(200).json({
            id: user._id,
            email: user.email,
            username: user.username,
            isAdmin: user.isAdmin
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch user', error: error.message });
    }
};

/**
 * Get user games
 */
const getUserGames = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).populate({
            path: 'games',
            populate: [
                { path: 'white', select: 'username' },
                { path: 'black', select: 'username' }
            ]
        });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.status(200).json(user.games);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch games', error: error.message });
    }
};

/**
 * Login user
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password required' });
        }

        const user = await User.findOne({ email });
        
        if (!user || !(await bcrypt.compare(password, user.hash))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const accessToken = jwt.sign(
            { id: user._id, email: user.email, isAdmin: user.isAdmin },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                isAdmin: user.isAdmin
            },
            accessToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
};

/**
 * Register new user
 */
const register = async (req, res) => {
    console.log(req);
    try {
        const { email, password, username } = req.body;
        
        if (!email || !password || !username) {
            return res.status(400).json({ message: 'Email, password, and username required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            email,
            username,
            hash: hashedPassword
        });

        const accessToken = jwt.sign(
            { id: user._id, email: user.email, isAdmin: user.isAdmin },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                isAdmin: user.isAdmin
            },
            accessToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Registration failed', error: error.message });
    }
};

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Google Login
 */
const googleLogin = async (req, res) => {
    try {
        const { token } = req.body;
        
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { email, name, sub: googleId } = payload;

        let user = await User.findOne({ email });
        
        if (!user) {
            user = await User.create({
                email,
                username: name || email.split('@')[0],
                hash: 'google-auth-placeholder',
                googleId
            });
        }

        const accessToken = jwt.sign(
            { id: user._id, email: user.email, isAdmin: user.isAdmin },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                isAdmin: user.isAdmin
            },
            accessToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Google login failed', error: error.message });
    }
};

/**
 * Forgot Password (Mock)
 */
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        // Mock sending email
        res.status(200).json({ message: 'If an account exists, a reset link has been sent.' });
    } catch (error) {
        res.status(500).json({ message: 'Request failed', error: error.message });
    }
};

/**
 * Initialize admin user if not exists
 */
const initializeAdminUser = async () => {
    try {
        const adminEmail = process.env.ADMIN_USER;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.warn('⚠️ Admin credentials not configured in .env');
            return;
        }

        const adminExists = await User.exists({ email: adminEmail });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await User.create({
                email: adminEmail,
                username: 'admin',
                hash: hashedPassword,
                isAdmin: true
            });
            console.log('✅ Admin user created');
        }
    } catch (error) {
        console.error('❌ Error initializing admin user:', error.message);
    }
};

module.exports = {
    getUsers,
    getUser,
    getMe,
    getUserGames,
    login,
    register,
    googleLogin,
    forgotPassword,
    initializeAdminUser
};