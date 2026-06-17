/* ============================================================
   ServiceSphere – Main Script
   - localStorage-based data layer (no backend required)
   - JWT-ready: will use backend API when available
   ============================================================ */

const API_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin + '/api';

console.log('Using API URL:', API_URL);



/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.innerHTML = `<span>${icons[type]}</span>`;
  toast.appendChild(msgSpan);
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

// Decode a JWT and check if it has expired (no library needed)
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now(); // exp is in seconds
  } catch (e) {
    return true; // treat malformed tokens as expired
  }
}

// Central fetch wrapper — auto-logs out on 401 Unauthorized
async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    clearAuth();
    window.location.href = 'login.html';
    throw new Error('Session expired');
  }
  return response;
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

  // Auto-logout if the JWT has expired
  if (isTokenExpired(token)) {
    clearAuth();
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
    location: role === 'provider' ? (document.getElementById('r_location')?.value || '') : '',
    address_line: role === 'provider' ? (document.getElementById('r_address')?.value?.trim() || '') : '',
    city: role === 'provider' ? (document.getElementById('r_city')?.value?.trim() || '') : '',
    pincode: role === 'provider' ? (document.getElementById('r_pincode')?.value?.trim() || '') : '',
    aadhaar_proof: role === 'provider' ? (window._aadhaarBase64 || '') : ''
  };

  if (role === 'provider') {
    userData.location = [userData.address_line, userData.city, userData.pincode].filter(Boolean).join(', ');
    if (!userData.service) { showErr('r_service_err', 'Select a service category.'); valid = false; }
    if (!userData.address_line || userData.address_line.length < 5) { showErr('r_address_err', 'Enter your full street address.'); valid = false; }
    if (!userData.city || userData.city.length < 2) { showErr('r_city_err', 'Enter your city.'); valid = false; }
    if (!/^\d{6}$/.test(userData.pincode)) { showErr('r_pincode_err', 'Enter a valid 6-digit pincode.'); valid = false; }
    if (!userData.aadhaar_proof) { showErr('r_aadhaar_err', 'Upload your Aadhaar photo.'); valid = false; }
    if (!valid) return;
  }

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
   BOOKINGS DATA LAYER (MySQL via API)
   ============================================================ */
let _bookingsCache = [];
let _bookingsFilter = 'all';
let _providerBookingsFilter = 'all';
let _providerServiceFilter = '';  // for service filter tabs
let _allProvidersCache = [];     // cached full provider list

async function fetchBookingsFromAPI() {
  const token = getToken();
  if (!token) return [];
  try {
    const res = await apiFetch(API_URL + '/bookings', {
      headers: { 'Authorization': 'Bearer ' + token },
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.bookings)) {
      _bookingsCache = data.bookings;
      return _bookingsCache;
    }
  } catch (e) {
    console.warn('Could not load bookings from API', e);
  }
  return _bookingsCache;
}

function getBookings() {
  return _bookingsCache;
}

/* ============================================================
   CREATE BOOKING (Customer)
   ============================================================ */
async function createBooking() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  const service  = document.getElementById('b_service')?.value;
  const rawProviderInput = document.getElementById('b_provider')?.value?.trim();
  const date     = document.getElementById('b_date')?.value;
  const time     = document.getElementById('b_time')?.value;
  const address  = document.getElementById('b_address')?.value?.trim();
  const notes    = document.getElementById('b_notes')?.value?.trim();
  const name     = document.getElementById('b_name')?.value?.trim() || user.name;

  if (!service)  { showToast('Please select a service.', 'error'); return; }
  if (!date)     { showToast('Please select a date.', 'error'); return; }
  if (!time)     { showToast('Please select a time.', 'error'); return; }
  if (!address)  { showToast('Please enter your address.', 'error'); return; }

  // ── Provider validation ──
  // If the user typed something but did NOT select from the dropdown, block them
  const providerPill = document.getElementById('providerSelectedPill');
  const providerConfirmed = providerPill && providerPill.style.display !== 'none';
  if (!providerConfirmed && rawProviderInput) {
    showToast('⚠️ Please select a provider from the dropdown, or choose "Any Available Provider".', 'error');
    document.getElementById('b_provider')?.focus();
    if (typeof setValidationMsg === 'function') {
      setValidationMsg('error', '❌ Please select from the list — or clear and choose "Any Available Provider"');
    }
    return;
  }

  // Determine final provider name (empty string = "any available")
  const pillText = document.getElementById('providerPillText')?.textContent || '';
  const isAny = pillText === 'Any Available Provider';
  const provider = providerConfirmed && !isAny ? rawProviderInput : '';

  const btnText    = document.getElementById('bookBtnText');
  const btnSpinner = document.getElementById('bookSpinner');
  if (btnText)    btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';

  const bookingData = {
    customer_name: name,
    service, provider, booking_date: date,
    booking_time: time, address, notes,
    provider_id: window._selectedProviderId || null,
    user_id: user.id || user.email
  };

  let success = false;

  try {
    const token = getToken();
    const res = await apiFetch(API_URL + '/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(bookingData),
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (data.success) {
      success = true;
      await fetchBookingsFromAPI();
    } else {
      showToast(data.message || 'Booking failed', 'error');
    }
  } catch (err) {
    showToast('Could not reach server. Check your connection.', 'error');
  }

  if (success) {
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
    if (document.getElementById('b_address'))  document.getElementById('b_address').value = '';
    if (document.getElementById('b_notes'))    document.getElementById('b_notes').value = '';
    // Reset provider autocomplete fully
    const _pill  = document.getElementById('providerSelectedPill');
    const _input = document.getElementById('b_provider');
    if (_pill)  _pill.style.display = 'none';
    if (_input) { _input.value = ''; _input.style.display = ''; }
    window._selectedProviderId = null;
  }

  if (btnText)    btnText.style.display = 'inline';
  if (btnSpinner) btnSpinner.style.display = 'none';
}

/* ============================================================
   CANCEL BOOKING (Customer)
   ============================================================ */
async function cancelBooking(id) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;

  try {
    const token = getToken();
    const res = await apiFetch(API_URL + '/booking/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (data.success) {
      await fetchBookingsFromAPI();
      showToast('Booking cancelled.', 'info');
      renderBookings(_bookingsFilter);
    } else {
      showToast(data.message || 'Could not cancel', 'error');
    }
  } catch (e) {
    showToast('Could not reach server.', 'error');
  }
}

/* ============================================================
   RENDER BOOKINGS (Customer Dashboard)
   ============================================================ */
async function renderBookings(filter = 'all') {
  const user = getUser();
  if (!user) return;

  const container = document.getElementById('bookingsList');
  if (!container) return;

  _bookingsFilter = filter;
  container.innerHTML = '<div class="loader-box">Loading your bookings…</div>';

  await fetchBookingsFromAPI();

  let bookings = getBookings().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (filter !== 'all') {
    bookings = bookings.filter(b => (b.status || 'Pending').toLowerCase() === filter);
  }

  const all = getBookings();
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
    const isPaid = b.payment_status === 'Paid';
    const payBadgeClass = isPaid ? 'badge-completed' : 'badge-pending';
    const payStatusText = isPaid ? '💳 Paid' : '💳 Unpaid';
    
    const canCancel = status !== 'Completed' && status !== 'Cancelled';
    const canPay = !isPaid && status !== 'Cancelled' && status !== 'Completed';

    return `
    <div class="booking-card">
      <div class="booking-card-header">
        <div>
          <h3>${serviceIcon(b.service)} ${escapeHtml(b.service)}</h3>
          <div class="meta">👤 ${escapeHtml(b.provider || 'Any Available Provider')}${b.provider_id ? ' <span style="color:var(--primary-light);font-size:11px;">(@' + escapeHtml(b.provider_username || 'provider') + ')</span>' : ''}</div>
          <div class="meta">📅 ${formatDate(b.booking_date)} at ${formatTime(b.booking_time)}</div>
          <div class="meta">📍 ${escapeHtml(b.address)}</div>
          ${b.notes ? `<div class="meta">📝 ${escapeHtml(b.notes)}</div>` : ''}
          <div class="meta" style="margin-top: 8px;">
            <span class="badge ${badgeClass}">${status}</span>
            <span class="badge ${payBadgeClass}">${payStatusText}</span>
          </div>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #fff;">₹${b.amount || '499.00'}</div>
      </div>
      <div class="actions">
        ${status !== 'Cancelled' && status !== 'Completed' ? `<button class="btn btn-ghost btn-sm" onclick="openChatDrawer(${b.id}, '${(b.provider || 'Provider').replace(/'/g, "\\'")}', '${(b.service || '').replace(/'/g, "\\'")}', ${b.provider_id || 'null'})">💬 Message</button>` : ''}
        ${canPay ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal(${b.id}, ${parseFloat(b.amount) || 499})">💳 Pay Now</button>` : ''}
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

  _providerBookingsFilter = filter;
  container.innerHTML = '<div class="loader-box">Loading booking requests…</div>';

  let bookings = [];
  
  // 1. Try fetching from Backend
  try {
    const token = getToken();
    const res = await apiFetch(API_URL + '/provider-bookings', {
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
    const isPaid = b.payment_status === 'Paid';
    const payBadgeClass = isPaid ? 'badge-completed' : 'badge-pending';
    const payStatusText = isPaid ? '💳 Paid' : '💳 Unpaid';

    return `
    <div class="booking-card">
      <div class="booking-card-header">
        <div>
          <h3>${serviceIcon(b.service)} ${escapeHtml(b.service)}</h3>
          <div class="meta">👤 Customer: <strong>${escapeHtml(b.customer_name)}</strong></div>
          <div class="meta">📅 ${formatDate(b.booking_date)} at ${formatTime(b.booking_time)}</div>
          <div class="meta">📍 ${escapeHtml(b.address)}</div>
          ${b.notes ? `<div class="meta">📝 ${escapeHtml(b.notes)}</div>` : ''}
          <div class="meta" style="margin-top: 8px;">
            <span class="badge ${badgeClass}">${status}</span>
            <span class="badge ${payBadgeClass}">${payStatusText}</span>
          </div>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #fff;">₹${b.amount || '499.00'}</div>
      </div>
      <div class="actions">
        ${status !== 'Cancelled' && status !== 'Completed' ? `<button class="btn btn-ghost btn-sm" onclick="openChatDrawer(${b.id}, '${(b.customer_name || 'Customer').replace(/'/g, "\\'")}', '${(b.service || '').replace(/'/g, "\\'")}')">💬 Message</button>` : ''}
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
  const user = getUser();
  if (user?.verification_status === 'pending') {
    showToast('Your account is pending verification. You cannot accept bookings yet.', 'error');
    return;
  }

  try {
    const token = getToken();
    const res = await apiFetch(API_URL + '/booking/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Update failed', 'error');
      return;
    }
  } catch (e) {
    showToast('Could not reach server.', 'error');
    return;
  }

  const msgs = { Accepted: 'Booking accepted! ✅', Completed: 'Marked as completed! ✔', Cancelled: 'Booking declined.' };
  showToast(msgs[status] || 'Status updated.', status === 'Cancelled' ? 'error' : 'success');
  renderProviderBookings(_providerBookingsFilter);
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
   LOAD FEATURED PROVIDERS (index page)
   ============================================================ */
async function loadFeaturedProviders(serviceFilter) {
  const container = document.getElementById('featuredProvidersList');
  if (!container) return;

  // Build service filter tabs if not already present
  const filterBar = document.getElementById('providerFilterBar');
  if (filterBar && !filterBar.children.length) {
    const services = ['All', 'Electrician', 'Plumber', 'Driver', 'Maid', 'Chef', 'Tutor', 'Carpenter', 'Painter', 'AC Repair', 'Gardener', 'Pet Care', 'Security'];
    filterBar.innerHTML = services.map(s => `<button class="tab-btn${s === 'All' ? ' active' : ''}" onclick="filterProvidersByService('${s === 'All' ? '' : s}')">${s}</button>`).join('');
  }

  const activeFilter = serviceFilter || _providerServiceFilter || '';
  let url = API_URL + '/providers';
  if (activeFilter) url += '?service=' + encodeURIComponent(activeFilter);

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success || !data.providers || !data.providers.length) {
      container.innerHTML = '<div class="loader-box">' + (activeFilter ? 'No providers found for ' + escapeHtml(activeFilter) + '.' : 'Join us to be our first featured provider!') + '</div>';
      return;
    }

    _allProvidersCache = data.providers;

    container.innerHTML = data.providers.slice(0, 12).map(p => `
      <div class="provider-card">
        <div class="provider-header">
          <div class="provider-avatar">${serviceIcon(p.service)}</div>
          <div>
            <div class="provider-name">${escapeHtml(p.name)}</div>
            <div class="provider-type">${escapeHtml(p.service || 'Professional')}${p.username ? ' · <span style="color:var(--primary-light);">@' + escapeHtml(p.username) + '</span>' : ''}</div>
          </div>
        </div>
        <div class="provider-detail">📍 ${escapeHtml(p.city || p.location || 'India')}${p.pincode ? ' · ' + escapeHtml(p.pincode) : ''}</div>
        <div class="provider-badge">✓ Verified</div>
        <button class="btn btn-primary btn-block" onclick="bookProvider('${(p.service || '').replace(/'/g, "\\'")}', '${(p.name || '').replace(/'/g, "\\'")}', ${p.id})">Book Now</button>
      </div>
    `).join('');

  } catch (err) {
    console.warn("Could not load providers showcase", err);
  }
}

function filterProvidersByService(service) {
  _providerServiceFilter = service;
  // Update active tab
  const filterBar = document.getElementById('providerFilterBar');
  if (filterBar) {
    filterBar.querySelectorAll('.tab-btn').forEach(btn => {
      const btnService = btn.textContent.trim();
      btn.classList.toggle('active', (service === '' && btnService === 'All') || btnService === service);
    });
  }
  loadFeaturedProviders(service);
}

/* ============================================================
   DASHBOARD PROVIDERS (user dashboard)
   ============================================================ */
async function loadDashboardProviders(serviceFilter) {
  const container = document.getElementById('recommendedProvidersList');
  if (!container) return;

  // Build service filter tabs
  const filterBar = document.getElementById('dashboardProviderFilterBar');
  if (filterBar && !filterBar.children.length) {
    const services = ['All', 'Electrician', 'Plumber', 'Driver', 'Maid', 'Chef', 'Tutor', 'Carpenter', 'Painter', 'AC Repair', 'Gardener', 'Pet Care', 'Security'];
    filterBar.innerHTML = services.map(s => `<button class="tab-btn${s === 'All' ? ' active' : ''}" onclick="filterDashboardProviders('${s === 'All' ? '' : s}')">${s}</button>`).join('');
  }

  const activeFilter = serviceFilter || '';
  let url = API_URL + '/providers';
  if (activeFilter) url += '?service=' + encodeURIComponent(activeFilter);

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success || !data.providers?.length) {
      container.innerHTML = '<div class="empty-state"><p>' + (activeFilter ? 'No providers for ' + escapeHtml(activeFilter) + ' yet.' : 'No verified providers yet. Check back soon!') + '</p></div>';
      return;
    }
    container.innerHTML = data.providers.slice(0, 12).map(p => `
      <div class="provider-card">
        <div class="provider-header">
          <div class="provider-avatar">${serviceIcon(p.service)}</div>
          <div>
            <div class="provider-name">${escapeHtml(p.name)}</div>
            <div class="provider-type">${escapeHtml(p.service || 'Professional')}${p.username ? ' · <span style="color:var(--primary-light);">@' + escapeHtml(p.username) + '</span>' : ''}</div>
          </div>
        </div>
        <div class="provider-detail">📍 ${escapeHtml(p.city || p.location || 'India')}${p.pincode ? ' · ' + escapeHtml(p.pincode) : ''}</div>
        <div class="provider-badge">✓ Verified</div>
        <button class="btn btn-primary btn-block btn-sm" onclick="prefillBooking('${(p.service || '').replace(/'/g, "\\'")}', '${(p.name || '').replace(/'/g, "\\'")}', ${p.id})">Book Now</button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="loader-box">Could not load providers.</div>';
  }
}

function filterDashboardProviders(service) {
  const filterBar = document.getElementById('dashboardProviderFilterBar');
  if (filterBar) {
    filterBar.querySelectorAll('.tab-btn').forEach(btn => {
      const btnService = btn.textContent.trim();
      btn.classList.toggle('active', (service === '' && btnService === 'All') || btnService === service);
    });
  }
  loadDashboardProviders(service);
}

/* ============================================================
   BOOKING CHAT (user ↔ provider)
   ============================================================ */
let activeChatBookingId = null;
let chatPollInterval = null;

async function openChatDrawer(bookingId, partnerName, service, providerId) {
  activeChatBookingId = bookingId;
  const drawer = document.getElementById('chatDrawer');
  if (!drawer) return;
  document.getElementById('chatPartnerName').textContent = partnerName || 'Chat';
  document.getElementById('chatPartnerService').textContent = service || '';
  // Try to show username in chat header
  if (providerId) {
    try {
      const res = await fetch(API_URL + '/provider/' + providerId);
      const data = await res.json();
      if (data.success && data.provider?.username) {
        document.getElementById('chatPartnerName').textContent = partnerName + ' @' + data.provider.username;
      }
    } catch(e) {}
  }
  drawer.classList.add('open');
  await loadChatMessages();
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(loadChatMessages, 5000);
}

function closeChatDrawer() {
  document.getElementById('chatDrawer')?.classList.remove('open');
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = null;
  activeChatBookingId = null;
}

async function loadChatMessages() {
  if (!activeChatBookingId) return;
  const box = document.getElementById('chatMessages');
  const user = getUser();
  if (!box || !user) return;

  try {
    const res = await apiFetch(API_URL + '/chats/' + activeChatBookingId, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (!data.success) {
      box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;">Could not load messages.</div>';
      return;
    }
    if (!data.messages?.length) {
      box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;margin:auto;">No messages yet. Say hello!</div>';
      return;
    }
    box.innerHTML = data.messages.map(m => {
      const isMine = m.sender_id === user.id;
      const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="chat-msg ${isMine ? 'outgoing' : 'incoming'}">${escapeHtml(m.message)}<div class="chat-msg-time">${time}</div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;">Connection error.</div>';
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text || !activeChatBookingId) return;

  try {
    const res = await apiFetch(API_URL + '/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ booking_id: activeChatBookingId, message: text }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      await loadChatMessages();
    } else {
      showToast(data.message || 'Could not send', 'error');
    }
  } catch (e) {
    showToast('Could not send message.', 'error');
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function handleAadhaarUpload(input) {
  const file = input.files?.[0];
  const errEl = document.getElementById('r_aadhaar_err');
  window._aadhaarBase64 = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    if (errEl) errEl.textContent = 'Please upload an image (JPG/PNG).';
    input.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Image must be under 2MB.';
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    window._aadhaarBase64 = reader.result;
    const preview = document.getElementById('aadhaarPreview');
    if (preview) {
      preview.style.display = 'block';
      preview.textContent = '✓ ' + file.name + ' uploaded';
    }
    if (errEl) errEl.textContent = '';
  };
  reader.readAsDataURL(file);
}

// Global Initialization
// Note: renderBookings/renderProviderBookings are called by each dashboard's own DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('featuredProvidersList')) loadFeaturedProviders();
  if (document.getElementById('recommendedProvidersList')) loadDashboardProviders();
});

/* ============================================================
   PAYMENTS FUNCTIONALITY
   ============================================================ */
let activePaymentBookingId = null;
let activePaymentAmount = 499.00;
let activePaymentMethod = 'card';

function openPaymentModal(bookingId, amount) {
  activePaymentBookingId = bookingId;
  activePaymentAmount = amount || 499.00;
  
  // Set amount display
  const amtEl = document.getElementById('paymentAmount');
  if (amtEl) amtEl.textContent = '₹' + activePaymentAmount.toFixed(2);
  
  // Reset form views
  const successView = document.getElementById('paymentSuccessView');
  const formView = document.getElementById('paymentFormView');
  if (successView) successView.style.display = 'none';
  if (formView) formView.style.display = 'block';
  
  // Reset fields
  resetPaymentFields();
  
  // Open modal
  const overlay = document.getElementById('paymentModalOverlay');
  if (overlay) overlay.classList.add('open');
}

function closePaymentModal() {
  const overlay = document.getElementById('paymentModalOverlay');
  if (overlay) overlay.classList.remove('open');
  activePaymentBookingId = null;
}

function switchPaymentMethod(method) {
  activePaymentMethod = method;
  const cardBtn = document.getElementById('payMethodCard');
  const upiBtn = document.getElementById('payMethodUpi');
  const cardFields = document.getElementById('cardPaymentFields');
  const upiFields = document.getElementById('upiPaymentFields');
  
  if (method === 'card') {
    cardBtn?.classList.add('active');
    upiBtn?.classList.remove('active');
    if (cardFields) cardFields.style.display = 'block';
    if (upiFields) upiFields.style.display = 'none';
  } else {
    cardBtn?.classList.remove('active');
    upiBtn?.classList.add('active');
    if (cardFields) cardFields.style.display = 'none';
    if (upiFields) upiFields.style.display = 'block';
  }
}

function resetPaymentFields() {
  // Card
  const cardName = document.getElementById('cardNameInput');
  const cardNumber = document.getElementById('cardNumberInput');
  const cardExpiry = document.getElementById('cardExpiryInput');
  const cardCvv = document.getElementById('cardCvvInput');
  if (cardName) cardName.value = '';
  if (cardNumber) cardNumber.value = '';
  if (cardExpiry) cardExpiry.value = '';
  if (cardCvv) cardCvv.value = '';
  
  // UPI
  const upiId = document.getElementById('upiIdInput');
  if (upiId) upiId.value = '';
  
  // Method
  switchPaymentMethod('card');
  updateCardPreview();
}

function updateCardPreview() {
  const cardName = document.getElementById('cardNameInput')?.value || '';
  const cardNumber = document.getElementById('cardNumberInput')?.value || '';
  const cardExpiry = document.getElementById('cardExpiryInput')?.value || '';
  
  // Logo check based on card prefix
  const previewLogo = document.getElementById('previewCardLogo');
  if (previewLogo) {
    if (cardNumber.startsWith('4')) {
      previewLogo.textContent = 'VISA';
    } else if (cardNumber.startsWith('5')) {
      previewLogo.textContent = 'MASTERCARD';
    } else if (cardNumber.startsWith('3')) {
      previewLogo.textContent = 'AMEX';
    } else {
      previewLogo.textContent = 'CARD';
    }
  }
  
  // Format Card Number (space every 4 digits)
  const cleanNumber = cardNumber.replace(/\s?/g, '').replace(/[^0-9]/g, '');
  let formattedNumber = '';
  for (let i = 0; i < cleanNumber.length; i++) {
    if (i > 0 && i % 4 === 0) formattedNumber += ' ';
    formattedNumber += cleanNumber[i];
  }
  
  const cardNumberInput = document.getElementById('cardNumberInput');
  if (cardNumberInput && cardNumber !== formattedNumber) {
    cardNumberInput.value = formattedNumber;
  }
  
  const previewNumber = document.getElementById('previewCardNumber');
  if (previewNumber) {
    previewNumber.textContent = formattedNumber || '•••• •••• •••• ••••';
  }
  
  // Cardholder name
  const previewName = document.getElementById('previewCardName');
  if (previewName) {
    previewName.textContent = cardName.toUpperCase() || 'YOUR NAME';
  }
  
  // Expiry date format MM/YY
  const expiryInput = document.getElementById('cardExpiryInput');
  if (expiryInput) {
    let expiryVal = expiryInput.value.replace(/\D/g, '');
    if (expiryVal.length > 2) {
      expiryVal = expiryVal.substring(0, 2) + '/' + expiryVal.substring(2, 4);
    }
    if (expiryInput.value !== expiryVal) {
      expiryInput.value = expiryVal;
    }
    const previewExpiry = document.getElementById('previewCardExpiry');
    if (previewExpiry) {
      previewExpiry.textContent = expiryVal || 'MM/YY';
    }
  }
}

async function submitPayment() {
  if (!activePaymentBookingId) return;
  
  // Validation
  let paymentDetails = {};
  if (activePaymentMethod === 'card') {
    const cardName = document.getElementById('cardNameInput')?.value?.trim();
    const cardNumber = document.getElementById('cardNumberInput')?.value?.replace(/\s/g, '');
    const cardExpiry = document.getElementById('cardExpiryInput')?.value?.trim();
    const cardCvv = document.getElementById('cardCvvInput')?.value?.trim();
    
    if (!cardName) { showToast('Cardholder name is required', 'error'); return; }
    if (!cardNumber || cardNumber.length < 16) { showToast('Valid card number is required', 'error'); return; }
    if (!cardExpiry || !cardExpiry.includes('/')) { showToast('Expiry date is required (MM/YY)', 'error'); return; }
    if (!cardCvv || cardCvv.length < 3) { showToast('Valid CVV is required', 'error'); return; }
    
    paymentDetails = {
      payment_method: 'Card',
      transaction_id: 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      amount: activePaymentAmount
    };
  } else {
    const upiId = document.getElementById('upiIdInput')?.value?.trim();
    if (!upiId || !upiId.includes('@')) { showToast('Valid UPI ID is required (e.g. user@upi)', 'error'); return; }
    
    paymentDetails = {
      payment_method: 'UPI',
      transaction_id: 'TXN-UPI-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      amount: activePaymentAmount
    };
  }
  
  const submitBtn = document.getElementById('paymentSubmitBtn');
  const btnText = document.getElementById('paymentSubmitBtnText');
  const btnSpinner = document.getElementById('paymentSubmitSpinner');
  
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';
  
  let apiSuccess = false;
  
  try {
    const token = getToken();
    const res = await apiFetch(API_URL + '/booking/' + activePaymentBookingId + '/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(paymentDetails),
      signal: AbortSignal.timeout(4000)
    });
    
    const data = await res.json();
    if (data.success) {
      apiSuccess = true;
    } else {
      console.warn("Backend payment failed:", data.message);
    }
  } catch (err) {
    console.warn("Backend payment connection failed, running fallback:", err);
  }
  
  if (apiSuccess) await fetchBookingsFromAPI();

  // Show checkmark view
  const formView = document.getElementById('paymentFormView');
  const successView = document.getElementById('paymentSuccessView');
  if (formView) formView.style.display = 'none';
  if (successView) successView.style.display = 'flex';
  
  if (apiSuccess) {
    showToast('Payment successful! 🎉', 'success');
  } else {
    showToast('Offline: Payment processed locally.', 'info');
  }
  
  renderBookings(_bookingsFilter);
  
  // Restore button state
  if (submitBtn) submitBtn.disabled = false;
  if (btnText) btnText.style.display = 'inline';
  if (btnSpinner) btnSpinner.style.display = 'none';
  
  // Close modal after 2 seconds
  setTimeout(() => {
    closePaymentModal();
  }, 2000);
}
