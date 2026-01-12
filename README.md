# Double Chess

A chess app for **Marseillais chess** (double-move chess) with a custom engine and online multiplayer.

## About Marseillais Chess

[Marseillais chess](https://en.wikipedia.org/wiki/Marseillais_chess) is a variant invented in Marseille, France around 1925. The twist: **each player makes two moves per turn**.

This changes the game significantly—tactics are deeper, piece coordination matters more, and you need to think about your opponent's double-move responses.

### Rules

- **Balanced mode**: White makes only one move on their first turn (to reduce first-move advantage)
- **Check ends turn**: If your first move gives check, you don't get a second move
- **Checkmate**: Same as regular chess

## The Engine

Standard engines like Stockfish don't work for double-move chess, so this project includes a custom engine built specifically for Marseillais.

It uses a 10×12 mailbox board representation with minimax and alpha-beta pruning, using standard [piece-square tables](https://www.chessprogramming.org/Piece-Square_Tables) and various positional bonuses.

See [chess-front/src/workers/double-move-engine.js](./chess-front/src/workers/double-move-engine.js) for the implementation.

## Quick Start

```bash
# Install
npm install
cd chess-front && npm install
cd ../chess-server && npm install

# Set up env
cd chess-server
cp .env.example .env

# Start MongoDB (Docker or Atlas)
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Run (two terminals)
cd chess-front && npm run dev
cd chess-server && npm run dev
```

Frontend: http://localhost:5173

## Tech Stack

- **Frontend**: React 19, Vite, react-chessboard, Socket.IO
- **Backend**: Express, Socket.IO, MongoDB
- **Engine**: Custom JS engine + chess.js for validation

## Project Structure

```
chess-front/          # React app
  src/workers/        # Engine code
chess-server/         # Express backend
```

## License

MIT
