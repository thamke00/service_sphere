/* ============================================================
   ServiceSphere – Main Script (Module Loader)
   
   This file has been modularized into focused modules:
   - js/utils.js        → Core utilities, formatting, toast, escapeHtml
   - js/auth.js         → Login, register, token management
   - js/bookings.js     → Booking CRUD, rendering, calendar
   - js/chat.js         → Chat drawer, messaging
   - js/payments.js     → Payment modal, card preview
   - js/providers.js    → Provider listings, filtering
   - js/notifications.js → Background notification polling
   
   Load order matters: utils.js → auth.js → (rest in any order)
   
   This file is kept for backward compatibility with HTML pages
   that load script.js directly. New pages should load the
   individual modules instead.
   ============================================================ */

// This file intentionally left minimal.
// All functionality is now in the individual module files above.
// If you're seeing this and the app doesn't work, ensure the
// HTML page loads all module scripts in the correct order.
