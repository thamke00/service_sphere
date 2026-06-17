/* ServiceSphere Help Assistant – Dialogflow-style intent matching */

const SS_CHATBOT_INTENTS = [
  {
    patterns: ["hello", "hi", "hey", "namaste", "good morning", "good evening"],
    reply: "Hello! 👋 I'm **ServiceSphere Assistant**. Ask me about booking, payments, providers, or chat."
  },
  {
    patterns: ["book", "booking", "schedule", "appointment", "how to book"],
    reply: "To book: **Login** → **Dashboard** → pick a verified provider or fill the form → choose date, time & address → **Confirm Booking**. Track everything under **My Bookings**."
  },
  {
    patterns: ["pay", "payment", "upi", "card", "paid"],
    reply: "Once your booking is accepted, open **My Bookings** and tap **Pay Now**. Card and UPI options are available (demo mode)."
  },
  {
    patterns: ["cancel", "cancellation", "refund"],
    reply: "Cancel from **My Bookings** using the **Cancel** button on eligible bookings (Pending or Accepted)."
  },
  {
    patterns: ["provider", "aadhaar", "verification", "join as provider", "become provider"],
    reply: "Providers: Register as **Provider** → upload **Aadhaar photo** + full address with **6-digit pincode**. Admin approves within 24–48 hours. Only **Verified** providers appear to customers."
  },
  {
    patterns: ["chat", "message", "contact provider", "talk"],
    reply: "Message your provider from **My Bookings** → **Message** on any active booking."
  },
  {
    patterns: ["login", "account", "password", "register", "sign up"],
    reply: "Use **Login** in the top menu. New users: **Register** as Customer or Provider. Forgot password? Contact support@servicesphere.com."
  },
  {
    patterns: ["service", "electrician", "plumber", "chef", "driver", "categories"],
    reply: "We offer Electrician, Plumber, Driver, Maid, Chef, Tutor, Carpenter, Painter, AC Repair, Gardener, Pet Care & more. Browse categories on the homepage."
  }
];

const SS_CHATBOT_DEFAULT =
  "I can help with **booking**, **payments**, **cancellation**, **provider signup**, and **messaging**. Try one of those topics, or open your dashboard for full features.";

function ssMatchIntent(text) {
  const lower = (text || "").toLowerCase().trim();
  if (!lower) return "Type your question below — I'm here to help!";
  for (const intent of SS_CHATBOT_INTENTS) {
    if (intent.patterns.some((p) => lower.includes(p))) return intent.reply;
  }
  return SS_CHATBOT_DEFAULT;
}

function ssFormatBotReply(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

let ssChatbotOpen = false;

function ssInitChatbot() {
  if (document.getElementById("ssChatbotWidget")) return;

  const widget = document.createElement("div");
  widget.id = "ssChatbotWidget";
  widget.innerHTML = `
    <button type="button" class="ss-chatbot-fab" id="ssChatbotFab" aria-label="Open help chat">💬</button>
    <div class="ss-chatbot-panel" id="ssChatbotPanel">
      <div class="ss-chatbot-panel-header">
        <div>
          <div class="ss-chatbot-title">ServiceSphere Assistant</div>
          <div class="ss-chatbot-sub">Powered by intent matching · like Dialogflow</div>
        </div>
        <button type="button" class="ss-chatbot-close" id="ssChatbotClose" aria-label="Close">✕</button>
      </div>
      <div class="ss-chatbot-messages" id="ssChatbotMessages">
        <div class="ss-chatbot-msg bot">${ssFormatBotReply(ssMatchIntent("hello"))}</div>
      </div>
      <div class="ss-chatbot-quick" id="ssChatbotQuick">
        <button type="button" data-q="How do I book?">Book</button>
        <button type="button" data-q="How to pay?">Pay</button>
        <button type="button" data-q="Provider verification">Provider</button>
        <button type="button" data-q="Chat with provider">Chat</button>
      </div>
      <div class="ss-chatbot-input-row">
        <input type="text" id="ssChatbotInput" placeholder="Ask anything…" autocomplete="off">
        <button type="button" id="ssChatbotSend">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  document.getElementById("ssChatbotFab").addEventListener("click", ssToggleChatbot);
  document.getElementById("ssChatbotClose").addEventListener("click", ssToggleChatbot);
  document.getElementById("ssChatbotSend").addEventListener("click", () => ssSendChatbotMessage());
  document.getElementById("ssChatbotInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") ssSendChatbotMessage();
  });

  document.querySelectorAll("#ssChatbotQuick button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("ssChatbotInput").value = btn.dataset.q;
      ssSendChatbotMessage();
    });
  });
}

function ssToggleChatbot() {
  ssChatbotOpen = !ssChatbotOpen;
  document.getElementById("ssChatbotPanel")?.classList.toggle("open", ssChatbotOpen);
  document.getElementById("ssChatbotFab")?.classList.toggle("active", ssChatbotOpen);
  if (ssChatbotOpen) document.getElementById("ssChatbotInput")?.focus();
}

function ssAppendChatbotMsg(text, type) {
  const box = document.getElementById("ssChatbotMessages");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `ss-chatbot-msg ${type}`;
  div.innerHTML = type === "bot" ? ssFormatBotReply(text) : text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function ssSendChatbotMessage() {
  const input = document.getElementById("ssChatbotInput");
  const text = input?.value?.trim();
  if (!text) return;

  ssAppendChatbotMsg(text, "user");
  input.value = "";

  let reply = ssMatchIntent(text);

  try {
    const res = await fetch(
      (typeof API_URL !== "undefined" ? API_URL : window.location.origin + "/api") + "/chatbot",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: AbortSignal.timeout(4000)
      }
    );
    const data = await res.json();
    if (data.success && data.reply) reply = data.reply;
  } catch (e) {
    /* use local intent match */
  }

  setTimeout(() => ssAppendChatbotMsg(reply, "bot"), 400);
}

document.addEventListener("DOMContentLoaded", ssInitChatbot);
