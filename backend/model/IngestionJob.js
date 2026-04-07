const mongoose = require('mongoose');

/**
 * IngestionJob Schema
 * Persists the state of full-codebase ingestion jobs.
 * Stores progress so the frontend can poll for status.
 */
const ingestionJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  repoUrl: {
    type: String,
    required: true,
    trim: true
  },

  serviceName: {
    type: String,
    required: true,
    trim: true
  },

  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },

  // Progress counters
  totalFiles: {
    type: Number,
    default: 0
  },

  filesProcessed: {
    type: Number,
    default: 0
  },

  functionsFound: {
    type: Number,
    default: 0
  },

  endpointsFound: {
    type: Number,
    default: 0
  },

  // Error tracking
  ingestionErrors: [{
    file: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],

  startedAt: {
    type: Date,
    default: null
  },

  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Find the latest completed job for a given repo
ingestionJobSchema.statics.findLatestForRepo = function (repoUrl) {
  return this.findOne({ repoUrl, status: 'completed' })
    .sort({ completedAt: -1 });
};

ingestionJobSchema.statics.findByJobId = function (jobId) {
  return this.findOne({ jobId });
};

const IngestionJob = mongoose.model('IngestionJob', ingestionJobSchema);

module.exports = IngestionJob;
