/* ============================================================
   ServiceSphere – Notification Polling Module
   Shared polling for booking/payment/message notifications.
   Used by both provider and customer dashboards.
   Depends on: utils.js, auth.js, chat.js (_playChatNotifSound),
               notif-center.js (addNotification)
   ============================================================ */

let _notifPollState = {
  isFirstPoll: true,
  prevBookingCount: 0,
  prevPaidCount: 0,
  prevMsgCounts: {},
  prevBookingStates: {}
};

/**
 * Start polling for notifications.
 * @param {Object} opts
 * @param {'provider'|'customer'} opts.role - Which dashboard is calling
 * @param {string} opts.bookingsEndpoint - API endpoint for bookings list
 * @param {Function} opts.onRefresh - Called when bookings should be re-rendered
 * @param {number} [opts.interval=10000] - Polling interval in ms
 */
function startNotificationPolling(opts) {
  const { role, bookingsEndpoint, onRefresh, interval = 10000 } = opts;
  const isProvider = role === 'provider';
  const st = _notifPollState;

  // Helper to send toast + store in notification center
  function notify(msg, toastType, notifType, meta) {
    if (typeof addNotification === 'function') {
      addNotification(notifType || 'system', msg, '', meta || {});
    }
    showToast(msg, toastType);
  }

  async function poll() {
    try {
      const token = getToken();
      if (!token) return;
      const user = getUser();
      if (!user) return;

      const res = await fetch(API_URL + bookingsEndpoint, {
        headers: { 'Authorization': 'Bearer ' + token },
        credentials: 'include',
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json();
      if (!data.success || !Array.isArray(data.bookings)) return;

      const bookings = data.bookings;
      const currentCount = bookings.length;
      const currentPaid = bookings.filter(b => b.payment_status === 'Paid').length;

      if (!st.isFirstPoll) {
        if (isProvider) {
          if (currentCount > st.prevBookingCount) {
            const diff = currentCount - st.prevBookingCount;
            notify(`🔔 ${diff} new booking request${diff > 1 ? 's' : ''}!`, 'info', 'booking');
            _playChatNotifSound();
            if (onRefresh) onRefresh();
          }
          if (currentPaid > st.prevPaidCount) {
            const diff = currentPaid - st.prevPaidCount;
            notify(`💰 Payment received for ${diff} booking${diff > 1 ? 's' : ''}!`, 'success', 'payment');
            _playChatNotifSound();
            if (onRefresh) onRefresh();
          }
        } else {
          for (const b of bookings) {
            const prev = st.prevBookingStates[b.id];
            if (prev) {
              // Status change detection
              if (prev.status !== b.status) {
                if (b.status === 'Accepted') {
                  notify(`✅ Your booking #${b.id} (${b.service}) was accepted!`, 'success', 'status', { bookingId: b.id, service: b.service });
                  _playChatNotifSound();
                } else if (b.status === 'In Progress') {
                  notify(`🔧 Your booking #${b.id} (${b.service}) — work has started!`, 'info', 'status', { bookingId: b.id, service: b.service });
                  _playChatNotifSound();
                } else if (b.status === 'Completed') {
                  notify(`🎉 Your booking #${b.id} (${b.service}) is completed! Don't forget to pay.`, 'success', 'status', { bookingId: b.id, service: b.service });
                  _playChatNotifSound();
                } else if (b.status === 'Cancelled' && prev.status !== 'Cancelled') {
                  notify(`❌ Your booking #${b.id} (${b.service}) was cancelled by the provider.`, 'error', 'status', { bookingId: b.id, service: b.service });
                }
                if (onRefresh) onRefresh();
              }

              // Reschedule detection — date or time changed
              const bDate = (b.booking_date || '').substring(0, 10);
              const prevDate = (prev.booking_date || '').substring(0, 10);
              const bTime = (b.booking_time || '').substring(0, 5);
              const prevTime = (prev.booking_time || '').substring(0, 5);
              if (bDate !== prevDate || bTime !== prevTime) {
                const formattedDate = typeof formatDate === 'function' ? formatDate(b.booking_date) : bDate;
                const formattedTime = typeof formatTime === 'function' ? formatTime(b.booking_time) : bTime;
                notify(
                  `🔄 Booking #${b.id} (${b.service}) was rescheduled to ${formattedDate} at ${formattedTime}`,
                  'info', 'reschedule',
                  { bookingId: b.id, service: b.service, newDate: bDate, newTime: bTime }
                );
                _playChatNotifSound();
                if (onRefresh) onRefresh();
              }

              // Payment status change
              if (prev.payment_status !== b.payment_status && b.payment_status === 'Paid' && prev.payment_status !== 'Paid') {
                notify(`💳 Payment confirmed for booking #${b.id}!`, 'success', 'payment', { bookingId: b.id });
                _playChatNotifSound();
                if (onRefresh) onRefresh();
              }
            }
          }
        }
      }

      // Baseline booking states — now includes date/time for reschedule detection
      for (const b of bookings) {
        st.prevBookingStates[b.id] = {
          status: b.status,
          payment_status: b.payment_status,
          booking_date: b.booking_date || '',
          booking_time: b.booking_time || ''
        };
      }

      // Check for new messages on each active booking
      for (const b of bookings) {
        if (b.status === 'Cancelled') continue;
        try {
          const msgRes = await fetch(API_URL + '/chats/' + b.id, {
            headers: { 'Authorization': 'Bearer ' + token },
            credentials: 'include',
            signal: AbortSignal.timeout(3000)
          });
          const msgData = await msgRes.json();
          if (msgData.success && Array.isArray(msgData.messages)) {
            const newCount = msgData.messages.length;
            if (st.isFirstPoll) {
              st.prevMsgCounts[b.id] = newCount;
            } else {
              const prevCount = st.prevMsgCounts[b.id];
              const chatOpen = typeof activeChatBookingId !== 'undefined' && activeChatBookingId === b.id;
              if (prevCount !== undefined && newCount > prevCount && !chatOpen) {
                const newMsgs = msgData.messages.slice(prevCount);
                const myIdStr = String(user.id);
                const incoming = newMsgs.filter(m => String(m.sender_id) !== myIdStr);
                if (incoming.length > 0) {
                  const senderName = incoming[0].sender_name || (isProvider ? 'Customer' : 'Provider');
                  const label = isProvider ? ` on booking #${b.id}` : '';
                  notify(`💬 New message from ${senderName}${label}`, 'info', 'message', { bookingId: b.id, senderName });
                  _playChatNotifSound();
                }
              }
              st.prevMsgCounts[b.id] = newCount;
            }
          }
        } catch(e) { /* skip individual chat errors */ }
      }

      st.prevBookingCount = currentCount;
      st.prevPaidCount = currentPaid;
      st.isFirstPoll = false;
    } catch(e) {
      console.warn(`${role} poll error:`, e);
    }
  }

  poll();
  setInterval(poll, interval);
}
