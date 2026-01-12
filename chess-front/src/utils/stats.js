/**
 * Stats tracking utility for the chess frontend
 * Logs visits, bot games, and game completions to the server
 */

// Generate or retrieve a session ID for this browser session
function getSessionId() {
  let sessionId = sessionStorage.getItem('chess_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem('chess_session_id', sessionId);
  }
  return sessionId;
}

// Get user ID from localStorage if available
function getUserId() {
  try {
    const token = localStorage.getItem('chess_token');
    if (token) {
      // Decode JWT to get user ID (simple decode, no verification needed on client)
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id || payload._id || null;
    }
  } catch (e) {
    // Ignore decode errors
  }
  return null;
}

/**
 * Log a site visit
 */
export async function logSiteVisit() {
  try {
    // Only log once per session
    if (sessionStorage.getItem('chess_visit_logged')) {
      return;
    }
    
    await fetch('/api/stats/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getSessionId(),
        userId: getUserId()
      })
    });
    
    sessionStorage.setItem('chess_visit_logged', 'true');
    console.log('[Stats] Site visit logged');
  } catch (error) {
    console.error('[Stats] Failed to log site visit:', error);
  }
}

/**
 * Generate a unique game ID for bot games
 */
function generateBotGameId() {
  return 'bot_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
}

/**
 * Log when a bot game is started
 * Returns the generated gameId so it can be used for game completion tracking
 */
export async function logBotGameStarted(skillLevel, playerColor) {
  const gameId = generateBotGameId();
  try {
    await fetch('/api/stats/bot-game-started', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: getSessionId(),
        userId: getUserId(),
        skillLevel,
        playerColor,
        gameId
      })
    });
    console.log('[Stats] Bot game started logged:', gameId);
    return gameId;
  } catch (error) {
    console.error('[Stats] Failed to log bot game started:', error);
    return gameId; // Still return the ID even if logging failed
  }
}

/**
 * Log when a game is completed
 */
export async function logGameCompleted(gameId, result, winner, isBotGame = false) {
  try {
    await fetch('/api/stats/game-completed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: gameId || `bot_${Date.now()}`,
        result,
        winner,
        isBotGame,
        sessionId: getSessionId(),
        userId: getUserId()
      })
    });
    console.log('[Stats] Game completed logged:', { result, winner, isBotGame });
  } catch (error) {
    console.error('[Stats] Failed to log game completed:', error);
  }
}
