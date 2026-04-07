const axios = require('axios');

const GITHUB_API = 'https://api.github.com';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/github/callback';

/**
 * Build the GitHub OAuth authorization URL.
 * Redirecting users here starts the OAuth flow.
 */
function getAuthorizationUrl(state) {
  const scopes = ['read:user', 'repo', 'read:org'];
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: scopes.join(' '),
    state: state || ''
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange the OAuth authorization code for an access token.
 */
async function exchangeCodeForToken(code) {
  const response = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_CALLBACK_URL
    },
    { headers: { Accept: 'application/json' } }
  );

  if (response.data.error) {
    throw new Error(`GitHub OAuth error: ${response.data.error_description || response.data.error}`);
  }

  return response.data; // { access_token, token_type, scope }
}

/**
 * Get the authenticated user's profile.
 */
async function getAuthenticatedUser(token) {
  const response = await axios.get(`${GITHUB_API}/user`, {
    headers: { Authorization: `token ${token}` }
  });
  return response.data;
}

/**
 * Fetch recent commits for a repo.
 * Returns author username, UID, commit message, SHA, and date.
 */
async function getCommits(token, owner, repo, options = {}) {
  const params = {};
  if (options.per_page) params.per_page = options.per_page;
  if (options.page) params.page = options.page;
  if (options.sha) params.sha = options.sha;       // branch or SHA to start from
  if (options.since) params.since = options.since;   // ISO 8601 date
  if (options.until) params.until = options.until;

  const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
    headers: { Authorization: `token ${token}` },
    params
  });

  return response.data.map(commit => ({
    sha: commit.sha,
    message: commit.commit.message,
    date: commit.commit.author.date,
    author: commit.author
      ? { login: commit.author.login, id: commit.author.id, avatar_url: commit.author.avatar_url }
      : { login: commit.commit.author.name, id: null, avatar_url: null },
    committer: commit.committer
      ? { login: commit.committer.login, id: commit.committer.id }
      : { login: commit.commit.committer.name, id: null }
  }));
}

/**
 * Fetch all contributors for a repo.
 * Returns login, UID, avatar, and contribution count.
 */
async function getContributors(token, owner, repo) {
  const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contributors`, {
    headers: { Authorization: `token ${token}` },
    params: { per_page: 100 }
  });

  return response.data.map(user => ({
    login: user.login,
    id: user.id,
    avatar_url: user.avatar_url,
    profile_url: user.html_url,
    contributions: user.contributions
  }));
}

/**
 * Compare two commits (old vs new) and return changed files with diffs.
 */
async function compareCommits(token, owner, repo, baseSha, headSha) {
  const response = await axios.get(
    `${GITHUB_API}/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`,
    { headers: { Authorization: `token ${token}` } }
  );

  const data = response.data;
  return {
    status: data.status,               // "ahead", "behind", "diverged", "identical"
    ahead_by: data.ahead_by,
    behind_by: data.behind_by,
    total_commits: data.total_commits,
    commits: data.commits.map(c => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.author ? { login: c.author.login, id: c.author.id } : null,
      date: c.commit.author.date
    })),
    files: data.files.map(f => ({
      filename: f.filename,
      status: f.status,                // "added", "removed", "modified", "renamed"
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch || null            // unified diff
    }))
  };
}

/**
 * Get a specific commit's details (files changed, stats, author).
 */
async function getCommitDetail(token, owner, repo, sha) {
  const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}`, {
    headers: { Authorization: `token ${token}` }
  });

  const data = response.data;
  return {
    sha: data.sha,
    message: data.commit.message,
    date: data.commit.author.date,
    author: data.author
      ? { login: data.author.login, id: data.author.id, avatar_url: data.author.avatar_url }
      : { login: data.commit.author.name, id: null },
    stats: data.stats,                  // { total, additions, deletions }
    files: data.files.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch || null
    }))
  };
}

/**
 * List repos accessible to the authenticated user.
 */
async function getUserRepos(token) {
  const response = await axios.get(`${GITHUB_API}/user/repos`, {
    headers: { Authorization: `token ${token}` },
    params: { per_page: 100, sort: 'updated' }
  });

  return response.data.map(repo => ({
    name: repo.name,
    full_name: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    default_branch: repo.default_branch,
    language: repo.language,
    updated_at: repo.updated_at
  }));
}

/**
 * Get raw file content at a specific commit SHA.
 * Returns null if the file didn't exist at that ref.
 */
async function getFileAtCommit(token, owner, repo, filePath, ref) {
  try {
    const encodedPath = filePath.split('/').map(s => encodeURIComponent(s)).join('/');
    const response = await axios.get(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`,
      {
        headers: { Authorization: `token ${token}` },
        params: { ref }
      }
    );
    // GitHub returns content as base64
    return Buffer.from(response.data.content, 'base64').toString('utf-8');
  } catch (err) {
    if (err.response?.status === 404) return null; // file didn't exist at this ref
    throw err;
  }
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
  getCommits,
  getContributors,
  compareCommits,
  getCommitDetail,
  getUserRepos,
  getFileAtCommit
};
