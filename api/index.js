const express = require("express");
const cors = require("cors");
const db = require("../backend/db");
const { generateUsername } = require("../backend/db");
const { attachRoutes } = require("../backend/routes");

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

// Health check
app.get("/api", (req, res) => res.json({ success: true, message: "ServiceSphere API is live" }));

// Attach all shared API routes at both "/" and "/api/" paths for Vercel rewrites
attachRoutes(app, db, generateUsername, {
    routePrefixes: ["", "/api"]
});

module.exports = app;
