const mysql = require("mysql2");

const db = mysql.createConnection({
    host: process.env.MYSQLHOST || "localhost",
    user: process.env.MYSQLUSER || "root",
    password: process.env.MYSQLPASSWORD || "",
    database: process.env.MYSQLDATABASE || "service_sphere",
    port: process.env.MYSQLPORT || 3306
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
