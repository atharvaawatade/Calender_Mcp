const llmService = require('./service');
const logger = require('../utils/logger');

module.exports = [
    {
        method: 'POST',
        path: '/llm/process',
        handler: async (request, h) => {
            try {
                const { input, type, userTimezone = 'UTC', provider = 'google' } = request.payload;
                
                if (!input) {
                    logger.warn('LLM process request received with empty input');
                    return h.response({ error: 'Input is required' }).code(400);
                }

                // Log the incoming request for debugging
                logger.info(`LLM process request: type=${type}, provider=${provider}, timezone=${userTimezone}, input="${input.substring(0, 100)}${input.length > 100 ? '...' : ''}"`);

                let result;
                if (type === 'meeting') {
                    // Process meeting request with timezone awareness
                    result = await llmService.processMeetingRequest(input, userTimezone, provider);
                    logger.info(`Meeting processed successfully with detected timezone: ${result.timezone || userTimezone}`);
                } else if (type === 'email') {
                    result = await llmService.processEmailRequest(input, provider);
                    logger.info('Email request processed successfully');
                } else {
                    logger.warn(`Invalid LLM request type: ${type}`);
                    return h.response({ error: 'Invalid type specified', details: 'Type must be "meeting" or "email"' }).code(400);
                }

                return h.response(result).code(200);
            } catch (error) {
                logger.error(`Error processing LLM request: ${error.message}`, error);
                
                // Provide more detailed error feedback
                let errorMessage = 'Failed to process request';
                let errorDetails = error.message;
                
                // Specific error handling for common issues
                if (error.message.includes('timezone')) {
                    errorMessage = 'Timezone processing error';
                } else if (error.message.includes('date') || error.message.includes('time')) {
                    errorMessage = 'Date/time processing error';
                } else if (error.message.includes('JSON')) {
                    errorMessage = 'Response format error';
                }
                
                return h.response({ 
                    error: errorMessage, 
                    details: errorDetails 
                }).code(500);
            }
        },
    },
    {
        method: 'GET',
        path: '/llm/timezones',
        handler: async (request, h) => {
            try {
                // Get list of supported timezones
                const timezones = llmService.getSupportedTimezones();
                return h.response({ timezones }).code(200);
            } catch (error) {
                logger.error(`Error fetching timezones: ${error.message}`);
                return h.response({ 
                    error: 'Failed to get timezones', 
                    details: error.message 
                }).code(500);
            }
        }
    }
]; 