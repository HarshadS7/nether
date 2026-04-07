const { ingestCodebase: ingestCodebaseService, processFile: processFileService } = require('../services/ingestion');
const { getServiceArchitecture } = require('../services/neo4j');

async function ingestCodebase(req, res) {
  try {
    const { codebasePath, serviceName, options } = req.body;

    if (!codebasePath || !serviceName) {
      return res.status(400).json({
        success: false,
        error: 'codebasePath and serviceName are required'
      });
    }

    const result = await ingestCodebaseService(
      codebasePath,
      serviceName,
      options || {}
    );

    res.json(result);
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function ingestFile(req, res) {
  try {
    const { filePath, serviceName, fileData } = req.body;

    if (!filePath || !serviceName) {
      return res.status(400).json({
        success: false,
        error: 'filePath and serviceName are required'
      });
    }

    await processFileService(fileData, serviceName);

    res.json({
      success: true,
      message: 'File ingested successfully'
    });
  } catch (error) {
    console.error('File ingestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getIngestionStatus(req, res) {
  try {
    const { serviceName } = req.params;
    
    const architecture = await getServiceArchitecture(serviceName);

    if (!architecture) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      service: serviceName,
      stats: {
        files: architecture.files.length,
        functions: architecture.functions.length,
        endpoints: architecture.endpoints.length
      }
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  ingestCodebase,
  ingestFile,
  getIngestionStatus
};
