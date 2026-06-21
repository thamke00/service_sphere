/* ============================================================
 ServiceSphere – Notification Center
 Persistent inbox for all notifications. Fetches from
 server API (GET /notifications) and also keeps a local
 fallback in localStorage for instant display.
 Depends on: utils.js, auth.js
 ============================================================ */

const NOTIF_STORAGE_KEY = 'servicesphere_notifications';
const NOTIF_MAX = 50;
let _serverNotifs = [];
let _notifLoaded = false;

/* ── Local cache (for instant display before server responds) ── */
function getLocalNotifs() {
 try { return JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) || '[]'); }
 catch { return []; }
}
function saveLocalNotifs(notifs) {
 localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifs.slice(0, NOTIF_MAX)));
}

/* ── Merged notifications (server + local) ── */
function getNotifications() {
 // If server notifs loaded, return them (they're the source of truth)
 if (_notifLoaded && _serverNotifs.length) return _serverNotifs;
 return getLocalNotifs();
}

/* ── Add local-only notification (from polling) ── */
function addNotification(type, title, body, meta) {
 const notifs = getLocalNotifs();
 const notif = {
 id: 'local-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
 type, title, body: body || '',
 meta: meta || {},
 timestamp: new Date().toISOString(),
 created_at: new Date().toISOString(),
 is_read: 0,
 read: false
 };
 notifs.unshift(notif);
 saveLocalNotifs(notifs);
 updateNotifBadge();
 renderNotifList();
 return notif;
}

/* ── Fetch from server ── */
async function fetchServerNotifications() {
 try {
 const token = typeof getToken === 'function' ? getToken() : null;
 if (!token) return;
 const res = await fetch(API_URL + '/notifications', {
 headers: { 'Authorization': 'Bearer ' + token },
 signal: AbortSignal.timeout(5000)
 });
 const data = await res.json();
 if (data.success && Array.isArray(data.notifications)) {
 _serverNotifs = data.notifications.map(n => ({
 ...n,
 read: !!n.is_read,
 timestamp: n.created_at,
 meta: typeof n.meta === 'string' ? JSON.parse(n.meta || '{}') : (n.meta || {})
 }));
 _notifLoaded = true;
 updateNotifBadge();
 renderNotifList();
 renderInlineNotifIfOpen();
 }
 } catch(e) { /* silent */ }
}

/* ── Mark read (server + local) ── */
async function markNotifRead(notifId) {
 // Local
 const notifs = getLocalNotifs();
 const n = notifs.find(n => n.id === notifId || n.id === String(notifId));
 if (n) { n.read = true; n.is_read = 1; saveLocalNotifs(notifs); }

 // Server
 if (_serverNotifs.length) {
 const sn = _serverNotifs.find(n => n.id === notifId || n.id === Number(notifId));
 if (sn) { sn.read = true; sn.is_read = 1; }
 }

 // API call
 const numericId = String(notifId).startsWith('local-') ? null : notifId;
 if (numericId) {
 try {
 const token = typeof getToken === 'function' ? getToken() : null;
 if (token) {
 fetch(API_URL + '/notifications/' + numericId + '/read', {
 method: 'PUT',
 headers: { 'Authorization': 'Bearer ' + token }
 });
 }
 } catch(e) {}
 }

 updateNotifBadge();
 renderNotifList();
 renderInlineNotifIfOpen();
}

async function markAllRead() {
 // Local
 const notifs = getLocalNotifs();
 notifs.forEach(n => { n.read = true; n.is_read = 1; });
 saveLocalNotifs(notifs);

 // Server
 _serverNotifs.forEach(n => { n.read = true; n.is_read = 1; });

 // API
 try {
 const token = typeof getToken === 'function' ? getToken() : null;
 if (token) {
 fetch(API_URL + '/notifications/read-all', {
 method: 'PUT',
 headers: { 'Authorization': 'Bearer ' + token }
 });
 }
 } catch(e) {}

 updateNotifBadge();
 renderNotifList();
 renderInlineNotifIfOpen();
}

function clearAllNotifications() {
 saveLocalNotifs([]);
 _serverNotifs = [];
 updateNotifBadge();
 renderNotifList();
}

function getUnreadCount() {
 const notifs = getNotifications();
 return notifs.filter(n => !n.read && !n.is_read).length;
}

/* ── Badge ── */
function updateNotifBadge() {
 const count = getUnreadCount();
 document.querySelectorAll('.notif-badge-count').forEach(b => {
 b.textContent = count;
 b.style.display = count > 0 ? '' : 'none';
 });
}

/* ── Icon map ── */
function notifIcon(type) {
 const map = {
 booking: '📅', payment: '', message: '',
 reschedule: '🔄', system: '', status: ''
 };
 return map[type] || '';
}

/* ── Time ago helper ── */
function timeAgo(iso) {
 if (!iso) return '';
 const diff = (Date.now() - new Date(iso).getTime()) / 1000;
 if (diff < 60) return 'Just now';
 if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
 if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
 return Math.floor(diff / 86400) + 'd ago';
}

/* ── Render list inside drawer ── */
function renderNotifList() {
 const container = document.getElementById('notifCenterList');
 if (!container) return;

 const notifs = getNotifications();

 if (!notifs.length) {
 container.innerHTML = `
 <div class="notif-empty">
 <div style="font-size:40px; margin-bottom:12px; opacity:0.5;"></div>
 <h4>No notifications yet</h4>
 <p>You'll see booking updates, messages, and alerts here.</p>
 </div>`;
 return;
 }

 container.innerHTML = notifs.map(n => {
 const isUnread = !n.read && !n.is_read;
 return `
 <div class="notif-item ${isUnread ? 'notif-item--unread' : ''}" onclick="markNotifRead('${n.id}')">
 <div class="notif-item-icon">${notifIcon(n.type)}</div>
 <div class="notif-item-body">
 <div class="notif-item-title">${typeof escapeHtml === 'function' ? escapeHtml(n.title) : n.title}</div>
 ${n.body ? `<div class="notif-item-text">${typeof escapeHtml === 'function' ? escapeHtml(n.body) : n.body}</div>` : ''}
 <div class="notif-item-time">${timeAgo(n.timestamp || n.created_at)}</div>
 </div>
 ${isUnread ? '<div class="notif-item-dot"></div>' : ''}
 </div>`;
 }).join('');
}

/* ── Helper: re-render inline panel if it's open ── */
function renderInlineNotifIfOpen() {
 const panel = document.getElementById('panel-notifications');
 if (panel && panel.classList.contains('active') && typeof renderInlineNotifications === 'function') {
 renderInlineNotifications();
 }
}

/* ── Drawer Open/Close ── */
function openNotifCenter() {
 const drawer = document.getElementById('notifCenterDrawer');
 if (drawer) {
 drawer.classList.add('open');
 fetchServerNotifications(); // Refresh from server when opened
 renderNotifList();
 }
}

function closeNotifCenter() {
 const drawer = document.getElementById('notifCenterDrawer');
 if (drawer) drawer.classList.remove('open');
}

/* ── Init on load ── */
document.addEventListener('DOMContentLoaded', () => {
 updateNotifBadge();
 // Fetch server notifications on page load
 setTimeout(fetchServerNotifications, 1500);
 // Poll server notifications every 15 seconds
 setInterval(fetchServerNotifications, 15000);
});
