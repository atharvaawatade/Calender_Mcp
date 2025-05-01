// src/plugins/google-services/index.js
const { google } = require('googleapis');
const { OAuth2 } = google.auth;
const auth = require('../../core/auth');
const pool = require('../../core/database');
const logger = require('../../utils/logger');
const { tools, refreshGoogleTokenIfNeeded } = require('./tools');
const llmService = require('../../llm/service');

const register = async (server, options) => {
    server.route([
        {
            method: 'GET',
            path: '/google/profile',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const user = await pool.query('SELECT * FROM users WHERE email = $1', [request.user.email]);
                    if (!user.rows[0]?.google_access_token) throw new Error('Google authentication required');
                    auth.googleOauth2Client.setCredentials({ access_token: user.rows[0].google_access_token });
                    const oauth2 = google.oauth2({ version: 'v2', auth: auth.googleOauth2Client });
                    const profile = await oauth2.userinfo.get();
                    return h.response(profile.data).code(200);
                } catch (error) {
                    logger.error('Google profile error:', error);
                    return h.response({ error: 'Failed to fetch profile', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'GET',
            path: '/calendar/events',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    const accessToken = await refreshGoogleTokenIfNeeded(email);
                    const events = await tools.getCalendarEvents(accessToken);
                    return h.response(events).code(200);
                } catch (error) {
                    logger.error('Calendar events error:', error);
                    return h.response({ error: 'Failed to fetch events', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'POST',
            path: '/calendar/events',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    const accessToken = await refreshGoogleTokenIfNeeded(email);
                    const event = await tools.createCalendarEvent(accessToken, request.payload);
                    return h.response(event).code(201);
                } catch (error) {
                    logger.error('Calendar create error:', error);
                    return h.response({ error: 'Failed to create event', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'POST',
            path: '/calendar/nl-create',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    logger.info(`Creating Google calendar event via natural language for user: ${email}`);
                    
                    // Process the natural language request
                    const { text, timezone = 'UTC' } = request.payload;
                    if (!text) {
                        return h.response({ error: 'Text is required' }).code(400);
                    }
                    
                    // Use LLM service to process the natural language request
                    // Pass 'google' as the provider to get the correct format
                    const processedData = await llmService.processMeetingRequest(text, timezone, 'google');
                    logger.info(`Processed Google meeting data: ${JSON.stringify(processedData)}`);
                    
                    // Refresh token and create the event
                    const accessToken = await refreshGoogleTokenIfNeeded(email);
                    const event = await tools.createCalendarEvent(accessToken, processedData);
                    
                    return h.response(event).code(201);
                } catch (error) {
                    logger.error(`POST /calendar/nl-create error: ${error.message}, Stack: ${error.stack}`);
                    return h.response({ error: 'Failed to create event', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'POST',
            path: '/gmail/send',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    const accessToken = await refreshGoogleTokenIfNeeded(email);
                    await tools.sendEmail(accessToken, request.payload);
                    return h.response({ success: true }).code(200);
                } catch (error) {
                    logger.error('Gmail send error:', error);
                    return h.response({ error: 'Failed to send email', details: error.message }).code(500);
                }
            },
        },
    ]);
};

module.exports = {
    name: 'google-services',
    version: '1.0.0',
    register,
};