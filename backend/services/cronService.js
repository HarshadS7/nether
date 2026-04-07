/**
 * Cron Service - Automatically fetches new commits from tracked repositories
 * every 15 minutes and sends them directly to the CI/CD pipeline.
 * 
 * Runs in background automatically when server starts.
 */
const Repository = require('../model/Repository');
const GitHubCommit = require('../model/GitHubCommit');
const { processCodePipeline } = require('./pipelineService');
const {
  getCommits,
  getCommitDetail,
  getFileAtCommit
} = require('./github');

// Configuration from environment
const CRON_INTERVAL_MS = parseInt(process.env.CRON_INTERVAL_MS) || 15 * 60 * 1000; // 15 minutes default
const CRON_ENABLED = process.env.CRON_ENABLED !== 'false'; // enabled by default

// Tracked repositories - configure via environment or add programmatically
// Format: "owner/repo:branch:token" (comma separated for multiple)
const trackedRepos = new Map();

let cronInterval = null;
let isRunning = false;

/**
 * Helper: derive language from file extension
 */
function getLanguageFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    java: 'java',
    go: 'go'
  };
  return map[ext] || null; // Return null for unsupported languages
}

/**
 * Add a repository to track.
 * Call this from your application code to register repos.
 */
function trackRepository(owner, repo, token, branch = 'main') {
  const key = `${owner}/${repo}`;
  trackedRepos.set(key, {
    owner,
    repo,
    token,
    branch,
    lastProcessedSha: null,
    addedAt: new Date()
  });
  console.log(`📡 [Cron] Now tracking: ${key}`);
  return key;
}

/**
 * Remove a repository from tracking.
 */
function untrackRepository(owner, repo) {
  return trackedRepos.delete(`${owner}/${repo}`);
}

/**
 * Get list of tracked repositories.
 */
function getTrackedRepos() {
  return Array.from(trackedRepos.keys());
}

/**
 * Process a single commit through the pipeline.
 */
async function processCommitThroughPipeline(token, owner, repo, sha) {
  console.log(`  📦 Processing commit ${sha.slice(0, 7)} through pipeline...`);

  try {
    const detail = await getCommitDetail(token, owner, repo, sha);
    const repoUrl = `https://github.com/${owner}/${repo}`;

    // Save commit to GitHubCommit model
    let commitRecord = null;
    try {
      const filesChangedData = detail.files.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        changes: f.changes || 0,
        patch: f.patch || '',
        language: getLanguageFromFilename(f.filename)
      }));

      commitRecord = await GitHubCommit.findOrCreate({
        commitHash: sha,
        repositoryUrl: repoUrl,
        repositoryName: repo,
        repositoryOwner: owner,
        author: {
          username: detail.author?.login || 'unknown',
          email: detail.commit?.author?.email || '',
          avatarUrl: detail.author?.avatar_url || '',
          name: detail.commit?.author?.name || detail.author?.login || 'Unknown'
        },
        message: detail.commit?.message || 'No message',
        timestamp: new Date(detail.commit?.author?.date || Date.now()),
        filesChanged: filesChangedData,
        stats: {
          totalFiles: detail.files.length,
          totalAdditions: detail.stats?.additions || 0,
          totalDeletions: detail.stats?.deletions || 0
        },
        parents: detail.parents?.map(p => p.sha) || [],
        workspaceId: null // Will be populated when workspace integration is complete
      });

      console.log(`  ✅ Commit saved to database`);
    } catch (dbErr) {
      console.error(`  ⚠️ Error saving commit to database:`, dbErr.message);
    }

    // Filter to supported languages only
    const supportedExtensions = /\.(js|ts|jsx|tsx|py|java|go)$/i;
    const filesToProcess = detail.files.filter(f => 
      supportedExtensions.test(f.filename) && f.status !== 'removed'
    );

    if (filesToProcess.length === 0) {
      console.log(`    No supported code files in commit, skipping.`);
      return { processed: 0, skipped: true };
    }

    const parentSha = `${sha}^`;
    let processed = 0;
    let errors = 0;

    for (const file of filesToProcess) {
      const language = getLanguageFromFilename(file.filename);
      if (!language) continue;

      try {
        // Fetch old and new code
        const [oldCode, newCode] = await Promise.all([
          file.status === 'added' 
            ? Promise.resolve(null) 
            : getFileAtCommit(token, owner, repo, file.filename, parentSha).catch(() => null),
          getFileAtCommit(token, owner, repo, file.filename, sha).catch(() => null)
        ]);

        if (!newCode) {
          console.log(`    ⚠️ Could not fetch: ${file.filename}`);
          continue;
        }

        // Prepare commit data for LLM (Step 4 will generate summary)
        const commitData = commitRecord ? {
          commitHash: sha,
          repositoryUrl: repoUrl,
          message: detail.commit?.message || 'No message',
          author: {
            username: detail.author?.login || 'unknown',
            name: detail.commit?.author?.name || detail.author?.login || 'Unknown'
          },
          filesChanged: commitRecord.filesChanged.slice(0, 5), // Limit to 5 files for LLM
          stats: commitRecord.stats
        } : null;

        // Run through pipeline (Step 4 will generate commit summary if commitData provided)
        console.log(`    🔄 Pipeline: ${file.filename} (${language})`);
        const pipelineResult = await processCodePipeline(newCode, language, {
          filename: file.filename,
          commitSha: sha,
          oldCode: oldCode, // For Step 6 documentation comparison
          repo: `${owner}/${repo}`,
          author: detail.author?.login || 'unknown',
          // Documentation metadata
          repositoryUrl: repoUrl,
          repositoryName: repo,
          workspaceId: null, // Will be populated when workspace integration is complete
          // Commit data for LLM summary generation (Step 4)
          commitData: commitData
        });

        if (pipelineResult.status === 'completed') {
          processed++;
          console.log(`    ✅ Done: ${file.filename}`);
        } else {
          errors++;
          console.log(`    ❌ Failed: ${file.filename}`);
        }
      } catch (fileErr) {
        errors++;
        console.error(`    ❌ Error processing ${file.filename}: ${fileErr.message}`);
      }
    }

    // Save commit to Repository model (user -> hash mapping)
    const authorLogin = detail.author?.login || 'unknown';
    try {
      let repository = await Repository.findByRepoUrl(repoUrl);
      if (!repository) {
        repository = new Repository({
          repoUrl,
          metadata: { repoName: repo, owner, lastSync: new Date() }
        });
      }
      await repository.addCommit(authorLogin, sha);
    } catch (dbErr) {
      console.warn(`    DB warning: ${dbErr.message}`);
    }

    return { processed, errors, total: filesToProcess.length };
  } catch (err) {
    console.error(`  ❌ Commit processing failed: ${err.message}`);
    return { processed: 0, error: err.message };
  }
}

/**
 * Check and process new commits for a single repository.
 */
async function checkRepository(key, repoData) {
  const { owner, repo, token, lastProcessedSha } = repoData;
  console.log(`🔍 [Cron] Checking ${key}...`);

  try {
    const commits = await getCommits(token, owner, repo, { per_page: 10 });

    if (!commits.length) {
      console.log(`  No commits found.`);
      return;
    }

    // Find new commits
    let newCommits = commits;
    if (lastProcessedSha) {
      const idx = commits.findIndex(c => c.sha === lastProcessedSha);
      if (idx !== -1) {
        newCommits = commits.slice(0, idx);
      }
    }

    if (!newCommits.length) {
      console.log(`  No new commits.`);
      return;
    }

    console.log(`  Found ${newCommits.length} new commit(s)`);

    // Process each new commit (oldest first)
    for (const commit of newCommits.reverse()) {
      await processCommitThroughPipeline(token, owner, repo, commit.sha);
      repoData.lastProcessedSha = commit.sha;
    }
  } catch (err) {
    console.error(`  ❌ Error checking ${key}: ${err.message}`);
  }
}

/**
 * Run one cron cycle - check all tracked repos.
 */
async function runCycle() {
  if (isRunning) {
    console.log(`⏳ [Cron] Previous cycle still running, skipping...`);
    return;
  }

  if (trackedRepos.size === 0) {
    console.log(`⏳ [Cron] No repositories being tracked.`);
    return;
  }

  isRunning = true;
  console.log(`\n⏰ [Cron] ${new Date().toISOString()} - Starting cycle (${trackedRepos.size} repos)`);

  for (const [key, repoData] of trackedRepos.entries()) {
    await checkRepository(key, repoData);
  }

  console.log(`✅ [Cron] Cycle complete.\n`);
  isRunning = false;
}

/**
 * Start the cron service (called automatically on server startup).
 */
function start() {
  if (cronInterval) {
    console.log(`⚠️ [Cron] Already running.`);
    return false;
  }

  if (!CRON_ENABLED) {
    console.log(`⏸️ [Cron] Disabled via CRON_ENABLED=false`);
    return false;
  }

  console.log(`🚀 [Cron] Starting background service (interval: ${CRON_INTERVAL_MS / 1000 / 60} minutes)`);

  // Parse repos from environment variable if provided
  // Format: CRON_REPOS="owner/repo:branch:token,owner2/repo2:branch:token"
  if (process.env.CRON_REPOS) {
    const repoConfigs = process.env.CRON_REPOS.split(',');
    for (const config of repoConfigs) {
      const [repoPath, branch, token] = config.trim().split(':');
      if (repoPath && token) {
        const [owner, repo] = repoPath.split('/');
        if (owner && repo) {
          trackRepository(owner, repo, token, branch || 'main');
        }
      }
    }
  }

  // Run immediately on start, then at interval
  setTimeout(() => runCycle(), 5000); // Small delay to let server fully start
  cronInterval = setInterval(runCycle, CRON_INTERVAL_MS);

  return true;
}

/**
 * Stop the cron service.
 */
function stop() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log(`🛑 [Cron] Stopped.`);
    return true;
  }
  return false;
}

// Auto-start when imported (if enabled)
if (CRON_ENABLED) {
  // Delay start to ensure DB connections are ready
  setTimeout(start, 3000);
}

module.exports = {
  trackRepository,
  untrackRepository,
  getTrackedRepos,
  start,
  stop,
  runCycle
};
