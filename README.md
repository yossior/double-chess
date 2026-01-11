# Double Chess

A modern chess application featuring Marseillais chess (double-move chess) with online multiplayer support.

## Features

- 🎮 **Multiple Game Modes:** Play standard chess or Marseillais (double-move) chess
- 👥 **Online Multiplayer:** Play against friends online with real-time synchronization
- 🤖 **AI Opponent:** Play against Stockfish AI with adjustable difficulty
- ⏱️ **Timed Games:** Built-in chess clock with time control
- 📱 **Responsive Design:** Works on desktop and mobile devices
- 🔐 **User Authentication:** Sign in with email or Google OAuth

## Project Structure

```
double-chess/
├── chess-front/          # React frontend with Vite
├── chess-server/         # Express.js backend with Socket.IO
├── chess.js/            # Modified chess.js library
└── modified-chess-js/   # Compiled chess.js build
```

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   cd chess-front && npm install
   cd ../chess-server && npm install
   ```

2. **Set up environment variables:**
   ```bash
   cd chess-server
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start MongoDB:**
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest

   # Or use MongoDB Atlas (cloud)
   ```

4. **Start the development servers:**
   ```bash
   # Terminal 1 - Frontend
   cd chess-front
   npm run dev

   # Terminal 2 - Backend
   cd chess-server
   npm run dev
   ```

5. **Open your browser:**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5001

## Deployment

### Deploy to Render (Recommended)

This project is configured for easy deployment on Render.com:

1. **Quick Setup Guide:** See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)
2. **Troubleshooting:** See [DEPLOYMENT_TROUBLESHOOTING.md](./DEPLOYMENT_TROUBLESHOOTING.md)

**Quick steps:**
1. Set up MongoDB Atlas (free tier)
2. Create a Web Service on Render
3. Connect your GitHub repository
4. Set environment variables
5. Deploy!

### Environment Variables

Required for production:

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.net/db` |
| `JWT_SECRET` | Secret for JWT tokens | Generate with `crypto.randomBytes(32)` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | Auto-set by Render (10000) |
| `GOOGLE_CLIENT_ID` | Google OAuth (optional) | Your Google Client ID |

## Technology Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **react-chessboard** - Chess board component
- **Socket.IO Client** - Real-time communication
- **Stockfish.js** - Chess engine for AI

### Backend
- **Node.js / Express** - Server framework
- **Socket.IO** - WebSocket communication
- **MongoDB / Mongoose** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing

### Chess Logic
- **chess.js** - Modified version supporting Marseillais chess

## Game Modes

### Standard Chess
Classic chess with all traditional rules.

### Marseillais Chess (Double-Move)
Each player makes **two moves** per turn (with some exceptions):
- First player makes only one move on their first turn
- If in check, player makes only one move to get out of check
- After capturing a piece, no second move is allowed
- Adds strategic depth and faster gameplay

## API Endpoints

### REST API
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Login with email/password
- `POST /api/users/google-login` - Login with Google OAuth
- `GET /health` - Server health check

### Socket.IO Events
- `find_opponent` - Join matchmaking queue
- `move` - Send a chess move
- `resign` - Forfeit the game
- `offer_draw` / `respond_draw` - Draw offers
- `sync_start` / `sync_offset` - Clock synchronization

See [chess-server/handlers/socket.handler.js](./chess-server/handlers/socket.handler.js) for full event list.

## Development

### Running Tests
```bash
# Frontend tests
cd chess-front
npm test

# Backend tests
cd chess-server
npm test
```

### Building for Production
```bash
# Build frontend
cd chess-front
npm run build

# Output goes to chess-front/dist/
```

### Code Style
- ESLint configured for both frontend and backend
- Run `npm run lint` to check code style

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Open a Pull Request

## Troubleshooting

### Common Issues

**Socket connection fails:**
- Check that backend is running
- Verify MONGO_URI is set correctly
- See [DEPLOYMENT_TROUBLESHOOTING.md](./DEPLOYMENT_TROUBLESHOOTING.md)

**MongoDB connection error:**
- Ensure MongoDB is running locally or use MongoDB Atlas
- Check MONGO_URI format

**Build fails:**
- Run `npm install` in all directories
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check [DEPLOYMENT_TROUBLESHOOTING.md](./DEPLOYMENT_TROUBLESHOOTING.md)
2. Review [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)
3. Open an issue on GitHub
