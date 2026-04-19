/* ============================================================
   ServiceSphere – Main Script
   - localStorage-based data layer (no backend required)
   - JWT-ready: will use backend API when available
   ============================================================ */

const API_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin + '/api';

console.log('Using API URL:', API_URL); // Uses the /api prefix for Vercel/Render



/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ============================================================
   AUTH HELPERS (localStorage)
   ============================================================ */
function getToken()  { return localStorage.getItem('ss_token'); }
function saveToken(t){ localStorage.setItem('ss_token', t); }
function getUser()   { return JSON.parse(localStorage.getItem('ss_user') || 'null'); }
function saveUser(u) { localStorage.setItem('ss_user', JSON.stringify(u)); }
function clearAuth() {
  localStorage.removeItem('ss_token');
  localStorage.removeItem('ss_user');
}

/* ============================================================
   CHECK AUTH (PROTECT PAGES)
   ============================================================ */
function checkAuth(requiredRole) {
  const token = getToken();
  const user  = getUser();

  if (!token || !user) {
    window.location.href = 'login.html';
    return;
  }

  if (requiredRole && user.role !== requiredRole) {
    // Redirect to correct dashboard
    if (user.role === 'customer') {
      window.location.href = 'dashboard-user.html';
    } else {
      window.location.href = 'dashboard-provider.html';
    }
  }
}

/* ============================================================
   REGISTER USER
   ============================================================ */
async function registerUser() {
  // Validate
  const name     = document.getElementById('r_name').value.trim();
  const email    = document.getElementById('r_email').value.trim();
  const phone    = document.getElementById('r_phone').value.trim();
  const password = document.getElementById('r_password').value;
  const confirm  = document.getElementById('r_confirm').value;
  const role     = document.getElementById('r_role').value;

  let valid = true;

  function showErr(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
    if (msg) valid = false;
  }

  showErr('r_name_err', name.length < 2 ? 'Please enter your full name.' : '');
  showErr('r_email_err', !email.includes('@') ? 'Enter a valid email.' : '');
  showErr('r_pass_err', password.length < 6 ? 'Password must be at least 6 characters.' : '');
  showErr('r_confirm_err', password !== confirm ? 'Passwords do not match.' : '');

  if (!valid) return;

  const userData = { name, email, phone, password, role,
    service: role === 'provider' ? (document.getElementById('r_service')?.value || '') : '',
    location: role === 'provider' ? (document.getElementById('r_location')?.value || '') : ''
  };

  const btnText    = document.getElementById('registerBtnText');
  const btnSpinner = document.getElementById('registerSpinner');
  btnText.style.display = 'none'; btnSpinner.style.display = 'inline-block';

  try {
    // Try backend first
    const res = await fetch(API_URL + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
      signal: AbortSignal.timeout(4000)
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showToast('Account created! Please sign in.', 'success');
      switchToLogin();
    } else {
      const msg = (data.errors && data.errors[0]?.msg) || data.message || 'Registration failed';
      showToast(msg, 'error');
    }

  } catch (err) {
    // ── Offline / no backend: localStorage fallback ──
    const users = JSON.parse(localStorage.getItem('ss_users') || '[]');
    if (users.find(u => u.email === email)) {
      showToast('Email already registered. Please login.', 'error');
      btnText.style.display = 'inline'; btnSpinner.style.display = 'none';
      return;
    }

    userData.id = Date.now();
    users.push(userData);
    localStorage.setItem('ss_users', JSON.stringify(users));

    showToast('Account created! Please sign in.', 'success');
    switchToLogin();
  }

  btnText.style.display = 'inline'; btnSpinner.style.display = 'none';
}

/* ============================================================
   LOGIN USER
   ============================================================ */
async function loginUser() {
  const email    = document.getElementById('l_email').value.trim();
  const password = document.getElementById('l_password').value;

  const showErr = (id, msg) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  };

  showErr('l_email_err', !email ? 'Email is required.' : '');
  showErr('l_pass_err',  !password ? 'Password is required.' : '');
  if (!email || !password) return;

  const btnText    = document.getElementById('loginBtnText');
  const btnSpinner = document.getElementById('loginSpinner');
  btnText.style.display = 'none'; btnSpinner.style.display = 'inline-block';

  try {
    // Try backend
    const res = await fetch(API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(4000)
    });

    const data = await res.json();

    if (data.success && data.token) {
      saveToken(data.token);
      saveUser(data.user);
      showToast('Welcome back, ' + data.user.name + '!', 'success');
      redirectToDashboard(data.user);
      return;
    } else {
      showToast(data.message || 'Invalid credentials.', 'error');
    }

  } catch (err) {
    // ── Offline / no backend: localStorage fallback ──
    const users = JSON.parse(localStorage.getItem('ss_users') || '[]');
    const user  = users.find(u => u.email === email && u.password === password);

    if (!user) {
      showToast('Invalid email or password.', 'error');
      btnText.style.display = 'inline'; btnSpinner.style.display = 'none';
      return;
    }

    // Generate a fake token
    const fakeToken = 'local_' + btoa(email + '_' + Date.now());
    saveToken(fakeToken);
    saveUser(user);
    showToast('Welcome back, ' + user.name + '!', 'success');

    setTimeout(() => redirectToDashboard(user), 800);
  }

  btnText.style.display = 'inline'; btnSpinner.style.display = 'none';
}

function redirectToDashboard(user) {
  if (user.role === 'customer') {
    window.location.href = 'dashboard-user.html';
  } else {
    window.location.href = 'dashboard-provider.html';
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */
function logout() {
  clearAuth();
  window.location.href = 'login.html';
}

/* ============================================================
   LOGIN TAB HELPERS
   ============================================================ */
function switchToLogin() {
  if (typeof switchAuthTab === 'function') switchAuthTab('login');
}

/* ============================================================
   BOOKINGS DATA LAYER (localStorage)
   ============================================================ */

function getBookings() {
  const user = getUser();
  if (!user) return [];
  const key = `ss_bookings_${user.id || user.email}`;
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function saveBookings(bookings) {
  const user = getUser();
  if (!user) return;
  const key = `ss_bookings_${user.id || user.email}`;
  localStorage.setItem(key, JSON.stringify(bookings));
}

/* ============================================================
   CREATE BOOKING (Customer)
   ============================================================ */
async function createBooking() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  const service  = document.getElementById('b_service')?.value;
  const provider = document.getElementById('b_provider')?.value?.trim();
  const date     = document.getElementById('b_date')?.value;
  const time     = document.getElementById('b_time')?.value;
  const address  = document.getElementById('b_address')?.value?.trim();
  const notes    = document.getElementById('b_notes')?.value?.trim();
  const name     = document.getElementById('b_name')?.value?.trim() || user.name;

  if (!service)  { showToast('Please select a service.', 'error'); return; }
  if (!date)     { showToast('Please select a date.', 'error'); return; }
  if (!time)     { showToast('Please select a time.', 'error'); return; }
  if (!address)  { showToast('Please enter your address.', 'error'); return; }

  const btnText    = document.getElementById('bookBtnText');
  const btnSpinner = document.getElementById('bookSpinner');
  if (btnText)    btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';

  const bookingData = {
    customer_name: name,
    service, provider, booking_date: date,
    booking_time: time, address, notes,
    user_id: user.id || user.email
  };

  let success = false;

  try {
    const token = getToken();
    const res = await fetch(API_URL + '/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(bookingData),
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();
    if (data.success) success = true;
  } catch (err) {
    // Local fallback
    success = true;
  }

  if (success) {
    // Always save locally for instant display
    const bookings = getBookings();
    bookings.push({
      id: Date.now(),
      ...bookingData,
      status: 'Pending',
      created_at: new Date().toISOString()
    });
    saveBookings(bookings);

    showToast('Booking confirmed! 🎉', 'success');
    renderBookings('all');

    // Reset status filter tabs
    ['all','pending','accepted','completed'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('active', t === 'all');
    });

    // Scroll to bookings
    document.getElementById('bookings')?.scrollIntoView({ behavior: 'smooth' });

    // Clear form
    if (document.getElementById('b_service'))  document.getElementById('b_service').value = '';
    if (document.getElementById('b_provider')) document.getElementById('b_provider').value = '';
    if (document.getElementById('b_address'))  document.getElementById('b_address').value = '';
    if (document.getElementById('b_notes'))    document.getElementById('b_notes').value = '';
  }

  if (btnText)    btnText.style.display = 'inline';
  if (btnSpinner) btnSpinner.style.display = 'none';
}

/* ============================================================
   CANCEL BOOKING (Customer)
   ============================================================ */
async function cancelBooking(id) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;

  // Local update
  const bookings = getBookings();
  const booking = bookings.find(b => b.id === id);
  if (booking) {
    booking.status = 'Cancelled';
    saveBookings(bookings);
  }

  // Try backend
  try {
    const token = getToken();
    await fetch(API_URL + '/booking/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
      signal: AbortSignal.timeout(4000)
    });
  } catch (e) { /* offline mode */ }

  showToast('Booking cancelled.', 'info');
  renderBookings('all');
}

/* ============================================================
   RENDER BOOKINGS (Customer Dashboard)
   ============================================================ */
function renderBookings(filter = 'all') {
  const user = getUser();
  if (!user) return;

  const container = document.getElementById('bookingsList');
  if (!container) return;

  let bookings = getBookings()
    .filter(b => (b.user_id === user.id || b.user_id === user.email))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (filter !== 'all') {
    bookings = bookings.filter(b => (b.status || 'Pending').toLowerCase() === filter);
  }

  // Update stats
  const all       = getBookings().filter(b => b.user_id === user.id || b.user_id === user.email);
  const pending   = all.filter(b => b.status === 'Pending').length;
  const accepted  = all.filter(b => b.status === 'Accepted').length;
  const completed = all.filter(b => b.status === 'Completed').length;

  setEl('totalBookings', all.length);
  setEl('pendingCnt', pending);
  setEl('acceptedCnt', accepted);
  setEl('completedCnt', completed);
  setEl('bookingsBadge', all.length);

  if (!bookings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <h4>No bookings found</h4>
        <p>${filter === 'all' ? 'Book a service below to get started.' : 'No ' + filter + ' bookings.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = bookings.map(b => {
    const status   = b.status || 'Pending';
    const badgeClass = 'badge-' + status.toLowerCase();
    const canCancel = status !== 'Completed' && status !== 'Cancelled';
    return `
    <div class="booking-card">
      <div class="booking-card-header">
        <div>
          <h3>${serviceIcon(b.service)} ${b.service}</h3>
          <div class="meta">👤 ${b.provider || 'Any Available Provider'}</div>
          <div class="meta">📅 ${formatDate(b.booking_date)} at ${formatTime(b.booking_time)}</div>
          <div class="meta">📍 ${b.address}</div>
          ${b.notes ? `<div class="meta">📝 ${b.notes}</div>` : ''}
        </div>
        <span class="badge ${badgeClass}">${status}</span>
      </div>
      <div class="actions">
        ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancel</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   RENDER PROVIDER BOOKINGS
   ============================================================ */
async function renderProviderBookings(filter = 'all') {
  const user = getUser();
  if (!user) return;

  const container = document.getElementById('providerBookingsList');
  if (!container) return;

  let bookings = [];
  
  // 1. Try fetching from Backend
  try {
    const token = getToken();
    const res = await fetch(API_URL + '/provider-bookings', {
      headers: { 'Authorization': 'Bearer ' + token },
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();
    if (data.success) {
      bookings = data.bookings;
    }
  } catch (err) {
    console.warn("Backend fetch failed, using localStorage fallback", err);
    // 2. Fallback to localStorage (ONLY if backend fails)
    const allLocal = JSON.parse(localStorage.getItem('ss_bookings') || '[]'); // Legacy check
    const userLocal = getBookings();
    bookings = [...userLocal, ...allLocal].filter(b => {
      // Strict exact name match (Case-insensitive but length-exact)
      const providerName = (b.provider || "").trim().toLowerCase();
      const currentUserName = (user.name || "").trim().toLowerCase();
      const byName = providerName !== "" && providerName === currentUserName;
      
      // Service pool match (only if no specific provider was requested)
      const noProviderRequested = !b.provider || b.provider.trim() === "";
      const byService = noProviderRequested && user.service && b.service && b.service.toLowerCase() === user.service.toLowerCase();
      
      return byName || byService;
    });
  }

  // Sort by date
  bookings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  if (filter !== 'all') {
    bookings = bookings.filter(b => (b.status || 'Pending').toLowerCase() === filter);
  }

  // Update stats
  const pending   = bookings.filter(b => b.status === 'Pending').length;
  const accepted  = bookings.filter(b => b.status === 'Accepted').length;
  const completed = bookings.filter(b => b.status === 'Completed').length;
  const cancelled = bookings.filter(b => b.status === 'Cancelled').length;

  setEl('pendingCnt', pending);
  setEl('acceptedCnt', accepted);
  setEl('completedCnt', completed);
  setEl('cancelledCnt', cancelled);
  setEl('pendingBadge', pending);

  if (!bookings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <h4>No ${filter === 'all' ? '' : filter + ' '}booking requests yet</h4>
        <p>When customers book your service, they'll appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = bookings.map(b => {
    const status     = b.status || 'Pending';
    const badgeClass = 'badge-' + status.toLowerCase();
    return `
    <div class="booking-card">
      <div class="booking-card-header">
        <div>
          <h3>${serviceIcon(b.service)} ${b.service}</h3>
          <div class="meta">👤 Customer: <strong>${b.customer_name}</strong></div>
          <div class="meta">📅 ${formatDate(b.booking_date)} at ${formatTime(b.booking_time)}</div>
          <div class="meta">📍 ${b.address}</div>
          ${b.notes ? `<div class="meta">📝 ${b.notes}</div>` : ''}
        </div>
        <span class="badge ${badgeClass}">${status}</span>
      </div>
      <div class="actions">
        ${status === 'Pending' ? `
          <button class="btn btn-success btn-sm" onclick="updateBookingStatus(${b.id}, 'Accepted')">✅ Accept</button>
          <button class="btn btn-danger btn-sm" onclick="updateBookingStatus(${b.id}, 'Cancelled')">❌ Decline</button>
        ` : ''}
        ${status === 'Accepted' ? `
          <button class="btn btn-warning btn-sm" onclick="updateBookingStatus(${b.id}, 'Completed')">✔ Mark Complete</button>
          <button class="btn btn-danger btn-sm" onclick="updateBookingStatus(${b.id}, 'Cancelled')">❌ Cancel</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   UPDATE BOOKING STATUS (Provider)
   ============================================================ */
async function updateBookingStatus(id, status) {
  // Local update
  const bookings = getBookings();
  const booking  = bookings.find(b => b.id === id);
  if (booking) {
    booking.status = status;
    saveBookings(bookings);
  }

  // Try backend (PUT request for status update)
  try {
    const token = getToken();
    await fetch(API_URL + '/booking/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(4000)
    });
  } catch (e) { /* offline */ }

  const msgs = { Accepted: 'Booking accepted! ✅', Completed: 'Marked as completed! ✔', Cancelled: 'Booking declined.' };
  showToast(msgs[status] || 'Status updated.', status === 'Cancelled' ? 'error' : 'success');
  renderProviderBookings('all');
}

/* ============================================================
   UTILITIES
   ============================================================ */
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const d = new Date(); d.setHours(h, m);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function serviceIcon(service) {
  const icons = {
    Electrician: '⚡', Plumber: '🔧', Driver: '🚗',
    Maid: '🏠', Chef: '👨‍🍳', Tutor: '📚',
    Carpenter: '🪚', Painter: '🎨', 'AC Repair': '❄️',
    Gardener: '🌿', 'Pet Care': '🐾', Security: '🛡️'
  };
  return icons[service] || '🔨';
}

/* ============================================================
   LOAD FEATURED PROVIDERS (PALETTE)
   ============================================================ */
async function loadFeaturedProviders() {
  const container = document.getElementById('featuredProvidersList');
  if (!container) return;

  try {
    const res = await fetch(API_URL + '/providers');
    const data = await res.json();
    
    if (!data.success || !data.providers || !data.providers.length) {
      container.innerHTML = '<div class="loader-box">Join us to be our first featured provider!</div>';
      return;
    }

    container.innerHTML = data.providers.slice(0, 8).map(p => `
      <div class="provider-card">
        <div class="provider-header">
          <div class="provider-avatar">${serviceIcon(p.service)}</div>
          <div>
            <div class="provider-name">${p.name}</div>
            <div class="provider-type">${p.service || 'Professional'}</div>
          </div>
        </div>
        <div class="provider-rating">★ 4.9 <span style="color:var(--text-muted);font-weight:400">(New)</span></div>
        <div class="provider-detail">📍 ${p.location || 'Mumbai'}</div>
        <div class="provider-badge">✓ Verified</div>
        <button class="btn btn-primary btn-block" onclick="bookProvider('${p.service}','${p.name}')">Book Now</button>
      </div>
    `).join('');

  } catch (err) {
    console.warn("Could not load providers showcase", err);
  }
}

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('featuredProvidersList')) loadFeaturedProviders();
  if (document.getElementById('bookingsList')) renderCustomerBookings();
  if (document.getElementById('providerBookingsList')) renderProviderBookings();
});
