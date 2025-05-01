// src/core/server.js
const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Cors = require('cors');
const routes = require('./routes');
const logger = require('../utils/logger');
require('dotenv').config();

const init = async () => {
    const server = Hapi.server({
        port: process.env.SERVER_PORT || 3000,
        host: 'localhost',
        routes: {
            cors: true,
            files: {
                relativeTo: __dirname + '/../client',
            },
        },
    });

    await server.register([
        Inert,
        { plugin: require('../plugins/google-services') },
        { plugin: require('../plugins/microsoft-services') }, // New Microsoft plugin
    ]);

    server.route([...routes]);

    server.route({
        method: 'GET',
        path: '/{param*}',
        handler: {
            directory: {
                path: '.',
                index: ['index.html'],
            },
        },
    });

    await server.start();
    logger.info('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled rejection: ${err.message}`);
    process.exit(1);
});

module.exports = { init };