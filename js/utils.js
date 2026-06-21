/* ============================================================
   ServiceSphere – Utilities & Core
   Shared constants, helpers, and UI utilities used by all modules.
   Must load FIRST before any other module.
   ============================================================ */

const API_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin + '/api';

console.log('Using API URL:', API_URL);

/* ============================================================
   MOBILE NAVIGATION (shared across all pages)
   ============================================================ */
function openMobileNav() {
  const nav = document.getElementById('mobileNav');
  const overlay = document.getElementById('mobileNavOverlay');
  if (nav) nav.classList.add('open');
  if (overlay) overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMobileNav() {
  const nav = document.getElementById('mobileNav');
  const overlay = document.getElementById('mobileNavOverlay');
  if (nav) nav.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('DOMContentLoaded', () => {
  const hb = document.getElementById('hamburgerBtn');
  const nc = document.getElementById('mobileNavClose');
  const no = document.getElementById('mobileNavOverlay');
  if (hb) hb.addEventListener('click', openMobileNav);
  if (nc) nc.addEventListener('click', closeMobileNav);
  if (no) no.addEventListener('click', closeMobileNav);
});

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
   DOM & FORMATTING HELPERS
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
    Electrician: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    Plumber: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    Driver: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    Maid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    Chef: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M5 8H4a4 4 0 0 0 0 8h1"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="12" y1="4" x2="12" y2="8"/><line x1="8" y1="6" x2="8" y2="8"/><line x1="16" y1="6" x2="16" y2="8"/></svg>',
    Tutor: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    Carpenter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/></svg>',
    Painter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12a10 10 0 0 0 5.012 8.662"/></svg>',
    'AC Repair': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/><path d="M9 3v4"/><path d="M15 3v4"/><rect x="4" y="7" width="16" height="9" rx="1"/></svg>',
    Gardener: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8c.7-1 1-2 1-3 0-2.8-2.2-5-5-5S8 2.2 8 5c0 1 .3 2 1 3"/><path d="M12 10v12"/><path d="M8 14c-2 0-4 1-4 3s2 3 4 3"/><path d="M16 14c2 0 4 1 4 3s-2 3-4 3"/></svg>',
    'Pet Care': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    Security: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  };
  return icons[service] || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ============================================================
   SCROLL REVEAL (IntersectionObserver)
   ============================================================ */
function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal, .reveal-stagger');
  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        if (entry.target.classList.contains('reveal-stagger')) {
          entry.target.querySelectorAll(':scope > *').forEach((child, i) => {
            child.style.animationDelay = `${i * 0.07}s`;
            child.classList.add('revealed');
          });
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealElements.forEach(el => observer.observe(el));
}

/* ============================================================
   ANIMATED STAT COUNTERS (Hero stats)
   ============================================================ */
function initStatCounters() {
  const statNums = document.querySelectorAll('.stat-item .num');
  if (!statNums.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNums.forEach(el => observer.observe(el));
}

function animateCounter(el) {
  const text = el.textContent.trim();
  const match = text.match(/^([\d,.]+)(.*)$/);
  if (!match) return;

  const target = parseInt(match[1].replace(/,/g, ''), 10);
  const suffix = match[2] || '';
  const duration = 1200;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * eased);

    if (target >= 1000) {
      el.textContent = (current / 1000).toFixed(current >= target ? 0 : 0) + 'K' + suffix;
    } else {
      el.textContent = current + suffix;
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = text;
    }
  }

  el.textContent = '0';
  requestAnimationFrame(update);
}

/* ============================================================
   PASSWORD STRENGTH INDICATOR
   ============================================================ */
function checkPasswordStrength(password) {
  const fill = document.getElementById('passwordStrengthFill');
  if (!fill) return;

  fill.className = 'password-strength-fill';

  if (password.length === 0) {
    fill.className = 'password-strength-fill';
    return;
  }

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) {
    fill.classList.add('weak');
  } else if (score <= 3) {
    fill.classList.add('medium');
  } else {
    fill.classList.add('strong');
  }
}

/* ============================================================
   AADHAAR UPLOAD (Provider Registration)
   ============================================================ */
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
  if (file.size > 5 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Image must be under 5MB.';
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round(height * MAX_WIDTH / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.7;
      let compressed = canvas.toDataURL('image/jpeg', quality);
      while (compressed.length > 400 * 1024 && quality > 0.3) {
        quality -= 0.1;
        compressed = canvas.toDataURL('image/jpeg', quality);
      }

      window._aadhaarBase64 = compressed;
      const preview = document.getElementById('aadhaarPreview');
      const originalKB = Math.round(file.size / 1024);
      const compressedKB = Math.round(compressed.length * 0.75 / 1024);
      if (preview) {
        preview.style.display = 'block';
        preview.textContent = '✓ ' + file.name + ' uploaded (' + originalKB + 'KB → ~' + compressedKB + 'KB compressed)';
      }
      if (errEl) errEl.textContent = '';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
