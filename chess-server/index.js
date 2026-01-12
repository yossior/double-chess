const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const { registerSocketHandlers } = require("./handlers/socket.handler");
const statsRoutes = require("./routes/stats.route");
// Admin initialization disabled
// const { initializeAdminUser } = require("./controllers/user.controller");

// ============================================
// INITIALIZE EXPRESS & SOCKET.IO
// ============================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ============================================
// MIDDLEWARE
// ============================================
// Enable cross-origin isolation for SharedArrayBuffer usage (COOP/COEP)
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static assets
app.use(express.static(path.join(__dirname, "public")));

// Serve frontend dist folder regardless of process cwd
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "chess-front", "dist");
app.use(express.static(distDir));

// ============================================
// ROUTES
// ============================================
app.use("/api/stats", statsRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: Date.now(),
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    mongoConnected: mongoose.connection.readyState === 1,
    socketIORunning: io !== undefined
  });
});

// SPA fallback - serve index.html for all non-API routes (Express v5-safe)
app.get(/^\/(?!api|socket).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================
io.on("connection", (socket) => {
  console.log(`👤 User connected: ${socket.id}`);
  registerSocketHandlers(io, socket);
});

// ============================================
// DATABASE CONNECTION & SERVER START
// ============================================
const PORT = process.env.PORT || 5001;

console.log("🔧 Environment Configuration:");
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   PORT: ${PORT}`);
console.log(`   MONGO_URI: ${process.env.MONGO_URI ? '✓ Set' : '✗ Not set'}`);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    // initializeAdminUser();
    startServer();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("⚠️ Starting server without database...");
    startServer();
  });

function startServer() {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📝 API: http://localhost:${PORT}/api`);
    console.log(`🎮 WebSocket: ws://localhost:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`${'='.repeat(50)}\n`);
  });
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  // Inform socket handlers that we're shutting down so they can avoid
  // emitting opponentDisconnected / logging noisy messages
  if (io) io.isShuttingDown = true;

  server.close(() => {
    console.log("✅ Server closed");
    Promise.resolve()
      .then(() => mongoose.connection.close(false))
      .then(() => {
        console.log("✅ MongoDB disconnected");
        process.exit(0);
      })
      .catch((err) => {
        console.error("❌ Error closing MongoDB connection:", err?.message || err);
        process.exit(1);
      });
  });
});

module.exports = { app, io, server };
