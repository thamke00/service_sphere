/* ============================================================
   ServiceSphere – Bookings Module
   Data layer, create/cancel/render bookings, provider bookings,
   status updates, reschedule, and calendar.
   Depends on: utils.js, auth.js
   ============================================================ */

/* ============================================================
   BOOKINGS DATA LAYER (MySQL via API)
   ============================================================ */
let _bookingsCache = [];
let _bookingsFilter = 'all';
let _providerBookingsFilter = 'all';
let _providerServiceFilter = '';
let _allProvidersCache = [];

async function fetchBookingsFromAPI() {
  const token = getToken();
  try {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await apiFetch(API_URL + '/bookings', {
      headers,
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

    ['all','pending','accepted','completed','cancelled'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('active', t === 'all');
    });

    document.getElementById('bookings')?.scrollIntoView({ behavior: 'smooth' });

    if (document.getElementById('b_service'))  document.getElementById('b_service').value = '';
    if (document.getElementById('b_address'))  document.getElementById('b_address').value = '';
    if (document.getElementById('b_notes'))    document.getElementById('b_notes').value = '';
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
  const cancelled = all.filter(b => b.status === 'Cancelled').length;

  setEl('totalBookings', all.length);
  setEl('pendingCnt', pending);
  setEl('acceptedCnt', accepted);
  setEl('completedCnt', completed);
  setEl('cancelledCnt', cancelled);
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
    const canPay = !isPaid && status !== 'Cancelled';
    const hasReview = !!b.review_id;
    const canReview = status === 'Completed' && !hasReview;

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
            ${hasReview ? `<span class="badge badge-review" title="${escapeHtml(b.review_text || '')}">${renderStarRating(b.review_rating, 5, 'xs')} ${b.review_rating}/5</span>` : ''}
          </div>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #fff;">₹${b.amount || '499.00'}</div>
      </div>
      <div class="actions">
        ${status !== 'Cancelled' ? `<button class="btn btn-ghost btn-sm" onclick="openChatDrawer(${b.id}, '${escapeHtml((b.provider || 'Provider').replace(/'/g, "\\\\'"))}', '${escapeHtml((b.service || '').replace(/'/g, "\\\\'"))}', ${b.provider_id || 'null'})">💬 Message</button>` : ''}
        ${canCancel ? `<button class="btn btn-ghost btn-sm" onclick="openRescheduleModal(${b.id}, '${b.booking_date || ''}', '${b.booking_time || ''}')">📅 Reschedule</button>` : ''}
        ${canReview ? `<button class="btn btn-review btn-sm" onclick="openReviewModal(${b.id}, '${escapeHtml((b.provider || 'Provider').replace(/'/g, "\\\\'"))}', '${escapeHtml((b.service || '').replace(/'/g, "\\\\'"))}')">⭐ Leave Review</button>` : ''}
        ${canPay ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal(${b.id}, ${parseFloat(b.amount) || 499})">💳 Pay Now</button>` : ''}
        ${isPaid ? `<span class="badge badge-completed" style="padding:6px 12px;">✅ Paid</span>` : ''}
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
    const allLocal = JSON.parse(localStorage.getItem('ss_bookings') || '[]');
    const userLocal = getBookings();
    bookings = [...userLocal, ...allLocal].filter(b => {
      const providerName = (b.provider || "").trim().toLowerCase();
      const currentUserName = (user.name || "").trim().toLowerCase();
      const byName = providerName !== "" && providerName === currentUserName;
      
      const noProviderRequested = !b.provider || b.provider.trim() === "";
      const byService = noProviderRequested && user.service && b.service && b.service.toLowerCase() === user.service.toLowerCase();
      
      return byName || byService;
    });
  }

  bookings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  _allProviderBookingsCache = [...bookings];

  if (filter !== 'all') {
    bookings = bookings.filter(b => (b.status || 'Pending').toLowerCase() === filter);
  }

  if (_calDateFilter) {
    bookings = bookings.filter(b => {
      if (!b.booking_date) return false;
      const d = new Date(b.booking_date);
      return !isNaN(d) && d.toISOString().split('T')[0] === _calDateFilter;
    });
  }

  const all = _allProviderBookingsCache;
  const pending   = all.filter(b => b.status === 'Pending').length;
  const accepted  = all.filter(b => b.status === 'Accepted').length;
  const completed = all.filter(b => b.status === 'Completed').length;
  const cancelled = all.filter(b => b.status === 'Cancelled').length;

  setEl('provTotalBookings', all.length);
  setEl('provPendingCnt', pending);
  setEl('provAcceptedCnt', accepted);
  setEl('provCompletedCnt', completed);
  setEl('provCancelledCnt', cancelled);

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
        ${status !== 'Cancelled' ? `<button class="btn btn-ghost btn-sm" onclick="openChatDrawer(${b.id}, '${escapeHtml((b.customer_name || 'Customer').replace(/'/g, "\\\\'"))}', '${escapeHtml((b.service || '').replace(/'/g, "\\\\'"))}')">💬 Message</button>` : ''}
        ${(status === 'Pending' || status === 'Accepted') ? `<button class="btn btn-ghost btn-sm" onclick="openRescheduleModal(${b.id}, '${b.booking_date || ''}', '${b.booking_time || ''}')">📅 Reschedule</button>` : ''}
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
  await renderProviderBookings(_providerBookingsFilter);
  if (typeof renderProviderCalendar === 'function') renderProviderCalendar();
}

/* ============================================================
   RESCHEDULE BOOKING
   ============================================================ */
function openRescheduleModal(bookingId, currentDate, currentTime) {
  document.getElementById('rescheduleBookingId').value = bookingId;
  if (currentDate) {
    const d = new Date(currentDate);
    if (!isNaN(d)) {
      document.getElementById('rescheduleDate').value = d.toISOString().split('T')[0];
    }
  }
  document.getElementById('rescheduleTime').value = currentTime || '';
  document.getElementById('rescheduleModal').classList.add('open');
  document.getElementById('rescheduleDate').min = new Date().toISOString().split('T')[0];
}

function closeRescheduleModal() {
  document.getElementById('rescheduleModal').classList.remove('open');
}

async function submitReschedule() {
  const bookingId = document.getElementById('rescheduleBookingId').value;
  const newDate = document.getElementById('rescheduleDate').value;
  const newTime = document.getElementById('rescheduleTime').value;

  if (!newDate || !newTime) {
    showToast('Please select both date and time.', 'error');
    return;
  }

  const btn = document.getElementById('rescheduleSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Rescheduling…';

  try {
    const res = await apiFetch(API_URL + '/booking/' + bookingId + '/reschedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ booking_date: newDate, booking_time: newTime }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Reschedule failed', 'error');
      return;
    }
    showToast('Booking rescheduled successfully! 📅', 'success');
    closeRescheduleModal();
    if (typeof renderProviderBookings === 'function' && document.getElementById('providerBookingsList')) {
      await renderProviderBookings(_providerBookingsFilter);
      if (typeof renderProviderCalendar === 'function') renderProviderCalendar();
    }
    if (typeof renderBookings === 'function' && document.getElementById('bookingsList')) {
      await renderBookings(_bookingsFilter);
    }
  } catch (e) {
    showToast('Could not reach server.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Confirm Reschedule';
  }
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'rescheduleModal') closeRescheduleModal();
});

/* ============================================================
   PROVIDER BOOKING CALENDAR
   ============================================================ */
let _calYear, _calMonth;

function renderProviderCalendar(year, month) {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  if (!grid || !label) return;

  const now = new Date();
  if (year === undefined) year = _calYear || now.getFullYear();
  if (month === undefined) month = _calMonth !== undefined ? _calMonth : now.getMonth();
  _calYear = year;
  _calMonth = month;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent = months[month] + ' ' + year;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().split('T')[0];

  const bookings = _allProviderBookingsCache || [];
  const dayMap = {};
  bookings.forEach(b => {
    if (!b.booking_date) return;
    const d = new Date(b.booking_date);
    if (isNaN(d)) return;
    const key = d.toISOString().split('T')[0];
    if (!dayMap[key]) dayMap[key] = [];
    dayMap[key].push({ status: b.status || 'Pending', service: b.service, customer: b.customer_name });
  });

  let html = '';
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-cell cal-cell--empty"></div>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const dayBookings = dayMap[dateStr] || [];
    const hasBookings = dayBookings.length > 0;

    let dotsHtml = '';
    if (hasBookings) {
      const statusSet = [...new Set(dayBookings.map(b => b.status.toLowerCase()))];
      dotsHtml = '<div class="cal-dots">' + statusSet.slice(0, 4).map(s => `<span class="cal-dot cal-dot--${s}"></span>`).join('') + '</div>';
    }

    html += `<div class="cal-cell${isToday ? ' cal-cell--today' : ''}${hasBookings ? ' cal-cell--has-bookings' : ''}" onclick="filterProviderBookingsByDate('${dateStr}')" title="${hasBookings ? dayBookings.length + ' booking(s)' : 'No bookings'}">
      <span class="cal-day-num">${day}</span>
      ${hasBookings ? `<span class="cal-count">${dayBookings.length}</span>` : ''}
      ${dotsHtml}
    </div>`;
  }

  grid.innerHTML = html;
}

function navigateCalendar(direction) {
  let m = _calMonth + direction;
  let y = _calYear;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  renderProviderCalendar(y, m);
}

let _allProviderBookingsCache = [];
let _calDateFilter = null;

function filterProviderBookingsByDate(dateStr) {
  _calDateFilter = dateStr;
  const d = new Date(dateStr);
  const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const filterEl = document.getElementById('calActiveFilter');
  const filterLabel = document.getElementById('calFilterLabel');
  if (filterEl) filterEl.style.display = 'flex';
  if (filterLabel) filterLabel.textContent = 'Showing: ' + label;
  renderProviderBookings(_providerBookingsFilter);
}

function clearCalendarFilter() {
  _calDateFilter = null;
  const filterEl = document.getElementById('calActiveFilter');
  if (filterEl) filterEl.style.display = 'none';
  renderProviderBookings(_providerBookingsFilter);
}
