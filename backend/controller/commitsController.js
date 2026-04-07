const GitHubCommit = require('../model/GitHubCommit');

/**
 * Get commits for a repository
 * GET /commits/repository/:owner/:repo
 */
async function getRepositoryCommits(req, res) {
  try {
    const { owner, repo } = req.params;
    const { author, since, until, branch, limit } = req.query;

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const options = {
      limit: parseInt(limit) || 50
    };

    if (author) options.author = author;
    if (since) options.since = since;
    if (until) options.until = until;
    if (branch) options.branch = branch;

    const commits = await GitHubCommit.getByRepository(repositoryUrl, options);

    const formattedCommits = commits.map(commit => commit.getFormattedInfo());

    res.json({
      success: true,
      repository: `${owner}/${repo}`,
      total: formattedCommits.length,
      commits: formattedCommits
    });
  } catch (error) {
    console.error('Error fetching repository commits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get commits by author
 * GET /commits/author/:username
 */
async function getAuthorCommits(req, res) {
  try {
    const { username } = req.params;
    const { repositoryUrl, limit } = req.query;

    const options = {
      limit: parseInt(limit) || 50
    };

    if (repositoryUrl) options.repositoryUrl = repositoryUrl;

    const commits = await GitHubCommit.getByAuthor(username, options);

    const formattedCommits = commits.map(commit => commit.getFormattedInfo());

    res.json({
      success: true,
      author: username,
      total: formattedCommits.length,
      commits: formattedCommits
    });
  } catch (error) {
    console.error('Error fetching author commits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get commits by workspace
 * GET /commits/workspace/:workspaceId
 */
async function getWorkspaceCommits(req, res) {
  try {
    const { workspaceId } = req.params;
    const { repositoryUrl, limit } = req.query;

    const options = {
      limit: parseInt(limit) || 100
    };

    if (repositoryUrl) options.repositoryUrl = repositoryUrl;

    const commits = await GitHubCommit.getByWorkspace(workspaceId, options);

    const formattedCommits = commits.map(commit => commit.getFormattedInfo());

    res.json({
      success: true,
      workspaceId,
      total: formattedCommits.length,
      commits: formattedCommits
    });
  } catch (error) {
    console.error('Error fetching workspace commits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get commit details by hash
 * GET /commits/repository/:owner/:repo/commit/:hash
 */
async function getCommitDetails(req, res) {
  try {
    const { owner, repo, hash } = req.params;
    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const commit = await GitHubCommit.findOne({
      repositoryUrl,
      commitHash: hash
    });

    if (!commit) {
      return res.status(404).json({
        success: false,
        error: 'Commit not found'
      });
    }

    res.json({
      success: true,
      commit: commit.getFormattedInfo()
    });
  } catch (error) {
    console.error('Error fetching commit details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get repository commit statistics
 * GET /commits/repository/:owner/:repo/stats
 */
async function getRepositoryStats(req, res) {
  try {
    const { owner, repo } = req.params;
    const { since, author } = req.query;

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const options = {};
    if (since) options.since = since;
    if (author) options.author = author;

    const stats = await GitHubCommit.getRepoStats(repositoryUrl, options);

    if (!stats) {
      return res.json({
        success: true,
        repository: `${owner}/${repo}`,
        stats: {
          totalCommits: 0,
          totalFiles: 0,
          totalAdditions: 0,
          totalDeletions: 0,
          authors: [],
          firstCommit: null,
          lastCommit: null
        }
      });
    }

    res.json({
      success: true,
      repository: `${owner}/${repo}`,
      stats: {
        totalCommits: stats.totalCommits,
        totalFiles: stats.totalFiles,
        totalAdditions: stats.totalAdditions,
        totalDeletions: stats.totalDeletions,
        authors: stats.authors,
        uniqueAuthors: stats.authors.length,
        firstCommit: stats.firstCommit,
        lastCommit: stats.lastCommit,
        timespan: stats.firstCommit && stats.lastCommit 
          ? Math.floor((stats.lastCommit - stats.firstCommit) / (1000 * 60 * 60 * 24)) 
          : 0
      }
    });
  } catch (error) {
    console.error('Error fetching repository stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get author activity for a repository
 * GET /commits/repository/:owner/:repo/activity
 */
async function getAuthorActivity(req, res) {
  try {
    const { owner, repo } = req.params;
    const { since, limit } = req.query;

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const options = {
      limit: parseInt(limit) || 10
    };

    if (since) options.since = since;

    const activity = await GitHubCommit.getAuthorActivity(repositoryUrl, options);

    res.json({
      success: true,
      repository: `${owner}/${repo}`,
      activity: activity.map(a => ({
        author: a._id,
        commits: a.commits,
        additions: a.additions,
        deletions: a.deletions,
        lastCommit: a.lastCommit
      }))
    });
  } catch (error) {
    console.error('Error fetching author activity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Manually update commit summary
 * PUT /commits/repository/:owner/:repo/commit/:hash/summary
 */
async function updateCommitSummary(req, res) {
  try {
    const { owner, repo, hash } = req.params;
    const { line1, line2 } = req.body;

    if (!line1 || !line2) {
      return res.status(400).json({
        success: false,
        error: 'Both line1 and line2 are required'
      });
    }

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const commit = await GitHubCommit.findOne({
      repositoryUrl,
      commitHash: hash
    });

    if (!commit) {
      return res.status(404).json({
        success: false,
        error: 'Commit not found'
      });
    }

    await commit.updateSummary(line1, line2, 'manual');

    res.json({
      success: true,
      message: 'Commit summary updated successfully',
      commit: commit.getFormattedInfo()
    });
  } catch (error) {
    console.error('Error updating commit summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getRepositoryCommits,
  getAuthorCommits,
  getWorkspaceCommits,
  getCommitDetails,
  getRepositoryStats,
  getAuthorActivity,
  updateCommitSummary
};
