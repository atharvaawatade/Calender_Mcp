const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { DateTime, IANAZone } = require('luxon');
const fetch = require('node-fetch');

// Initialize Gemini with proper configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
    apiVersion: 'v1beta'
});

// Map common timezone abbreviations to IANA timezone identifiers
const TIMEZONE_MAP = {
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'GMT': 'Europe/London',
    'BST': 'Europe/London',
    'CET': 'Europe/Paris',
    'CEST': 'Europe/Paris',
    'IST': 'Asia/Kolkata',
    'JST': 'Asia/Tokyo',
    'AEST': 'Australia/Sydney',
    'AEDT': 'Australia/Sydney',
    'NZST': 'Pacific/Auckland',
    'NZDT': 'Pacific/Auckland',
    'UTC': 'UTC'
};

// Add common city to timezone mappings
const CITY_TO_TIMEZONE = {
    'new york': 'America/New_York',
    'los angeles': 'America/Los_Angeles',
    'chicago': 'America/Chicago',
    'houston': 'America/Chicago',
    'phoenix': 'America/Phoenix',
    'philadelphia': 'America/New_York',
    'san antonio': 'America/Chicago',
    'san diego': 'America/Los_Angeles',
    'dallas': 'America/Chicago',
    'san jose': 'America/Los_Angeles',
    'austin': 'America/Chicago',
    'jacksonville': 'America/New_York',
    'san francisco': 'America/Los_Angeles',
    'columbus': 'America/New_York',
    'london': 'Europe/London',
    'berlin': 'Europe/Berlin',
    'madrid': 'Europe/Madrid',
    'rome': 'Europe/Rome',
    'paris': 'Europe/Paris',
    'tokyo': 'Asia/Tokyo',
    'sydney': 'Australia/Sydney',
    'mumbai': 'Asia/Kolkata',
    'delhi': 'Asia/Kolkata',
    'bangalore': 'Asia/Kolkata',
    'kolkata': 'Asia/Kolkata',
    'chennai': 'Asia/Kolkata',
    'hyderabad': 'Asia/Kolkata',
    'beijing': 'Asia/Shanghai',
    'shanghai': 'Asia/Shanghai',
    'hong kong': 'Asia/Hong_Kong',
    'singapore': 'Asia/Singapore',
    'toronto': 'America/Toronto',
    'vancouver': 'America/Vancouver',
    'montreal': 'America/Montreal',
    'dubai': 'Asia/Dubai',
    'dublin': 'Europe/Dublin'
};

// Regex patterns for better timezone and datetime detection
const TIMEZONE_PATTERNS = {
    abbreviation: /\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|BST|CET|CEST|IST|JST|AEST|AEDT|NZST|NZDT|UTC)\b/i,
    offset: /UTC[+-][0-9]{1,2}(:?[0-9]{2})?|GMT[+-][0-9]{1,2}(:?[0-9]{2})?/i,
    city: new RegExp(`\\b(${Object.keys(CITY_TO_TIMEZONE).join('|')})\\b`, 'i'),
};

// Time-related terms for better parsing
const TIME_KEYWORDS = {
    relative: [
        'today', 'tomorrow', 'yesterday', 
        'next week', 'last week', 'this week',
        'next month', 'last month', 'this month',
        'next year', 'last year', 'this year',
        'morning', 'afternoon', 'evening', 'night',
        'now', 'soon', 'later'
    ],
    days: [
        'monday', 'tuesday', 'wednesday', 'thursday', 
        'friday', 'saturday', 'sunday'
    ],
    months: [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ]
};

const MEETING_PROMPT = `You are a meeting scheduling assistant with deep expertise in datetime processing. Convert the following natural language request into a structured JSON format for scheduling a meeting.
The output must be in this precise format (with no extra fields or modifications):
{
    "type": "meeting",
    "summary": "Meeting title/summary",
    "start": "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "end": "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "attendees": ["email1@example.com", "email2@example.com"],
    "detectedTimezone": "IANA timezone identifier (e.g., Asia/Kolkata for IST)"
}

Current precise time: {currentTime}
User's system timezone: {userTimezone}
Detected timezone in request (if any): {detectedTimezone}
Current time in detected timezone (if any): {currentTimeInDetectedTimezone}

Rules:
1. Always use the CURRENT TIME to calculate relative times ("tomorrow", "next week", etc.)
2. Prefer timezone mentioned in the request over the user's system timezone
3. Always include the correct timezone offset in the ISO timestamps for start/end times 
4. Create a descriptive meeting title based on the purpose or attendees
5. Default meeting duration is 1 hour if not specified
6. For the detectedTimezone field, always use the IANA identifier (e.g., "Asia/Kolkata") not abbreviations (e.g., "IST")
7. Be exact with time calculations - if user says 2pm IST, this must be exactly 14:00:00 in IST timezone

Examples of correct datetime processing:
- "tomorrow at 2pm" → Calculate 14:00:00 on the next calendar day from the current time
- "next Monday at 10am" → Find the next occurrence of Monday and set time to 10:00:00
- "May 15th at 3pm IST" → May 15th of current/next year at 15:00:00 in Asia/Kolkata timezone

User request: `;

// Enhance the EMAIL_PROMPT to better handle multiple recipients
const EMAIL_PROMPT = `You are an email composition assistant. Convert the following natural language request into a structured JSON format for sending an email.
The output should be in this exact format:
{
    "type": "email",
    "to": ["recipient1@example.com", "recipient2@example.com"],
    "cc": ["cc1@example.com", "cc2@example.com"],
    "bcc": ["bcc1@example.com"],
    "subject": "Email subject",
    "body": "Email body content"
}

Rules:
1. The "to" field MUST be an array of email addresses, even if there's only one recipient
2. Include "cc" and "bcc" arrays only if they are explicitly mentioned in the request
3. Extract all recipients correctly, handling comma-separated lists or multiple mentions
4. Make sure all email addresses are properly formatted (name@domain.com)
5. Create a clear subject line if one is not explicitly provided
6. Format the body text with proper paragraphs and line breaks
7. If CC or BCC is not mentioned, don't include those fields in the JSON

Examples:
- "Send an email to john@example.com about the project update" → format with just "to" field
- "Email john@example.com and cc sarah@example.com about tomorrow's meeting" → include both "to" and "cc" fields
- "Send an email to team@company.com with cc to manager@company.com and bcc hr@company.com about budget approval" → include all three recipient types

User's request: `;

class LLMService {
    constructor() {
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
            }
        });
    }

    /**
     * Fetch the current world time for a specific timezone
     * @param {string} timezone - IANA timezone identifier
     * @returns {Promise<DateTime>} - Current time in the specified timezone
     */
    async fetchWorldTime(timezone) {
        try {
            // First try to use Luxon's built-in capability for timezone conversion
            let now = DateTime.now().setZone(timezone);
            if (now.isValid) {
                logger.info(`Using Luxon for timezone ${timezone}: ${now.toISO()}`);
                return now;
            }

            // Fallback to an external API if needed
            const response = await fetch(`http://worldtimeapi.org/api/timezone/${timezone}`);
            if (!response.ok) {
                throw new Error(`World Time API returned ${response.status}`);
            }
            
            const data = await response.json();
            logger.info(`World Time API response for ${timezone}: ${JSON.stringify(data)}`);
            
            const dt = DateTime.fromISO(data.datetime);
            return dt;
        } catch (error) {
            logger.warn(`Error fetching world time for ${timezone}: ${error.message}. Using local calculation.`);
            // Fallback to local calculation
            return DateTime.now().setZone(timezone);
        }
    }

    /**
     * Comprehensive timezone detection from user input
     * @param {string} input - User input text
     * @returns {Object} - Detected timezone info or null
     */
    detectTimezone(input) {
        try {
            // Try to detect timezone abbreviation (IST, PST, etc.)
            const abbrMatch = input.match(TIMEZONE_PATTERNS.abbreviation);
            if (abbrMatch) {
                const abbr = abbrMatch[1].toUpperCase();
                const ianaName = TIMEZONE_MAP[abbr];
                if (ianaName) {
                    logger.info(`Detected timezone abbreviation: ${abbr} -> ${ianaName}`);
                    return {
                        original: abbr,
                        ianaName: ianaName,
                        source: 'abbreviation'
                    };
                }
            }
            
            // Try to detect timezone by city name
            const cityMatch = input.match(TIMEZONE_PATTERNS.city);
            if (cityMatch) {
                const city = cityMatch[1].toLowerCase();
                const ianaName = CITY_TO_TIMEZONE[city];
                if (ianaName) {
                    logger.info(`Detected timezone by city: ${city} -> ${ianaName}`);
                    return {
                        original: city,
                        ianaName: ianaName,
                        source: 'city'
                    };
                }
            }
            
            // Try to detect GMT/UTC offset
            const offsetMatch = input.match(TIMEZONE_PATTERNS.offset);
            if (offsetMatch) {
                const offset = offsetMatch[0];
                // Convert offset to IANA if possible or use fixed offset
                try {
                    // UTC+5:30 format
                    let fixedOffset = offset.replace(/UTC|GMT/i, '');
                    const zone = IANAZone.create(`Etc/GMT${fixedOffset}`);
                    if (zone.isValid) {
                        logger.info(`Detected timezone offset: ${offset} -> ${zone.name}`);
                        return {
                            original: offset,
                            ianaName: zone.name,
                            source: 'offset'
                        };
                    }
                } catch (e) {
                    logger.warn(`Error parsing timezone offset: ${offset}, ${e.message}`);
                }
            }
            
            return null;
        } catch (error) {
            logger.error(`Error in timezone detection: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Check if a string contains time-related keywords
     * @param {string} input - User input text
     * @returns {boolean} - Whether time keywords are present
     */
    containsTimeKeywords(input) {
        input = input.toLowerCase();
        
        // Check for relative time terms
        const hasRelativeTerms = TIME_KEYWORDS.relative.some(term => input.includes(term));
        if (hasRelativeTerms) return true;
        
        // Check for day names
        const hasDayNames = TIME_KEYWORDS.days.some(day => input.includes(day));
        if (hasDayNames) return true;
        
        // Check for month names
        const hasMonthNames = TIME_KEYWORDS.months.some(month => input.includes(month));
        if (hasMonthNames) return true;
        
        // Check for time patterns like 2pm, 14:00, etc.
        const hasTimePattern = /\b([0-9]{1,2})(:[0-9]{2})?\s*(am|pm)?\b/i.test(input);
        if (hasTimePattern) return true;
        
        // Check for date patterns like 2023-04-01, April 1st, etc.
        const hasDatePattern = /\b([0-9]{4}-[0-9]{2}-[0-9]{2})|([0-9]{1,2}\/[0-9]{1,2}(\/[0-9]{2,4})?)|([0-9]{1,2}(st|nd|rd|th)?\s+(of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december))\b/i.test(input);
        
        return hasDatePattern;
    }

    /**
     * Process a meeting request with enhanced datetime awareness
     * @param {string} userInput - Natural language request
     * @param {string} userTimezone - User's default timezone
     * @param {string} provider - 'google' or 'microsoft'
     * @returns {Promise<Object>} - Formatted meeting data
     */
    async processMeetingRequest(userInput, userTimezone = 'UTC', provider = 'google') {
        logger.info(`Processing meeting request: "${userInput}" using ${provider} provider with user timezone ${userTimezone}`);
        
        try {
            // Validate the provided user timezone
            try {
                const zone = IANAZone.create(userTimezone);
                if (!zone.isValid) {
                    logger.warn(`Invalid user timezone ${userTimezone}, falling back to UTC`);
                    userTimezone = 'UTC';
                }
            } catch (e) {
                logger.warn(`Error parsing user timezone ${userTimezone}, falling back to UTC: ${e.message}`);
                userTimezone = 'UTC';
            }
            
            // First detect any timezone mentioned in the request
            const detectedTimezoneInfo = this.detectTimezone(userInput);
            let effectiveTimezone = userTimezone;
            let detectedTimezoneIANA = null;
            
            if (detectedTimezoneInfo) {
                detectedTimezoneIANA = detectedTimezoneInfo.ianaName;
                effectiveTimezone = detectedTimezoneIANA;
                logger.info(`Using detected timezone ${detectedTimezoneIANA} (from ${detectedTimezoneInfo.original})`);
            }
            
            // Get current time in user's timezone
            const currentTimeUserTz = DateTime.now().setZone(userTimezone);
            
            // Get current time in detected timezone if available
            let currentTimeDetectedTz = null;
            if (detectedTimezoneIANA) {
                currentTimeDetectedTz = await this.fetchWorldTime(detectedTimezoneIANA);
                logger.info(`Current time in detected timezone ${detectedTimezoneIANA}: ${currentTimeDetectedTz.toISO()}`);
            }
            
            // Create the prompt with all the contextual information
            let prompt = MEETING_PROMPT
                .replace('{currentTime}', DateTime.now().toISO())
                .replace('{userTimezone}', userTimezone)
                .replace('{detectedTimezone}', detectedTimezoneIANA || 'None detected')
                .replace('{currentTimeInDetectedTimezone}', currentTimeDetectedTz ? currentTimeDetectedTz.toISO() : 'N/A');
                
            prompt += userInput;
            
            logger.info(`Sending prompt to LLM with timezone context: user=${userTimezone}, detected=${detectedTimezoneIANA || 'none'}`);
            
            // Generate response from LLM
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            
            const response = await result.response;
            const text = response.text();
            
            logger.info(`LLM Response: ${text}`);

            // Extract JSON from the LLM response
            const jsonMatch = text.match(/```json\n([\s\S]+)\n```/) || 
                              text.match(/```\n([\s\S]+)\n```/) ||
                              text.match(/{[\s\S]+}/);
            
            if (!jsonMatch) {
                throw new Error('No valid JSON found in LLM response');
            }
            
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            let meetingData;
            
            try {
                meetingData = JSON.parse(jsonStr);
            } catch (e) {
                logger.error(`Error parsing LLM JSON response: ${e.message}`);
                throw new Error('Invalid JSON format in LLM response');
            }

            // Validate meeting data
            if (!meetingData.summary || !meetingData.start || !meetingData.end || !meetingData.attendees) {
                throw new Error('Missing required meeting information in LLM response');
            }
            
            // Validate and potentially fix timezone information
            if (detectedTimezoneIANA && !meetingData.detectedTimezone) {
                meetingData.detectedTimezone = detectedTimezoneIANA;
            }
            
            // Format for provider-specific output
            let formattedMeeting;
            
            if (provider === 'microsoft') {
                // Microsoft format
                formattedMeeting = {
                    summary: meetingData.summary,
                    start: meetingData.start,
                    end: meetingData.end,
                    attendees: Array.isArray(meetingData.attendees) ? meetingData.attendees : [],
                    timezone: meetingData.detectedTimezone || userTimezone
                };
            } else {
                // Google format
                formattedMeeting = {
                    summary: meetingData.summary,
                    start: {
                        dateTime: meetingData.start,
                        timeZone: meetingData.detectedTimezone || userTimezone
                    },
                    end: {
                        dateTime: meetingData.end,
                        timeZone: meetingData.detectedTimezone || userTimezone
                    },
                    attendees: Array.isArray(meetingData.attendees) 
                        ? meetingData.attendees.map(email => ({ email }))
                        : [],
                    timezone: meetingData.detectedTimezone || userTimezone
                };
            }

            logger.info(`Formatted meeting for ${provider}: ${JSON.stringify(formattedMeeting)}`);
            return formattedMeeting;
        } catch (error) {
            logger.error(`Error processing meeting request: ${error.message}`);
            throw new Error(`Could not process meeting request: ${error.message}`);
        }
    }

    // Enhance the processEmailRequest method to better handle multiple recipients
    async processEmailRequest(userInput, provider = 'google') {
        try {
            logger.info(`Processing email request: "${userInput}" using ${provider} provider`);
            
            const prompt = EMAIL_PROMPT + userInput;
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            
            const response = await result.response;
            const text = response.text();
            
            logger.info(`Raw LLM response: ${text}`);
            
            // Extract the JSON object
            let emailData;
            try {
                // Find JSON in the response
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    emailData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No valid JSON found in response');
                }
            } catch (parseError) {
                logger.error(`Error parsing LLM response: ${parseError.message}`);
                throw new Error('Failed to understand the email request. Please try again with clearer instructions.');
            }
            
            // Validate email data structure
            if (emailData.type !== 'email') {
                throw new Error('Invalid response type. Expected email data.');
            }
            
            if (!emailData.to || !Array.isArray(emailData.to) || emailData.to.length === 0) {
                throw new Error('No valid recipients found in the request. Please specify who to send the email to.');
            }
            
            // Validate all email addresses
            const validateEmail = (email) => {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(String(email).toLowerCase());
            };
            
            // Validate "to" addresses
            emailData.to = emailData.to.filter(email => {
                const isValid = validateEmail(email);
                if (!isValid) {
                    logger.warn(`Invalid email address in TO field: ${email}`);
                }
                return isValid;
            });
            
            // Validate CC addresses if present
            if (emailData.cc && Array.isArray(emailData.cc)) {
                emailData.cc = emailData.cc.filter(email => {
                    const isValid = validateEmail(email);
                    if (!isValid) {
                        logger.warn(`Invalid email address in CC field: ${email}`);
                    }
                    return isValid;
                });
                
                // Remove cc field if empty after filtering
                if (emailData.cc.length === 0) {
                    delete emailData.cc;
                }
            }
            
            // Validate BCC addresses if present
            if (emailData.bcc && Array.isArray(emailData.bcc)) {
                emailData.bcc = emailData.bcc.filter(email => {
                    const isValid = validateEmail(email);
                    if (!isValid) {
                        logger.warn(`Invalid email address in BCC field: ${email}`);
                    }
                    return isValid;
                });
                
                // Remove bcc field if empty after filtering
                if (emailData.bcc.length === 0) {
                    delete emailData.bcc;
                }
            }
            
            // After filtering, if no valid recipients remain, throw error
            if (emailData.to.length === 0) {
                throw new Error('No valid email addresses found in the request.');
            }
            
            if (!emailData.subject) {
                emailData.subject = 'No Subject';
            }
            
            if (!emailData.body) {
                throw new Error('Email body is missing or empty.');
            }
            
            // Format the data for email sending
            const formattedEmail = {
                to: emailData.to.join(','),
                subject: emailData.subject,
                body: emailData.body
            };
            
            // Add CC if present
            if (emailData.cc && emailData.cc.length > 0) {
                formattedEmail.cc = emailData.cc.join(',');
            }
            
            // Add BCC if present
            if (emailData.bcc && emailData.bcc.length > 0) {
                formattedEmail.bcc = emailData.bcc.join(',');
            }
            
            logger.info(`Processed email request: To: ${formattedEmail.to}, Subject: ${formattedEmail.subject}`);
            if (formattedEmail.cc) logger.info(`CC: ${formattedEmail.cc}`);
            if (formattedEmail.bcc) logger.info(`BCC: ${formattedEmail.bcc}`);
            
            return formattedEmail;
        } catch (error) {
            logger.error(`Error processing email request: ${error.message}`);
            throw new Error(`Could not process email request: ${error.message}`);
        }
    }

    /**
     * Get a list of supported timezones for the UI
     * @returns {Object[]} Array of timezone objects with value and label
     */
    getSupportedTimezones() {
        try {
            // Create a list of common timezones first - don't use Info.getIANAZones()
            const commonZones = Object.keys(TIMEZONE_MAP).map(abbr => {
                return {
                    value: TIMEZONE_MAP[abbr],
                    label: `${TIMEZONE_MAP[abbr].replace('_', ' ').replace('/', ': ')} (${abbr})`,
                    abbreviation: abbr,
                    common: true
                };
            });
            
            // Add all major city timezones
            const cityZones = Object.entries(CITY_TO_TIMEZONE).map(([city, zone]) => {
                return {
                    value: zone,
                    label: `${city.charAt(0).toUpperCase() + city.slice(1)} (${zone.split('/').pop().replace('_', ' ')})`,
                    city: city,
                    common: false
                };
            });
            
            // Combine common and city zones, removing duplicates by value
            const combinedZones = [...commonZones];
            
            cityZones.forEach(zone => {
                if (!combinedZones.some(existing => existing.value === zone.value)) {
                    combinedZones.push(zone);
                }
            });
            
            // Sort by common first, then alphabetically
            combinedZones.sort((a, b) => {
                if (a.common && !b.common) return -1;
                if (!a.common && b.common) return 1;
                return a.label.localeCompare(b.label);
            });
            
            logger.info(`Returning ${combinedZones.length} supported timezones`);
            return combinedZones;
        } catch (error) {
            logger.error(`Error getting supported timezones: ${error.message}`);
            // Return minimal set of timezones as fallback
            return [
                { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
                { value: 'America/New_York', label: 'New York (EST/EDT)' },
                { value: 'Europe/London', label: 'London (GMT/BST)' },
                { value: 'Asia/Kolkata', label: 'India (IST)' },
                { value: 'Asia/Tokyo', label: 'Tokyo (JST)' }
            ];
        }
    }
}

module.exports = new LLMService(); 