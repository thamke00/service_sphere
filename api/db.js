const mysql = require("mysql2");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

let poolConfig;

if (process.env.DATABASE_URL) {
    poolConfig = {
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
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
        maxIdle: 10,
        idleTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: { rejectUnauthorized: false }
    };
}

const db = mysql.createPool(poolConfig);

db.on("error", (err) => {
    console.error("❌ Database pool error:", err.message);
});

// Keep-alive ping every 4 minutes (recycles idle connections)
function keepAlive() {
    db.getConnection((err, conn) => {
        if (err) {
            console.warn("⚠️ Keep-alive: could not get connection –", err.message);
            return;
        }
        conn.query("SELECT 1", (pingErr) => {
            conn.release();
            if (pingErr) console.warn("⚠️ Keep-alive ping failed –", pingErr.message);
        });
    });
}
setInterval(keepAlive, 4 * 60 * 1000);

const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(30) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role ENUM('customer','provider') DEFAULT 'customer',
  service VARCHAR(100),
  location VARCHAR(100),
  address_line VARCHAR(255),
  city VARCHAR(100),
  pincode VARCHAR(10),
  verification_status ENUM('pending','approved','rejected') DEFAULT NULL,
  aadhaar_proof MEDIUMTEXT,
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
  provider_id INT NULL,
  booking_date DATE,
  booking_time TIME,
  address TEXT,
  notes TEXT,
  status ENUM('Pending','Accepted','Completed','Cancelled') DEFAULT 'Pending',
  payment_status ENUM('Unpaid', 'Paid') DEFAULT 'Unpaid',
  amount DECIMAL(10,2) DEFAULT 499.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL
);
`;

const createPaymentsTable = `
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'Success',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);
`;

const createMessagesTable = `
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sender_id INT NOT NULL,
  receiver_id INT,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);
`;

function addColumnIfMissing(table, column, definition) {
    db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column], (err, results) => {
        if (!err && results.length === 0) {
            db.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`, (alterErr) => {
                if (alterErr) console.error(`❌ Error adding ${table}.${column}:`, alterErr.message);
                else console.log(`✓ Added ${table}.${column}`);
            });
        }
    });
}

/* ============ generateUsername (collision-safe) ============ */
function generateUsername(name, callback, attempt) {
    attempt = attempt || 0;
    let base = name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 20);
    if (!base) base = 'user';
    const suffix = attempt > 0 ? '_' + (attempt + 1) : '';
    const candidate = base + suffix;
    db.query('SELECT id FROM users WHERE username = ?', [candidate], (err, results) => {
        if (err) return callback(err);
        if (results.length === 0) return callback(null, candidate);
        generateUsername(name, callback, attempt + 1);
    });
}

function runMigrations() {
    console.log("🚀 Running database migrations...");
    db.query(createUsersTable, (err) => {
        if (err) return console.error("❌ Users table migration error:", err.message);

        addColumnIfMissing("users", "username", "username VARCHAR(30) UNIQUE");
        addColumnIfMissing("users", "address_line", "address_line VARCHAR(255)");
        addColumnIfMissing("users", "city", "city VARCHAR(100)");
        addColumnIfMissing("users", "pincode", "pincode VARCHAR(10)");
        addColumnIfMissing("users", "verification_status", "verification_status ENUM('pending','approved','rejected') DEFAULT NULL");
        addColumnIfMissing("users", "aadhaar_proof", "aadhaar_proof MEDIUMTEXT");

        // Backfill usernames for existing users who have NULL
        db.query("SELECT id, name FROM users WHERE username IS NULL", (uErr, users) => {
            if (uErr) return console.error("❌ Username backfill select error:", uErr.message);
            users.forEach((u) => {
                generateUsername(u.name, (gErr, uname) => {
                    if (!gErr) {
                        db.query("UPDATE users SET username = ? WHERE id = ?", [uname, u.id]);
                    }
                });
            });
        });

        db.query(createBookingsTable, (err) => {
            if (err) return console.error("❌ Bookings table migration error:", err.message);

            addColumnIfMissing("bookings", "payment_status", "payment_status ENUM('Unpaid', 'Paid') DEFAULT 'Unpaid'");
            addColumnIfMissing("bookings", "amount", "amount DECIMAL(10,2) DEFAULT 499.00");
            addColumnIfMissing("bookings", "provider_id", "provider_id INT NULL");

            // Add FK for provider_id if missing
            db.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_NAME='bookings' AND CONSTRAINT_TYPE='FOREIGN KEY' AND REFERENCED_TABLE_NAME='users' AND COLUMN_NAME='provider_id'", (fkErr, fkRows) => {
                if (!fkErr && fkRows.length === 0) {
                    db.query("ALTER TABLE bookings ADD FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL", (aErr) => {
                        if (!aErr) console.log("✓ Added provider_id FK to bookings");
                    });
                }
            });

            // Backfill provider_id from existing bookings by matching provider name
            db.query(`UPDATE bookings b JOIN users u ON LOWER(TRIM(b.provider)) = LOWER(TRIM(u.name)) AND u.role = 'provider' SET b.provider_id = u.id WHERE b.provider_id IS NULL AND b.provider IS NOT NULL AND b.provider != ''`, (bErr) => {
                if (!bErr) console.log("✓ provider_id backfill complete");
            });

            db.query(createPaymentsTable, (err) => {
                if (err) console.error("❌ Payments table migration error:", err.message);
                else console.log("✓ Payments table ready!");
            });

            db.query(createMessagesTable, (err) => {
                if (err) console.error("❌ Messages table migration error:", err.message);
                else console.log("✓ Messages table ready!");
            });

            db.query("SHOW COLUMNS FROM messages LIKE 'receiver_id'", (err, cols) => {
                if (!err && cols.length > 0 && cols[0].Null === "NO") {
                    db.query("ALTER TABLE messages MODIFY receiver_id INT NULL", (e) => {
                        if (!e) console.log("✓ messages.receiver_id allows NULL");
                    });
                }
            });
        });
    });
}

db.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database Connection Error:", err.message);
        return;
    }
    console.log("✓ MySQL connected successfully");
    connection.release();
    runMigrations();
});

module.exports = db;
module.exports.generateUsername = generateUsername;
