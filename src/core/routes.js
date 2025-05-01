// src/core/routes.js
const auth = require('./auth');
const pool = require('./database');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const llmRoutes = require('../llm/routes');
require('dotenv').config();

const googleOauth2 = google.oauth2({ version: 'v2', auth: auth.googleOauth2Client });

module.exports = [
    // Google Routes
    {
        method: 'GET',
        path: '/auth/google',
        handler: (request, h) => {
            try {
                const url = auth.getGoogleAuthUrl();
                logger.info('Redirecting to Google OAuth');
                return h.redirect(url);
            } catch (error) {
                logger.error(`Failed to redirect to Google auth: ${error.message}`);
                return h.response({ error: 'Failed to initiate authentication' }).code(500);
            }
        },
    },
    {
        method: 'GET',
        path: '/auth/google/callback',
        handler: async (request, h) => {
            const code = request.query.code;
            if (!code) {
                logger.error('No authorization code provided in callback');
                return h.response({ error: 'Missing authorization code' }).code(400);
            }

            try {
                logger.info(`Received Google authorization code: ${code}`);
                const tokens = await auth.getGoogleTokens(code);
                auth.googleOauth2Client.setCredentials({ access_token: tokens.access_token });
                const userInfo = await googleOauth2.userinfo.get();
                const email = userInfo.data.email;

                if (!email) throw new Error('Email not found in user info');
                logger.info(`User email: ${email}`);

                await pool.query(
                    `INSERT INTO users (email, google_access_token, google_refresh_token, google_token_expiry)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (email) DO UPDATE SET
                    google_access_token = EXCLUDED.google_access_token,
                    google_refresh_token = EXCLUDED.google_refresh_token,
                    google_token_expiry = EXCLUDED.google_token_expiry`,
                    [email, tokens.access_token, tokens.refresh_token, new Date(tokens.expiry_date)]
                );

                const jwtToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
                const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
                await pool.query(
                    `INSERT INTO sessions (user_email, jwt_token, expires_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_email) DO UPDATE SET
                    jwt_token = EXCLUDED.jwt_token,
                    expires_at = EXCLUDED.expires_at`,
                    [email, jwtToken, expiresAt]
                );
                logger.info(`Session created for user: ${email}`);

                return h.redirect(`/?token=${jwtToken}&provider=google`);
            } catch (error) {
                logger.error(`Google callback error: ${error.message}, Stack: ${error.stack}`);
                return h.response({ error: 'Authentication failed', details: error.message }).code(500);
            }
        },
    },
    // Microsoft Routes
    {
        method: 'GET',
        path: '/auth/microsoft',
        handler: (request, h) => {
            try {
                const url = auth.getMicrosoftAuthUrl();
                logger.info('Redirecting to Microsoft OAuth');
                return h.redirect(url);
            } catch (error) {
                logger.error(`Failed to redirect to Microsoft auth: ${error.message}`);
                return h.response({ error: 'Failed to initiate authentication' }).code(500);
            }
        },
    },
    {
        method: 'GET',
        path: '/auth/microsoft/callback',
        handler: async (request, h) => {
            const code = request.query.code;
            if (!code) {
                logger.error('No authorization code provided in Microsoft callback');
                return h.response({ error: 'Missing authorization code' }).code(400);
            }

            try {
                logger.info(`Received Microsoft authorization code: ${code}`);
                const tokens = await auth.getMicrosoftTokens(code);
                const graphClient = require('@microsoft/microsoft-graph-client').Client.init({
                    authProvider: (done) => done(null, tokens.access_token),
                });
                const userInfo = await graphClient.api('/me').get();
                const email = userInfo.mail || userInfo.userPrincipalName;

                if (!email) throw new Error('Email not found in Microsoft user info');
                logger.info(`User email: ${email}`);

                await pool.query(
                    `INSERT INTO users (email, microsoft_access_token, microsoft_refresh_token, microsoft_token_expiry)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (email) DO UPDATE SET
                    microsoft_access_token = EXCLUDED.microsoft_access_token,
                    microsoft_refresh_token = EXCLUDED.microsoft_refresh_token,
                    microsoft_token_expiry = EXCLUDED.microsoft_token_expiry`,
                    [email, tokens.access_token, tokens.refresh_token, new Date(Date.now() + tokens.expires_in * 1000)]
                );

                const jwtToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
                const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
                await pool.query(
                    `INSERT INTO sessions (user_email, jwt_token, expires_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_email) DO UPDATE SET
                    jwt_token = EXCLUDED.jwt_token,
                    expires_at = EXCLUDED.expires_at`,
                    [email, jwtToken, expiresAt]
                );
                logger.info(`Session created for user: ${email}`);

                return h.redirect(`/?token=${jwtToken}&provider=microsoft`);
            } catch (error) {
                logger.error(`Microsoft callback error: ${error.message}, Stack: ${error.stack}`);
                return h.response({ error: 'Authentication failed', details: error.message }).code(500);
            }
        },
    },
    // Logout Route
    {
        method: 'POST',
        path: '/auth/logout',
        handler: async (request, h) => {
            try {
                const token = request.headers.authorization?.split(' ')[1];
                if (!token) throw new Error('No token provided');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const email = decoded.email;

                await pool.query('DELETE FROM sessions WHERE user_email = $1', [email]);
                logger.info(`User logged out: ${email}`);
                return h.response({ message: 'Logged out successfully' }).code(200);
            } catch (error) {
                logger.error(`Logout error: ${error.message}`);
                return h.response({ error: 'Logout failed', details: error.message }).code(401);
            }
        },
    },
    // Add LLM routes for natural language processing
    ...llmRoutes,
];