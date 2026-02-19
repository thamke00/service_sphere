const mysql = require("mysql2");

// log environment values for troubleshooting
console.log("DB config", {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ? "<hidden>" : undefined,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "service_sphere",
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error("Database Connection Error:", err);
        return;
    }

    console.log("✓ MySQL connected successfully");

    // ✅ CREATE USERS TABLE
    const usersTable = `
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role ENUM('customer','provider') DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    db.query(usersTable, (err) => {
        if (err) console.error("Users table error:", err);
        else console.log("✓ Users table ready");
    });

    // ✅ CREATE BOOKINGS TABLE
    const bookingsTable = `
    CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        customer_name VARCHAR(100),
        service VARCHAR(100),
        provider VARCHAR(100),
        booking_date DATE,
        booking_time TIME,
        address TEXT,
        notes TEXT,
        status ENUM('Pending','Accepted','Completed','Cancelled') DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    db.query(bookingsTable, (err) => {
        if (err) console.error("Bookings table error:", err);
        else console.log("✓ Bookings table ready");
    });
});

module.exports = db;
