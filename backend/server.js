const path = require("path");
// load env from backend directory explicitly (start script runs from project root)
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("./db");

/* ===================================================
   TEST DATABASE CONNECTION
=================================================== */

db.getConnection((err, connection) => {

    if (err) {
        console.error("❌ Database Connection Error:", err);
        return;
    }

    console.log("✓ MySQL connected successfully (Pool)");
    connection.release();
});


module.exports = db;

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key_change_in_production";

// Middleware
app.use(cors({
    origin: "*",
    credentials: false
}));
app.use(express.json());
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
    body("password")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters"),
    body("phone").trim().notEmpty().withMessage("Phone is required"),
    body("role").isIn(["customer", "provider"]).withMessage("Invalid role")
], async (req, res) => {
    
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { name, email, password, phone, role } = req.body;

        // Check if user already exists
        db.query("SELECT email FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error" });
            }

            if (results.length > 0) {
                return res.status(400).json({ success: false, message: "Email already registered" });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert user
            const sql = "INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)";
            db.query(sql, [name, email, hashedPassword, phone, role], (err) => {
                if (err) {
                    console.error("Registration DB Error:", err);
                    return res.status(500).json({ success: false, message: "Registration failed" });
                }
                return res.status(201).json({ success: true, message: "Registered Successfully" });
            });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ================= LOGIN USER ================= */
/* ================= LOGIN USER ================= */
app.post("/login", async (req, res) => {

    console.log("LOGIN BODY:", req.body);

    const { email, password } = req.body;

    const sql = "SELECT id, name, email, password, role FROM users WHERE email=?";

    db.query(sql, [email], async (err, results) => {

        if (err) {
    console.error("LOGIN DATABASE ERROR:", err); // ⭐ IMPORTANT
    return res.status(500).json({
        success:false,
        message:"Database error"
        });
        }
        if (results.length === 0) {
            return res.json({ success: false, message: "Invalid email or password" });
        }

        const user = results[0];

        // ✅ compare hashed password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({ success: false, message: "Invalid email or password" });
        }

        // ✅ create token
       const token = jwt.sign(
    {
        id: user.id,
        name: user.name,   // ⭐ ADD THIS
        email: user.email,
        role: user.role
     },
     JWT_SECRET,
      { expiresIn: "24h" }
    );

        // ✅ send response
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    });
});


/* ================= GET BOOKINGS ================= */
app.get("/bookings", verifyToken, (req, res) => {
    const sql = "SELECT * FROM bookings WHERE customer_id = ? ORDER BY booking_date DESC";
    db.query(sql, [req.user.id], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Failed to fetch bookings" });
        }
        res.json({ success: true, bookings: results });
    });
});

/* ================= UPDATE BOOKING STATUS ================= */
app.put("/booking/:id", verifyToken, [
    body("status").isIn(["Pending", "Accepted", "Completed", "Cancelled"]).withMessage("Invalid status")
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const bookingId = req.params.id;
        const { status } = req.body;

        // Verify ownership
        const checkSql = "SELECT customer_id FROM bookings WHERE id = ?";
        db.query(checkSql, [bookingId], (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ success: false, message: "Booking not found" });
            }

            if (results[0].customer_id !== req.user.id) {
                return res.status(403).json({ success: false, message: "Unauthorized" });
            }

            const updateSql = "UPDATE bookings SET status = ? WHERE id = ?";
            db.query(updateSql, [status, bookingId], (err) => {
                if (err) {
                    console.error("Update Booking Error:", err);
                    return res.status(500).json({ success: false, message: "Failed to update booking" });
                }
                res.json({ success: true, message: "Booking updated successfully" });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ================= CANCEL BOOKING ================= */
app.delete("/booking/:id", verifyToken, (req, res) => {
    try {
        const bookingId = req.params.id;

        // Verify ownership
        const checkSql = "SELECT customer_id FROM bookings WHERE id = ?";
        db.query(checkSql, [bookingId], (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ success: false, message: "Booking not found" });
            }

            if (results[0].customer_id !== req.user.id) {
                return res.status(403).json({ success: false, message: "Unauthorized" });
            }

            const deleteSql = "DELETE FROM bookings WHERE id = ?";
            db.query(deleteSql, [bookingId], (err) => {
                if (err) {
                    console.error("Delete Booking Error:", err);
                    return res.status(500).json({ success: false, message: "Failed to cancel booking" });
                }
                res.json({ success: true, message: "Booking cancelled successfully" });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/* ================= LOGOUT (Optional - mainly client-side) ================= */
app.post("/logout", verifyToken, (req, res) => {
    // In JWT, logout is mainly handled on the client side by removing the token
    res.json({ success: true, message: "Logged out successfully" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});
/* ===============PROVIDER BOOKINGS (For providers to view their bookings)================= */
app.get("/provider-bookings", verifyToken, (req, res) => {

    const providerName = req.user.name;

    const sql = `
        SELECT * FROM bookings
        WHERE provider = ?
        ORDER BY booking_date DESC
    `;

    db.query(sql, [providerName], (err, results) => {

        if (err) {
            console.log("Provider booking error:", err);
            return res.json({ success:false });
        }

        res.json({
            success:true,
            bookings: results
        });
    });
});
