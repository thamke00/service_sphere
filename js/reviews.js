/* ============================================================
 ServiceSphere – Reviews Module
 Star rating UI, review modal, provider reviews drawer.
 Depends on: utils.js, auth.js
 ============================================================ */

let _activeReviewBookingId = null;
let _activeReviewRating = 0;

/* ============================================================
 STAR RATING HTML HELPER
 ============================================================ */
function renderStarRating(rating, maxStars = 5, size = 'md') {
 const sizeClass = `star-rating--${size}`;
 let html = `<span class="star-rating ${sizeClass}">`;
 for (let i = 1; i <= maxStars; i++) {
 if (i <= Math.floor(rating)) {
 html += '<span class="star star--filled">★</span>';
 } else if (i - 0.5 <= rating) {
 html += '<span class="star star--half">★</span>';
 } else {
 html += '<span class="star star--empty">★</span>';
 }
 }
 html += '</span>';
 return html;
}

/* ============================================================
 INTERACTIVE STAR PICKER (for review modal)
 ============================================================ */
function renderStarPicker() {
 const container = document.getElementById('reviewStarPicker');
 if (!container) return;

 let html = '';
 for (let i = 1; i <= 5; i++) {
 html += `<span class="star-pick star-pick--empty" data-rating="${i}" 
 onmouseenter="previewStars(${i})" 
 onmouseleave="restoreStars()" 
 onclick="selectStarRating(${i})">★</span>`;
 }
 container.innerHTML = html;
 _activeReviewRating = 0;
}

function previewStars(n) {
 const stars = document.querySelectorAll('#reviewStarPicker .star-pick');
 stars.forEach((s, i) => {
 s.classList.toggle('star-pick--filled', i < n);
 s.classList.toggle('star-pick--empty', i >= n);
 });
}

function restoreStars() {
 const stars = document.querySelectorAll('#reviewStarPicker .star-pick');
 stars.forEach((s, i) => {
 s.classList.toggle('star-pick--filled', i < _activeReviewRating);
 s.classList.toggle('star-pick--empty', i >= _activeReviewRating);
 });
}

function selectStarRating(n) {
 _activeReviewRating = n;
 restoreStars();
 const label = document.getElementById('reviewRatingLabel');
 const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
 if (label) label.textContent = labels[n] || '';
}

/* ============================================================
 REVIEW MODAL
 ============================================================ */
function openReviewModal(bookingId, providerName, service) {
 _activeReviewBookingId = bookingId;
 _activeReviewRating = 0;

 const modal = document.getElementById('reviewModal');
 if (!modal) return;

 // Set header info
 const nameEl = document.getElementById('reviewProviderName');
 const serviceEl = document.getElementById('reviewServiceName');
 if (nameEl) nameEl.textContent = providerName || 'Provider';
 if (serviceEl) serviceEl.textContent = service || '';

 // Reset form
 const textarea = document.getElementById('reviewText');
 if (textarea) textarea.value = '';
 const label = document.getElementById('reviewRatingLabel');
 if (label) label.textContent = '';
 const charCount = document.getElementById('reviewCharCount');
 if (charCount) charCount.textContent = '0 / 1000';

 // Reset submit button
 const btn = document.getElementById('reviewSubmitBtn');
 if (btn) { btn.disabled = false; btn.textContent = ' Submit Review'; }

 renderStarPicker();
 modal.classList.add('open');
}

function closeReviewModal() {
 const modal = document.getElementById('reviewModal');
 if (modal) modal.classList.remove('open');
 _activeReviewBookingId = null;
 _activeReviewRating = 0;
}

// Close on backdrop click
document.addEventListener('click', (e) => {
 if (e.target.id === 'reviewModal') closeReviewModal();
});

/* ============================================================
 SUBMIT REVIEW
 ============================================================ */
async function submitReview() {
 if (!_activeReviewBookingId) return;
 if (_activeReviewRating < 1) {
 showToast('Please select a star rating.', 'error');
 return;
 }

 const reviewText = document.getElementById('reviewText')?.value?.trim() || '';

 const btn = document.getElementById('reviewSubmitBtn');
 if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

 try {
 const res = await apiFetch(API_URL + '/booking/' + _activeReviewBookingId + '/review', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
 body: JSON.stringify({ rating: _activeReviewRating, review_text: reviewText }),
 signal: AbortSignal.timeout(8000)
 });
 const data = await res.json();

 if (data.success) {
 showToast('Review submitted! Thank you ', 'success');
 closeReviewModal();
 // Refresh bookings to update the review button state
 if (typeof renderBookings === 'function') renderBookings(_bookingsFilter);
 } else {
 showToast(data.message || 'Could not submit review.', 'error');
 }
 } catch (e) {
 showToast('Could not reach server.', 'error');
 } finally {
 if (btn) { btn.disabled = false; btn.textContent = ' Submit Review'; }
 }
}

/* ============================================================
 PROVIDER REVIEWS DRAWER
 ============================================================ */
async function openProviderReviews(providerId, providerName) {
 const drawer = document.getElementById('reviewsDrawer');
 if (!drawer) return;

 const nameEl = document.getElementById('reviewsDrawerProviderName');
 if (nameEl) nameEl.textContent = providerName || 'Provider';

 const body = document.getElementById('reviewsDrawerBody');
 if (body) body.innerHTML = '<div class="loader-box">Loading reviews…</div>';

 drawer.classList.add('open');

 try {
 const res = await fetch(API_URL + '/provider/' + providerId + '/reviews', {
 signal: AbortSignal.timeout(8000)
 });
 const data = await res.json();

 if (!data.success) {
 body.innerHTML = '<div class="empty-state"><div class="icon"></div><p>Could not load reviews.</p></div>';
 return;
 }

 // Header with aggregate stats
 let html = `<div class="reviews-summary">
 <div class="reviews-summary-rating">
 <span class="reviews-big-number">${data.avg_rating.toFixed(1)}</span>
 ${renderStarRating(data.avg_rating, 5, 'lg')}
 </div>
 <div class="reviews-summary-count">${data.total_reviews} review${data.total_reviews !== 1 ? 's' : ''}</div>
 </div>`;

 if (!data.reviews.length) {
 html += '<div class="empty-state"><div class="icon"></div><h4>No reviews yet</h4><p>Be the first to leave a review!</p></div>';
 } else {
 html += '<div class="reviews-list">';
 html += data.reviews.map(r => `
 <div class="review-card">
 <div class="review-card-header">
 <div class="review-card-avatar">👤</div>
 <div>
 <div class="review-card-name">${escapeHtml(r.customer_name)}</div>
 <div class="review-card-date">${formatDate(r.created_at)}</div>
 </div>
 <div class="review-card-stars">${renderStarRating(r.rating, 5, 'sm')}</div>
 </div>
 ${r.review_text ? `<div class="review-card-text">${escapeHtml(r.review_text)}</div>` : ''}
 </div>
 `).join('');
 html += '</div>';
 }

 body.innerHTML = html;
 } catch (e) {
 body.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Connection error.</p></div>';
 }
}

function closeReviewsDrawer() {
 const drawer = document.getElementById('reviewsDrawer');
 if (drawer) drawer.classList.remove('open');
}

/* ============================================================
 REVIEW TEXT CHAR COUNTER
 ============================================================ */
function updateReviewCharCount() {
 const textarea = document.getElementById('reviewText');
 const counter = document.getElementById('reviewCharCount');
 if (textarea && counter) {
 counter.textContent = textarea.value.length + ' / 1000';
 }
}

/* ============================================================
 LOAD MY REVIEWS (Provider Dashboard)
 ============================================================ */
async function loadMyReviews() {
 const user = getUser();
 if (!user || !user.id) return;

 const container = document.getElementById('myReviewsList');
 const header = document.getElementById('myReviewsHeader');
 if (!container) return;

 container.innerHTML = '<div class="loader-box">Loading reviews…</div>';

 try {
 const res = await fetch(API_URL + '/provider/' + user.id + '/reviews', {
 signal: AbortSignal.timeout(8000)
 });
 const data = await res.json();

 if (!data.success) {
 container.innerHTML = '<div class="empty-state"><div class="icon"></div><p>Could not load reviews.</p></div>';
 return;
 }

 // Update aggregate header
 if (header && data.total_reviews > 0) {
 header.style.display = '';
 const avgEl = document.getElementById('myAvgRating');
 const starsEl = document.getElementById('myAvgStars');
 const countEl = document.getElementById('myReviewCount');
 if (avgEl) avgEl.textContent = data.avg_rating.toFixed(1);
 if (starsEl) starsEl.innerHTML = renderStarRating(data.avg_rating, 5, 'md');
 if (countEl) countEl.textContent = data.total_reviews + ' review' + (data.total_reviews !== 1 ? 's' : '');
 }

 if (!data.reviews.length) {
 container.innerHTML = '<div class="empty-state"><div class="icon"></div><h4>No reviews yet</h4><p>Reviews from customers will appear here after they rate your services.</p></div>';
 return;
 }

 container.innerHTML = '<div class="reviews-list">' + data.reviews.slice(0, 10).map(r => `
 <div class="review-card">
 <div class="review-card-header">
 <div class="review-card-avatar">👤</div>
 <div>
 <div class="review-card-name">${escapeHtml(r.customer_name)}</div>
 <div class="review-card-date">${formatDate(r.created_at)}</div>
 </div>
 <div class="review-card-stars">${renderStarRating(r.rating, 5, 'sm')}</div>
 </div>
 ${r.review_text ? `<div class="review-card-text">${escapeHtml(r.review_text)}</div>` : ''}
 </div>
 `).join('') + '</div>';

 } catch (e) {
 container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Connection error.</p></div>';
 }
}

