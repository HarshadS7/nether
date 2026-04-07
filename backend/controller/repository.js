const Repository = require('../model/Repository');

/**
 * Get all repositories
 */
async function getAllRepositories(req, res) {
  try {
    const repositories = await Repository.find({});
    
    res.status(200).json({
      success: true,
      count: repositories.length,
      data: repositories.map(repo => ({
        id: repo._id,
        repoUrl: repo.repoUrl,
        commits: repo.getAllCommits(),
        metadata: repo.metadata,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch repositories',
      message: error.message
    });
  }
}

/**
 * Get repository by URL
 */
async function getRepositoryByUrl(req, res) {
  try {
    const { repoUrl } = req.params;
    
    const repository = await Repository.findByRepoUrl(decodeURIComponent(repoUrl));
    
    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: repository._id,
        repoUrl: repository.repoUrl,
        commits: repository.getAllCommits(),
        metadata: repository.metadata,
        createdAt: repository.createdAt,
        updatedAt: repository.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching repository:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch repository',
      message: error.message
    });
  }
}

/**
 * Create or update a repository
 */
async function createOrUpdateRepository(req, res) {
  try {
    const { repoUrl, username, commitHash, metadata } = req.body;
    
    // Validation
    if (!repoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Repository URL is required'
      });
    }
    
    // Find existing repository or create new one
    let repository = await Repository.findByRepoUrl(repoUrl);
    
    if (repository) {
      // Update existing repository
      if (username && commitHash) {
        await repository.addCommit(username, commitHash);
      }
      
      if (metadata) {
        repository.metadata = { ...repository.metadata, ...metadata };
        await repository.save();
      }
      
      return res.status(200).json({
        success: true,
        message: 'Repository updated successfully',
        data: {
          id: repository._id,
          repoUrl: repository.repoUrl,
          commits: repository.getAllCommits(),
          metadata: repository.metadata
        }
      });
    } else {
      // Create new repository
      const newRepository = new Repository({
        repoUrl,
        metadata: metadata || {}
      });
      
      if (username && commitHash) {
        newRepository.commits.set(username, [commitHash]);
      }
      
      await newRepository.save();
      
      return res.status(201).json({
        success: true,
        message: 'Repository created successfully',
        data: {
          id: newRepository._id,
          repoUrl: newRepository.repoUrl,
          commits: newRepository.getAllCommits(),
          metadata: newRepository.metadata
        }
      });
    }
  } catch (error) {
    console.error('Error creating/updating repository:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create/update repository',
      message: error.message
    });
  }
}

/**
 * Add commit to repository
 */
async function addCommit(req, res) {
  try {
    const { repoUrl } = req.params;
    const { username, commitHash } = req.body;
    
    if (!username || !commitHash) {
      return res.status(400).json({
        success: false,
        error: 'Username and commit hash are required'
      });
    }
    
    const repository = await Repository.findByRepoUrl(decodeURIComponent(repoUrl));
    
    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }
    
    await repository.addCommit(username, commitHash);
    
    res.status(200).json({
      success: true,
      message: 'Commit added successfully',
      data: {
        repoUrl: repository.repoUrl,
        username,
        commitHash,
        allCommits: repository.getAllCommits()
      }
    });
  } catch (error) {
    console.error('Error adding commit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add commit',
      message: error.message
    });
  }
}

/**
 * Get commits for a user
 */
async function getCommits(req, res) {
  try {
    const { repoUrl, username } = req.params;
    
    const repository = await Repository.findByRepoUrl(decodeURIComponent(repoUrl));
    
    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }
    
    const commitHashes = repository.getCommits(username);
    
    if (!commitHashes || commitHashes.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No commits found for user: ${username}`
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        repoUrl: repository.repoUrl,
        username,
        commits: commitHashes,
        count: commitHashes.length
      }
    });
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commits',
      message: error.message
    });
  }
}

/**
 * Remove commit for a user
 */
async function removeCommit(req, res) {
  try {
    const { repoUrl, username } = req.params;
    const { commitHash } = req.body; // Optional: specific commit to remove
    
    const repository = await Repository.findByRepoUrl(decodeURIComponent(repoUrl));
    
    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }
    
    await repository.removeCommit(username, commitHash);
    
    res.status(200).json({
      success: true,
      message: commitHash 
        ? `Specific commit removed successfully` 
        : `All commits removed for user: ${username}`,
      data: {
        repoUrl: repository.repoUrl,
        username,
        removedCommit: commitHash,
        allCommits: repository.getAllCommits()
      }
    });
  } catch (error) {
    console.error('Error removing commit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove commit',
      message: error.message
    });
  }
}

/**
 * Delete repository
 */
async function deleteRepository(req, res) {
  try {
    const { repoUrl } = req.params;
    
    const repository = await Repository.findByRepoUrl(decodeURIComponent(repoUrl));
    
    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }
    
    await Repository.deleteOne({ _id: repository._id });
    
    res.status(200).json({
      success: true,
      message: 'Repository deleted successfully',
      data: {
        repoUrl: repository.repoUrl
      }
    });
  } catch (error) {
    console.error('Error deleting repository:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete repository',
      message: error.message
    });
  }
}

module.exports = {
  getAllRepositories,
  getRepositoryByUrl,
  createOrUpdateRepository,
  addCommit,
  getCommits,
  removeCommit,
  deleteRepository
};
