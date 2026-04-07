const { processCodePipeline, parseCode } = require('../services/pipelineService');

async function analyzeCode(req, res) {
  try {
    const { code, language, options } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        error: 'code and language are required'
      });
    }

    // Validate supported languages
    const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'go'];
    if (!supportedLanguages.includes(language.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Unsupported language. Supported: ${supportedLanguages.join(', ')}`
      });
    }

    const result = await processCodePipeline(
      code,
      language.toLowerCase(),
      options || {}
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function parseCodeOnly(req, res) {
  try {
    let { code, language, file_name } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        error: 'code and language are required'
      });
    }

    // Convert TypeScript to language code the backend recognizes if sent that way
    if (language.toLowerCase() === 'ts' || language.toLowerCase() === 'tsx') language = 'typescript';
    if (language.toLowerCase() === 'js' || language.toLowerCase() === 'jsx') language = 'javascript';
    if (language.toLowerCase() === 'py') language = 'python';

    const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'go', 'cpp', 'c']; // allow cpp to pass through maybe? Wait, backend doesn't support cpp natively.. let's fallback to unsupported handled by Python then.
    
    // Parse
    const result = await parseCode(
      code,
      language.toLowerCase(),
      { filename: file_name }
    );

    res.json({
      success: true,
      parse_result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = { analyzeCode, parseCodeOnly };
