const express = require('express');
const router = express.Router();
const { generateServiceDocs, generateOnboardingGuide, getRefactoringSuggestions } = require('../controller/documentation');
const {
  getRepositoryDocumentation,
  getDocumentationBlock,
  updateDocumentationBlock,
  getWorkspaceDocumentation,
  regenerateDocumentation,
  bulkGenerateDocumentation
} = require('../controller/documentationController');

// Legacy routes (keep for backward compatibility)
router.get('/service/:serviceName', generateServiceDocs);
router.get('/onboarding/:serviceName', generateOnboardingGuide);
router.get('/refactor/:functionId', getRefactoringSuggestions);

// New block-based documentation routes
// Get full documentation for a repository
router.get('/repository/:owner/:repo', getRepositoryDocumentation);

// Get specific documentation block
router.get('/repository/:owner/:repo/block/:blockName', getDocumentationBlock);

// Update documentation block manually
router.put('/repository/:owner/:repo/block/:blockName', updateDocumentationBlock);

// Get all documentation for a workspace
router.get('/workspace/:workspaceId', getWorkspaceDocumentation);

// Regenerate documentation
router.post('/repository/:owner/:repo/regenerate', regenerateDocumentation);

// Bulk generate documentation
router.post('/generate-docs', bulkGenerateDocumentation);

module.exports = router;
