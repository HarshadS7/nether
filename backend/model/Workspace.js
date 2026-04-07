const mongoose = require('mongoose');

/**
 * Workspace Schema
 * Stores groups of GitHub repositories representing a project or organization
 */
const workspaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    description: {
        type: String,
        trim: true
    },

    repositories: [{
        type: String, // Store repoUrls
        trim: true
    }],

    // Store the username or user ID of the creator
    owner: {
        type: String,
        required: true,
        trim: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries by owner
workspaceSchema.index({ owner: 1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
