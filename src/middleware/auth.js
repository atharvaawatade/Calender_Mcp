// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../core/database');
const logger = require('../utils/logger');
require('dotenv').config();

const validateToken = async (request, h) => {
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
        logger.error('No token provided in request');
        return h.response({ error: 'Unauthorized' }).code(401);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const email = decoded.email;

        const session = await pool.query(
            'SELECT * FROM sessions WHERE user_email = $1 AND jwt_token = $2 AND expires_at > NOW()',
            [email, token]
        );
        if (!session.rows[0]) {
            logger.error(`Invalid or expired session for ${email}`);
            return h.response({ error: 'Session expired or invalid' }).code(401);
        }

        request.user = decoded;
        return h.continue;
    } catch (error) {
        logger.error(`Token validation error: ${error.message}`);
        return h.response({ error: 'Invalid token' }).code(401);
    }
};

module.exports = validateToken;