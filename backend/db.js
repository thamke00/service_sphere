const mysql = require("mysql2");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

let poolConfig;

// Support: Render DATABASE_URL, Railway MYSQL* vars, or individual DB_* vars
if (process.env.DATABASE_URL) {
    poolConfig = { 
        uri: process.env.DATABASE_URL, 
        waitForConnections: true, 
        connectionLimit: 10,
        ssl: { rejectUnauthorized: false }
    };
} else {
    poolConfig = {
        host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
        user: process.env.MYSQLUSER || process.env.DB_USER || "root",
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
        database: process.env.MYSQLDATABASE || process.env.DB_NAME || "servicesphere",
        port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        ssl: { rejectUnauthorized: false }
    };
}

const db = mysql.createPool(poolConfig);

db.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database Connection Error:", err.message);
        return;
    }
    console.log("✓ MySQL connected successfully");
    connection.release();
});

module.exports = db;
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role ENUM('customer','provider') DEFAULT 'customer',
  service VARCHAR(100),
  location VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;
const createBookingsTable = `
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL
);
`;
if (require.main === module) {
    console.log("Creating tables...");
    db.query(createUsersTable, (err) => {
        if (err) {
            console.error("❌ Error creating users table:", err.message);
            process.exit(1);
        }
        console.log("✅ Users table ready!");

        db.query(createBookingsTable, (err) => {
            if (err) {
                console.error("❌ Error creating bookings table:", err.message);
                process.exit(1);
            }
            console.log("✅ Bookings table ready!");
            console.log("🚀 Database setup complete!");
            process.exit(0);
        });
    });
}
