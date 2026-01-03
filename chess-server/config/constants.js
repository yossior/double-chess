/**
 * Server configuration and constants
 */

module.exports = {
  // Clock settings
  CLOCK: {
    INITIAL_TIME_SECONDS: 300, // 5 minutes
    INCREMENT_SECONDS: 2, // 2 second increment per move
    INITIAL_TIME_MS: 300 * 1000,
    INCREMENT_MS: 2 * 1000,
  },

  // Game settings
  GAME: {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 2,
  },

  // Auth settings
  AUTH: {
    TOKEN_EXPIRY: '24h',
  },

  // HTTP status codes
  HTTP: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
  },

  // Game states
  GAME_STATUS: {
    WAITING: 'waiting',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned',
  },

  // Game results
  GAME_RESULT: {
    WHITE_WIN: 'white_win',
    BLACK_WIN: 'black_win',
    DRAW: 'draw',
    ABANDONED: 'abandoned',
  },

  // Game result reasons
  RESULT_REASON: {
    CHECKMATE: 'checkmate',
    RESIGNATION: 'resignation',
    TIMEOUT: 'timeout',
    STALEMATE: 'stalemate',
    INSUFFICIENT_MATERIAL: 'insufficient_material',
    THREEFOLD_REPETITION: 'threefold_repetition',
    FIFTY_MOVE_RULE: 'fifty_move_rule',
  },
};
