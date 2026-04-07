const express = require('express');
const { errorHandler, notFoundHandler, requestLogger } = require('./error');

/**
 * Returns Express JSON parser middleware
 */
function jsonParser() {
    return express.json();
}

module.exports = {
    jsonParser,
    errorHandler,
    notFoundHandler,
    requestLogger
};