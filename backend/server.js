const path = require("path");
// load env from backend directory explicitly (start script runs from project root)
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("./db");
const { generateUsername } = require("./db");

// ── Utility (must be defined before routes that use it) ──
const LOWER_TRIM = (val) => (val || "").trim().toLowerCase();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// Warn if using default secrets
if (!process.env.JWT_SECRET) console.warn("⚠️  Using default JWT_SECRET – set JWT_SECRET env var for production!");

// Middleware
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:5500", "http://127.0.0.1:5500"];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true
}));
app.use(express.json({ limit: "6mb" }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..")));

// Default route (homepage)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

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
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { name, email, password, phone, role } = req.body;

        db.query("SELECT email FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error" });
            if (results.length > 0) return res.status(400).json({ success: false, message: "Email already registered" });

            const hashedPassword = await bcrypt.hash(password, 10);

            generateUsername(name, (genErr, username) => {
                if (genErr) {
                    console.error("Username generation error:", genErr);
                    return res.status(500).json({ success: false, message: "Registration failed" });
                }

                const sql = `INSERT INTO users (username, name, email, password, phone, role, service, location, address_line, city, pincode, aadhaar_proof)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                db.query(sql, [
                    username, name, email, hashedPassword, phone, role,
                    req.body.service || "", req.body.location || "",
                    req.body.address_line || "", req.body.city || "",
                    req.body.pincode || "", req.body.aadhaar_proof || null
                ], (err) => {
                    if (err) {
                        console.error("Registration DB Error:", err);
                        return res.status(500).json({ success: false, message: "Registration failed" });
                    }
                    return res.status(201).json({ success: true, message: "Registered Successfully", username });
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ================= LOGIN USER ================= */
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT id, username, name, email, password, role, service, location, city, pincode, verification_status FROM users WHERE email=?";

    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error("LOGIN DATABASE ERROR:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        if (results.length === 0) {
            return res.json({ success: false, message: "Invalid email or password" });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ success: false, message: "Invalid email or password" });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, service: user.service || "" },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username || "",
                name: user.name,
                email: user.email,
                role: user.role,
                service: user.service || "",
                location: user.location || "",
                city: user.city || "",
                pincode: user.pincode || "",
                verification_status: user.verification_status || ""
            }
        });
    });
});

/* ================= LOGOUT ================= */
app.post("/logout", verifyToken, (req, res) => {
    res.json({ success: true, message: "Logged out successfully" });
});

/* ================= GET BOOKINGS ================= */
app.get("/bookings", verifyToken, (req, res) => {
    const sql = `SELECT b.*, u.username as provider_username
                 FROM bookings b
                 LEFT JOIN users u ON b.provider_id = u.id
                 WHERE b.customer_id = ?
                 ORDER BY b.created_at DESC`;
    db.query(sql, [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to fetch bookings" });
        res.json({ success: true, bookings: results });
    });
});

/* ================= CREATE BOOKING ================= */
app.post("/booking", verifyToken, (req, res) => {
    const { customer_name, service, provider, provider_id, booking_date, booking_time, address, notes } = req.body;
    const customer_id = req.user.id;

    // Resolve provider_id and provider name
    let resolvedProviderId = provider_id || null;
    let resolvedProviderName = provider || "";

    function createBookingRow(pid, pname) {
        const sql = `INSERT INTO bookings (customer_id, customer_name, service, provider, provider_id, booking_date, booking_time, address, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.query(sql, [customer_id, customer_name, service, pname, pid, booking_date, booking_time, address, notes || ""], (err, result) => {
            if (err) {
                console.error("BOOKING DB ERROR:", err);
                return res.status(500).json({ success: false, message: "Server error" });
            }
            res.json({ success: true, message: "Booking created successfully", booking: { id: result.insertId } });
        });
    }

    // Validate that provider exists, is verified, and offers the requested service
    if (resolvedProviderId) {
        db.query("SELECT id, name, service, verification_status FROM users WHERE id = ? AND role = 'provider'", [resolvedProviderId], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Server database error" });
            if (results.length === 0) {
                return res.status(400).json({ success: false, message: "Selected provider does not exist." });
            }
            const p = results[0];
            if (p.verification_status !== 'approved') {
                return res.status(400).json({ success: false, message: "Selected provider is not verified." });
            }
            const providerService = (p.service || "").trim().toLowerCase();
            const bookingService = (service || "").trim().toLowerCase();
            if (providerService && bookingService && providerService !== bookingService) {
                return res.status(400).json({
                    success: false,
                    message: `This provider offers "${p.service}", not "${service}". Please select a provider who offers the service you need.`
                });
            }
            createBookingRow(p.id, p.name);
        });
    } else if (resolvedProviderName && resolvedProviderName.trim() !== "" && resolvedProviderName !== "Any Available Provider") {
        db.query("SELECT id, name, service, verification_status FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND role = 'provider' LIMIT 1", [resolvedProviderName], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Server database error" });
            if (results.length === 0) {
                return res.status(400).json({ success: false, message: "Selected provider does not exist." });
            }
            const p = results[0];
            if (p.verification_status !== 'approved') {
                return res.status(400).json({ success: false, message: "Selected provider is not verified." });
            }
            const providerService = (p.service || "").trim().toLowerCase();
            const bookingService = (service || "").trim().toLowerCase();
            if (providerService && bookingService && providerService !== bookingService) {
                return res.status(400).json({
                    success: false,
                    message: `This provider offers "${p.service}", not "${service}". Please select a provider who offers the service you need.`
                });
            }
            createBookingRow(p.id, p.name);
        });
    } else {
        createBookingRow(null, "");
    }
});

/* ================= CANCEL BOOKING (soft delete) ================= */
app.delete("/booking/:id", verifyToken, (req, res) => {
    const bookingId = req.params.id;

    db.query("SELECT customer_id FROM bookings WHERE id = ?", [bookingId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
        if (results[0].customer_id !== req.user.id) return res.status(403).json({ success: false, message: "Unauthorized" });

        db.query("UPDATE bookings SET status = 'Cancelled' WHERE id = ?", [bookingId], (err) => {
            if (err) {
                console.error("Cancel Booking Error:", err);
                return res.status(500).json({ success: false, message: "Failed to cancel booking" });
            }
            res.json({ success: true, message: "Booking cancelled successfully" });
        });
    });
});

/* ================= UPDATE BOOKING STATUS (Provider) ================= */
app.put("/booking/:id", verifyToken, (req, res) => {
    const { status } = req.body;
    const bookingId = req.params.id;

    db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [bookingId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

        const booking = results[0];
        const isCustomer = booking.customer_id === req.user.id;
        const isProviderById = booking.provider_id && booking.provider_id === req.user.id;
        const isProviderByName = req.user.role === 'provider' && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
        const isServicePool = req.user.role === 'provider' && (!booking.provider || booking.provider.trim() === '') && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

        if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this booking" });
        }

        db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, bookingId], (err) => {
            if (err) {
                console.error("Update Status Error:", err);
                return res.status(500).json({ success: false, message: "Failed to update status" });
            }
            res.json({ success: true, message: "Status updated successfully" });
        });
    });
});

/* ================= PROVIDER BOOKINGS ================= */
app.get("/provider-bookings", verifyToken, (req, res) => {
    const providerId = req.user.id;
    const providerName = req.user.name;
    const providerService = req.user.service;

    const sql = `
        SELECT * FROM bookings
        WHERE (provider_id = ?)
           OR (provider_id IS NULL AND LOWER(TRIM(provider)) = LOWER(TRIM(?)))
           OR ((provider IS NULL OR TRIM(provider) = '') AND LOWER(TRIM(service)) = LOWER(TRIM(?)))
        ORDER BY id DESC
    `;

    db.query(sql, [providerId, providerName, providerService], (err, results) => {
        if (err) {
            console.error("Provider booking error:", err);
            return res.json({ success: false, bookings: [] });
        }
        res.json({ success: true, bookings: results });
    });
});

/* ================= GET ALL PROVIDERS ================= */
app.get("/providers", (req, res) => {
    const { service } = req.query;
    let sql = `SELECT id, username, name, service, city, pincode, location, verification_status
               FROM users WHERE role = 'provider' AND verification_status = 'approved'`;
    const params = [];

    if (service) {
        sql += ` AND LOWER(TRIM(service)) = LOWER(TRIM(?))`;
        params.push(service);
    }
    sql += ` ORDER BY created_at DESC`;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to fetch providers" });
        res.json({ success: true, providers: results });
    });
});

/* ================= GET SINGLE PROVIDER (by id or username) ================= */
app.get("/provider/:identifier", (req, res) => {
    const { identifier } = req.params;
    const isNumeric = /^\d+$/.test(identifier);
    const sql = isNumeric
        ? `SELECT id, username, name, service, city, pincode, location, verification_status FROM users WHERE id = ? AND role = 'provider'`
        : `SELECT id, username, name, service, city, pincode, location, verification_status FROM users WHERE username = ? AND role = 'provider'`;

    db.query(sql, [identifier], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to fetch provider" });
        if (results.length === 0) return res.status(404).json({ success: false, message: "Provider not found" });
        res.json({ success: true, provider: results[0] });
    });
});

/* ================= PAY BOOKING ================= */
app.post("/booking/:id/pay", verifyToken, (req, res) => {
    const bookingId = req.params.id;
    const { payment_method, transaction_id, amount } = req.body;

    db.query("SELECT customer_id FROM bookings WHERE id = ?", [bookingId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
        if (results[0].customer_id !== req.user.id) return res.status(403).json({ success: false, message: "Unauthorized" });

        db.query("UPDATE bookings SET payment_status = 'Paid' WHERE id = ?", [bookingId], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to update payment status" });

            db.query(
                "INSERT INTO payments (booking_id, payment_method, transaction_id, amount, status) VALUES (?, ?, ?, ?, 'Success')",
                [bookingId, payment_method, transaction_id || `TXN-${Date.now()}`, amount || 499.00],
                (err) => {
                    if (err) console.error("Payment log insert error:", err);
                    res.json({ success: true, message: "Payment processed successfully" });
                }
            );
        });
    });
});

/* ================= GET CHAT MESSAGES ================= */
app.get("/chats/:booking_id", verifyToken, (req, res) => {
    const bookingId = req.params.booking_id;
    const userId = req.user.id;

    db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [bookingId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

        const booking = results[0];
        const isCustomer = booking.customer_id === userId;
        const isProviderById = booking.provider_id && booking.provider_id === userId;
        const isProviderByName = req.user.role === 'provider' && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
        const isServicePool = req.user.role === 'provider' && (!booking.provider || booking.provider.trim() === '') && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

        if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
            return res.status(403).json({ success: false, message: "Unauthorized to access chats for this booking" });
        }

        const sql = `
            SELECT m.*, u.name as sender_name, u.role as sender_role, u.username as sender_username
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.booking_id = ?
            ORDER BY m.created_at ASC
        `;
        db.query(sql, [bookingId], (err, messages) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to fetch chat history" });

            // Also fetch provider info for chat header
            let providerInfo = null;
            if (booking.provider_id) {
                db.query("SELECT id, username, name, service FROM users WHERE id = ?", [booking.provider_id], (pErr, pResults) => {
                    if (!pErr && pResults.length > 0) providerInfo = pResults[0];
                    res.json({ success: true, messages, provider: providerInfo });
                });
            } else {
                res.json({ success: true, messages, provider: providerInfo });
            }
        });
    });
});

/* ================= SEND CHAT MESSAGE ================= */
app.post("/chats", verifyToken, (req, res) => {
    const { booking_id, message } = req.body;
    const senderId = req.user.id;

    if (!booking_id || !message || message.trim() === '') {
        return res.status(400).json({ success: false, message: "Booking ID and message are required" });
    }

    db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [booking_id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

        const booking = results[0];
        const isCustomer = booking.customer_id === senderId;
        const isProviderById = booking.provider_id && booking.provider_id === senderId;
        const isProviderByName = req.user.role === 'provider' && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
        const isServicePool = req.user.role === 'provider' && (!booking.provider || booking.provider.trim() === '') && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

        if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
            return res.status(403).json({ success: false, message: "Unauthorized to send messages for this booking" });
        }

        if (isCustomer) {
            // Use provider_id directly if available
            if (booking.provider_id) {
                insertMessage(booking_id, senderId, booking.provider_id, message, res);
            } else if (booking.provider && booking.provider.trim() !== '') {
                // Fallback: resolve by name
                db.query("SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND role = 'provider' LIMIT 1", [booking.provider], (err, provResults) => {
                    const receiverId = !err && provResults.length > 0 ? provResults[0].id : null;
                    insertMessage(booking_id, senderId, receiverId, message, res);
                });
            } else {
                insertMessage(booking_id, senderId, null, message, res);
            }
        } else {
            insertMessage(booking_id, senderId, booking.customer_id, message, res);
        }
    });
});

function insertMessage(bookingId, senderId, receiverId, message, res) {
    const sql = "INSERT INTO messages (booking_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)";
    db.query(sql, [bookingId, senderId, receiverId, message.trim()], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to send message" });
        res.json({ success: true, messageId: result.insertId });
    });
}

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
});
