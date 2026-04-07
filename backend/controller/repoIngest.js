const { ingestRepository, getJobStatus } = require('../services/repoIngestion');

async function runIngestion(req, res) {
  try {
    const { repoUrl, serviceName, branch } = req.body;

    if (!repoUrl || !serviceName) {
      return res.status(400).json({
        success: false,
        error: 'repoUrl and serviceName are required'
      });
    }

    const token = process.env.GITHUB_PAT;
    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'GITHUB_PAT not configured in environment'
      });
    }

    const result = await ingestRepository(token, repoUrl, serviceName, branch || 'main');
    res.json(result);
  } catch (error) {
    console.error('❌ Repo ingestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getStatus(req, res) {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId is required'
      });
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({ success: true, ...status });
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  runIngestion,
  getStatus
};
