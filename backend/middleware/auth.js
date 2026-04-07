/**
 * Authentication Middleware
 * Validates API keys and user authentication
 */

/**
 * Simple API Key Authentication Middleware
 * Checks for valid API key in headers
 */
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'API key is required. Provide it via X-API-Key header or Authorization Bearer token.'
    });
  }
  
  // Validate API key
  const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
  
  if (validApiKeys.length === 0) {
    console.warn('⚠️  Warning: No API keys configured in environment variables');
  }
  
  if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }
  
  // Attach API key info to request
  req.apiKey = apiKey;
  next();
}

/**
 * Optional authentication middleware
 * Allows requests to proceed but attaches auth info if present
 */
function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (apiKey) {
    const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
    
    if (validApiKeys.includes(apiKey)) {
      req.authenticated = true;
      req.apiKey = apiKey;
    } else {
      req.authenticated = false;
    }
  } else {
    req.authenticated = false;
  }
  
  next();
}

/**
 * GitHub OAuth Token Validation Middleware
 * Validates GitHub access tokens
 */
async function requireGitHubAuth(req, res, next) {
  const token = req.headers['x-github-token'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'GitHub token is required. Provide it via X-GitHub-Token header or Authorization Bearer token.'
    });
  }
  
  try {
    // Validate GitHub token by making a test API call
    const axios = require('axios');
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    // Attach GitHub user info to request
    req.githubUser = response.data;
    req.githubToken = token;
    next();
  } catch (error) {
    console.error('GitHub auth error:', error.message);
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid GitHub token'
    });
  }
}

/**
 * Admin role check middleware
 * Requires specific admin API keys
 */
function requireAdmin(req, res, next) {
  const apiKey = req.apiKey || req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Admin authentication required'
    });
  }
  
  const adminApiKeys = process.env.ADMIN_API_KEYS ? process.env.ADMIN_API_KEYS.split(',') : [];
  
  if (!adminApiKeys.includes(apiKey)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
  }
  
  req.isAdmin = true;
  next();
}

/**
 * Rate limiting by API key
 * Simple in-memory rate limiter (use Redis for production)
 */
const requestCounts = new Map();

function rateLimit(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const identifier = req.apiKey || req.ip;
    const now = Date.now();
    
    if (!requestCounts.has(identifier)) {
      requestCounts.set(identifier, []);
    }
    
    const requests = requestCounts.get(identifier);
    
    // Remove old requests outside the time window
    const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }
    
    recentRequests.push(now);
    requestCounts.set(identifier, recentRequests);
    
    next();
  };
}

module.exports = {
  requireApiKey,
  optionalAuth,
  requireGitHubAuth,
  requireAdmin,
  rateLimit
};
