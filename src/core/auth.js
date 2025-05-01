// src/core/auth.js
const { google } = require('googleapis');
const logger = require('../utils/logger');
require('dotenv').config();

const googleOauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/meetings.space.created',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
];

function getGoogleAuthUrl() {
    try {
        const url = googleOauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: GOOGLE_SCOPES,
            prompt: 'consent',
        });
        logger.info('Generated Google OAuth URL');
        return url;
    } catch (error) {
        logger.error(`Error generating Google auth URL: ${error.message}`);
        throw error;
    }
}

async function getGoogleTokens(code) {
    try {
        const { tokens } = await googleOauth2Client.getToken(code);
        logger.info('Successfully retrieved Google tokens');
        return tokens;
    } catch (error) {
        logger.error(`Error retrieving Google tokens: ${error.message}`);
        throw error;
    }
}

const MICROSOFT_SCOPES = [
    'User.Read',
    'Mail.ReadWrite',
    'Mail.Send',
    'Calendars.ReadWrite',
    'OnlineMeetings.ReadWrite', // Added for Teams meetings
    'offline_access',
];

function getMicrosoftAuthUrl() {
    try {
        const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.MICROSOFT_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.MICROSOFT_REDIRECT_URI)}&response_type=code&scope=${MICROSOFT_SCOPES.join(' ')}`;
        logger.info('Generated Microsoft OAuth URL');
        return url;
    } catch (error) {
        logger.error(`Error generating Microsoft auth URL: ${error.message}`);
        throw error;
    }
}

async function getMicrosoftTokens(code) {
    try {
        const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET,
                code,
                redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });
        const tokens = await response.json();
        if (tokens.error) throw new Error(tokens.error_description);
        logger.info('Successfully retrieved Microsoft tokens');
        return tokens;
    } catch (error) {
        logger.error(`Error retrieving Microsoft tokens: ${error.message}`);
        throw error;
    }
}

module.exports = {
    googleOauth2Client,
    getGoogleAuthUrl,
    getGoogleTokens,
    getMicrosoftAuthUrl,
    getMicrosoftTokens,
};