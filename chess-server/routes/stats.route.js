const express = require('express');
const router = express.Router();
const statsService = require('../services/stats.service');

/**
 * Helper to extract client IP from request
 */
function getClientIp(req) {
  // Check for forwarded IP (behind proxy/load balancer like Render, Nginx)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, the first is the client's
    return forwarded.split(',')[0].trim();
  }
  // Check for real IP header (some proxies use this)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  // Fallback to connection's remote address
  return req.connection?.remoteAddress || req.socket?.remoteAddress || null;
}

/**
 * POST /api/stats/visit
 * Log a site visit
 */
router.post('/visit', async (req, res) => {
  const { sessionId, userId } = req.body;
  const userAgent = req.headers['user-agent'];
  const ip = getClientIp(req);
  
  await statsService.logSiteVisit(sessionId, userId, userAgent, ip);
  res.status(200).json({ success: true });
});

/**
 * POST /api/stats/bot-game-started
 * Log when a bot game is started
 */
router.post('/bot-game-started', async (req, res) => {
  const { sessionId, userId, skillLevel, playerColor, gameId } = req.body;
  const userAgent = req.headers['user-agent'];
  const ip = getClientIp(req);
  
  await statsService.logBotGameStarted(sessionId, userId, skillLevel, playerColor, userAgent, ip, gameId);
  res.status(200).json({ success: true });
});

/**
 * POST /api/stats/game-completed
 * Log when a game is completed (can also be called from frontend for bot games)
 */
router.post('/game-completed', async (req, res) => {
  const { gameId, result, winner, isBotGame, sessionId, userId } = req.body;
  const userAgent = req.headers['user-agent'];
  const ip = getClientIp(req);
  
  await statsService.logGameCompleted(gameId, result, winner, isBotGame, sessionId, userId, userAgent, ip);
  res.status(200).json({ success: true });
});

/**
 * GET /api/stats/summary
 * Get statistics summary
 */
router.get('/summary', async (req, res) => {
  const stats = await statsService.getStatsSummary();
  
  if (stats) {
    res.status(200).json(stats);
  } else {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/stats/today
 * Get today's statistics
 */
router.get('/today', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const stats = await statsService.getStatsForPeriod(today);
  
  if (stats) {
    res.status(200).json(stats);
  } else {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
