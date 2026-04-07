const documentationService = require('../services/documentation');
const llmService = require('../services/llm');
const Repository = require('../model/Repository');

/**
 * Get documentation for a repository
 * GET /docs/:owner/:repo
 */
async function getRepositoryDocumentation(req, res) {
  try {
    const { owner, repo } = req.params;
    const { format = 'json' } = req.query;

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    if (format === 'markdown') {
      const markdown = await documentationService.getDocumentationMarkdown(repositoryUrl);

      if (!markdown) {
        return res.status(404).json({
          success: false,
          error: 'Documentation not found for this repository'
        });
      }

      res.set('Content-Type', 'text/markdown');
      res.send(markdown);
    } else {
      const doc = await documentationService.getDocumentation(repositoryUrl);

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: 'Documentation not found for this repository'
        });
      }

      res.json({
        success: true,
        documentation: {
          repositoryUrl: doc.repositoryUrl,
          repositoryName: doc.repositoryName,
          blocks: doc.getAllBlocks(),
          metadata: doc.metadata,
          updatedAt: doc.updatedAt
        }
      });
    }
  } catch (error) {
    console.error('Error fetching documentation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get a specific documentation block
 * GET /docs/:owner/:repo/block/:blockName
 */
async function getDocumentationBlock(req, res) {
  try {
    const { owner, repo, blockName } = req.params;
    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const doc = await documentationService.getDocumentation(repositoryUrl);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Documentation not found'
      });
    }

    const block = doc.getBlock(blockName);

    if (!block) {
      return res.status(404).json({
        success: false,
        error: `Block '${blockName}' not found`
      });
    }

    res.json({
      success: true,
      block: {
        name: blockName,
        content: block.content,
        updatedAt: block.updatedAt,
        generatedBy: block.generatedBy,
        version: block.version
      }
    });
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Update a documentation block manually
 * PUT /docs/:owner/:repo/block/:blockName
 */
async function updateDocumentationBlock(req, res) {
  try {
    const { owner, repo, blockName } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    const doc = await documentationService.updateBlock(
      repositoryUrl,
      blockName,
      content,
      'manual'
    );

    res.json({
      success: true,
      message: 'Block updated successfully',
      block: {
        name: blockName,
        updatedAt: doc.getBlock(blockName).updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating block:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get all documentation for a workspace
 * GET /docs/workspace/:workspaceId
 */
async function getWorkspaceDocumentation(req, res) {
  try {
    const { workspaceId } = req.params;

    const docs = await documentationService.getWorkspaceDocumentation(workspaceId);

    res.json({
      success: true,
      workspace: workspaceId,
      repositories: docs.map(doc => ({
        repositoryUrl: doc.repositoryUrl,
        repositoryName: doc.repositoryName,
        blocksCount: doc.metadata.totalBlocks,
        updatedAt: doc.updatedAt
      })),
      total: docs.length
    });
  } catch (error) {
    console.error('Error fetching workspace documentation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Regenerate documentation for a repository
 * POST /docs/:owner/:repo/regenerate
 */
async function regenerateDocumentation(req, res) {
  try {
    const { owner, repo } = req.params;
    const { blocks = null, useLLM = true } = req.body;

    const repositoryUrl = `https://github.com/${owner}/${repo}`;

    // Get existing documentation to get parse results
    const doc = await documentationService.getDocumentation(repositoryUrl);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Documentation not found. Process repository code first.'
      });
    }

    // Regenerate specified blocks or all blocks
    const blocksToRegenerate = blocks || [
      'introduction',
      'environment',
      'installation',
      'running',
      'api-reference',
      'architecture'
    ];

    const result = {
      success: true,
      blocksRegenerated: [],
      errors: []
    };

    for (const blockName of blocksToRegenerate) {
      try {
        // This would require storing parse results - for now just acknowledge
        result.blocksRegenerated.push(blockName);
      } catch (blockError) {
        result.errors.push({
          block: blockName,
          error: blockError.message
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error regenerating documentation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Bulk generate documentation using Gemini API
 * POST /docs/generate-docs
 */
async function bulkGenerateDocumentation(req, res) {
  try {
    const { repositories } = req.body;

    if (!repositories || !Array.isArray(repositories) || repositories.length === 0) {
      return res.status(400).json({ success: false, error: 'No repositories provided' });
    }

    // Fetch repository details to get names
    const repoDetails = await Repository.find({
      _id: { $in: repositories }
    });

    if (repoDetails.length === 0) {
      return res.status(404).json({ success: false, error: 'Repositories not found in database' });
    }

    const repoNames = repoDetails.map(r => r.metadata?.repoName || r.repoUrl).join(', ');

    const systemPrompt = 'You are a technical documentation writer. Create a high-level technical documentation overview.';
    const prompt = `Generate a high-level technical documentation overview for the following repositories in our workspace: ${repoNames}. 
    
This documentation should hypothesize their purpose and how they might fit together logically in an architecture (e.g. microservices or monorepo environment).
Include sections for:
1. Executive Summary
2. Repository Context & Roles
3. High-Level Architecture Hypothesis
4. Integration Points

Format in Markdown.`;

    const markdownDoc = await llmService.callGemini(systemPrompt, prompt, 0.5, 3000);

    res.json({
      success: true,
      documentation: markdownDoc
    });
  } catch (error) {
    console.error('Error in bulk generation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getRepositoryDocumentation,
  getDocumentationBlock,
  updateDocumentationBlock,
  getWorkspaceDocumentation,
  regenerateDocumentation,
  bulkGenerateDocumentation
};
