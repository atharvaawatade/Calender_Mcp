// src/plugins/google-services/tools.js
const { calendar, gmail } = require('./api');
const auth = require('../../core/auth');
const pool = require('../../core/database');
const logger = require('../../utils/logger');

const refreshGoogleTokenIfNeeded = async (email) => {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!user.rows[0]) throw new Error('User not found');
    const { google_access_token, google_refresh_token, google_token_expiry } = user.rows[0];

    if (new Date() > new Date(google_token_expiry)) {
        logger.info(`Refreshing token for ${email}`);
        auth.googleOauth2Client.setCredentials({ refresh_token: google_refresh_token });
        const { credentials } = await auth.googleOauth2Client.refreshAccessToken();
        await pool.query(
            'UPDATE users SET google_access_token = $1, google_token_expiry = $2 WHERE email = $3',
            [credentials.access_token, new Date(credentials.expiry_date), email]
        );
        logger.info(`Token refreshed for ${email}`);
        return credentials.access_token;
    }
    return google_access_token;
};

const setUserToken = (accessToken) => {
    auth.googleOauth2Client.setCredentials({ access_token: accessToken });
};

const tools = {
    getCalendarEvents: async (accessToken, params = {}) => {
        setUserToken(accessToken);
        const { calendarId = 'primary', timeMin, timeMax } = params;
        const res = await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });
        return res.data.items;
    },

    createCalendarEvent: async (accessToken, params) => {
        setUserToken(accessToken);
        const { summary, start, end, attendees } = params;
        
        // Basic validation
        if (!summary) {
            throw new Error('Summary is required');
        }
        
        if (!start || !end) {
            throw new Error('Start and end times are required');
        }
        
        // Ensure start and end have the same format (dateTime or date)
        const event = {
            summary,
            attendees: attendees ? attendees.map(email => (typeof email === 'string' ? { email } : email)) : [],
            conferenceData: { createRequest: { requestId: `${Date.now()}` } },
        };
        
        // Format the dates as required by Google Calendar API
        if (start.dateTime && end.dateTime) {
            // Both are dateTime format
            event.start = { 
                dateTime: start.dateTime,
                timeZone: start.timeZone || 'UTC'
            };
            event.end = { 
                dateTime: end.dateTime,
                timeZone: end.timeZone || 'UTC'
            };
        } else if (start.date && end.date) {
            // Both are date format (all-day events)
            event.start = { date: start.date };
            event.end = { date: end.date };
        } else {
            // Mixed formats or unrecognized format
            logger.error('Invalid date format:', { start, end });
            throw new Error('Start and end times must either both be date or both be dateTime');
        }
        
        // Log the formatted event 
        logger.info('Formatted event data:', JSON.stringify(event));
        
        const res = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });
        return res.data;
    },

    getGmailMessages: async (accessToken, maxResults = 10) => {
        setUserToken(accessToken);
        const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults,
        });
        return res.data.messages || [];
    },

    sendGmail: async (accessToken, { to, cc, bcc, subject, body }) => {
        setUserToken(accessToken);
        
        // Build the raw email with headers
        let emailHeaders = `To: ${to}\r\n`;
        
        // Add CC if provided
        if (cc) {
            emailHeaders += `Cc: ${cc}\r\n`;
        }
        
        // Add BCC if provided
        if (bcc) {
            emailHeaders += `Bcc: ${bcc}\r\n`;
        }
        
        // Add subject and body
        emailHeaders += `Subject: ${subject}\r\n\r\n${body}`;
        
        // Convert to base64url format as required by Gmail API
        const raw = Buffer.from(emailHeaders)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        
        const res = await gmail.users.messages.send({
            userId: 'me',
            resource: { raw },
        });
        return res.data;
    },

    sendEmail: async (auth, { to, cc, bcc, subject, body }) => {
        try {
            // Format recipients consistently
            let toRecipients;
            if (typeof to === 'string') {
                // Split comma-separated emails
                toRecipients = to.split(',').map(email => email.trim());
            } else if (Array.isArray(to)) {
                toRecipients = to.map(recipient => {
                    if (typeof recipient === 'string') return recipient.trim();
                    if (recipient.email) return recipient.email.trim();
                    return recipient;
                });
            } else if (to.email) {
                toRecipients = [to.email.trim()];
            } else {
                throw new Error('Invalid recipient format');
            }
            
            // Process CC recipients if provided
            let ccRecipients = [];
            if (cc) {
                if (typeof cc === 'string') {
                    ccRecipients = cc.split(',').map(email => email.trim());
                } else if (Array.isArray(cc)) {
                    ccRecipients = cc.map(recipient => {
                        if (typeof recipient === 'string') return recipient.trim();
                        if (recipient.email) return recipient.email.trim();
                        return recipient;
                    });
                }
            }
            
            // Process BCC recipients if provided
            let bccRecipients = [];
            if (bcc) {
                if (typeof bcc === 'string') {
                    bccRecipients = bcc.split(',').map(email => email.trim());
                } else if (Array.isArray(bcc)) {
                    bccRecipients = bcc.map(recipient => {
                        if (typeof recipient === 'string') return recipient.trim();
                        if (recipient.email) return recipient.email.trim();
                        return recipient;
                    });
                }
            }
            
            logger.info('Sending Google email:', JSON.stringify({
                to: toRecipients,
                cc: ccRecipients.length > 0 ? ccRecipients : undefined,
                bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
                subject
            }));
            
            const result = await tools.sendGmail(auth, {
                to: toRecipients.join(','),
                cc: ccRecipients.length > 0 ? ccRecipients.join(',') : undefined,
                bcc: bccRecipients.length > 0 ? bccRecipients.join(',') : undefined,
                subject,
                body
            });
            
            return { 
                success: true, 
                messageId: result.id,
                threadId: result.threadId,
                recipientCount: {
                    to: toRecipients.length,
                    cc: ccRecipients.length,
                    bcc: bccRecipients.length
                }
            };
        } catch (error) {
            logger.error('Google email sending error:', error);
            throw new Error(`Failed to send Google email: ${error.message}`);
        }
    },
};

module.exports = { tools, refreshGoogleTokenIfNeeded };