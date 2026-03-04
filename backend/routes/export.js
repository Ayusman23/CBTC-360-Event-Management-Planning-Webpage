const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

// All export routes require authentication
router.use(authMiddleware);

// ── Helper: send workbook as XLSX download ──────────────────────────────────
function sendWorkbook(res, workbook, filename) {
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
}

// ── Helper: style header row ─────────────────────────────────────────────────
function styledSheet(headers, rows) {
    const sheetData = [headers, ...rows];
    return XLSX.utils.aoa_to_sheet(sheetData);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/export/all  ← All user data in one .xlsx (4 sheets)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/all', (req, res) => {
    const uid = req.user.id;
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: My Events ─────────────────────────────────
    const events = db.prepare(`
    SELECT e.id, e.title, e.category, e.event_date, e.event_time,
           e.venue, e.capacity, e.status, e.description, e.cover_color,
           e.created_at,
           (SELECT COUNT(*) FROM guests g WHERE g.event_id = e.id) AS guest_count,
           (SELECT COUNT(*) FROM rsvps  r WHERE r.event_id = e.id) AS rsvp_count
    FROM events e WHERE e.user_id = ? ORDER BY e.event_date ASC
  `).all(uid);

    const evHeaders = ['ID', 'Title', 'Category', 'Date', 'Time', 'Venue', 'Capacity', 'Status', 'Description', 'Cover Color', 'Created At', 'Guests', 'RSVPs'];
    const evRows = events.map(e => [
        e.id, e.title, e.category, e.event_date, e.event_time || '—',
        e.venue || '—', e.capacity || 0, e.status, e.description || '—',
        e.cover_color, e.created_at, e.guest_count, e.rsvp_count
    ]);
    XLSX.utils.book_append_sheet(wb, styledSheet(evHeaders, evRows), 'My Events');

    // ── Sheet 2: All Guests ────────────────────────────────
    const guests = db.prepare(`
    SELECT g.id, e.title AS event_title, g.name, g.email, g.phone, g.status, g.added_at
    FROM guests g
    JOIN events e ON e.id = g.event_id
    WHERE e.user_id = ?
    ORDER BY e.title, g.name
  `).all(uid);

    const gHeaders = ['Guest ID', 'Event', 'Guest Name', 'Email', 'Phone', 'Status', 'Added At'];
    const gRows = guests.map(g => [g.id, g.event_title, g.name, g.email, g.phone || '—', g.status, g.added_at]);
    XLSX.utils.book_append_sheet(wb, styledSheet(gHeaders, gRows), 'Guests');

    // ── Sheet 3: RSVPs ─────────────────────────────────────
    const rsvps = db.prepare(`
    SELECT r.id, e.title AS event_title, r.guest_name, r.guest_email,
           r.response, r.message, r.responded_at
    FROM rsvps r
    JOIN events e ON e.id = r.event_id
    WHERE e.user_id = ?
    ORDER BY e.title, r.responded_at DESC
  `).all(uid);

    const rHeaders = ['RSVP ID', 'Event', 'Guest Name', 'Email', 'Response', 'Message', 'Responded At'];
    const rRows = rsvps.map(r => [r.id, r.event_title, r.guest_name, r.guest_email, r.response, r.message || '—', r.responded_at]);
    XLSX.utils.book_append_sheet(wb, styledSheet(rHeaders, rRows), 'RSVPs');

    // ── Sheet 4: Notifications ─────────────────────────────
    const notifs = db.prepare(`
    SELECT id, message, type, CASE WHEN is_read=1 THEN 'Read' ELSE 'Unread' END AS status, created_at
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC
  `).all(uid);

    const nHeaders = ['ID', 'Message', 'Type', 'Status', 'Created At'];
    const nRows = notifs.map(n => [n.id, n.message, n.type, n.status, n.created_at]);
    XLSX.utils.book_append_sheet(wb, styledSheet(nHeaders, nRows), 'Notifications');

    // ── Sheet 5: Account Summary ───────────────────────────
    const user = db.prepare('SELECT name, email, created_at FROM users WHERE id=?').get(uid);
    const summaryData = [
        ['EventPlanner 360 — Data Export'],
        [],
        ['Account Name', user.name],
        ['Email', user.email],
        ['Member Since', user.created_at],
        ['Export Date', new Date().toISOString()],
        [],
        ['Total Events', events.length],
        ['Total Guests Added', guests.length],
        ['Total RSVPs', rsvps.length],
        ['Upcoming Events', events.filter(e => e.status === 'upcoming').length],
        ['Completed Events', events.filter(e => e.status === 'completed').length],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

    const filename = `EventPlanner360_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    sendWorkbook(res, wb, filename);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/export/events  ← Just events
// ─────────────────────────────────────────────────────────────────────────────
router.get('/events', (req, res) => {
    const events = db.prepare(`
    SELECT e.id, e.title, e.category, e.event_date, e.event_time,
           e.venue, e.capacity, e.status, e.description, e.created_at,
           (SELECT COUNT(*) FROM guests g WHERE g.event_id = e.id) AS guest_count
    FROM events e WHERE e.user_id = ? ORDER BY e.event_date ASC
  `).all(req.user.id);

    const wb = XLSX.utils.book_new();
    const headers = ['ID', 'Title', 'Category', 'Date', 'Time', 'Venue', 'Capacity', 'Status', 'Description', 'Created At', 'Guests'];
    const rows = events.map(e => [e.id, e.title, e.category, e.event_date, e.event_time || '', e.venue || '', e.capacity || 0, e.status, e.description || '', e.created_at, e.guest_count]);
    XLSX.utils.book_append_sheet(wb, styledSheet(headers, rows), 'Events');

    sendWorkbook(res, wb, `Events_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/export/guests  ← Just guests
// ─────────────────────────────────────────────────────────────────────────────
router.get('/guests', (req, res) => {
    const guests = db.prepare(`
    SELECT g.id, e.title AS event_title, e.event_date, g.name, g.email, g.phone, g.status, g.added_at
    FROM guests g JOIN events e ON e.id = g.event_id
    WHERE e.user_id = ? ORDER BY e.title, g.name
  `).all(req.user.id);

    const wb = XLSX.utils.book_new();
    const headers = ['ID', 'Event', 'Event Date', 'Guest Name', 'Email', 'Phone', 'Status', 'Added At'];
    const rows = guests.map(g => [g.id, g.event_title, g.event_date, g.name, g.email, g.phone || '', g.status, g.added_at]);
    XLSX.utils.book_append_sheet(wb, styledSheet(headers, rows), 'Guests');

    sendWorkbook(res, wb, `Guests_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/export/rsvps  ← Just RSVPs
// ─────────────────────────────────────────────────────────────────────────────
router.get('/rsvps', (req, res) => {
    const rsvps = db.prepare(`
    SELECT r.id, e.title AS event_title, e.event_date, r.guest_name, r.guest_email,
           r.response, r.message, r.responded_at
    FROM rsvps r JOIN events e ON e.id = r.event_id
    WHERE e.user_id = ? ORDER BY r.responded_at DESC
  `).all(req.user.id);

    const wb = XLSX.utils.book_new();
    const headers = ['ID', 'Event', 'Event Date', 'Guest Name', 'Email', 'Response', 'Message', 'Responded At'];
    const rows = rsvps.map(r => [r.id, r.event_title, r.event_date, r.guest_name, r.guest_email, r.response, r.message || '', r.responded_at]);
    XLSX.utils.book_append_sheet(wb, styledSheet(headers, rows), 'RSVPs');

    sendWorkbook(res, wb, `RSVPs_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
});

module.exports = router;
