// src/plugins/google-services/api.js
const { google } = require('googleapis');
const auth = require('../../core/auth');

const calendar = google.calendar({ version: 'v3', auth: auth.googleOauth2Client });
const gmail = google.gmail({ version: 'v1', auth: auth.googleOauth2Client });
// Note: Google Meet API is limited; we'll use Calendar for meeting creation for now

module.exports = { calendar, gmail };