const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

// ── POST /api/auth/signup ──────────────────────────────────────────────────────
router.post('/signup', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Check existing user
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existingUser) {
        return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 12);
    const initials = name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const stmt = db.prepare('INSERT INTO users (name, email, password, avatar) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name.trim(), email.toLowerCase().trim(), hashedPassword, initials);

    // Create welcome notification
    db.prepare("INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)").run(
        result.lastInsertRowid,
        `Welcome to EventPlanner 360, ${name.trim().split(' ')[0]}! 🎉 Start by creating your first event.`,
        'success'
    );

    const token = jwt.sign(
        { id: result.lastInsertRowid, email: email.toLowerCase().trim(), name: name.trim() },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
        success: true,
        message: 'Account created successfully!',
        token,
        user: { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim(), avatar: initials }
    });
});

// ── POST /api/auth/login ───────────────────────────────────────────────────────
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
        success: true,
        message: `Welcome back, ${user.name.split(' ')[0]}!`,
        token,
        user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, created_at: user.created_at }
    });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
const authMiddleware = require('../middleware/auth');
router.get('/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, name, email, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
});

module.exports = router;
