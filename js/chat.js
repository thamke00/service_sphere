/* ============================================================
   ServiceSphere – Chat Module
   Booking chat drawer, message rendering, real-time polling.
   Depends on: utils.js, auth.js
   ============================================================ */

let activeChatBookingId = null;
let chatPollInterval = null;
let _lastMessageCount = 0;
let _chatNotifiedIds = new Set();

async function openChatDrawer(bookingId, partnerName, service, providerId) {
  activeChatBookingId = bookingId;
  _lastMessageCount = 0;
  _chatNotifiedIds.clear();
  const drawer = document.getElementById('chatDrawer');
  if (!drawer) return;

  const currentUser = getUser();
  const myRole = currentUser?.role || 'customer';
  drawer.classList.remove('chat-role-customer', 'chat-role-provider');
  drawer.classList.add(myRole === 'provider' ? 'chat-role-provider' : 'chat-role-customer');

  const partnerRole = myRole === 'provider' ? 'Customer' : 'Provider';
  const roleIcon = myRole === 'provider' ? '👤' : '🔧';
  const nameEl = document.getElementById('chatPartnerName');
  const serviceEl = document.getElementById('chatPartnerService');
  if (nameEl) nameEl.textContent = partnerName || 'Chat';
  if (serviceEl) serviceEl.innerHTML = (service || '') + ' <span class="chat-role-badge chat-role-badge--' + partnerRole.toLowerCase() + '">' + roleIcon + ' ' + partnerRole + '</span>';

  if (providerId) {
    try {
      const res = await fetch(API_URL + '/provider/' + providerId);
      const data = await res.json();
      if (data.success && data.provider?.username) {
        if (nameEl) nameEl.textContent = partnerName + ' @' + data.provider.username;
      }
    } catch(e) {}
  }
  drawer.classList.add('open');
  await loadChatMessages(true);
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => {
    if (!document.hidden) loadChatMessages(false);
  }, 3000);
}

function closeChatDrawer() {
  const drawer = document.getElementById('chatDrawer');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.classList.remove('chat-role-customer', 'chat-role-provider');
  }
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = null;
  activeChatBookingId = null;
  _lastMessageCount = 0;
  _chatNotifiedIds.clear();
}

async function loadChatMessages(isInitialLoad) {
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
      _lastMessageCount = 0;
      return;
    }

    // Use the server-provided current_user_id (from verified JWT — most reliable source)
    const myIdNum = Number(data.current_user_id);

    if (!isInitialLoad && data.messages.length > _lastMessageCount) {
      const newMessages = data.messages.slice(_lastMessageCount);
      newMessages.forEach(m => {
        const isFromMe = Number(m.sender_id) === myIdNum;
        if (!isFromMe && !_chatNotifiedIds.has(m.id)) {
          _chatNotifiedIds.add(m.id);
          const senderName = m.sender_name || 'Someone';
          showToast(`💬 New message from ${senderName}`, 'info');
          _playChatNotifSound();
        }
      });
    }
    _lastMessageCount = data.messages.length;

    const myRole = user.role || 'customer';
    box.innerHTML = data.messages.map(m => {
      const isMine = Number(m.sender_id) === myIdNum;
      const msgClass = isMine ? 'outgoing' : 'incoming';

      // Use sender_role from DB join, with sensible fallback
      const senderRole = m.sender_role || (isMine ? myRole : (myRole === 'customer' ? 'provider' : 'customer'));

      const dateTime = formatChatDateTime(m.created_at);

      let senderLabel = '';
      if (isMine) {
        senderLabel = '<div class="chat-msg-sender chat-msg-sender--you">You</div>';
      } else if (m.sender_name) {
        const roleTag = senderRole === 'provider'
          ? ' <span class="chat-sender-role-tag provider">Provider</span>'
          : ' <span class="chat-sender-role-tag customer">Customer</span>';
        senderLabel = `<div class="chat-msg-sender">${escapeHtml(m.sender_name)}${roleTag}</div>`;
      }

      return `<div class="chat-msg ${msgClass}">
        ${senderLabel}
        ${escapeHtml(m.message)}
        <div class="chat-msg-time">${dateTime}</div>
      </div>`;
    }).join('');

    box.scrollTop = box.scrollHeight;
  } catch (e) {
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;">Connection error.</div>';
  }
}

/**
 * Format chat date/time
 */
function formatChatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dayMonth = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const dayMonthYear = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  if (msgDate.getTime() === today.getTime()) {
    return `Today, ${dayMonth} · ${timeStr}`;
  } else if (msgDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${dayMonth} · ${timeStr}`;
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${dayMonth} · ${timeStr}`;
  } else {
    return `${dayMonthYear} · ${timeStr}`;
  }
}

/**
 * Play a subtle notification sound for new incoming messages
 */
function _playChatNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) { /* audio not available */ }
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
      await loadChatMessages(false);
    } else {
      showToast(data.message || 'Could not send', 'error');
    }
  } catch (e) {
    showToast('Could not send message.', 'error');
  }
}

// Pause/resume chat polling when tab visibility changes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeChatBookingId) loadChatMessages();
});
