/**
 * Setup Script - Create Database Tables on Railway MySQL
 * 
 * Run this script to initialize your database:
 * node backend/setup.js
 */

require("dotenv").config();
const mysql = require("mysql2");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error("❌ Database Connection Error:", err.message);
        process.exit(1);
    }
    console.log("✓ Connected to Railway MySQL");
    createTables();
});

function createTables() {
    // Create users table
    const usersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            role ENUM('customer', 'provider') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.query(usersTable, (err) => {
        if (err) {
            console.error("❌ Error creating users table:", err.message);
            db.end();
            process.exit(1);
        }
        console.log("✓ Users table created/verified");
        createBookingsTable();
    });
}

function createBookingsTable() {
    // Create bookings table
    const bookingsTable = `
        CREATE TABLE IF NOT EXISTS bookings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            customer_id INT NOT NULL,
            customer_name VARCHAR(255) NOT NULL,
            service VARCHAR(100) NOT NULL,
            provider VARCHAR(255) NOT NULL,
            booking_date DATE NOT NULL,
            booking_time TIME NOT NULL,
            address VARCHAR(500) NOT NULL,
            notes TEXT,
            status ENUM('Pending', 'Accepted', 'Completed', 'Cancelled') DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES users(id)
        )
    `;

    db.query(bookingsTable, (err) => {
        if (err) {
            console.error("❌ Error creating bookings table:", err.message);
            db.end();
            process.exit(1);
        }
        console.log("✓ Bookings table created/verified");
        insertTestData();
    });
}

function insertTestData() {
    // Insert test user
    const testUserEmail = "testuser@example.com";
    
    const checkUser = `SELECT id FROM users WHERE email = ?`;
    
    db.query(checkUser, [testUserEmail], (err, results) => {
        if (err) {
            console.error("❌ Error checking test user:", err.message);
            db.end();
            process.exit(1);
        }
        
        if (results.length === 0) {
            // Insert test user
            const bcrypt = require("bcrypt");
            const hashedPassword = require("crypto")
                .createHash("sha256")
                .update("Password123")
                .digest("hex");
            
            const insertUser = `
                INSERT INTO users (name, email, password, phone, role) 
                VALUES ('Test User', ?, ?, '9876543210', 'customer')
            `;
            
            db.query(insertUser, [testUserEmail, hashedPassword], (err) => {
                if (err) {
                    console.error("❌ Error inserting test user:", err.message);
                    db.end();
                    process.exit(1);
                }
                console.log("✓ Test user created");
                console.log("  Email: testuser@example.com");
                console.log("  Password: Password123");
                insertTestBookings();
            });
        } else {
            console.log("✓ Test user already exists");
            insertTestBookings();
        }
    });
}

function insertTestBookings() {
    const userId = 1; // Default test user ID after insertion
    
    const bookingsQuery = `SELECT COUNT(*) as count FROM bookings`;
    
    db.query(bookingsQuery, (err, results) => {
        if (err) {
            console.error("❌ Error checking bookings:", err.message);
            db.end();
            process.exit(1);
        }
        
        if (results[0].count === 0) {
            const insertBookings = `
                INSERT INTO bookings (customer_id, customer_name, service, provider, booking_date, booking_time, address, notes, status) 
                VALUES 
                (?, 'Test User', 'Electrician', 'Ramesh Electrician', '2026-02-20', '10:00:00', '123 Main St, City', 'Fix ceiling fan', 'Pending'),
                (?, 'Test User', 'Plumber', 'Suresh Plumber', '2026-02-21', '14:00:00', '456 Oak Ave, Town', 'Leaky tap repair', 'Accepted'),
                (?, 'Test User', 'Electrician', 'Ramesh Electrician', '2026-02-22', '09:00:00', '789 Pine Rd, Village', 'Install new lights', 'Completed')
            `;
            
            db.query(insertBookings, [userId, userId, userId], (err) => {
                if (err) {
                    console.error("❌ Error inserting test bookings:", err.message);
                    db.end();
                    process.exit(1);
                }
                console.log("✓ Test bookings created (3 bookings)");
                finishSetup();
            });
        } else {
            console.log("✓ Test bookings already exist");
            finishSetup();
        }
    });
}

function finishSetup() {
    db.end();
    console.log("\n✅ Database setup completed successfully!");
    console.log("\nYour app is ready to use on Railway! 🚀");
    process.exit(0);
}
