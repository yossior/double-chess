const Stats = require('../models/stats.model');
const Game = require('../models/game.model');

class StatsService {
  /**
   * Log a site visit
   */
  async logSiteVisit(sessionId = null, userId = null, userAgent = null, ip = null) {
    try {
      await Stats.create({
        type: 'site_visit',
        sessionId,
        userId,
        userAgent,
        ip
      });
      console.log(`[Stats] Site visit logged (session: ${sessionId || 'anonymous'}, ip: ${ip || 'unknown'})`);
    } catch (error) {
      console.error('[Stats] Failed to log site visit:', error.message);
    }
  }

  /**
   * Log a bot game started
   */
  async logBotGameStarted(sessionId = null, userId = null, skillLevel = null, playerColor = null, userAgent = null, ip = null, gameId = null) {
    try {
      await Stats.create({
        type: 'bot_game_started',
        gameId,
        sessionId,
        userId,
        skillLevel,
        playerColor,
        userAgent,
        ip,
        isBotGame: true
      });
      console.log(`[Stats] Bot game started: ${gameId} (session: ${sessionId || 'anonymous'}, skill: ${skillLevel}, ip: ${ip || 'unknown'})`);
    } catch (error) {
      console.error('[Stats] Failed to log bot game started:', error.message);
    }
  }

  /**
   * Log a PvP game started (player vs player online game)
   */
  async logPvpGameStarted(gameId, whitePlayer, blackPlayer, gameCreatorColor) {
    try {
      await Stats.create({
        type: 'pvp_game_started',
        gameId,
        whitePlayerIp: whitePlayer.ip,
        whitePlayerUserAgent: whitePlayer.userAgent,
        whitePlayerId: whitePlayer.userId,
        blackPlayerIp: blackPlayer.ip,
        blackPlayerUserAgent: blackPlayer.userAgent,
        blackPlayerId: blackPlayer.userId,
        gameCreatorColor,
        isBotGame: false
      });
      console.log(`[Stats] PvP game started: ${gameId} (creator: ${gameCreatorColor}, white ip: ${whitePlayer.ip || 'unknown'}, black ip: ${blackPlayer.ip || 'unknown'})`);
    } catch (error) {
      console.error('[Stats] Failed to log PvP game started:', error.message);
    }
  }

  /**
   * Log a game completed
   * For bot games, also saves the full game to the games collection
   * For abandoned games (any type), saves to games collection if moves are provided
   * @param {object} botGameData - Optional data for games { moves, fen, skillLevel, playerColor, isUnbalanced, startedAt }
   */
  async logGameCompleted(gameId, result, winner, isBotGame = false, sessionId = null, userId = null, userAgent = null, ip = null, botGameData = null) {
    try {
      // Create stats entry with all available data
      await Stats.create({
        type: 'game_completed',
        gameId,
        result,
        winner,
        isBotGame,
        skillLevel: botGameData?.skillLevel || null,
        playerColor: botGameData?.playerColor || null,
        sessionId,
        userId,
        userAgent,
        ip
      });
      
      // Save to games collection if we have moves data
      // This handles both bot games and abandoned friend games
      if (botGameData?.moves && Array.isArray(botGameData.moves) && botGameData.moves.length > 0) {
        await this._saveGameToDb(gameId, result, winner, sessionId, userId, isBotGame, botGameData, userAgent, ip);
      }
      
      console.log(`[Stats] Game completed: ${gameId} (result: ${result}, winner: ${winner}, bot: ${isBotGame}, moves: ${botGameData?.moves?.length || 0})`);
    } catch (error) {
      console.error('[Stats] Failed to log game completed:', error.message);
    }
  }

  /**
   * Save a game to the games collection
   * Works for both bot games and abandoned friend games
   */
  async _saveGameToDb(gameId, result, winner, sessionId, userId, isBotGame, gameData, userAgent = null, ip = null) {
    try {
      const { moves, fen, skillLevel, playerColor, isUnbalanced, startedAt } = gameData;
      
      // Create game document
      const gameDoc = {
        gameId,
        // Store session ID for identification
        whiteSessionId: playerColor === 'w' ? sessionId : null,
        blackSessionId: playerColor === 'b' ? sessionId : null,
        // User IDs if available
        white: playerColor === 'w' ? (userId || null) : null,
        black: playerColor === 'b' ? (userId || null) : null,
        // IP addresses and user agents
        whiteIp: playerColor === 'w' ? ip : null,
        blackIp: playerColor === 'b' ? ip : null,
        whiteUserAgent: playerColor === 'w' ? userAgent : null,
        blackUserAgent: playerColor === 'b' ? userAgent : null,
        moves: moves || [],
        fen: fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        isUnbalanced: isUnbalanced !== undefined ? isUnbalanced : true,
        status: 'completed',
        result: result,
        winner: winner,
        // Bot-specific info
        isBotGame: isBotGame,
        skillLevel: isBotGame ? (skillLevel || null) : null,
        playerColor: playerColor || null,
        // Timestamps
        startedAt: startedAt ? new Date(startedAt) : null,
        completedAt: new Date()
      };
      
      // Use upsert to avoid duplicate key errors
      const savedGame = await Game.findOneAndUpdate(
        { gameId },
        { $set: gameDoc },
        { upsert: true, new: true }
      );
      
      console.log(`[Stats] Game saved to games collection: ${gameId} (${moves?.length || 0} moves, bot: ${isBotGame})`);
      return savedGame;
    } catch (error) {
      console.error('[Stats] Failed to save game to DB:', error.message);
      return null;
    }
  }

  /**
   * Get statistics summary
   */
  async getStatsSummary() {
    try {
      const [siteVisits, botGamesStarted, pvpGamesStarted, gamesCompleted, botGamesCompleted] = await Promise.all([
        Stats.countDocuments({ type: 'site_visit' }),
        Stats.countDocuments({ type: 'bot_game_started' }),
        Stats.countDocuments({ type: 'pvp_game_started' }),
        Stats.countDocuments({ type: 'game_completed' }),
        Stats.countDocuments({ type: 'game_completed', isBotGame: true })
      ]);

      return {
        siteVisits,
        botGamesStarted,
        pvpGamesStarted,
        gamesCompleted,
        botGamesCompleted,
        pvpGamesCompleted: gamesCompleted - botGamesCompleted
      };
    } catch (error) {
      console.error('[Stats] Failed to get stats summary:', error.message);
      return null;
    }
  }

  /**
   * Get stats for a time period
   */
  async getStatsForPeriod(startDate, endDate = new Date()) {
    try {
      const query = {
        timestamp: { $gte: startDate, $lte: endDate }
      };

      const [siteVisits, botGamesStarted, gamesCompleted] = await Promise.all([
        Stats.countDocuments({ ...query, type: 'site_visit' }),
        Stats.countDocuments({ ...query, type: 'bot_game_started' }),
        Stats.countDocuments({ ...query, type: 'game_completed' })
      ]);

      return {
        period: { start: startDate, end: endDate },
        siteVisits,
        botGamesStarted,
        gamesCompleted
      };
    } catch (error) {
      console.error('[Stats] Failed to get stats for period:', error.message);
      return null;
    }
  }
}

module.exports = new StatsService();
