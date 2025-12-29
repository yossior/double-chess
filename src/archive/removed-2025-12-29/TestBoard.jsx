import React, { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
// NOTE: Make sure to use the correct import for the Chess class based on your 'chess.js' version
// For modern versions (>=1.0.0):
import { Chess } from 'chess.js'; 
// For older versions (<=0.13.4):
// const Chess = require('chess.js').Chess; 

// Sample PGN for demonstration
const SAMPLE_PGN = `[Event "rated bullet game"]
[Site "https://lichess.org/vCmd4h1k"]
[Date "2025.12.08"]
[White "Kirill_Malakhov"]
[Black "ancient-love-poetry5"]
[Result "0-1"]
[GameId "vCmd4h1k"]
[UTCDate "2025.12.08"]
[UTCTime "14:11:56"]
[WhiteElo "2689"]
[BlackElo "2876"]
[WhiteRatingDiff "-3"]
[BlackRatingDiff "+4"]
[Variant "Standard"]
[TimeControl "60+0"]
[ECO "A40"]
[Opening "Horwitz Defense"]
[Termination "Normal"]
[Annotator "lichess.org"]

1. d4 e6 { A40 Horwitz Defense } 2. e3 d5 3. f4 Nf6 4. Nf3 b6 5. Bd3 Be7 6. c3 O-O 7. Qe2 a5 8. Nbd2 Ba6 9. c4 c5 10. b3 Nc6 11. Bb2 Nb4 12. Bb1 cxd4 13. Nxd4 dxc4 14. bxc4 Rc8 15. a3 Nc6 16. O-O Bc5 17. N2f3 Nxd4 18. exd4 Bd6 19. Ne5 Qc7 20. Bd3 Nd7 21. Rac1 Be7 22. Rf3 f5 23. Rh3 Nxe5 24. fxe5 g6 25. Rg3 Qd7 26. d5 exd5 27. e6 Qd6 28. Be5 Qxe6 29. cxd5 Rxc1+ 30. Kf2 Bxd3 31. dxe6 Bxe2 32. Kxe2 Rfc8 33. Rb3 R1c2+ 34. Kf3 R8c6 35. g4 Rxe6 36. Rb5 Bc5 37. Bf4 Rf2+ 38. Kg3 fxg4 39. Kxg4 Re4 40. h4 Rfxf4+ 41. Kg5 Rf5+ 42. Kh6 Rh5# { Black wins by checkmate. } 0-1`;

// Utility function to process moves for display
const processMoves = (history) => {
  const moves = [];
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    // Check if it's a white move (even index) or a black move (odd index)
    if (i % 2 === 0) {
      moves.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: move,
        black: null,
      });
    } else {
      moves[moves.length - 1].black = move;
    }
  }
  return moves;
};

export default function PgnViewer({ pgn = SAMPLE_PGN }) {
  // 1. Initialize chess.js game state and current move index
  const [game, setGame] = useState(() => {
    const newGame = new Chess();
    newGame.loadPgn(pgn);
    return newGame;
  });
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 means initial position (FEN 'start')

  // The full move history is constant once the PGN is loaded
  const fullHistory = useMemo(() => game.history(), [pgn]);
  const formattedMoves = useMemo(() => processMoves(fullHistory), [fullHistory]);
  
  // 2. Navigation Functions
  const navigate = useCallback((newIndex) => {
    const newGame = new Chess();
    newGame.loadPgn(pgn); // Start from the initial PGN state
    
    // Play all moves up to the desired index
    const movesToPlay = fullHistory.slice(0, newIndex + 1);
    movesToPlay.forEach(move => newGame.move(move));

    // Update state
    setGame(newGame);
    setCurrentMoveIndex(newIndex);
  }, [pgn, fullHistory]);

  const goToStart = () => navigate(-1);
  const goBack = () => navigate(Math.max(-1, currentMoveIndex - 1));
  const goForward = () => navigate(Math.min(fullHistory.length - 1, currentMoveIndex + 1));
  const goToEnd = () => navigate(fullHistory.length - 1);
  
  // 3. Determine the current FEN to display on the board
  const currentFen = currentMoveIndex === -1 ? 'start' : game.fen();

  // 4. Handle clicking a move in the list
  const handleMoveClick = (moveIndex) => {
    navigate(moveIndex);
  };
  
  // 5. Render the component
  return (
    <div style={{ display: 'flex', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ width: '500px' }}>
        <Chessboard 
          id="PgnViewerBoard" 
          position={currentFen} 
          arePiecesDraggable={false} // Prevent user interaction to enforce view-only mode
        />
      </div>

      <div style={{ flex: 1, marginLeft: '20px' }}>
        <h2>Game Moves</h2>
        <div style={{ marginBottom: '10px' }}>
          <button onClick={goToStart} disabled={currentMoveIndex === -1}>⏮️ Start</button>
          <button onClick={goBack} disabled={currentMoveIndex === -1}>⬅️ Back</button>
          <button onClick={goForward} disabled={currentMoveIndex === fullHistory.length - 1}>➡️ Forward</button>
          <button onClick={goToEnd} disabled={currentMoveIndex === fullHistory.length - 1}>⏭️ End</button>
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
          {/* 

[Image of chess move notation and board]
 - This helps visualize the connection */}
          <ol style={{ listStyleType: 'none', padding: 0 }}>
            {formattedMoves.map((turn, turnIndex) => (
              <li key={turn.moveNumber} style={{ display: 'flex', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', marginRight: '8px', minWidth: '30px' }}>{turn.moveNumber}.</span>
                <span 
                  onClick={() => handleMoveClick(turnIndex * 2)} 
                  className={currentMoveIndex === turnIndex * 2 ? 'active-move' : ''}
                  style={{ cursor: 'pointer', padding: '2px 5px', borderRadius: '3px' }}
                >
                  {turn.white}
                </span>
                {turn.black && (
                  <span 
                    onClick={() => handleMoveClick(turnIndex * 2 + 1)} 
                    className={currentMoveIndex === turnIndex * 2 + 1 ? 'active-move' : ''}
                    style={{ cursor: 'pointer', marginLeft: '8px', padding: '2px 5px', borderRadius: '3px' }}
                  >
                    {turn.black}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {/* Add a CSS class 'active-move' to highlight the current position */}
          <style>{`
            .active-move {
              background-color: lightblue;
              font-weight: bold;
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}