/* ============================================================
   ServiceSphere – Shared API Routes
   ─────────────────────────────────────────────────────────────
   Used by both backend/server.js (Express) and api/index.js
   (Vercel serverless). Eliminates code duplication.
   ============================================================ */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");

// Graceful fallback if express-rate-limit isn't installed yet
let rateLimit;
try {
    rateLimit = require("express-rate-limit");
} catch (e) {
    console.warn("⚠️  express-rate-limit not installed – rate limiting disabled. Run: npm install express-rate-limit");
    rateLimit = null;
}

/* ══════════════════════════════════════════════════════════════
   CHATBOT – Simple server-side fallback
   (Full intent matching lives in js/chatbot.js on the frontend)
   ══════════════════════════════════════════════════════════════ */
function getChatbotReply(message) {
    const text = (message || "").toLowerCase().trim();
    if (!text) return "Please type your question and I'll help you.";
    // Simple keyword match as server fallback — primary matching is in js/chatbot.js
    const keywords = {
        book: "To book: sign in → dashboard → choose provider → pick date & time → Confirm.",
        pay: "After a provider accepts, tap **Pay Now** on the booking card.",
        cancel: "Cancel from **My Bookings** while the booking is Pending or Accepted.",
        provider: "Register as Provider → upload Aadhaar + address → admin approves within 24–48h.",
        chat: "Open **My Bookings** → tap **Message** on any booking.",
        help: "Use in-booking chat, or email support@servicesphere.com."
    };
    for (const [key, reply] of Object.entries(keywords)) {
        if (text.includes(key)) return reply;
    }
    return "Try asking about **booking**, **payment**, **cancel**, **provider**, or **chat**.";
}

/* ══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ══════════════════════════════════════════════════════════════ */
const LOWER_TRIM = (val) => (val || "").trim().toLowerCase();

function isValidPincode(pincode) {
    return /^\d{6}$/.test(String(pincode || "").trim());
}

// Max Aadhaar base64 size: ~500KB (after client-side compression)
const MAX_AADHAAR_BASE64_LENGTH = 500 * 1024;

/* ══════════════════════════════════════════════════════════════
   MAIN EXPORT: attachRoutes(app, db, generateUsername, options)
   ══════════════════════════════════════════════════════════════ */
function attachRoutes(app, db, generateUsername, options = {}) {
    const JWT_SECRET = options.JWT_SECRET || process.env.JWT_SECRET || "dev_secret_change_me";
    const ADMIN_EMAIL = options.ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@servicesphere.com";
    const ADMIN_PASSWORD = options.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin123";
    const prefixes = options.routePrefixes || [""];
    const isProduction = process.env.NODE_ENV === "production";

    // Cookie settings for JWT
    const COOKIE_NAME = 'ss_jwt';
    const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches JWT expiry)
        path: '/'
    };

    // ── Security warnings ──
    if (!process.env.JWT_SECRET) console.warn("⚠️  Using default JWT_SECRET – set JWT_SECRET env var for production!");
    if (!process.env.ADMIN_PASSWORD) console.warn("⚠️  Using default ADMIN_PASSWORD – set ADMIN_PASSWORD env var for production!");
    if (isProduction && ADMIN_PASSWORD === "admin123") {
        console.error("🚨 CRITICAL: Default admin password in production! Set ADMIN_PASSWORD env var immediately.");
    }

    // ── Helper: register route at multiple prefixes ──
    function paths(base) {
        return prefixes.length > 1 ? prefixes.map(p => p + base) : prefixes[0] + base;
    }

    // ── Rate Limiting ──
    let loginLimiter, registerLimiter, globalLimiter;
    if (rateLimit) {
        const limiterMessage = (msg) => ({ success: false, message: msg });

        loginLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: 10,
            message: limiterMessage("Too many login attempts. Please try again in a minute."),
            standardHeaders: true,
            legacyHeaders: false
        });

        registerLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: 5,
            message: limiterMessage("Too many registration attempts. Please try again in a minute."),
            standardHeaders: true,
            legacyHeaders: false
        });

        globalLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: 100,
            message: limiterMessage("Too many requests. Please slow down."),
            standardHeaders: true,
            legacyHeaders: false
        });

        // Apply global rate limit to all API routes
        prefixes.forEach(prefix => {
            if (prefix) app.use(prefix, globalLimiter);
        });
    }

    // No-op middleware for when rate limiting is disabled
    const noopMiddleware = (req, res, next) => next();
    const loginRL = loginLimiter || noopMiddleware;
    const registerRL = registerLimiter || noopMiddleware;

    // ── JWT Middleware (reads cookie first, then Authorization header) ──
    const verifyToken = (req, res, next) => {
        const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ success: false, message: "Token not provided" });
        try {
            req.user = jwt.verify(token, JWT_SECRET);
            next();
        } catch (err) {
            // Clear invalid cookie if present
            if (req.cookies?.[COOKIE_NAME]) res.clearCookie(COOKIE_NAME, { path: '/' });
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

    // ── Insert chat message helper ──
    function insertMessage(bookingId, senderId, receiverId, message, res) {
        const sql = "INSERT INTO messages (booking_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)";
        db.query(sql, [bookingId, senderId, receiverId, message.trim()], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to send message" });
            res.json({ success: true, messageId: result.insertId });
        });
    }

    /* ═══════════════════ CHATBOT ═══════════════════ */
    app.post(paths("/chatbot"), (req, res) => {
        const { message } = req.body;
        res.json({ success: true, reply: getChatbotReply(message), intent: "matched" });
    });

    /* ═══════════════════ ADMIN ═══════════════════ */
    app.post(paths("/admin/login"), loginRL, (req, res) => {
        const { email, password } = req.body;

        // Block default credentials in production
        if (isProduction && ADMIN_EMAIL === "admin@servicesphere.com" && ADMIN_PASSWORD === "admin123") {
            return res.status(503).json({ success: false, message: "Admin credentials not configured for production." });
        }

        if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
            return res.status(401).json({ success: false, message: "Invalid admin credentials" });
        }
        const token = jwt.sign({ email, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
        res.json({ success: true, token });
    });

    app.get(paths("/admin/pending-providers"), verifyAdmin, (req, res) => {
        const sql = `SELECT id, name, email, phone, service, location, address_line, city, pincode, verification_status, aadhaar_proof, created_at
                     FROM users WHERE role = 'provider' AND verification_status = 'pending' ORDER BY created_at DESC`;
        db.query(sql, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error" });
            res.json({ success: true, providers: results });
        });
    });

    app.get(paths("/admin/stats"), verifyAdmin, (req, res) => {
        db.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'", (e1, customers) => {
            db.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'provider'", (e2, providers) => {
                db.query("SELECT COUNT(*) as cnt FROM bookings WHERE status IN ('Pending','Accepted','In Progress')", (e3, bookings) => {
                    db.query("SELECT COALESCE(SUM(platform_fee), 0) as total_revenue, COALESCE(SUM(amount), 0) as total_gmv, COUNT(*) as total_bookings FROM bookings WHERE payment_status = 'Paid'", (e4, revenue) => {
                        res.json({
                            success: true,
                            stats: {
                                customers: customers?.[0]?.cnt || 0,
                                providers: providers?.[0]?.cnt || 0,
                                activeBookings: bookings?.[0]?.cnt || 0,
                                totalRevenue: parseFloat(revenue?.[0]?.total_revenue) || 0,
                                totalGMV: parseFloat(revenue?.[0]?.total_gmv) || 0,
                                paidBookings: revenue?.[0]?.total_bookings || 0
                            }
                        });
                    });
                });
            });
        });
    });

    app.put(paths("/admin/provider/:id/verify"), verifyAdmin, (req, res) => {
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

    /* ═══════════════════ REGISTER ═══════════════════ */
    app.post(paths("/register"), registerRL, [
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

            // Provider-specific validation
            if (role === "provider") {
                if (!service) return res.status(400).json({ success: false, message: "Service category is required" });
                if (!address_line || !city) return res.status(400).json({ success: false, message: "Full address and city are required" });
                if (!isValidPincode(pincode)) return res.status(400).json({ success: false, message: "Valid 6-digit pincode is required" });
                if (!aadhaar_proof) return res.status(400).json({ success: false, message: "Aadhaar photo is required for providers" });
                // Server-side size guard for Aadhaar image
                if (aadhaar_proof.length > MAX_AADHAAR_BASE64_LENGTH) {
                    return res.status(400).json({ success: false, message: "Aadhaar image too large. Please upload a smaller image (max 500KB after compression)." });
                }
            }

            db.query("SELECT id, role FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [name], (nameErr, nameResults) => {
                if (nameErr) return res.status(500).json({ success: false, message: "Database error" });
                if (nameResults.length > 0) {
                    const existingRole = nameResults[0].role;
                    return res.status(400).json({
                        success: false,
                        message: `A ${existingRole} with the name "${name}" already exists. Please use a different name.`
                    });
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
            }); // close name uniqueness check
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });

    /* ═══════════════════ LOGIN ═══════════════════ */
    app.post(paths("/login"), loginRL, async (req, res) => {
        const { email, password } = req.body;
        const sql = `SELECT id, username, name, email, password, role, service, location, address_line, city, pincode, verification_status
                     FROM users WHERE email=?`;
        db.query(sql, [email], async (err, results) => {
            if (err) {
                console.error("LOGIN DATABASE ERROR:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }
            if (results.length === 0) return res.json({ success: false, message: "Invalid email or password" });

            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.json({ success: false, message: "Invalid email or password" });

            // Block rejected providers
            if (user.role === "provider" && user.verification_status === "rejected") {
                return res.json({ success: false, message: "Your provider account was not approved. Contact support@servicesphere.com" });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, service: user.service || "" },
                JWT_SECRET,
                { expiresIn: "7d" }
            );

            res.cookie(COOKIE_NAME, token, cookieOptions);
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

    /* ═══════════════════ LOGOUT ═══════════════════ */
    app.post(paths("/logout"), verifyToken, (req, res) => {
        res.clearCookie(COOKIE_NAME, { path: '/' });
        res.json({ success: true, message: "Logged out successfully" });
    });

    /* ═══════════════════ FORGOT PASSWORD ═══════════════════ */
    app.post(paths("/forgot-password"), loginRL, (req, res) => {
        const { email } = req.body;
        if (!email || !email.trim()) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        db.query("SELECT id, name FROM users WHERE email = ?", [email.trim().toLowerCase()], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error." });

            // Always respond with success to prevent email enumeration
            if (results.length === 0) {
                return res.json({ success: true, message: "If an account exists with this email, a reset code has been generated." });
            }

            const user = results[0];
            // Generate 6-digit OTP
            const resetCode = String(Math.floor(100000 + Math.random() * 900000));
            const tokenHash = crypto.createHash('sha256').update(resetCode).digest('hex');
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            // REPLACE INTO removes any existing token for this user (prevents flooding)
            db.query(
                "REPLACE INTO password_reset_tokens (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, 0)",
                [user.id, tokenHash, expiresAt],
                (err) => {
                    if (err) {
                        console.error("Reset token insert error:", err);
                        return res.status(500).json({ success: false, message: "Could not generate reset code." });
                    }

                    // In production, this code would be sent via email.
                    // For demo/development, we return it in the response.
                    console.log(`\n🔐 Password reset code for ${email}: ${resetCode} (expires in 15 min)\n`);

                    res.json({
                        success: true,
                        message: "If an account exists with this email, a reset code has been generated.",
                        // DEV ONLY: Remove resetCode from response in production
                        resetCode: isProduction ? undefined : resetCode
                    });
                }
            );
        });
    });

    /* ═══════════════════ RESET PASSWORD ═══════════════════ */
    app.post(paths("/reset-password"), loginRL, async (req, res) => {
        const { email, code, new_password } = req.body;

        if (!email || !code || !new_password) {
            return res.status(400).json({ success: false, message: "Email, reset code, and new password are required." });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
        }

        const tokenHash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');

        db.query("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()], async (err, users) => {
            if (err) return res.status(500).json({ success: false, message: "Database error." });
            if (users.length === 0) return res.status(400).json({ success: false, message: "Invalid reset code." });

            const userId = users[0].id;

            db.query(
                "SELECT id FROM password_reset_tokens WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > NOW()",
                [userId, tokenHash],
                async (err, tokens) => {
                    if (err) return res.status(500).json({ success: false, message: "Database error." });
                    if (tokens.length === 0) {
                        return res.status(400).json({ success: false, message: "Invalid or expired reset code. Please request a new one." });
                    }

                    const hashedPassword = await bcrypt.hash(new_password, 10);

                    // Update password
                    db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId], (err) => {
                        if (err) return res.status(500).json({ success: false, message: "Could not update password." });

                        // Mark token as used
                        db.query("UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?", [userId]);

                        res.json({ success: true, message: "Password reset successfully! You can now sign in." });
                    });
                }
            );
        });
    });

    /* ═══════════════════ GET BOOKINGS (Customer) ═══════════════════ */
    app.get(paths("/bookings"), verifyToken, (req, res) => {
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 0;
        let sql = `SELECT b.*, u.username as provider_username,
                     r.id as review_id, r.rating as review_rating, r.review_text
                     FROM bookings b
                     LEFT JOIN users u ON b.provider_id = u.id
                     LEFT JOIN reviews r ON r.booking_id = b.id
                     WHERE b.customer_id = ?
                     ORDER BY b.created_at DESC`;
        const params = [req.user.id];
        if (page > 0 && limit > 0) {
            sql += ` LIMIT ? OFFSET ?`;
            params.push(limit, (page - 1) * limit);
        }
        db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to fetch bookings" });
            if (page > 0 && limit > 0) {
                db.query(`SELECT COUNT(*) as total FROM bookings WHERE customer_id = ?`, [req.user.id], (cErr, cRes) => {
                    const total = (!cErr && cRes[0]) ? cRes[0].total : results.length;
                    res.json({ success: true, bookings: results, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
                });
            } else {
                res.json({ success: true, bookings: results });
            }
        });
    });

    /* ═══════════════════ CREATE BOOKING ═══════════════════ */
    app.post(paths("/booking"), verifyToken, (req, res) => {
        const { customer_name, service, provider, provider_id, booking_date, booking_time, address, notes } = req.body;
        const customer_id = req.user.id;

        // ── Input Validation ──
        if (!service || !service.trim()) return res.status(400).json({ success: false, message: "Service is required." });
        if (!booking_date) return res.status(400).json({ success: false, message: "Booking date is required." });
        if (!booking_time) return res.status(400).json({ success: false, message: "Booking time is required." });
        if (!address || !address.trim()) return res.status(400).json({ success: false, message: "Address is required." });

        // Enforce max lengths to prevent abuse
        const MAX_LENGTHS = { service: 100, address: 500, notes: 1000, customer_name: 200, provider: 200 };
        for (const [field, max] of Object.entries(MAX_LENGTHS)) {
            if (req.body[field] && String(req.body[field]).length > max) {
                return res.status(400).json({ success: false, message: `${field} is too long (max ${max} characters).` });
            }
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) {
            return res.status(400).json({ success: false, message: "Invalid date format." });
        }

        // Strip HTML tags from text fields as server-side sanitization
        const stripTags = (str) => (str || "").replace(/<[^>]*>/g, "");

        const cleanService = stripTags(service).trim();
        const cleanAddress = stripTags(address).trim();
        const cleanNotes = stripTags(notes || "").trim();
        const cleanCustomerName = stripTags(customer_name || req.user.name || "").trim();

        let resolvedProviderId = provider_id || null;
        let resolvedProviderName = provider || "";

        // ── Revenue: calculate 10% platform fee ──
        const PLATFORM_FEE_RATE = 0.10;

        function createBookingRow(pid, pname, bookingAmount) {
            const amount = bookingAmount || 499.00;
            const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
            const providerEarning = Math.round((amount - platformFee) * 100) / 100;

            // ── Double-booking prevention: check for conflicts ──
            function doInsert() {
                const sql = `INSERT INTO bookings (customer_id, customer_name, service, provider, provider_id, booking_date, booking_time, address, notes, amount, platform_fee, provider_earning)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                db.query(sql, [customer_id, cleanCustomerName, cleanService, pname, pid, booking_date, booking_time, cleanAddress, cleanNotes, amount, platformFee, providerEarning], (err, result) => {
                    if (err) {
                        console.error("BOOKING DB ERROR:", err);
                        return res.status(500).json({ success: false, message: "Server error" });
                    }
                    res.json({ success: true, message: "Booking created successfully", booking: { id: result.insertId, amount, platform_fee: platformFee, provider_earning: providerEarning } });
                });
            }

            if (pid) {
                // Check for double-booking: same provider, same date+time, active status
                db.query(
                    `SELECT id FROM bookings WHERE provider_id = ? AND booking_date = ? AND booking_time = ? AND status IN ('Pending','Accepted','In Progress') LIMIT 1`,
                    [pid, booking_date, booking_time],
                    (err, conflicts) => {
                        if (err) return res.status(500).json({ success: false, message: "Server error" });
                        if (conflicts.length > 0) {
                            return res.status(409).json({ success: false, message: "This provider already has a booking at this date and time. Please choose a different time." });
                        }
                        // Check provider availability for the day of week
                        const bookingDay = new Date(booking_date).getDay(); // 0=Sun
                        db.query(
                            `SELECT is_available, start_time, end_time FROM provider_availability WHERE provider_id = ? AND day_of_week = ?`,
                            [pid, bookingDay],
                            (err, avail) => {
                                if (err) return doInsert(); // fail-open if availability table missing
                                if (avail.length > 0 && !avail[0].is_available) {
                                    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                                    return res.status(400).json({ success: false, message: `This provider is not available on ${dayNames[bookingDay]}s. Please choose another day.` });
                                }
                                if (avail.length > 0 && avail[0].start_time && avail[0].end_time) {
                                    if (booking_time < avail[0].start_time || booking_time > avail[0].end_time) {
                                        return res.status(400).json({ success: false, message: `This provider is available from ${avail[0].start_time.substring(0,5)} to ${avail[0].end_time.substring(0,5)} on this day.` });
                                    }
                                }
                                doInsert();
                            }
                        );
                    }
                );
            } else {
                doInsert();
            }
        }

        // Validate provider exists, is verified, and offers the requested service
        if (resolvedProviderId) {
            db.query("SELECT id, name, service, verification_status, service_price FROM users WHERE id = ? AND role = 'provider'", [resolvedProviderId], (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Server database error" });
                if (results.length === 0) return res.status(400).json({ success: false, message: "Selected provider does not exist." });
                const p = results[0];
                if (p.verification_status !== "approved") return res.status(400).json({ success: false, message: "Selected provider is not verified." });
                const providerService = LOWER_TRIM(p.service);
                const bookingService = LOWER_TRIM(service);
                if (providerService && bookingService && providerService !== bookingService) {
                    return res.status(400).json({ success: false, message: `This provider offers "${p.service}", not "${service}". Please select a provider who offers the service you need.` });
                }
                createBookingRow(p.id, p.name, parseFloat(p.service_price) || 499.00);
            });
        } else if (resolvedProviderName && resolvedProviderName.trim() !== "" && resolvedProviderName !== "Any Available Provider") {
            db.query("SELECT id, name, service, verification_status, service_price FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND role = 'provider' LIMIT 1", [resolvedProviderName], (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Server database error" });
                if (results.length === 0) return res.status(400).json({ success: false, message: "Selected provider does not exist." });
                const p = results[0];
                if (p.verification_status !== "approved") return res.status(400).json({ success: false, message: "Selected provider is not verified." });
                const providerService = LOWER_TRIM(p.service);
                const bookingService = LOWER_TRIM(service);
                if (providerService && bookingService && providerService !== bookingService) {
                    return res.status(400).json({ success: false, message: `This provider offers "${p.service}", not "${service}". Please select a provider who offers the service you need.` });
                }
                createBookingRow(p.id, p.name, parseFloat(p.service_price) || 499.00);
            });
        } else {
            createBookingRow(null, "", 499.00);
        }
    });

    /* ═══════════════════ CANCEL BOOKING ═══════════════════ */
    app.delete(paths("/booking/:id"), verifyToken, (req, res) => {
        const bookingId = req.params.id;
        db.query("SELECT customer_id FROM bookings WHERE id = ?", [bookingId], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
            if (Number(results[0].customer_id) !== Number(req.user.id)) return res.status(403).json({ success: false, message: "Unauthorized" });
            db.query("UPDATE bookings SET status = 'Cancelled' WHERE id = ?", [bookingId], (err) => {
                if (err) return res.status(500).json({ success: false, message: "Failed to cancel booking" });
                res.json({ success: true, message: "Booking cancelled successfully" });
            });
        });
    });

    /* ═══════════════════ UPDATE BOOKING STATUS (Provider) ═══════════════════ */
    app.put(paths("/booking/:id"), verifyToken, (req, res) => {
        const { status } = req.body;
        const bookingId = req.params.id;

        // Validate status is in allowed set (including new 'In Progress')
        const VALID_STATUSES = ['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled'];
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status value." });
        }

        db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [bookingId], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

            const booking = results[0];
            const isCustomer = Number(booking.customer_id) === Number(req.user.id);
            const isProviderById = booking.provider_id && Number(booking.provider_id) === Number(req.user.id);
            const isProviderByName = req.user.role === "provider" && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
            const isServicePool = req.user.role === "provider" && (!booking.provider || booking.provider.trim() === "") && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

            if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
                return res.status(403).json({ success: false, message: "Unauthorized to update this booking" });
            }

            // If a pool provider accepts, claim the booking by assigning provider_id + provider name + their price
            const isAccepting = status === "Accepted" && isServicePool && !booking.provider_id;

            if (isAccepting) {
                // Race-condition guard: check no one else already accepted
                db.query("SELECT provider_id, status FROM bookings WHERE id = ? AND status = 'Pending' AND provider_id IS NULL", [bookingId], (checkErr, checkResults) => {
                    if (checkErr) return res.status(500).json({ success: false, message: "Server error" });
                    if (checkResults.length === 0) {
                        return res.status(409).json({ success: false, message: "This booking was already accepted by another provider." });
                    }
                    // Look up provider's actual price so the booking amount reflects it
                    db.query("SELECT service_price FROM users WHERE id = ? AND role = 'provider'", [req.user.id], (pErr, pResults) => {
                        const providerPrice = (!pErr && pResults[0]) ? parseFloat(pResults[0].service_price) || 499.00 : 499.00;
                        const platformFee = Math.round(providerPrice * 0.10 * 100) / 100;
                        const providerEarning = Math.round((providerPrice - platformFee) * 100) / 100;
                        const claimSql = "UPDATE bookings SET status = ?, provider_id = ?, provider = ?, amount = ?, platform_fee = ?, provider_earning = ? WHERE id = ? AND status = 'Pending'";
                        db.query(claimSql, [status, req.user.id, req.user.name, providerPrice, platformFee, providerEarning, bookingId], (err, result) => {
                            if (err) return res.status(500).json({ success: false, message: "Failed to update status" });
                            if (result.affectedRows === 0) return res.status(409).json({ success: false, message: "This booking was already accepted by another provider." });
                            // Notify customer that a provider accepted
                            createNotification(
                                booking.customer_id, 'status',
                                `✅ Your booking #${bookingId} (${booking.service}) was accepted by ${req.user.name}!`,
                                '', { bookingId: Number(bookingId), service: booking.service, status: 'Accepted' }
                            );
                            res.json({ success: true, message: "Booking accepted and assigned to you", amount: providerPrice });
                        });
                    });
                });
            } else {
                db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, bookingId], (err) => {
                    if (err) return res.status(500).json({ success: false, message: "Failed to update status" });

                    // Notify the other party about the status change
                    const statusMsgs = {
                        'Accepted': `✅ Your booking #${bookingId} (${booking.service}) was accepted!`,
                        'In Progress': `🔧 Your booking #${bookingId} (${booking.service}) — work has started!`,
                        'Completed': `🎉 Your booking #${bookingId} (${booking.service}) is completed!`,
                        'Cancelled': `❌ Booking #${bookingId} (${booking.service}) was cancelled.`
                    };
                    const notifMsg = statusMsgs[status];
                    if (notifMsg) {
                        // If provider changed status, notify customer. If customer cancelled, notify provider.
                        const notifyId = isCustomer ? booking.provider_id : booking.customer_id;
                        if (notifyId) {
                            createNotification(notifyId, 'status', notifMsg, '',
                                { bookingId: Number(bookingId), service: booking.service, status }
                            );
                        }
                    }

                    res.json({ success: true, message: "Status updated successfully" });
                });
            }
        });
    });

    /* ═══════════════════ RESCHEDULE BOOKING ═══════════════════ */
    app.put(paths("/booking/:id/reschedule"), verifyToken, (req, res) => {
        const { booking_date, booking_time } = req.body;
        const bookingId = req.params.id;

        if (!booking_date || !booking_time) {
            return res.status(400).json({ success: false, message: "New date and time are required" });
        }

        // Validate the new date is not in the past
        const newDate = new Date(booking_date + "T" + booking_time);
        if (isNaN(newDate) || newDate < new Date()) {
            return res.status(400).json({ success: false, message: "Cannot reschedule to a past date/time" });
        }

        db.query("SELECT customer_id, provider, provider_id, service, status FROM bookings WHERE id = ?", [bookingId], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

            const booking = results[0];

            // Only allow rescheduling for Pending or Accepted bookings
            if (booking.status !== "Pending" && booking.status !== "Accepted") {
                return res.status(400).json({ success: false, message: "Can only reschedule Pending or Accepted bookings" });
            }

            // Authorization: customer or provider
            const isCustomer = Number(booking.customer_id) === Number(req.user.id);
            const isProviderById = booking.provider_id && Number(booking.provider_id) === Number(req.user.id);
            const isProviderByName = req.user.role === "provider" && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);

            if (!isCustomer && !isProviderById && !isProviderByName) {
                return res.status(403).json({ success: false, message: "Unauthorized to reschedule this booking" });
            }

            db.query("UPDATE bookings SET booking_date = ?, booking_time = ? WHERE id = ?", [booking_date, booking_time, bookingId], (err) => {
                if (err) return res.status(500).json({ success: false, message: "Failed to reschedule booking" });

                // Notify the OTHER party about the reschedule
                const notifyUserId = isCustomer ? booking.provider_id : booking.customer_id;
                const whoRescheduled = isCustomer ? 'Customer' : 'Provider';
                if (notifyUserId) {
                    createNotification(
                        notifyUserId,
                        'reschedule',
                        `🔄 Booking #${bookingId} (${booking.service}) was rescheduled by ${whoRescheduled} to ${booking_date} at ${booking_time}`,
                        '',
                        { bookingId: Number(bookingId), service: booking.service, newDate: booking_date, newTime: booking_time }
                    );
                }

                res.json({ success: true, message: "Booking rescheduled successfully" });
            });
        });
    });

    /* ═══════════════════ PROVIDER BOOKINGS ═══════════════════ */
    app.get(paths("/provider-bookings"), verifyToken, (req, res) => {
        const providerId = req.user.id;
        const providerName = req.user.name;
        const providerService = req.user.service;
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 0;

        let sql = `
            SELECT * FROM bookings
            WHERE (provider_id = ?)
               OR (provider_id IS NULL AND LOWER(TRIM(provider)) = LOWER(TRIM(?)))
               OR ((provider IS NULL OR TRIM(provider) = '') AND provider_id IS NULL AND LOWER(TRIM(service)) = LOWER(TRIM(?)) AND status = 'Pending')
            ORDER BY id DESC
        `;
        const params = [providerId, providerName, providerService];
        if (page > 0 && limit > 0) {
            sql += ` LIMIT ? OFFSET ?`;
            params.push(limit, (page - 1) * limit);
        }
        db.query(sql, params, (err, results) => {
            if (err) {
                console.error("Provider booking error:", err);
                return res.json({ success: false, bookings: [] });
            }
            if (page > 0 && limit > 0) {
                const countSql = `SELECT COUNT(*) as total FROM bookings
                    WHERE (provider_id = ?)
                       OR (provider_id IS NULL AND LOWER(TRIM(provider)) = LOWER(TRIM(?)))
                       OR ((provider IS NULL OR TRIM(provider) = '') AND provider_id IS NULL AND LOWER(TRIM(service)) = LOWER(TRIM(?)) AND status = 'Pending')`;
                db.query(countSql, [providerId, providerName, providerService], (cErr, cRes) => {
                    const total = (!cErr && cRes[0]) ? cRes[0].total : results.length;
                    res.json({ success: true, bookings: results, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
                });
            } else {
                res.json({ success: true, bookings: results });
            }
        });
    });

    /* ═══════════════════ PROVIDERS LIST (with search & filters) ═══════════════════ */
    app.get(paths("/providers"), (req, res) => {
        const { service, q, city, rating_min, price_max, price_min, sort } = req.query;
        let sql = `SELECT u.id, u.username, u.name, u.service, u.city, u.pincode, u.location, u.verification_status,
                   u.service_price,
                   COALESCE(rv.avg_rating, 0) as avg_rating, COALESCE(rv.review_count, 0) as review_count,
                   COALESCE(bk.completed_jobs, 0) as completed_jobs,
                   COALESCE(bk.total_jobs, 0) as total_jobs
                   FROM users u
                   LEFT JOIN (
                     SELECT provider_id, ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as review_count
                     FROM reviews GROUP BY provider_id
                   ) rv ON rv.provider_id = u.id
                   LEFT JOIN (
                     SELECT provider_id, 
                       SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_jobs,
                       COUNT(*) as total_jobs
                     FROM bookings WHERE provider_id IS NOT NULL GROUP BY provider_id
                   ) bk ON bk.provider_id = u.id
                   WHERE u.role = 'provider' AND u.verification_status = 'approved'`;
        const params = [];

        if (service) {
            sql += ` AND LOWER(TRIM(u.service)) = LOWER(TRIM(?))`;
            params.push(service);
        }
        if (q) {
            sql += ` AND (LOWER(u.name) LIKE ? OR LOWER(u.service) LIKE ? OR LOWER(u.city) LIKE ?)`;
            const like = '%' + q.toLowerCase().trim() + '%';
            params.push(like, like, like);
        }
        if (city) {
            sql += ` AND LOWER(u.city) LIKE ?`;
            params.push('%' + city.toLowerCase().trim() + '%');
        }
        if (rating_min) {
            sql += ` AND COALESCE(rv.avg_rating, 0) >= ?`;
            params.push(parseFloat(rating_min));
        }
        if (price_max) {
            sql += ` AND (u.service_price IS NULL OR u.service_price <= ?)`;
            params.push(parseFloat(price_max));
        }
        if (price_min) {
            sql += ` AND (u.service_price IS NULL OR u.service_price >= ?)`;
            params.push(parseFloat(price_min));
        }

        // Sort options
        if (sort === 'price_low') sql += ` ORDER BY COALESCE(u.service_price, 499) ASC, rv.avg_rating DESC`;
        else if (sort === 'price_high') sql += ` ORDER BY COALESCE(u.service_price, 499) DESC, rv.avg_rating DESC`;
        else if (sort === 'jobs') sql += ` ORDER BY bk.completed_jobs DESC, rv.avg_rating DESC`;
        else sql += ` ORDER BY rv.avg_rating DESC, bk.completed_jobs DESC, u.created_at DESC`;

        db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to fetch providers" });
            res.json({ success: true, providers: results });
        });
    });

    /* ═══════════════════ PROVIDER CITIES (for location filter) ═══════════════════ */
    app.get(paths("/provider-cities"), (req, res) => {
        db.query(
            `SELECT DISTINCT TRIM(city) as city FROM users 
             WHERE role = 'provider' AND verification_status = 'approved' 
             AND city IS NOT NULL AND TRIM(city) != '' 
             ORDER BY city ASC`,
            (err, results) => {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true, cities: results.map(r => r.city) });
            }
        );
    });

    /* ═══════════════════ SINGLE PROVIDER ═══════════════════ */
    app.get(paths("/provider/:identifier"), (req, res) => {
        const { identifier } = req.params;
        const isNumeric = /^\d+$/.test(identifier);
        const sql = isNumeric
            ? `SELECT id, username, name, service, city, pincode, location, verification_status, service_price FROM users WHERE id = ? AND role = 'provider'`
            : `SELECT id, username, name, service, city, pincode, location, verification_status, service_price FROM users WHERE username = ? AND role = 'provider'`;

        db.query(sql, [identifier], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to fetch provider" });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Provider not found" });
            res.json({ success: true, provider: results[0] });
        });
    });

    /* ═══════════════════ UPDATE PROVIDER PRICE ═══════════════════ */
    app.put(paths("/provider/price"), verifyToken, (req, res) => {
        const userId = req.user.id;
        const { price } = req.body;

        if (req.user.role !== 'provider') {
            return res.status(403).json({ success: false, message: "Only providers can set pricing." });
        }

        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 49 || numPrice > 99999) {
            return res.status(400).json({ success: false, message: "Price must be between ₹49 and ₹99,999." });
        }

        db.query("UPDATE users SET service_price = ? WHERE id = ? AND role = 'provider'", [numPrice, userId], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "Could not update price." });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Provider not found." });
            res.json({ success: true, message: "Price updated to ₹" + numPrice.toFixed(2), price: numPrice });
        });
    });

    /* ═══════════════════ PROVIDER COUNTS (NEW) ═══════════════════ */
    app.get(paths("/provider-counts"), (req, res) => {
        const sql = `SELECT service, COUNT(*) as count
                     FROM users
                     WHERE role = 'provider' AND verification_status = 'approved'
                     GROUP BY service`;
        db.query(sql, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Failed to fetch provider counts" });
            const counts = {};
            (results || []).forEach(r => { counts[r.service] = r.count; });
            res.json({ success: true, counts });
        });
    });

    /* ═══════════════════ PAY BOOKING ═══════════════════ */
    app.post(paths("/booking/:id/pay"), verifyToken, (req, res) => {
        const bookingId = req.params.id;
        const { payment_method, transaction_id, amount } = req.body;

        db.query("SELECT customer_id FROM bookings WHERE id = ?", [bookingId], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
            if (Number(results[0].customer_id) !== Number(req.user.id)) return res.status(403).json({ success: false, message: "Unauthorized" });

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

    /* ═══════════════════ GET CHAT MESSAGES ═══════════════════ */
    app.get(paths("/chats/:booking_id"), verifyToken, (req, res) => {
        const bookingId = req.params.booking_id;
        const userId = req.user.id;

        db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [bookingId], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });

            const booking = results[0];
            const isCustomer = Number(booking.customer_id) === Number(userId);
            const isProviderById = booking.provider_id && Number(booking.provider_id) === Number(userId);
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
                        res.json({ success: true, messages, provider: providerInfo, current_user_id: userId });
                    });
                } else {
                    res.json({ success: true, messages, provider: providerInfo, current_user_id: userId });
                }
            });
        });
    });

    /* ═══════════════════ SEND CHAT MESSAGE ═══════════════════ */
    app.post(paths("/chats"), verifyToken, (req, res) => {
        const { booking_id, message } = req.body;
        const senderId = req.user.id;

        if (!booking_id || !message || message.trim() === "") {
            return res.status(400).json({ success: false, message: "Booking ID and message are required" });
        }

        db.query("SELECT customer_id, provider, provider_id, service FROM bookings WHERE id = ?", [booking_id], (err, results) => {
            if (err || results.length === 0) {
                console.error("Chat send: Booking not found, id=", booking_id, "err=", err?.message);
                return res.status(404).json({ success: false, message: "Booking not found" });
            }

            const booking = results[0];
            // Use Number() to avoid type mismatches between JWT id and MySQL INT
            const isCustomer = Number(booking.customer_id) === Number(senderId);
            const isProviderById = booking.provider_id && Number(booking.provider_id) === Number(senderId);
            const isProviderByName = req.user.role === "provider" && LOWER_TRIM(req.user.name) === LOWER_TRIM(booking.provider);
            const isServicePool = req.user.role === "provider" && (!booking.provider || booking.provider.trim() === "") && LOWER_TRIM(req.user.service) === LOWER_TRIM(booking.service);

            if (!isCustomer && !isProviderById && !isProviderByName && !isServicePool) {
                console.warn("Chat send UNAUTHORIZED: senderId=", senderId, typeof senderId,
                    "customer_id=", booking.customer_id, typeof booking.customer_id,
                    "provider_id=", booking.provider_id, typeof booking.provider_id,
                    "provider=", booking.provider, "user.name=", req.user.name, "user.role=", req.user.role);
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

    /* ═══════════════════ SUBMIT REVIEW ═══════════════════ */
    app.post(paths("/booking/:id/review"), verifyToken, (req, res) => {
        const bookingId = req.params.id;
        const { rating, review_text } = req.body;
        const customerId = req.user.id;

        const ratingNum = parseInt(rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
        }
        if (review_text && review_text.length > 1000) {
            return res.status(400).json({ success: false, message: "Review text is too long (max 1000 characters)." });
        }

        db.query(
            "SELECT id, customer_id, provider_id, provider, status FROM bookings WHERE id = ?",
            [bookingId],
            (err, results) => {
                if (err || results.length === 0) {
                    return res.status(404).json({ success: false, message: "Booking not found." });
                }
                const booking = results[0];
                if (Number(booking.customer_id) !== Number(customerId)) {
                    return res.status(403).json({ success: false, message: "You can only review your own bookings." });
                }
                if (booking.status !== 'Completed') {
                    return res.status(400).json({ success: false, message: "You can only review completed bookings." });
                }

                // Resolve provider_id: use booking's provider_id, or look up by provider name
                function insertReview(resolvedProviderId) {
                    db.query("SELECT id FROM reviews WHERE booking_id = ?", [bookingId], (err, existing) => {
                        if (err) return res.status(500).json({ success: false, message: "Database error." });
                        if (existing.length > 0) {
                            return res.status(409).json({ success: false, message: "You have already reviewed this booking." });
                        }

                        const cleanText = (review_text || "").replace(/<[^>]*>/g, "").trim();
                        db.query(
                            "INSERT INTO reviews (booking_id, customer_id, provider_id, rating, review_text) VALUES (?, ?, ?, ?, ?)",
                            [bookingId, customerId, resolvedProviderId, ratingNum, cleanText || null],
                            (err, result) => {
                                if (err) {
                                    console.error("Review insert error:", err);
                                    return res.status(500).json({ success: false, message: "Failed to submit review." });
                                }
                                res.json({ success: true, message: "Review submitted successfully!", reviewId: result.insertId });
                            }
                        );
                    });
                }

                if (booking.provider_id) {
                    insertReview(booking.provider_id);
                } else if (booking.provider && booking.provider.trim()) {
                    // Try to resolve provider by name
                    db.query(
                        "SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND role = 'provider' LIMIT 1",
                        [booking.provider],
                        (err, providerResults) => {
                            if (!err && providerResults.length > 0) {
                                // Also backfill the booking's provider_id
                                db.query("UPDATE bookings SET provider_id = ? WHERE id = ?", [providerResults[0].id, bookingId]);
                                insertReview(providerResults[0].id);
                            } else {
                                // No provider found — still allow the review with null provider_id
                                insertReview(null);
                            }
                        }
                    );
                } else {
                    // No provider at all — still allow the review
                    insertReview(null);
                }
            }
        );
    });

    /* ═══════════════════ GET REVIEW FOR BOOKING ═══════════════════ */
    app.get(paths("/booking/:id/review"), verifyToken, (req, res) => {
        const bookingId = req.params.id;
        db.query(
            `SELECT r.*, u.name as customer_name FROM reviews r JOIN users u ON r.customer_id = u.id WHERE r.booking_id = ?`,
            [bookingId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Database error." });
                if (results.length === 0) return res.json({ success: true, review: null });
                res.json({ success: true, review: results[0] });
            }
        );
    });

    /* ═══════════════════ GET PROVIDER REVIEWS ═══════════════════ */
    app.get(paths("/provider/:id/reviews"), (req, res) => {
        const providerId = req.params.id;
        db.query(
            `SELECT r.*, u.name as customer_name
             FROM reviews r
             JOIN users u ON r.customer_id = u.id
             WHERE r.provider_id = ?
             ORDER BY r.created_at DESC
             LIMIT 50`,
            [providerId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Failed to fetch reviews." });
                db.query(
                    `SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE provider_id = ?`,
                    [providerId],
                    (err2, stats) => {
                        const avg = (!err2 && stats[0]) ? stats[0] : { avg_rating: 0, total_reviews: 0 };
                        res.json({
                            success: true,
                            reviews: results,
                            avg_rating: parseFloat(avg.avg_rating) || 0,
                            total_reviews: avg.total_reviews || 0
                        });
                    }
                );
            }
        );
    });

    /* ═══════════════════ PROVIDER AVAILABILITY ═══════════════════ */
    app.get(paths("/provider/:id/availability"), (req, res) => {
        db.query(
            `SELECT day_of_week, start_time, end_time, is_available FROM provider_availability WHERE provider_id = ? ORDER BY day_of_week`,
            [req.params.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Failed to fetch availability" });
                res.json({ success: true, availability: results });
            }
        );
    });

    app.put(paths("/provider/availability"), verifyToken, (req, res) => {
        if (req.user.role !== 'provider') {
            return res.status(403).json({ success: false, message: "Only providers can set availability." });
        }
        const { schedule } = req.body; // array of { day_of_week, start_time, end_time, is_available }
        if (!Array.isArray(schedule) || schedule.length === 0) {
            return res.status(400).json({ success: false, message: "Schedule array is required." });
        }

        const providerId = req.user.id;
        let completed = 0;
        let errors = 0;

        schedule.forEach(slot => {
            const { day_of_week, start_time, end_time, is_available } = slot;
            if (day_of_week < 0 || day_of_week > 6) { completed++; errors++; return; }
            db.query(
                `INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time, is_available)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), is_available = VALUES(is_available)`,
                [providerId, day_of_week, start_time || '09:00', end_time || '18:00', is_available ? 1 : 0],
                (err) => {
                    if (err) errors++;
                    completed++;
                    if (completed >= schedule.length) {
                        if (errors > 0) return res.status(500).json({ success: false, message: `Saved with ${errors} error(s).` });
                        res.json({ success: true, message: "Availability updated successfully!" });
                    }
                }
            );
        });
    });

    /* ═══════════════════ PROVIDER EARNINGS ═══════════════════ */
    app.get(paths("/provider/earnings"), verifyToken, (req, res) => {
        if (req.user.role !== 'provider') {
            return res.status(403).json({ success: false, message: "Provider only." });
        }
        const pid = req.user.id;
        db.query(
            `SELECT 
                COALESCE(SUM(provider_earning), 0) as total_earned,
                COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) THEN provider_earning ELSE 0 END), 0) as earned_this_month,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_jobs,
                COUNT(*) as total_jobs,
                ROUND(SUM(CASE WHEN status IN ('Accepted','In Progress','Completed') THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as acceptance_rate
             FROM bookings WHERE provider_id = ?`,
            [pid],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Database error" });
                const r = results[0] || {};
                res.json({
                    success: true,
                    earnings: {
                        total_earned: parseFloat(r.total_earned) || 0,
                        earned_this_month: parseFloat(r.earned_this_month) || 0,
                        completed_jobs: r.completed_jobs || 0,
                        total_jobs: r.total_jobs || 0,
                        acceptance_rate: r.acceptance_rate || 0
                    }
                });
            }
        );
    });

    /* ═══════════════════ RECOMMENDED PROVIDERS ═══════════════════ */
    app.get(paths("/providers/recommended"), verifyToken, (req, res) => {
        const customerId = req.user.id;
        // Simple recommendation: providers previously booked + highest rated in user's booked categories
        db.query(
            `SELECT DISTINCT u.id, u.username, u.name, u.service, u.city, u.pincode, u.location,
                    u.verification_status, u.service_price,
                    COALESCE(rv.avg_rating, 0) as avg_rating, COALESCE(rv.review_count, 0) as review_count,
                    COALESCE(bk.completed_jobs, 0) as completed_jobs,
                    1 as is_recommended
             FROM bookings b
             JOIN users u ON b.provider_id = u.id AND u.role = 'provider' AND u.verification_status = 'approved'
             LEFT JOIN (SELECT provider_id, ROUND(AVG(rating),1) as avg_rating, COUNT(*) as review_count FROM reviews GROUP BY provider_id) rv ON rv.provider_id = u.id
             LEFT JOIN (SELECT provider_id, SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) as completed_jobs FROM bookings WHERE provider_id IS NOT NULL GROUP BY provider_id) bk ON bk.provider_id = u.id
             WHERE b.customer_id = ? AND b.status = 'Completed'
             ORDER BY rv.avg_rating DESC, bk.completed_jobs DESC
             LIMIT 6`,
            [customerId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Database error" });
                res.json({ success: true, providers: results });
            }
        );
    });

    /* ═══════════════════ REBOOK (clone a booking) ═══════════════════ */
    app.post(paths("/booking/:id/rebook"), verifyToken, (req, res) => {
        const bookingId = req.params.id;
        const customerId = req.user.id;

        db.query(
            "SELECT service, provider, provider_id, address, notes, amount, platform_fee, provider_earning FROM bookings WHERE id = ? AND customer_id = ?",
            [bookingId, customerId],
            (err, results) => {
                if (err || results.length === 0) return res.status(404).json({ success: false, message: "Booking not found" });
                const orig = results[0];
                const { booking_date, booking_time } = req.body;
                if (!booking_date || !booking_time) return res.status(400).json({ success: false, message: "New date and time required." });

                const sql = `INSERT INTO bookings (customer_id, customer_name, service, provider, provider_id, booking_date, booking_time, address, notes, amount, platform_fee, provider_earning)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                db.query(sql, [customerId, req.user.name, orig.service, orig.provider, orig.provider_id, booking_date, booking_time, orig.address, orig.notes || '', orig.amount, orig.platform_fee, orig.provider_earning], (err, result) => {
                    if (err) return res.status(500).json({ success: false, message: "Could not create rebook." });
                    res.json({ success: true, message: "Rebooked successfully!", booking: { id: result.insertId, amount: orig.amount } });
                });
            }
        );
    });

    /* ═══════════════════ CUSTOMER LOYALTY POINTS ═══════════════════ */
    app.get(paths("/customer/stats"), verifyToken, (req, res) => {
        const customerId = req.user.id;
        db.query(
            `SELECT 
                COUNT(*) as total_bookings,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN payment_status = 'Paid' THEN amount ELSE 0 END) as total_spent,
                SUM(CASE WHEN status = 'Completed' THEN 10 ELSE 0 END) as loyalty_points,
                COUNT(DISTINCT service) as services_used
             FROM bookings WHERE customer_id = ?`,
            [customerId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Database error" });
                const r = results[0] || {};
                res.json({
                    success: true,
                    stats: {
                        total_bookings: r.total_bookings || 0,
                        completed: r.completed || 0,
                        total_spent: parseFloat(r.total_spent) || 0,
                        loyalty_points: r.loyalty_points || 0,
                        services_used: r.services_used || 0
                    }
                });
            }
        );
    });

    /* ═══════════════════ NOTIFICATION HELPER ═══════════════════ */
    function createNotification(userId, type, title, body, meta) {
        if (!userId) return;
        db.query(
            "INSERT INTO notifications (user_id, type, title, body, meta) VALUES (?, ?, ?, ?, ?)",
            [userId, type || 'system', title, body || '', JSON.stringify(meta || {})],
            (err) => { if (err) console.error("Notif insert error:", err.message); }
        );
    }

    /* ═══════════════════ GET NOTIFICATIONS ═══════════════════ */
    app.get(paths("/notifications"), verifyToken, (req, res) => {
        db.query(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            [req.user.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
                res.json({ success: true, notifications: results });
            }
        );
    });

    /* ═══════════════════ MARK ALL READ (must be before :id/read!) ═══════════════════ */
    app.put(paths("/notifications/read-all"), verifyToken, (req, res) => {
        db.query(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
            [req.user.id],
            (err) => {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true });
            }
        );
    });

    /* ═══════════════════ MARK NOTIFICATION READ ═══════════════════ */
    app.put(paths("/notifications/:id/read"), verifyToken, (req, res) => {
        db.query(
            "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
            [req.params.id, req.user.id],
            (err) => {
                if (err) return res.status(500).json({ success: false });
                res.json({ success: true });
            }
        );
    });

    /* ═══════════════════ GET PROFILE ═══════════════════ */
    app.get(paths("/profile"), verifyToken, (req, res) => {
        db.query(
            "SELECT id, username, name, email, phone, role, service, location, city, created_at FROM users WHERE id = ?",
            [req.user.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Database error" });
                if (!results.length) return res.status(404).json({ success: false, message: "User not found" });
                res.json({ success: true, user: results[0] });
            }
        );
    });

    /* ═══════════════════ UPDATE PROFILE ═══════════════════ */
    app.put(paths("/profile"), verifyToken, [
        body("name").optional().isLength({ min: 2, max: 100 }).trim(),
        body("email").optional().isEmail().normalizeEmail(),
        body("phone").optional().matches(/^[0-9]{10}$/).withMessage("Phone must be 10 digits"),
    ], (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const { name, email, phone } = req.body;
        const updates = [];
        const values = [];

        if (name) { updates.push("name = ?"); values.push(name.trim()); }
        if (email) { updates.push("email = ?"); values.push(email.trim().toLowerCase()); }
        if (phone !== undefined) { updates.push("phone = ?"); values.push(phone || null); }

        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update" });

        values.push(req.user.id);

        // Check email uniqueness if email is being changed
        const checkAndUpdate = () => {
            db.query(
                `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
                values,
                (err) => {
                    if (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            return res.status(409).json({ success: false, message: "Email already in use by another account" });
                        }
                        return res.status(500).json({ success: false, message: "Database error" });
                    }
                    // Re-fetch updated user
                    db.query(
                        "SELECT id, username, name, email, phone, role, service, location, city FROM users WHERE id = ?",
                        [req.user.id],
                        (err2, results) => {
                            if (err2) return res.status(500).json({ success: false });
                            res.json({ success: true, message: "Profile updated", user: results[0] });
                        }
                    );
                }
            );
        };

        checkAndUpdate();
    });

    /* ═══════════════════ CHANGE PASSWORD ═══════════════════ */
    app.put(paths("/change-password"), verifyToken, [
        body("currentPassword").notEmpty().withMessage("Current password is required"),
        body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const { currentPassword, newPassword } = req.body;

        try {
            // Get current password hash
            const [rows] = await db.promise().query(
                "SELECT password FROM users WHERE id = ?",
                [req.user.id]
            );
            if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });

            const match = await bcrypt.compare(currentPassword, rows[0].password);
            if (!match) return res.status(401).json({ success: false, message: "Current password is incorrect" });

            const hash = await bcrypt.hash(newPassword, 10);
            await db.promise().query(
                "UPDATE users SET password = ? WHERE id = ?",
                [hash, req.user.id]
            );

            res.json({ success: true, message: "Password changed successfully" });
        } catch (err) {
            console.error("Change password error:", err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    });
}

module.exports = { attachRoutes };
