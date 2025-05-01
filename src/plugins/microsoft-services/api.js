// src/plugins/microsoft-services/api.js
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

module.exports = {
    graphClient: (accessToken) => Client.init({
        authProvider: (done) => done(null, accessToken),
    }),
};