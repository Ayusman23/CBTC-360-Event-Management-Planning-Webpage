/**
 * EventPlanner 360 — API Utility
 * frontend/js/api.js
 * Centralised fetch wrapper for all backend calls.
 */

const API_BASE = '/api';

// ── Token helpers ────────────────────────────────────────────────────────────
const Auth = {
    getToken: () => localStorage.getItem('ep360_token'),
    getUser: () => { try { return JSON.parse(localStorage.getItem('ep360_user')); } catch { return null; } },
    setSession: (token, user) => { localStorage.setItem('ep360_token', token); localStorage.setItem('ep360_user', JSON.stringify(user)); },
    clearSession: () => { localStorage.removeItem('ep360_token'); localStorage.removeItem('ep360_user'); },
    isLoggedIn: () => !!localStorage.getItem('ep360_token'),
    redirectIfNotLoggedIn: (redirect = 'login.html') => {
        if (!localStorage.getItem('ep360_token')) {
            window.location.href = redirect; return true;
        }
        return false;
    },
    redirectIfLoggedIn: (redirect = 'dashboard.html') => {
        if (localStorage.getItem('ep360_token')) {
            window.location.href = redirect; return true;
        }
        return false;
    }
};

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
            Auth.clearSession();
            if (!window.location.href.includes('login')) window.location.href = 'login.html';
            return { success: false, message: data.message || 'Session expired.' };
        }
        return data;
    } catch (err) {
        console.error('API Error:', err);
        return { success: false, message: 'Cannot connect to server. Make sure backend is running.' };
    }
}

// ── API methods ───────────────────────────────────────────────────────────────
const API = {
    // Auth
    signup: (data) => apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    getMe: () => apiFetch('/auth/me'),

    // Dashboard
    getDashboard: () => apiFetch('/users/dashboard'),
    updateProfile: (data) => apiFetch('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),

    // Notifications
    getNotifications: () => apiFetch('/users/notifications'),
    markNotifsRead: () => apiFetch('/users/notifications/read', { method: 'PUT' }),

    // Events
    getEvents: () => apiFetch('/events'),
    getEvent: (id) => apiFetch(`/events/${id}`),
    getStats: () => apiFetch('/events/stats'),
    createEvent: (data) => apiFetch('/events', { method: 'POST', body: JSON.stringify(data) }),
    updateEvent: (id, data) => apiFetch(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEvent: (id) => apiFetch(`/events/${id}`, { method: 'DELETE' }),

    // Guests
    addGuest: (eventId, data) => apiFetch(`/events/${eventId}/guests`, { method: 'POST', body: JSON.stringify(data) }),
    removeGuest: (eventId, gId) => apiFetch(`/events/${eventId}/guests/${gId}`, { method: 'DELETE' }),

    // RSVPs
    submitRsvp: (eventId, data) => apiFetch(`/events/${eventId}/rsvp`, { method: 'POST', body: JSON.stringify(data) }),
};

// ── Toast notification system ─────────────────────────────────────────────────
const Toast = {
    container: null,
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },
    show(msg, type = 'info', duration = 4000) {
        this.init();
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-msg">${msg}</span>
    `;
        this.container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    },
    success: (msg, d) => Toast.show(msg, 'success', d),
    error: (msg, d) => Toast.show(msg, 'error', d),
    info: (msg, d) => Toast.show(msg, 'info', d),
    warning: (msg, d) => Toast.show(msg, 'warning', d),
};

// ── Scroll Animations ─────────────────────────────────────────────────────────
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-in-up').forEach(el => observer.observe(el));
}

// ── Navbar scroll effect ──────────────────────────────────────────────────────
function initNavbar() {
    const nav = document.querySelector('.navbar');
    if (!nav) return;
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50));
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getCategoryEmoji(cat) {
    const map = { Conference: '🏛️', Wedding: '💍', Birthday: '🎂', Corporate: '💼', Concert: '🎵', Sports: '⚽', Party: '🥳', Workshop: '🔧', General: '📅' };
    return map[cat] || '📅';
}

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ── Mobile sidebar toggle ─────────────────────────────────────────────────────
function initMobileSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
    });
    if (overlay) overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
}

// Export as globals (no module bundler used)
window.Auth = Auth;
window.API = API;
window.Toast = Toast;
window.formatDate = formatDate;
window.getCategoryEmoji = getCategoryEmoji;
window.timeAgo = timeAgo;
window.initScrollAnimations = initScrollAnimations;
window.initNavbar = initNavbar;
window.initMobileSidebar = initMobileSidebar;
