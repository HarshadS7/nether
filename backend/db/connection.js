// Database connection utility
const mongoose = require('mongoose');

/**
 * Connect to MongoDB using provided URI
 * @param {string} url - MongoDB connection URI
 * @returns {Promise} Mongoose connection promise
 */
async function connectMongoDB(url) {
    return mongoose.connect(url);
}

module.exports = {
    connectMongoDB,
}