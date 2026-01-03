const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

/**
 * Authenticate user from JWT token in Authorization header
 */
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token', error: err.message });
    }
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('[Error]', err.message);
    
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    
    res.status(status).json({ message, error: err });
};

module.exports = { authenticate, requireAdmin, errorHandler };
