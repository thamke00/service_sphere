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
    Electrician: '⚡', Plumber: '🔧', Driver: '🚗',
    Maid: '🏠', Chef: '👨‍🍳', Tutor: '📚',
    Carpenter: '🪚', Painter: '🎨', 'AC Repair': '❄️',
    Gardener: '🌿', 'Pet Care': '🐾', Security: '🛡️'
  };
  return icons[service] || '🔨';
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
  if (/[0-9]/.test(password)) score++;


  if (score <= 1) {
    fill.classList.add('weak');
  } else if (score <= 2) {
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
