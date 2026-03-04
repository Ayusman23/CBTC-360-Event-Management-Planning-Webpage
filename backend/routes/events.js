const express = require('express');
const router = express.Router();
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

// All event routes require authentication
router.use(authMiddleware);

// ── GET /api/events ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const events = db.prepare(`
    SELECT e.*, 
      (SELECT COUNT(*) FROM guests g WHERE g.event_id = e.id) AS guest_count,
      (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.response = 'confirmed') AS rsvp_confirmed
    FROM events e 
    WHERE e.user_id = ? 
    ORDER BY e.event_date ASC
  `).all(req.user.id);
    res.json({ success: true, events });
});

// ── GET /api/events/stats ──────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
    const totalEvents = db.prepare('SELECT COUNT(*) AS cnt FROM events WHERE user_id = ?').get(req.user.id).cnt;
    const upcomingEvents = db.prepare("SELECT COUNT(*) AS cnt FROM events WHERE user_id = ? AND status = 'upcoming'").get(req.user.id).cnt;
    const totalGuests = db.prepare('SELECT COUNT(*) AS cnt FROM guests WHERE user_id = ?').get(req.user.id).cnt;
    const completedEvents = db.prepare("SELECT COUNT(*) AS cnt FROM events WHERE user_id = ? AND status = 'completed'").get(req.user.id).cnt;

    res.json({ success: true, stats: { totalEvents, upcomingEvents, totalGuests, completedEvents } });
});

// ── GET /api/events/:id ────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const guests = db.prepare('SELECT * FROM guests WHERE event_id = ? ORDER BY added_at DESC').all(event.id);
    const rsvps = db.prepare('SELECT * FROM rsvps WHERE event_id = ? ORDER BY responded_at DESC').all(event.id);

    res.json({ success: true, event: { ...event, guests, rsvps } });
});

// ── POST /api/events ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    const { title, description, category, venue, event_date, event_time, capacity, cover_color } = req.body;

    if (!title || !event_date) {
        return res.status(400).json({ success: false, message: 'Title and event date are required.' });
    }

    const stmt = db.prepare(`
    INSERT INTO events (user_id, title, description, category, venue, event_date, event_time, capacity, cover_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const result = stmt.run(
        req.user.id, title, description || '', category || 'General',
        venue || '', event_date, event_time || '', capacity || 0, cover_color || '#6c63ff'
    );

    // Notification for event creation
    db.prepare("INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)").run(
        req.user.id,
        `Your event "${title}" has been created successfully! 🎊`,
        'success'
    );

    // Emit real-time update via Socket.io (attached to req.app)
    const io = req.app.get('io');
    if (io) io.to(`user_${req.user.id}`).emit('event:created', { eventId: result.lastInsertRowid, title });

    const newEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Event created successfully!', event: newEvent });
});

// ── PUT /api/events/:id ────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const { title, description, category, venue, event_date, event_time, capacity, status, cover_color } = req.body;

    db.prepare(`
    UPDATE events SET title=?, description=?, category=?, venue=?, event_date=?, event_time=?, capacity=?, status=?, cover_color=?, updated_at=CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(
        title || event.title, description ?? event.description, category || event.category,
        venue ?? event.venue, event_date || event.event_date, event_time ?? event.event_time,
        capacity ?? event.capacity, status || event.status, cover_color || event.cover_color,
        req.params.id, req.user.id
    );

    const io = req.app.get('io');
    if (io) io.to(`user_${req.user.id}`).emit('event:updated', { eventId: req.params.id });

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Event updated successfully!', event: updated });
});

// ── DELETE /api/events/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    const io = req.app.get('io');
    if (io) io.to(`user_${req.user.id}`).emit('event:deleted', { eventId: req.params.id });

    res.json({ success: true, message: 'Event deleted successfully.' });
});

// ── POST /api/events/:id/guests ────────────────────────────────────────────────
router.post('/:id/guests', (req, res) => {
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    const { name, email, phone } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: 'Guest name and email are required.' });

    const result = db.prepare('INSERT INTO guests (event_id, user_id, name, email, phone) VALUES (?, ?, ?, ?, ?)').run(
        req.params.id, req.user.id, name, email, phone || ''
    );

    const io = req.app.get('io');
    if (io) io.to(`user_${req.user.id}`).emit('guest:added', { eventId: req.params.id, guestName: name });

    res.status(201).json({ success: true, message: 'Guest added!', guestId: result.lastInsertRowid });
});

// ── DELETE /api/events/:id/guests/:guestId ─────────────────────────────────────
router.delete('/:id/guests/:guestId', (req, res) => {
    db.prepare('DELETE FROM guests WHERE id = ? AND event_id = ?').run(req.params.guestId, req.params.id);
    res.json({ success: true, message: 'Guest removed.' });
});

// ── POST /api/events/:id/rsvp ──────────────────────────────────────────────────
router.post('/:id/rsvp', (req, res) => {
    const { guest_name, guest_email, response, message } = req.body;
    if (!guest_name || !guest_email) return res.status(400).json({ success: false, message: 'Name and email required.' });

    db.prepare('INSERT INTO rsvps (event_id, guest_name, guest_email, response, message) VALUES (?, ?, ?, ?, ?)').run(
        req.params.id, guest_name, guest_email, response || 'confirmed', message || ''
    );

    const event = db.prepare('SELECT title, user_id FROM events WHERE id = ?').get(req.params.id);
    if (event) {
        db.prepare("INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)").run(
            event.user_id,
            `${guest_name} has RSVP'd to "${event.title}" ✅`,
            'info'
        );
        const io = req.app.get('io');
        if (io) io.to(`user_${event.user_id}`).emit('rsvp:received', { eventId: req.params.id, guestName: guest_name });
    }

    res.status(201).json({ success: true, message: 'RSVP submitted!' });
});

module.exports = router;
