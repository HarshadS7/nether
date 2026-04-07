const mongoose = require('mongoose');

/**
 * GitHubCommit Schema
 * Stores GitHub commit history with code diffs and LLM-generated 2-line summaries
 * Links to Workspace -> GitHub Repositories
 */
const gitHubCommitSchema = new mongoose.Schema({
  // Commit identification
  commitHash: {
    type: String,
    required: true,
    index: true
  },
  
  // Repository information
  repositoryUrl: {
    type: String,
    required: true,
    index: true
  },
  
  repositoryName: {
    type: String,
    required: true
  },
  
  repositoryOwner: {
    type: String,
    required: true,
    index: true
  },
  
  // Author information (who made the commit)
  author: {
    username: {
      type: String,
      required: true,
      index: true
    },
    email: String,
    avatarUrl: String,
    name: String
  },
  
  // Commit metadata
  message: {
    type: String,
    required: true
  },
  
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  
  // Code changes (diffs)
  filesChanged: [{
    filename: String,
    status: String, // 'added', 'modified', 'removed', 'renamed'
    additions: Number,
    deletions: Number,
    changes: Number,
    patch: String, // Git diff patch
    language: String
  }],
  
  // Statistics
  stats: {
    totalFiles: {
      type: Number,
      default: 0
    },
    totalAdditions: {
      type: Number,
      default: 0
    },
    totalDeletions: {
      type: Number,
      default: 0
    }
  },
  
  // LLM-generated 2-line summary (generated in Step 4)
  summary: {
    line1: {
      type: String,
      default: ''
    },
    line2: {
      type: String,
      default: ''
    },
    generatedAt: Date,
    generatedBy: {
      type: String,
      enum: ['llm', 'manual', 'none'],
      default: 'none'
    }
  },
  
  // Pipeline tracking
  pipelineId: String,
  processed: {
    type: Boolean,
    default: false
  },
  
  // Workspace relationship
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    index: true
  },
  
  // Branch
  branch: {
    type: String,
    default: 'main'
  },
  
  // Parent commit(s)
  parents: [String],
  
  // Timestamps
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

// Compound indexes
gitHubCommitSchema.index({ repositoryUrl: 1, commitHash: 1 }, { unique: true });
gitHubCommitSchema.index({ repositoryUrl: 1, timestamp: -1 });
gitHubCommitSchema.index({ 'author.username': 1, timestamp: -1 });
gitHubCommitSchema.index({ workspaceId: 1, timestamp: -1 });

// Instance Methods

/**
 * Update commit summary (2 lines from LLM)
 */
gitHubCommitSchema.methods.updateSummary = function(line1, line2, generatedBy = 'llm') {
  this.summary = {
    line1,
    line2,
    generatedAt: new Date(),
    generatedBy
  };
  return this.save();
};

/**
 * Mark as processed
 */
gitHubCommitSchema.methods.markProcessed = function(pipelineId) {
  this.processed = true;
  if (pipelineId) {
    this.pipelineId = pipelineId;
  }
  return this.save();
};

/**
 * Get formatted commit info for frontend
 */
gitHubCommitSchema.methods.getFormattedInfo = function() {
  return {
    hash: this.commitHash.substring(0, 7),
    fullHash: this.commitHash,
    author: {
      username: this.author.username,
      name: this.author.name || this.author.username,
      avatarUrl: this.author.avatarUrl || null,
      email: this.author.email || null
    },
    message: this.message,
    timestamp: this.timestamp,
    summary: {
      line1: this.summary.line1 || '',
      line2: this.summary.line2 || '',
      available: this.summary.generatedBy !== 'none'
    },
    stats: {
      files: this.stats.totalFiles,
      additions: this.stats.totalAdditions,
      deletions: this.stats.totalDeletions
    },
    filesChanged: this.filesChanged.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      language: f.language
    })),
    branch: this.branch
  };
};

// Static Methods

/**
 * Find or create commit
 */
gitHubCommitSchema.statics.findOrCreate = async function(commitData) {
  let commit = await this.findOne({
    repositoryUrl: commitData.repositoryUrl,
    commitHash: commitData.commitHash
  });
  
  if (!commit) {
    commit = new this(commitData);
    await commit.save();
  }
  
  return commit;
};

/**
 * Get commits by repository
 */
gitHubCommitSchema.statics.getByRepository = function(repositoryUrl, options = {}) {
  const query = this.find({ repositoryUrl });
  
  if (options.author) {
    query.where('author.username').equals(options.author);
  }
  
  if (options.since) {
    query.where('timestamp').gte(new Date(options.since));
  }
  
  if (options.until) {
    query.where('timestamp').lte(new Date(options.until));
  }
  
  if (options.branch) {
    query.where('branch').equals(options.branch);
  }
  
  return query
    .sort({ timestamp: -1 })
    .limit(options.limit || 50);
};

/**
 * Get commits by author
 */
gitHubCommitSchema.statics.getByAuthor = function(username, options = {}) {
  const query = this.find({ 'author.username': username });
  
  if (options.repositoryUrl) {
    query.where('repositoryUrl').equals(options.repositoryUrl);
  }
  
  return query
    .sort({ timestamp: -1 })
    .limit(options.limit || 50);
};

/**
 * Get commits by workspace
 */
gitHubCommitSchema.statics.getByWorkspace = function(workspaceId, options = {}) {
  const query = this.find({ workspaceId });
  
  if (options.repositoryUrl) {
    query.where('repositoryUrl').equals(options.repositoryUrl);
  }
  
  return query
    .sort({ timestamp: -1 })
    .limit(options.limit || 100);
};

/**
 * Get latest commit
 */
gitHubCommitSchema.statics.getLatest = function(repositoryUrl, branch = null) {
  const query = this.findOne({ repositoryUrl });
  
  if (branch) {
    query.where('branch').equals(branch);
  }
  
  return query.sort({ timestamp: -1 });
};

/**
 * Get repository statistics
 */
gitHubCommitSchema.statics.getRepoStats = async function(repositoryUrl, options = {}) {
  const match = { repositoryUrl };
  
  if (options.since) {
    match.timestamp = { $gte: new Date(options.since) };
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCommits: { $sum: 1 },
        totalFiles: { $sum: '$stats.totalFiles' },
        totalAdditions: { $sum: '$stats.totalAdditions' },
        totalDeletions: { $sum: '$stats.totalDeletions' },
        authors: { $addToSet: '$author.username' },
        firstCommit: { $min: '$timestamp' },
        lastCommit: { $max: '$timestamp' }
      }
    }
  ]);
  
  return stats[0] || null;
};

/**
 * Get commit activity by author
 */
gitHubCommitSchema.statics.getAuthorActivity = async function(repositoryUrl, options = {}) {
  const match = { repositoryUrl };
  
  if (options.since) {
    match.timestamp = { $gte: new Date(options.since) };
  }
  
  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$author.username',
        commits: { $sum: 1 },
        additions: { $sum: '$stats.totalAdditions' },
        deletions: { $sum: '$stats.totalDeletions' },
        lastCommit: { $max: '$timestamp' }
      }
    },
    { $sort: { commits: -1 } },
    { $limit: options.limit || 10 }
  ]);
};

module.exports = mongoose.model('GitHubCommit', gitHubCommitSchema);
