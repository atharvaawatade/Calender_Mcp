// src/plugins/microsoft-services/index.js
const { tools, refreshMicrosoftTokenIfNeeded } = require('./tools');
const pool = require('../../core/database');
const logger = require('../../utils/logger');
const llmService = require('../../llm/service');

const register = async (server, options) => {
    server.route([
        {
            method: 'GET',
            path: '/microsoft/calendar/events',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    logger.info(`Fetching Microsoft calendar events for user: ${email}`);
                    const user = await pool.query('SELECT microsoft_access_token FROM users WHERE email = $1', [email]);
                    if (!user.rows[0]?.microsoft_access_token) throw new Error('Microsoft authentication required');
                    const accessToken = await refreshMicrosoftTokenIfNeeded(email);
                    const events = await tools.getCalendarEvents(accessToken);
                    return h.response(events).code(200);
                } catch (error) {
                    logger.error(`GET /microsoft/calendar/events error: ${error.message}, Stack: ${error.stack}`);
                    return h.response({ error: 'Failed to fetch events', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'POST',
            path: '/microsoft/calendar/events',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    logger.info(`Creating Microsoft calendar event for user: ${email}`);
                    const user = await pool.query('SELECT microsoft_access_token FROM users WHERE email = $1', [email]);
                    if (!user.rows[0]?.microsoft_access_token) throw new Error('Microsoft authentication required');
                    const accessToken = await refreshMicrosoftTokenIfNeeded(email);
                    const eventData = request.payload;
                    logger.info(`Microsoft event data: ${JSON.stringify(eventData)}`);
                    const event = await tools.createCalendarEvent(accessToken, eventData);
                    return h.response(event).code(201);
                } catch (error) {
                    logger.error(`POST /microsoft/calendar/events error: ${error.message}, Stack: ${error.stack}`);
                    return h.response({ error: 'Failed to create event', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'POST',
            path: '/microsoft/calendar/nl-create',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    logger.info(`Creating Microsoft calendar event via natural language for user: ${email}`);
                    const user = await pool.query('SELECT microsoft_access_token FROM users WHERE email = $1', [email]);
                    if (!user.rows[0]?.microsoft_access_token) throw new Error('Microsoft authentication required');
                    
                    // Process the natural language request
                    const { text, timezone = 'UTC' } = request.payload;
                    if (!text) {
                        return h.response({ error: 'Text is required' }).code(400);
                    }
                    
                    // Use LLM service to process the natural language request
                    // Pass 'microsoft' as the provider to get the correct format
                    const processedData = await llmService.processMeetingRequest(text, timezone, 'microsoft');
                    logger.info(`Processed Microsoft meeting data: ${JSON.stringify(processedData)}`);
                    
                    // Refresh token and create the event
                    const accessToken = await refreshMicrosoftTokenIfNeeded(email);
                    const event = await tools.createCalendarEvent(accessToken, processedData);
                    
                    return h.response(event).code(201);
                } catch (error) {
                    logger.error(`POST /microsoft/calendar/nl-create error: ${error.message}, Stack: ${error.stack}`);
                    return h.response({ error: 'Failed to create event', details: error.message }).code(500);
                }
            },
        },
        {
            method: 'POST',
            path: '/microsoft/outlook/send',
            options: { pre: [{ method: require('../../middleware/auth') }] },
            handler: async (request, h) => {
                try {
                    const email = request.user.email;
                    logger.info(`Sending Microsoft email for user: ${email}`);
                    const user = await pool.query('SELECT microsoft_access_token FROM users WHERE email = $1', [email]);
                    if (!user.rows[0]?.microsoft_access_token) throw new Error('Microsoft authentication required');
                    const accessToken = await refreshMicrosoftTokenIfNeeded(email);
                    const emailData = await tools.sendEmail(accessToken, request.payload);
                    logger.info(`Microsoft email sent successfully for ${email}`);
                    return h.response(emailData).code(200);
                } catch (error) {
                    logger.error(`POST /microsoft/outlook/send error: ${error.message}, Stack: ${error.stack}`);
                    return h.response({ error: 'Failed to send email', details: error.message }).code(500);
                }
            },
        },
    ]);
};

module.exports = {
    name: 'microsoft-services',
    version: '1.0.0',
    register,
};