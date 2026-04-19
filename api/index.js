const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("./db");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "servicesphere_secret_key_2026_safe";

// Middleware
app.use(cors({
    origin: "*",
    credentials: false
}));
app.use(express.json());

app.get("/api", (req, res) => res.json({ success: true, message: "ServiceSphere API is live" }));

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: "Token not provided" });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid token" });
    }
};

/* ================= REGISTER USER ================= */
app.post("/register", [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("phone").trim().notEmpty().withMessage("Phone is required"),
    body("role").isIn(["customer", "provider"]).withMessage("Invalid role")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        const { name, email, password, phone, role } = req.body;
        db.query("SELECT email FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error" });
            if (results.length > 0) return res.status(400).json({ success: false, message: "Email already registered" });
            const hashedPassword = await bcrypt.hash(password, 10);
            const sql = "INSERT INTO users (name, email, password, phone, role, service, location) VALUES (?, ?, ?, ?, ?, ?, ?)";
            db.query(sql, [name, email, hashedPassword, phone, role, req.body.service || "", req.body.location || ""], (err) => {
                if (err) return res.status(500).json({ success: false, message: "Registration failed" });
                return res.status(201).json({ success: true, message: "Registered Successfully" });
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ================= LOGIN USER ================= */
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT id, name, email, password, role, service, location FROM users WHERE email=?";
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        if (results.length === 0) return res.json({ success: false, message: "Invalid email or password" });
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.json({ success: false, message: "Invalid email or password" });
        const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, service: user.service || "" }, JWT_SECRET, { expiresIn: "24h" });
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, service: user.service || "", location: user.location || "" } });
    });
});

/* ================= GET BOOKINGS ================= */
app.get("/bookings", verifyToken, (req, res) => {
    const sql = "SELECT * FROM bookings WHERE customer_id = ? ORDER BY booking_date DESC";
    db.query(sql, [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to fetch bookings" });
        res.json({ success: true, bookings: results });
    });
});

/* ================= CREATE BOOKING ================= */
app.post("/booking", verifyToken, (req, res) => {
    const { customer_name, service, provider, booking_date, booking_time, address, notes } = req.body;
    const sql = "INSERT INTO bookings (customer_id, customer_name, service, provider, booking_date, booking_time, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    db.query(sql, [req.user.id, customer_name, service, provider, booking_date, booking_time, address, notes], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Server error" });
        res.json({ success: true, message: "Booking created successfully" });
    });
});

/* ================= CANCEL BOOKING ================= */
app.delete("/booking/:id", verifyToken, (req, res) => {
    db.query("SELECT customer_id FROM bookings WHERE id = ?", [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
        if (results[0].customer_id !== req.user.id) return res.status(403).json({ success: false, message: "Unauthorized" });
        db.query("DELETE FROM bookings WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to cancel booking" });
            res.json({ success: true, message: "Booking cancelled successfully" });
        });
    });
});

/* ================= UPDATE BOOKING STATUS (Provider) ================= */
app.put("/booking/:id", verifyToken, (req, res) => {
    const { status } = req.body;
    const bookingId = req.params.id;

    const sql = "UPDATE bookings SET status = ? WHERE id = ?";
    db.query(sql, [status, bookingId], (err, result) => {
        if (err) {
            console.error("Update Status Error:", err);
            return res.status(500).json({ success: false, message: "Failed to update status" });
        }
        res.json({ success: true, message: "Status updated successfully" });
    });
});

app.get(["/provider-bookings", "/api/provider-bookings"], verifyToken, (req, res) => {
    const providerName = req.user.name;
    const providerService = req.user.service;

    console.log(`Fetching bookings for Provider: "${providerName}" Service: "${providerService}"`);

    const sql = `
        SELECT * FROM bookings
        WHERE (LOWER(TRIM(provider)) = LOWER(TRIM(?))) 
           OR ( (provider IS NULL OR TRIM(provider) = '') AND LOWER(TRIM(service)) = LOWER(TRIM(?)) )
        ORDER BY id DESC
    `;

    db.query(sql, [providerName, providerService], (err, results) => {
        if (err) {
            console.error("DB Error:", err);
            return res.json({ success: false, bookings: [] });
        }
        console.log(`Found ${results.length} bookings for ${providerName}`);
        res.json({ success: true, bookings: results });
    });
});

/* ================= GET ALL PROVIDERS ================= */
app.get(["/providers", "/api/providers"], (req, res) => {
    const sql = "SELECT name, service, location FROM users WHERE role = 'provider' LIMIT 20";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Provider List Error:", err);
            return res.status(500).json({ 
                success: false, 
                message: "Database query failed", 
                error: err.message,
                code: err.code 
            });
        }
        res.json({ success: true, providers: results });
    });
});

module.exports = app;
