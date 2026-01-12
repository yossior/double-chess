const User = require('../models/user.model.js');

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

module.exports = {
    getMe,
    getUserGames
};