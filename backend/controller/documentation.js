const { generateDocumentation, generateOnboardingGuide: generateOnboardingGuideService, suggestRefactoring } = require('../services/llm');
const { getServiceArchitecture } = require('../services/neo4j');
const { analyzeImpact } = require('../services/impact');

async function generateServiceDocs(req, res) {
  try {
    const { serviceName } = req.params;

    // Get service architecture
    const architecture = await getServiceArchitecture(serviceName);

    if (!architecture) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    // Generate documentation using LLM
    const documentation = await generateDocumentation(
      architecture.service,
      architecture.functions,
      architecture.endpoints
    );

    res.json({
      success: true,
      serviceName,
      documentation
    });
  } catch (error) {
    console.error('Documentation generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function generateOnboardingGuide(req, res) {
  try {
    const { serviceName } = req.params;

    // Get service architecture
    const architecture = await getServiceArchitecture(serviceName);

    if (!architecture) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    // Identify key components
    const keyComponents = {
      mainEndpoints: architecture.endpoints.slice(0, 10),
      coreFunctions: architecture.functions.slice(0, 15),
      entryFiles: architecture.files.filter(f => 
        f.path.includes('index') || f.path.includes('main')
      )
    };

    // Generate onboarding guide
    const guide = await generateOnboardingGuideService(
      architecture,
      keyComponents
    );

    res.json({
      success: true,
      serviceName,
      guide
    });
  } catch (error) {
    console.error('Onboarding guide generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getRefactoringSuggestions(req, res) {
  try {
    const { functionId } = req.params;

    // Get function details and dependencies
    const impact = await analyzeImpact(functionId, {
      maxDepth: 2,
      generateExplanation: false
    });

    // Get suggestions from LLM
    const suggestions = await suggestRefactoring(
      { id: functionId },
      impact.forwardImpact.items,
      impact.blastRadius
    );

    res.json({
      success: true,
      functionId,
      suggestions
    });
  } catch (error) {
    console.error('Refactoring suggestions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  generateServiceDocs,
  generateOnboardingGuide,
  getRefactoringSuggestions
};
