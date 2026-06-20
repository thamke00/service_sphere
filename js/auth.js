/* ============================================================
   ServiceSphere – Authentication Module
   Login, register, token management, auth guards.
   Depends on: utils.js (showToast, API_URL)
   ============================================================ */

/* ============================================================
   AUTH HELPERS (localStorage)
   ============================================================ */
function getToken()  { return localStorage.getItem('ss_token'); }
function saveToken(t){ localStorage.setItem('ss_token', t); }
function getUser() {
  const user = JSON.parse(localStorage.getItem('ss_user') || 'null');
  if (!user) return null;
  // Ensure user.id is always available by decoding from JWT if missing
  if (user.id == null) {
    try {
      const token = getToken();
      if (token && token.includes('.')) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.id) {
          user.id = payload.id;
          saveUser(user);
        }
      }
    } catch(e) {}
  }
  return user;
}
function saveUser(u) { localStorage.setItem('ss_user', JSON.stringify(u)); }
function clearAuth() {
  localStorage.removeItem('ss_token');
  localStorage.removeItem('ss_user');
  // Server will clear httpOnly cookie via /logout endpoint
}

// Decode a JWT and check if it has expired (no library needed)
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch (e) {
    return true;
  }
}

// Central fetch wrapper — auto-sends cookies + fallback token header, auto-logs out on 401
async function apiFetch(url, options = {}) {
  // Always include credentials so the httpOnly cookie is sent
  options.credentials = 'include';
  // Backward compat: also send Authorization header from localStorage if present
  const token = getToken();
  if (token) {
    options.headers = options.headers || {};
    if (!options.headers['Authorization']) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
  }
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

  if (isTokenExpired(token)) {
    clearAuth();
    window.location.href = 'login.html';
    return;
  }

  if (requiredRole && user.role !== requiredRole) {
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
    // Offline / no backend: localStorage fallback
    const users = JSON.parse(localStorage.getItem('ss_users') || '[]');
    if (users.find(u => u.name.toLowerCase().trim() === name.toLowerCase().trim())) {
      showToast('A user with this name already exists. Please use a different name.', 'error');
      btnText.style.display = 'inline'; btnSpinner.style.display = 'none';
      return;
    }
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
    const res = await fetch(API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
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
    // Offline / no backend: localStorage fallback
    const users = JSON.parse(localStorage.getItem('ss_users') || '[]');
    const user  = users.find(u => u.email === email && u.password === password);

    if (!user) {
      showToast('Invalid email or password.', 'error');
      btnText.style.display = 'inline'; btnSpinner.style.display = 'none';
      return;
    }

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
  // Call server to clear httpOnly cookie (fire and forget)
  fetch(API_URL + '/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Authorization': 'Bearer ' + (getToken() || '') }
  }).catch(() => {});
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
   FORGOT PASSWORD FLOW
   ============================================================ */
let _resetEmail = '';

function showForgotPasswordForm() {
  const loginForm = document.getElementById('loginForm');
  const forgotForm = document.getElementById('forgotPasswordForm');
  if (loginForm) loginForm.style.display = 'none';
  if (forgotForm) forgotForm.style.display = 'block';
  // Reset state
  const step1 = document.getElementById('forgotStep1');
  const step2 = document.getElementById('forgotStep2');
  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';
  _resetEmail = '';
}

function hideForgotPasswordForm() {
  const loginForm = document.getElementById('loginForm');
  const forgotForm = document.getElementById('forgotPasswordForm');
  if (loginForm) loginForm.style.display = 'block';
  if (forgotForm) forgotForm.style.display = 'none';
}

async function requestPasswordReset() {
  const email = document.getElementById('forgot_email')?.value?.trim();
  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  const btn = document.getElementById('forgotSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const res = await fetch(API_URL + '/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();

    if (data.success) {
      _resetEmail = email;
      showToast('Reset code generated! Check below.', 'success');

      // Show step 2 (enter code + new password)
      const step1 = document.getElementById('forgotStep1');
      const step2 = document.getElementById('forgotStep2');
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';

      // In dev mode, auto-fill the code for convenience
      if (data.resetCode) {
        const codeInput = document.getElementById('reset_code');
        if (codeInput) codeInput.value = data.resetCode;
        showToast('Dev mode: Code auto-filled → ' + data.resetCode, 'info');
      }
    } else {
      showToast(data.message || 'Could not process request.', 'error');
    }
  } catch (e) {
    showToast('Could not reach server.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔑 Send Reset Code'; }
  }
}

async function submitPasswordReset() {
  const code = document.getElementById('reset_code')?.value?.trim();
  const newPass = document.getElementById('reset_password')?.value;
  const confirmPass = document.getElementById('reset_confirm')?.value;

  if (!code || code.length !== 6) {
    showToast('Please enter the 6-digit reset code.', 'error');
    return;
  }
  if (!newPass || newPass.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }
  if (newPass !== confirmPass) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  const btn = document.getElementById('resetSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }

  try {
    const res = await fetch(API_URL + '/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: _resetEmail, code, new_password: newPass }),
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();

    if (data.success) {
      showToast('Password reset! Please sign in with your new password. ✅', 'success');
      hideForgotPasswordForm();
    } else {
      showToast(data.message || 'Reset failed.', 'error');
    }
  } catch (e) {
    showToast('Could not reach server.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Reset Password'; }
  }
}

