const crypto = require('crypto');
const {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
  getCommits,
  getContributors,
  compareCommits,
  getCommitDetail,
  getUserRepos,
  getFileAtCommit
} = require('../services/github');
const Repository = require('../model/Repository');

// Helper: derive language from file extension for pipeline
function getLanguageFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    java: 'java',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c', h: 'c',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    md: 'markdown',
    yml: 'yaml', yaml: 'yaml',
    json: 'json',
    sh: 'shell',
    env: 'env',
    txt: 'text'
  };
  return map[ext] || 'unknown';
}

// In-memory token store (swap for DB/session in production)
const tokenStore = new Map();

/**
 * GET /github/login
 * Redirects the user to GitHub's OAuth authorization page.
 */
async function login(req, res) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    // Store state to validate on callback (CSRF protection)
    tokenStore.set(`state:${state}`, { createdAt: Date.now() });

    const url = getAuthorizationUrl(state);
    res.redirect(url);
  } catch (error) {
    console.error('GitHub login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/callback
 * Handles the OAuth callback from GitHub.
 * Exchanges the code for an access token and returns user info.
 */
async function callback(req, res) {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Missing authorization code' });
    }

    // Validate state (CSRF protection)
    if (state && !tokenStore.has(`state:${state}`)) {
      return res.status(403).json({ success: false, error: 'Invalid state parameter' });
    }
    tokenStore.delete(`state:${state}`);

    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(code);
    const accessToken = tokenData.access_token;

    // Get user profile
    const user = await getAuthenticatedUser(accessToken);

    // Store token mapped to user ID
    tokenStore.set(`user:${user.id}`, {
      token: accessToken,
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: 'GitHub OAuth successful',
      user: {
        login: user.login,
        id: user.id,
        avatar_url: user.avatar_url,
        name: user.name,
        email: user.email
      },
      // Return the user ID so the frontend can use it for subsequent requests
      userId: user.id
    });
  } catch (error) {
    console.error('GitHub callback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Middleware: extracts the GitHub token from the request.
 * Expects header: x-github-user-id  OR  query param: userId
 */
function extractToken(req, res, next) {
  const userId = req.headers['x-github-user-id'] || req.query.userId;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Missing x-github-user-id header or userId query param' });
  }

  const session = tokenStore.get(`user:${userId}`);
  if (!session || !session.token) {
    return res.status(401).json({ success: false, error: 'Not authenticated. Please login via /github/login first.' });
  }

  req.githubToken = session.token;
  req.githubUser = session;
  next();
}

/**
 * GET /github/commits/:owner/:repo
 * Fetches recent commits for a repo.
 */
async function listCommits(req, res) {
  try {
    const { owner, repo } = req.params;
    const { per_page, page, sha, since, until } = req.query;

    const commits = await getCommits(req.githubToken, owner, repo, {
      per_page: per_page || 30,
      page: page || 1,
      sha, since, until
    });

    res.json({ success: true, count: commits.length, commits });
  } catch (error) {
    console.error('Fetch commits error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/contributors/:owner/:repo
 * Lists all contributors with their UIDs and contribution counts.
 */
async function listContributors(req, res) {
  try {
    const { owner, repo } = req.params;
    const contributors = await getContributors(req.githubToken, owner, repo);

    res.json({ success: true, count: contributors.length, contributors });
  } catch (error) {
    console.error('Fetch contributors error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/compare/:owner/:repo/:baseSha/:headSha
 * Compares two commits and shows changed files with diffs.
 */
async function compareVersions(req, res) {
  try {
    const { owner, repo, baseSha, headSha } = req.params;
    const comparison = await compareCommits(req.githubToken, owner, repo, baseSha, headSha);

    res.json({ success: true, comparison });
  } catch (error) {
    console.error('Compare commits error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/commit/:owner/:repo/:sha
 * Gets detailed info about a specific commit.
 */
async function commitDetail(req, res) {
  try {
    const { owner, repo, sha } = req.params;
    const detail = await getCommitDetail(req.githubToken, owner, repo, sha);

    res.json({ success: true, commit: detail });
  } catch (error) {
    console.error('Commit detail error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/repos
 * Lists repositories accessible to the authenticated user.
 */
async function listRepos(req, res) {
  try {
    const repos = await getUserRepos(req.githubToken);
    res.json({ success: true, count: repos.length, repos });
  } catch (error) {
    console.error('List repos error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/me
 * Returns the currently authenticated GitHub user info.
 */
async function me(req, res) {
  try {
    const user = await getAuthenticatedUser(req.githubToken);
    res.json({
      success: true,
      user: {
        login: user.login,
        id: user.id,
        avatar_url: user.avatar_url,
        name: user.name,
        email: user.email,
        public_repos: user.public_repos,
        html_url: user.html_url
      }
    });
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

/**
 * GET /github/changes/:owner/:repo/:sha
 * Fetches the changed files in a commit, gets old+new content for each file.
 * Returns data in pipeline-compatible format for AST, knowledge graph, and vector DB updates.
 * Saves commit hash mapped to author in Repository model.
 * Optional query param: ?baseSha=<old_sha> to compare two specific commits.
 */
async function fetchCommitChanges(req, res) {
  try {
    const { owner, repo, sha } = req.params;
    const baseSha = req.query.baseSha || null;

    // Step 1: get the commit detail to find which files changed
    const detail = await getCommitDetail(req.githubToken, owner, repo, sha);

    // Step 2: for each changed file, fetch old and new content
    const textExtensions = /\.(js|ts|jsx|tsx|py|java|go|rb|php|cs|cpp|c|h|rs|swift|kt|md|yml|yaml|json|sh|env|txt)$/i;
    const filesToProcess = detail.files.filter(f => textExtensions.test(f.filename));

    const parentSha = baseSha || `${sha}^`; // parent commit

    const changedFiles = await Promise.all(
      filesToProcess.map(async (f) => {
        const language = getLanguageFromFilename(f.filename);
        const [oldContent, newContent] = await Promise.all([
          f.status === 'added' ? Promise.resolve(null) : getFileAtCommit(req.githubToken, owner, repo, f.filename, parentSha).catch(() => null),
          f.status === 'removed' ? Promise.resolve(null) : getFileAtCommit(req.githubToken, owner, repo, f.filename, sha).catch(() => null)
        ]);

        return {
          // File path for AST/knowledge graph/vector DB
          path: f.filename,
          directory: f.filename.substring(0, f.filename.lastIndexOf('/')) || '/',
          language,
          status: f.status, // added | modified | removed | renamed
          // Git stats
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch || null,
          // Pipeline input format: old code for documentation comparison (Step 6)
          old_code: oldContent,
          // New code for pipeline processing
          new_code: newContent
        };
      })
    );

    // Step 3: Save commit to Repository model (Map<author, commitHashes[]>)
    const repoUrl = `https://github.com/${owner}/${repo}`;
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
      console.warn('Repository save warning (DB may not be connected):', dbErr.message);
    }

    res.json({
      success: true,
      commit: {
        sha: detail.sha,
        message: detail.message,
        author: detail.author,
        date: detail.date,
        stats: detail.stats,
        parent_sha: parentSha
      },
      repo: {
        url: repoUrl,
        owner,
        name: repo
      },
      // Files ready for pipeline (AST parsing, knowledge graph, vector DB)
      files: changedFiles,
      // Summary for quick reference
      summary: {
        total_files: changedFiles.length,
        added: changedFiles.filter(f => f.status === 'added').length,
        modified: changedFiles.filter(f => f.status === 'modified').length,
        removed: changedFiles.filter(f => f.status === 'removed').length,
        renamed: changedFiles.filter(f => f.status === 'renamed').length
      }
    });
  } catch (error) {
    console.error('Fetch commit changes error:', error.message);
    res.status(error.response?.status || 500).json({ success: false, error: error.message });
  }
}

module.exports = {
  login,
  callback,
  extractToken,
  listCommits,
  listContributors,
  compareVersions,
  commitDetail,
  listRepos,
  me,
  fetchCommitChanges
};
