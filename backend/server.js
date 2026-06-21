const path = require("path");
// Load env from backend directory explicitly (start script runs from project root)
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const db = require("./db");
const { generateUsername } = require("./db");
const { attachRoutes } = require("./routes");

const app = express();

// ── CORS ──
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:5500", "http://127.0.0.1:5500"];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
            callback(null, true);
        } else if (process.env.NODE_ENV === "production") {
            callback(new Error("Not allowed by CORS"));
        } else {
            callback(null, true); // permissive in dev
        }
    },
    credentials: true
}));

app.use(express.json({ limit: "6mb" }));
app.use(cookieParser());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..")));

// Default route (homepage)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

// Serve HTML pages without .html extension
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "login.html"));
});
app.get("/dashboard-user", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "dashboard-user.html"));
});
app.get("/dashboard-provider", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "dashboard-provider.html"));
});
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "admin.html"));
});

// Attach all shared API routes (auth, bookings, providers, chat, payments, admin, chatbot)
attachRoutes(app, db, generateUsername, {
    routePrefixes: [""]
});

/* ================= GLOBAL ERROR HANDLERS ================= */
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception (server stays alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection (server stays alive):', reason);
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
});
