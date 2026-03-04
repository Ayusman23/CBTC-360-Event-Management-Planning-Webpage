const express = require('express');
const router = express.Router();
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// ── GET /api/users/dashboard ───────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
    const user = db.prepare('SELECT id, name, email, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const events = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM guests g WHERE g.event_id = e.id) AS guest_count
    FROM events e WHERE e.user_id = ? ORDER BY e.event_date ASC LIMIT 5
  `).all(req.user.id);

    const stats = {
        totalEvents: db.prepare('SELECT COUNT(*) AS c FROM events WHERE user_id = ?').get(req.user.id).c,
        upcomingEvents: db.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND status = 'upcoming'").get(req.user.id).c,
        totalGuests: db.prepare('SELECT COUNT(*) AS c FROM guests WHERE user_id = ?').get(req.user.id).c,
        completedEvents: db.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND status = 'completed'").get(req.user.id).c,
    };

    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(req.user.id);
    const unreadCount = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;

    res.json({ success: true, user, events, stats, notifications, unreadCount });
});

// ── GET /api/users/notifications ──────────────────────────────────────────────
router.get('/notifications', (req, res) => {
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ success: true, notifications });
});

// ── PUT /api/users/notifications/read ─────────────────────────────────────────
router.put('/notifications/read', (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read.' });
});

// ── PUT /api/users/profile ─────────────────────────────────────────────────────
router.put('/profile', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });

    const initials = name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    db.prepare('UPDATE users SET name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name.trim(), initials, req.user.id);

    res.json({ success: true, message: 'Profile updated!' });
});

module.exports = router;
