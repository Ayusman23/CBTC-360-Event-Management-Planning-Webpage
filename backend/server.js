require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ── CORS (manual middleware — no cors package) ─────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Socket.io ──────────────────────────────────────────────────────────────────
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    socket.on('join:user', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`👤 User ${userId} joined room user_${userId}`);
    });
    socket.on('disconnect', () => console.log('❌ Client disconnected:', socket.id));
});

// ── Body parsers ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Serve static files ─────────────────────────────────────────────────────────
// /frontend → serves frontend/css, frontend/js, frontend/assets
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
// root → serves index.html, login.html, dashboard.html, event.html, about.html, etc.
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/users', require('./routes/users'));
app.use('/api/export', require('./routes/export'));

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        success: true,
        message: 'EventPlanner 360 API is running! 🚀',
        timestamp: new Date().toISOString()
    });
});

// ── 404 for unknown API routes ─────────────────────────────────────────────────
app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, message: 'API route not found.' });
});

// ── Start Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║       EventPlanner 360 — Backend Server              ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  🚀 Open:      http://localhost:${PORT}                  ║`);
    console.log(`║  🗄  Database: SQLite  (eventplanner.db)              ║`);
    console.log(`║  🔴 Real-time: Socket.io enabled                     ║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
});

module.exports = { app, server };
