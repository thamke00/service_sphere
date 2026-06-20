/* ============================================================
   ServiceSphere – Providers Module
   Featured providers (index page), dashboard providers,
   category counts, and page initialization.
   Depends on: utils.js, auth.js
   ============================================================ */

/* ── Provider rating line helper ── */
function providerRatingHtml(p) {
  if (typeof renderStarRating !== 'function') return '';
  if (p.avg_rating > 0) {
    return `<div class="provider-rating" onclick="if(typeof openProviderReviews==='function')openProviderReviews(${p.id},'${escapeHtml((p.name||'').replace(/'/g,"\\'"))}')" style="cursor:pointer;" title="View reviews">
      ${renderStarRating(p.avg_rating, 5, 'sm')} <span class="provider-rating-text">${p.avg_rating} (${p.review_count})</span>
    </div>`;
  }
  return '<div class="provider-rating provider-rating--new"><span class="provider-rating-text">✨ New</span></div>';
}

/* ── Provider price line helper ── */
function providerPriceHtml(p) {
  const price = parseFloat(p.service_price);
  if (price && price > 0) {
    return `<div class="provider-detail" style="font-weight:700; color:var(--success);">💰 ₹${price.toFixed(0)} <span style="font-weight:400; font-size:12px; color:var(--text-muted);">per service</span></div>`;
  }
  return '<div class="provider-detail" style="color:var(--text-muted);">💰 ₹499 <span style="font-size:12px;">(default)</span></div>';
}

/* ============================================================
   LOAD FEATURED PROVIDERS (index page)
   ============================================================ */
async function loadFeaturedProviders(serviceFilter) {
  const container = document.getElementById('featuredProvidersList');
  if (!container) return;

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
      if (activeFilter) {
        container.innerHTML = '<div class="loader-box">No providers found for ' + escapeHtml(activeFilter) + '. Try browsing all categories!</div>';
      }
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
        ${providerPriceHtml(p)}
        ${providerRatingHtml(p)}
        <div class="provider-badge">✓ Verified</div>
        <button class="btn btn-primary btn-block" onclick="bookProvider('${(p.service || '').replace(/'/g, "\\\\'")}', '${(p.name || '').replace(/'/g, "\\\\'")}', ${p.id})">Book Now</button>
      </div>
    `).join('');

  } catch (err) {
    console.warn("Could not load providers showcase", err);
  }
}

function filterProvidersByService(service) {
  _providerServiceFilter = service;
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
  const section = document.getElementById('recommendedProvidersSection');
  if (!container) return;

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
      if (!activeFilter && filterBar) filterBar.style.display = 'none';
      container.innerHTML = `
        <div style="grid-column: 1 / -1;">
          <div style="
            text-align: center;
            padding: 48px 24px;
            background: linear-gradient(135deg, rgba(99,102,241,0.04), rgba(6,182,212,0.04));
            border: 1px dashed rgba(255,255,255,0.08);
            border-radius: var(--radius-lg);
          ">
            <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.6;">🔍</div>
            <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">
              ${activeFilter ? 'No ' + escapeHtml(activeFilter) + ' providers yet' : 'No providers available yet'}
            </h4>
            <p style="font-size: 13px; color: var(--text-muted); max-width: 360px; margin: 0 auto 20px; line-height: 1.6;">
              ${activeFilter
                ? 'There are no verified ' + escapeHtml(activeFilter) + ' providers at the moment. Try browsing all categories or book with "Any Available Provider".'
                : 'Providers are being onboarded. You can still book a service below and choose "Any Available Provider" — we\'ll match you when one is verified!'
              }
            </p>
            <a href="#book-service" class="btn btn-primary btn-sm" style="font-size: 13px;">📝 Book a Service Anyway</a>
            ${activeFilter ? '<button class="btn btn-ghost btn-sm" onclick="filterDashboardProviders(\'\')" style="font-size:13px; margin-left:8px;">View All Categories</button>' : ''}
          </div>
        </div>`;
      return;
    }
    if (filterBar) filterBar.style.display = '';
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
        ${providerPriceHtml(p)}
        ${providerRatingHtml(p)}
        <div class="provider-badge">✓ Verified</div>
        <button class="btn btn-primary btn-block btn-sm" onclick="prefillBooking('${(p.service || '').replace(/'/g, "\\\\'")}', '${(p.name || '').replace(/'/g, "\\\\'")}', ${p.id})">Book Now</button>
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
   DYNAMIC PROVIDER COUNTS (Homepage categories)
   ============================================================ */
async function loadCategoryCounts() {
  try {
    const res = await fetch(API_URL + '/provider-counts', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (data.success && data.counts) {
      Object.entries(data.counts).forEach(([service, count]) => {
        const id = 'count-' + service.toLowerCase().replace(/\s+/g, '-');
        const el = document.getElementById(id);
        if (el) el.textContent = count + ' provider' + (count !== 1 ? 's' : '');
      });
    }
  } catch (e) { /* keep hardcoded fallback counts */ }
}

/* ============================================================
   GLOBAL INITIALIZATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('featuredProvidersList')) {
    loadFeaturedProviders();
    loadCategoryCounts();
  }
  if (document.getElementById('recommendedProvidersList')) loadDashboardProviders();

  initScrollReveal();
  initStatCounters();
});
