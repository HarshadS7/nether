const mongoose = require('mongoose');

/**
 * Repository Schema
 * Stores GitHub repository information with commit tracking per user
 */
const repositorySchema = new mongoose.Schema({
  // GitHub repository URL (unique key)
  repoUrl: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: function(v) {
        // Validate GitHub URL format
        return /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/.test(v);
      },
      message: props => `${props.value} is not a valid GitHub repository URL!`
    }
  },
  
  // Map of username to array of commit hashes
  commits: {
    type: Map,
    of: [String],
    default: new Map()
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Optional: Repository metadata
  metadata: {
    repoName: String,
    owner: String,
    branch: {
      type: String,
      default: 'main'
    },
    lastSync: Date
  }
}, {
  timestamps: true
});

// Index for faster queries (repoUrl already has unique index from schema)
repositorySchema.index({ 'metadata.owner': 1 });

// Methods
repositorySchema.methods.addCommit = function(username, commitHash) {
  const userCommits = this.commits.get(username) || [];
  if (!userCommits.includes(commitHash)) {
    userCommits.push(commitHash);
    this.commits.set(username, userCommits);
  }
  return this.save();
};

repositorySchema.methods.getCommits = function(username) {
  return this.commits.get(username) || [];
};

repositorySchema.methods.removeCommit = function(username, commitHash) {
  if (commitHash) {
    // Remove specific commit
    const userCommits = this.commits.get(username) || [];
    const filteredCommits = userCommits.filter(hash => hash !== commitHash);
    if (filteredCommits.length > 0) {
      this.commits.set(username, filteredCommits);
    } else {
      this.commits.delete(username);
    }
  } else {
    // Remove all commits for user
    this.commits.delete(username);
  }
  return this.save();
};

repositorySchema.methods.getAllCommits = function() {
  return Object.fromEntries(this.commits);
};

// Static methods
repositorySchema.statics.findByRepoUrl = function(repoUrl) {
  return this.findOne({ repoUrl });
};

repositorySchema.statics.findByOwner = function(owner) {
  return this.find({ 'metadata.owner': owner });
};

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository;
