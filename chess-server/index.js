const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const { registerSocketHandlers } = require("./handlers/socket.handler");
const userRoutes = require("./routes/user.route");
const { errorHandler } = require("./middleware/auth.middleware");
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
app.use("/api/users", userRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});

// SPA fallback - serve index.html for all non-API routes (Express v5-safe)
app.get(/^\/(?!api|socket).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// Error handling middleware
app.use(errorHandler);

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

  server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📝 API: http://localhost:${PORT}/api`);
    console.log(`🎮 WebSocket: ws://localhost:${PORT}`);
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
