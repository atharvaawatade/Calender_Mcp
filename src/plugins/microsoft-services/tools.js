// src/plugins/microsoft-services/tools.js
const { graphClient } = require('./api');
const auth = require('../../core/auth');
const pool = require('../../core/database');
const logger = require('../../utils/logger');
const { DateTime } = require('luxon');

const refreshMicrosoftTokenIfNeeded = async (email) => {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!user.rows[0]) throw new Error('User not found');
    const { microsoft_access_token, microsoft_refresh_token, microsoft_token_expiry } = user.rows[0];

    if (new Date() > new Date(microsoft_token_expiry)) {
        logger.info(`Refreshing Microsoft token for ${email}`);
        const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET,
                refresh_token: microsoft_refresh_token,
                grant_type: 'refresh_token',
            }),
        });
        const tokens = await response.json();
        if (tokens.error) throw new Error(tokens.error_description);
        await pool.query(
            'UPDATE users SET microsoft_access_token = $1, microsoft_token_expiry = $2 WHERE email = $3',
            [tokens.access_token, new Date(Date.now() + tokens.expires_in * 1000), email]
        );
        logger.info(`Microsoft token refreshed for ${email}`);
        return tokens.access_token;
    }
    return microsoft_access_token;
};

const tools = {
    getCalendarEvents: async (accessToken) => {
        const client = graphClient(accessToken);
        const res = await client.api('/me/events')
            .select('subject,organizer,attendees,start,end,bodyPreview,isOnlineMeeting,onlineMeeting')
            .orderby('createdDateTime DESC')
            .top(10)
            .get();
        
        // Transform Microsoft format to match Google format for consistency
        return res.value.map(event => ({
            id: event.id,
            summary: event.subject,
            organizer: event.organizer?.emailAddress?.address,
            start: {
                dateTime: event.start.dateTime,
                timeZone: event.start.timeZone
            },
            end: {
                dateTime: event.end.dateTime,
                timeZone: event.end.timeZone
            },
            attendees: event.attendees?.map(a => ({ email: a.emailAddress.address })) || [],
            description: event.bodyPreview,
            isOnlineMeeting: event.isOnlineMeeting,
            onlineMeeting: event.onlineMeeting
        }));
    },
    
    createCalendarEvent: async (accessToken, params) => {
        const client = graphClient(accessToken);
        
        // Validate and format the event data
        if (!params.summary) throw new Error('Event summary is required');
        
        // Process start and end times consistently
        let startDateTime, endDateTime, startTimeZone, endTimeZone;
        
        // Handle formatting based on the input structure
        if (params.start && params.start.dateTime) {
            // If dateTime is provided directly in the expected format
            startDateTime = params.start.dateTime;
            startTimeZone = params.start.timeZone || 'UTC';
        } else if (typeof params.start === 'string') {
            // If start is provided as a string
            try {
                const dt = DateTime.fromISO(params.start);
                startDateTime = dt.toISO();
                startTimeZone = dt.zoneName || 'UTC';
            } catch (e) {
                throw new Error(`Invalid start date format: ${e.message}`);
            }
        } else {
            throw new Error('Invalid start time format');
        }
        
        // Similarly for end time
        if (params.end && params.end.dateTime) {
            endDateTime = params.end.dateTime;
            endTimeZone = params.end.timeZone || 'UTC';
        } else if (typeof params.end === 'string') {
            try {
                const dt = DateTime.fromISO(params.end);
                endDateTime = dt.toISO();
                endTimeZone = dt.zoneName || 'UTC';
            } catch (e) {
                throw new Error(`Invalid end date format: ${e.message}`);
            }
        } else {
            throw new Error('Invalid end time format');
        }
        
        // Format attendees consistently
        const attendees = params.attendees?.map(a => {
            if (typeof a === 'string') return { emailAddress: { address: a } };
            if (a.email) return { emailAddress: { address: a.email } };
            if (a.emailAddress?.address) return a;
            return null;
        }).filter(a => a !== null) || [];
        
        // Construct the Microsoft Graph event object
        const event = {
            subject: params.summary,
            start: { 
                dateTime: startDateTime, 
                timeZone: startTimeZone 
            },
            end: { 
                dateTime: endDateTime, 
                timeZone: endTimeZone 
            },
            attendees: attendees,
            isOnlineMeeting: true,
            onlineMeetingProvider: 'teamsForBusiness',
        };
        
        logger.info('Creating Microsoft calendar event:', JSON.stringify(event));
        
        try {
            const res = await client.api('/me/events').post(event);
            
            // Fetch the event again to get the Teams meeting details if not in initial response
            if (!res.onlineMeeting || !res.onlineMeeting.joinUrl) {
                logger.info(`Teams meeting link not available in initial response. Fetching event again: ${res.id}`);
                try {
                    const updatedEvent = await client.api(`/me/events/${res.id}`).get();
                    res.onlineMeeting = updatedEvent.onlineMeeting || { joinUrl: 'Teams link not immediately available' };
                } catch (fetchError) {
                    logger.warn(`Could not fetch meeting details: ${fetchError.message}`);
                    res.onlineMeeting = { joinUrl: 'Teams link not immediately available' };
                }
            }
            
            logger.info(`Teams meeting created: ${res.onlineMeeting?.joinUrl || 'No join URL available yet'}`);
            return res;
        } catch (error) {
            logger.error('Microsoft calendar event creation error:', error);
            throw new Error(`Failed to create Microsoft event: ${error.message}`);
        }
    },
    
    sendEmail: async (accessToken, { to, cc, bcc, subject, body }) => {
        const client = graphClient(accessToken);
        
        // Format recipients consistently
        let toRecipients;
        if (typeof to === 'string') {
            // Split comma-separated emails
            toRecipients = to.split(',').map(email => ({ 
                emailAddress: { address: email.trim() } 
            }));
        } else if (Array.isArray(to)) {
            toRecipients = to.map(recipient => {
                if (typeof recipient === 'string') return { emailAddress: { address: recipient.trim() } };
                if (recipient.email) return { emailAddress: { address: recipient.email.trim() } };
                return recipient;
            });
        } else if (to.email) {
            toRecipients = [{ emailAddress: { address: to.email.trim() } }];
        } else {
            throw new Error('Invalid recipient format');
        }
        
        // Process CC recipients if provided
        let ccRecipients = [];
        if (cc) {
            if (typeof cc === 'string') {
                ccRecipients = cc.split(',').map(email => ({ 
                    emailAddress: { address: email.trim() } 
                }));
            } else if (Array.isArray(cc)) {
                ccRecipients = cc.map(recipient => {
                    if (typeof recipient === 'string') return { emailAddress: { address: recipient.trim() } };
                    if (recipient.email) return { emailAddress: { address: recipient.email.trim() } };
                    return recipient;
                });
            }
        }
        
        // Process BCC recipients if provided
        let bccRecipients = [];
        if (bcc) {
            if (typeof bcc === 'string') {
                bccRecipients = bcc.split(',').map(email => ({ 
                    emailAddress: { address: email.trim() } 
                }));
            } else if (Array.isArray(bcc)) {
                bccRecipients = bcc.map(recipient => {
                    if (typeof recipient === 'string') return { emailAddress: { address: recipient.trim() } };
                    if (recipient.email) return { emailAddress: { address: recipient.email.trim() } };
                    return recipient;
                });
            }
        }
        
        const message = {
            subject,
            body: { contentType: 'Text', content: body },
            toRecipients,
        };
        
        // Add CC recipients if any
        if (ccRecipients.length > 0) {
            message.ccRecipients = ccRecipients;
        }
        
        // Add BCC recipients if any
        if (bccRecipients.length > 0) {
            message.bccRecipients = bccRecipients;
        }
        
        logger.info('Sending Microsoft email:', JSON.stringify({
            to: toRecipients.map(r => r.emailAddress.address),
            cc: ccRecipients.length > 0 ? ccRecipients.map(r => r.emailAddress.address) : undefined,
            bcc: bccRecipients.length > 0 ? bccRecipients.map(r => r.emailAddress.address) : undefined,
            subject
        }));
        
        try {
            const res = await client.api('/me/sendMail').post({ message });
            return { 
                success: true, 
                messageId: res.id,
                recipientCount: {
                    to: toRecipients.length,
                    cc: ccRecipients.length,
                    bcc: bccRecipients.length
                }
            };
        } catch (error) {
            logger.error('Microsoft email sending error:', error);
            throw new Error(`Failed to send Microsoft email: ${error.message}`);
        }
    },
};

module.exports = {
    tools,
    refreshMicrosoftTokenIfNeeded,
};