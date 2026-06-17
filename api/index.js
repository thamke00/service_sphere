const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("./db");
const { generateUsername } = require("./db");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@servicesphere.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Warn if using default secrets in production
if (!process.env.JWT_SECRET) console.warn("⚠️  Using default JWT_SECRET – set JWT_SECRET env var for production!");
if (!process.env.ADMIN_PASSWORD) console.warn("⚠️  Using default ADMIN_PASSWORD – set ADMIN_PASSWORD env var for production!");

// CORS: allow specific origins in production, all in development
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:5500", "http://127.0.0.1:5500"];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
            callback(null, true);
        } else {
            callback(null, true); // permissive in dev; tighten for production
        }
    },
    credentials: true
}));
app.use(express.json({ limit: "6mb" }));

app.get("/api", (req, res) => res.json({ success: true, message: "ServiceSphere API is live" }));

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Token not provided" });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid token" });
    }
};

const verifyAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Admin token required" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== "admin") return res.status(403).json({ success: false, message: "Admin access only" });
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid admin token" });
    }
};

const LOWER_TRIM = (val) => (val || "").trim().toLowerCase();

function isValidPincode(pincode) {
    return /^\d{6}$/.test(String(pincode || "").trim());
}

/* ================= CHATBOT (Dialogflow-style intents) ================= */
const CHATBOT_INTENTS = [
    {
        name: "greeting",
        patterns: ["hello", "hi", "hey", "good morning", "good evening", "namaste"],
        response: "Hello! 👋 I'm ServiceSphere Assistant. I can help with booking, payments, provider verification, and account questions. What do you need?"
    },
    {
        name: "book_service",
        patterns: ["book", "booking", "schedule", "appointment", "how to book"],
        response: "To book a service: sign in → open your dashboard → choose a provider or fill the booking form → pick date, time, and address → Confirm. You'll see it under **My Bookings**."
    },
    {
        name: "payment",
        patterns: ["pay", "payment", "upi", "card", "paid", "unpaid"],
        response: "After a provider accepts your booking, tap **Pay Now** on the booking card. We support card and UPI (demo mode on this site)."
    },
    {
        name: "cancel",
        patterns: ["cancel", "cancellation", "refund"],
        response: "You can cancel a booking from **My Bookings** while it's still Pending or Accepted. Tap **Cancel** on the booking card."
    },
    {
        name: "provider_join",
        patterns: ["provider", "become provider", "register provider", "join as provider", "aadhaar", "verification"],
        response: "To join as a provider: Register → choose **Provider** → fill service, full address, pincode, and upload Aadhaar photo. Our team reviews within 24–48 hours. You'll see **Verified** once approved."
    },
    {
        name: "chat_provider",
        patterns: ["message", "chat", "contact provider", "talk to provider"],
        response: "Open **My Bookings** → tap **Message** on a booking to chat with your provider directly."
    },
    {
        name: "support",
        patterns: ["help", "support", "contact", "problem", "issue", "not working"],
        response: "For help: use in-booking chat with your provider, or email support@servicesphere.com. Describe your booking ID if you have one."
    }
];

function getChatbotReply(message) {
    const text = (message || "").toLowerCase().trim();
    if (!text) return "Please type your question and I'll help you.";
    for (const intent of CHATBOT_INTENTS) {
        if (intent.patterns.some((p) => text.includes(p))) return intent.response;
    }
    return "I'm not sure about that. Try asking about **booking**, **payment**, **cancel**, **provider registration**, or **chat**. Or visit your dashboard for more options.";
}

app.post(["/chatbot", "/api/chatbot"], (req, res) => {
    const { message } = req.body;
    res.json({ success: true, reply: getChatbotReply(message), intent: "matched" });
});

/* ================= ADMIN LOGIN ================= */
app.post(["/admin/login", "/api/admin/login"], async (req, res) => {
    const { email, password } = req.body;
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }
    const token = jwt.sign({ email, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ success: true, token });
});

app.get(["/admin/pending-providers", "/api/admin/pending-providers"], verifyAdmin, (req, res) => {
    const sql = `SELECT id, name, email, phone, service, location, address_line, city, pincode, verification_status, aadhaar_proof, created_at
                 FROM users WHERE role = 'provider' AND verification_status = 'pending' ORDER BY created_at DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        res.json({ success: true, providers: results });
    });
});

app.get(["/admin/stats", "/api/admin/stats"], verifyAdmin, (req, res) => {
    db.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'", (e1, customers) => {
        db.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'provider'", (e2, providers) => {
            db.query("SELECT COUNT(*) as cnt FROM bookings WHERE status IN ('Pending','Accepted')", (e3, bookings) => {
                res.json({
                    success: true,
                    stats: {
                        customers: customers?.[0]?.cnt || 0,
                        providers: providers?.[0]?.cnt || 0,
                        activeBookings: bookings?.[0]?.cnt || 0
                    }
                });
            });
        });
    });
});

app.put(["/admin/provider/:id/verify", "/api/admin/provider/:id/verify"], verifyAdmin, (req, res) => {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ success: false, message: "Status must be approved or rejected" });
    }
    db.query("UPDATE users SET verification_status = ? WHERE id = ? AND role = 'provider'", [status, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Update failed" });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Provider not found" });
        res.json({ success: true, message: `Provider ${status}` });
    });
});

/* ================= REGISTER ================= */
app.post(["/register", "/api/register"], [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("phone").trim().notEmpty().withMessage("Phone is required"),
    body("role").isIn(["customer", "provider"]).withMessage("Invalid role")
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const { name, email, password, phone, role, service, location, address_line, city, pincode, aadhaar_proof } = req.body;

        if (role === "provider") {
            if (!service) return res.status(400).json({ success: false, message: "Service category is required" });
            if (!address_line || !city) return res.status(400).json({ success: false, message: "Full address and city are required" });
            if (!isValidPincode(pincode)) return res.status(400).json({ success: false, message: "Valid 6-digit pincode is required" });
            if (!aadhaar_proof) return res.status(400).json({ success: false, message: "Aadhaar photo is required for providers" });
        }

        db.query("SELECT email FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error" });
            if (results.length > 0) return res.status(400).json({ success: false, message: "Email already registered" });

            const hashedPassword = await bcrypt.hash(password, 10);
            const fullLocation = location || [address_line, city, pincode].filter(Boolean).join(", ");

            generateUsername(name, (genErr, username) => {
                if (genErr) {
                    console.error("Username generation error:", genErr);
                    return res.status(500).json({ success: false, message: "Registration failed" });
                }

                const sql = `INSERT INTO users (username, name, email, password, phone, role, service, location, address_line, city, pincode, verification_status, aadhaar_proof)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                const params = [
                    username, name, email, hashedPassword, phone, role,
                    role === "provider" ? service : "",
                    fullLocation,
                    role === "provider" ? address_line : null,
                    role === "provider" ? city : null,
                    role === "provider" ? pincode : null,
                    role === "provider" ? "pending" : null,
                    role === "provider" ? aadhaar_proof : null
                ];

                db.query(sql, params, (insertErr) => {
                    if (insertErr) {
                        console.error("Register error:", insertErr);
                        return res.status(500).json({ success: false, message: "Registration failed" });
                    }
                    const msg = role === "provider"
                        ? "Registered! Your account is pending verification (24–48 hrs)."
                        : "Registered Successfully";
                    return res.status(201).json({ success: true, message: msg, username });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ================= LOGIN ================= */
app.post(["/login", "/api/login"], async (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT id, username, name, email, password, role, service, location, address_line, city, pincode, verification_status
                 FROM users WHERE email=?`;
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        if (results.length === 0) return res.json({ success: false, message: "Invalid email or password" });

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.json({ success: false, message: "Invalid email or password" });

        if (user.role === "provider" && user.verification_status === "rejected") {
            return res.json({ success: false, message: "Your provider account was not approved. Contact support@servicesphere.com" });
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

/* ================= BOOKINGS ================= */
app.get(["/bookings", "/api/bookings"], verifyToken, (req, res) => {
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

app.post(["/booking", "/api/booking"], verifyToken, (req, res) => {
    const { customer_name, service, provider, provider_id, booking_date, booking_time, address, notes } = req.body;
    const customer_id = req.user.id;

    // Resolve provider_id and provider name
    let resolvedProviderId = provider_id || null;
    let resolvedProviderName = provider || "";

    function createBookingRow(pid, pname) {
        const sql = `INSERT INTO bookings (customer_id, customer_name, service, provider, provider_id, booking_date, booking_time, address, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.query(sql, [customer_id, customer_name, service, pname, pid, booking_date, booking_time, address, notes || ""], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "Server error" });
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

app.delete(["/booking/:id", "/api/booking/:id"], verifyToken, (req, res) => {
    db.query("SELECT customer_id FROM bookings WHERE id = ?", [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
        if (results[0].customer_id !== req.user.id) return res.status(403).json({ success: false, message: "Unauthorized" });
        db.query("UPDATE bookings SET status = 'Cancelled' WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to cancel booking" });
            res.json({ success: true, message: "Booking cancelled successfully" });
        });
    });
});

app.put(["/booking/:id", "/api/booking/:id"], verifyToken, (req, res) => {
    const { status } = req.body;
    const bookingId = req.params.id;

    db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [bookingId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

        const booking = results[0];
        const isCustomer = booking.customer_id === req.user.id;
        const isProviderById = booking.provider_id && booking.provider_id === req.user.id;
        const isProviderByName = req.user.role === "provider" && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
        const isServicePool = req.user.role === "provider" && (!booking.provider || booking.provider.trim() === "") && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

        if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this booking" });
        }

        db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, bookingId], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to update status" });
            res.json({ success: true, message: "Status updated successfully" });
        });
    });
});

app.get(["/provider-bookings", "/api/provider-bookings"], verifyToken, (req, res) => {
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
        if (err) return res.json({ success: false, bookings: [] });
        res.json({ success: true, bookings: results });
    });
});

/* ================= PROVIDERS ================= */
app.get(["/providers", "/api/providers"], (req, res) => {
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
app.get(["/provider/:identifier", "/api/provider/:identifier"], (req, res) => {
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

/* ================= PAY ================= */
app.post(["/booking/:id/pay", "/api/booking/:id/pay"], verifyToken, (req, res) => {
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
                () => res.json({ success: true, message: "Payment processed successfully" })
            );
        });
    });
});

/* ================= CHAT ================= */
app.get(["/chats/:booking_id", "/api/chats/:booking_id"], verifyToken, (req, res) => {
    const bookingId = req.params.booking_id;
    const userId = req.user.id;

    db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [bookingId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

        const booking = results[0];
        const isCustomer = booking.customer_id === userId;
        const isProviderById = booking.provider_id && booking.provider_id === userId;
        const isProviderByName = req.user.role === "provider" && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
        const isServicePool = req.user.role === "provider" && (!booking.provider || booking.provider.trim() === "") && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

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

app.post(["/chats", "/api/chats"], verifyToken, (req, res) => {
    const { booking_id, message } = req.body;
    const senderId = req.user.id;

    if (!booking_id || !message || message.trim() === "") {
        return res.status(400).json({ success: false, message: "Booking ID and message are required" });
    }

    db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [booking_id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

        const booking = results[0];
        const isCustomer = booking.customer_id === senderId;
        const isProviderById = booking.provider_id && booking.provider_id === senderId;
        const isProviderByName = req.user.role === "provider" && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
        const isServicePool = req.user.role === "provider" && (!booking.provider || booking.provider.trim() === "") && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

        if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
            return res.status(403).json({ success: false, message: "Unauthorized to send messages for this booking" });
        }

        if (isCustomer) {
            if (booking.provider_id) {
                insertMessage(booking_id, senderId, booking.provider_id, message, res);
            } else if (booking.provider && booking.provider.trim() !== "") {
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

module.exports = app;
