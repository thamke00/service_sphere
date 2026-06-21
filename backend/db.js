const mysql = require("mysql2");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

let poolConfig;

if (process.env.DATABASE_URL) {
    poolConfig = {
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 5,
        maxIdle: 2,
        idleTimeout: 300000,      // 5 min — recycle idle connections before Aiven drops them
        connectTimeout: 20000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        timezone: 'Z',            // Treat all TIMESTAMP values as UTC
        dateStrings: false,       // Return Date objects (JSON.stringify will produce ISO with Z)
        ssl: { rejectUnauthorized: false }
    };
} else {
    poolConfig = {
        host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
        user: process.env.MYSQLUSER || process.env.DB_USER || "root",
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
        database: process.env.MYSQLDATABASE || process.env.DB_NAME || "servicesphere",
        port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
        waitForConnections: true,
        connectionLimit: 5,
        maxIdle: 2,
        idleTimeout: 300000,      // 5 min — recycle idle connections before Aiven drops them
        connectTimeout: 20000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        timezone: 'Z',            // Treat all TIMESTAMP values as UTC
        dateStrings: false,       // Return Date objects (JSON.stringify will produce ISO with Z)
        ssl: { rejectUnauthorized: false }
    };
}

const db = mysql.createPool(poolConfig);

// Handle pool-level errors (e.g. sudden disconnect) without crashing the server
db.on("error", (err) => {
    console.error("❌ Database pool error:", err.code, err.message);
});

// ── Keep-alive: ping every 4 minutes (Aiven cuts idle at ~8 min) ──
// Gets a fresh connection from the pool each time so stale ones are discarded
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
setInterval(keepAlive, 4 * 60 * 1000); // every 4 minutes

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
  status ENUM('Pending','Accepted','In Progress','Completed','Cancelled') DEFAULT 'Pending',
  payment_status ENUM('Unpaid', 'Paid') DEFAULT 'Unpaid',
  amount DECIMAL(10,2) DEFAULT 499.00,
  platform_fee DECIMAL(10,2) DEFAULT 0.00,
  provider_earning DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL
);
`;

const createAvailabilityTable = `
CREATE TABLE IF NOT EXISTS provider_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sun, 1=Mon, ... 6=Sat',
  start_time TIME NOT NULL DEFAULT '09:00:00',
  end_time TIME NOT NULL DEFAULT '18:00:00',
  is_available TINYINT(1) DEFAULT 1,
  UNIQUE KEY unique_provider_day (provider_id, day_of_week),
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
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

const createReviewsTable = `
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  provider_id INT NOT NULL,
  rating TINYINT NOT NULL,
  review_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

const createPasswordResetTable = `
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_reset (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

const createNotificationsTable = `
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'system',
  title VARCHAR(255) NOT NULL,
  body TEXT,
  meta JSON,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

// ── Safe index creation (ignores duplicate index errors) ──
function addIndexIfMissing(table, indexName, columns) {
    db.query(`CREATE INDEX ${indexName} ON ${table} (${columns})`, (err) => {
        if (err && !err.message.includes('Duplicate')) {
            console.error(`❌ Index ${indexName} error:`, err.message);
        } else if (!err) {
            console.log(`✓ Index ${indexName} created on ${table}`);
        }
    });
}

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

// ── Generate unique username from name ──
function generateUsername(name, callback, attempt) {
    attempt = attempt || 0;
    // slugify: lowercase, replace spaces/special chars with underscore, trim
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
        // collision – retry with incremented suffix
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
        addColumnIfMissing("users", "service_price", "service_price DECIMAL(10,2) DEFAULT NULL");

        // Backfill usernames for existing users without one
        db.query("SELECT id, name FROM users WHERE username IS NULL", (err, users) => {
            if (err) return console.error("❌ Username backfill error:", err.message);
            if (users.length > 0) {
                console.log(`📝 Backfilling usernames for ${users.length} users...`);
                let done = 0;
                users.forEach(u => {
                    generateUsername(u.name, (genErr, uname) => {
                        if (genErr) { done++; return; }
                        db.query("UPDATE users SET username = ? WHERE id = ?", [uname, u.id], () => { done++; });
                    });
                });
                // Check completion
                const checkDone = setInterval(() => {
                    if (done >= users.length) {
                        clearInterval(checkDone);
                        console.log("✓ Usernames backfilled");
                    }
                }, 200);
            }
        });

        db.query(createBookingsTable, (err) => {
            if (err) return console.error("❌ Bookings table migration error:", err.message);

            addColumnIfMissing("bookings", "payment_status", "payment_status ENUM('Unpaid', 'Paid') DEFAULT 'Unpaid'");
            addColumnIfMissing("bookings", "amount", "amount DECIMAL(10,2) DEFAULT 499.00");
            addColumnIfMissing("bookings", "provider_id", "provider_id INT NULL");
            addColumnIfMissing("bookings", "platform_fee", "platform_fee DECIMAL(10,2) DEFAULT 0.00");
            addColumnIfMissing("bookings", "provider_earning", "provider_earning DECIMAL(10,2) DEFAULT 0.00");

            // Expand status ENUM to include 'In Progress' (safe: ALTER ignores if already present)
            db.query(`ALTER TABLE bookings MODIFY COLUMN status ENUM('Pending','Accepted','In Progress','Completed','Cancelled') DEFAULT 'Pending'`, (err) => {
                if (err && !err.message.includes('Duplicate')) console.warn("⚠️ Status ENUM expansion:", err.message);
                else if (!err) console.log("✓ Bookings status ENUM expanded (In Progress)");
            });

            // Add FK for provider_id if missing
            db.query(`
                SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND CONSTRAINT_NAME = 'fk_booking_provider'
            `, (err, fks) => {
                if (!err && fks.length === 0) {
                    db.query(`
                        ALTER TABLE bookings ADD CONSTRAINT fk_booking_provider
                        FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL
                    `, (fkErr) => {
                        if (fkErr) console.error("❌ FK provider_id error:", fkErr.message);
                        else console.log("✓ bookings.provider_id FK added");
                    });
                }
            });

            // Backfill provider_id from provider name
            db.query(`
                UPDATE bookings b
                JOIN users u ON LOWER(TRIM(b.provider)) = LOWER(TRIM(u.name)) AND u.role = 'provider'
                SET b.provider_id = u.id
                WHERE b.provider_id IS NULL AND b.provider IS NOT NULL AND TRIM(b.provider) != ''
            `, (err, result) => {
                if (err) console.error("❌ Provider ID backfill error:", err.message);
                else if (result.affectedRows > 0) console.log(`✓ Backfilled provider_id for ${result.affectedRows} bookings`);
            });

            db.query(createPaymentsTable, (err) => {
                if (err) console.error("❌ Payments table migration error:", err.message);
                else console.log("✓ Payments table ready!");
            });

            db.query(createMessagesTable, (err) => {
                if (err) console.error("❌ Messages table migration error:", err.message);
                else console.log("✓ Messages table ready!");
            });

            db.query(createReviewsTable, (err) => {
                if (err) console.error("❌ Reviews table migration error:", err.message);
                else console.log("✓ Reviews table ready!");
            });

            db.query(createPasswordResetTable, (err) => {
                if (err) console.error("❌ Password reset table migration error:", err.message);
                else console.log("✓ Password reset tokens table ready!");
            });

            db.query(createAvailabilityTable, (err) => {
                if (err) console.error("❌ Availability table migration error:", err.message);
                else console.log("✓ Provider availability table ready!");
            });

            db.query(createNotificationsTable, (err) => {
                if (err) console.error("❌ Notifications table migration error:", err.message);
                else console.log("✓ Notifications table ready!");
            });

            db.query("SHOW COLUMNS FROM messages LIKE 'receiver_id'", (err, cols) => {
                if (!err && cols.length > 0 && cols[0].Null === "NO") {
                    db.query("ALTER TABLE messages MODIFY receiver_id INT NULL", (e) => {
                        if (!e) console.log("✓ messages.receiver_id allows NULL");
                    });
                }
            });

            // ── Performance indexes ──
            console.log("📇 Checking indexes...");
            addIndexIfMissing("users", "idx_users_email", "email");
            addIndexIfMissing("users", "idx_users_username", "username");
            addIndexIfMissing("users", "idx_users_service", "service");
            addIndexIfMissing("users", "idx_users_verification", "verification_status");
            addIndexIfMissing("users", "idx_users_role", "role");
            addIndexIfMissing("users", "idx_users_city", "city");
            addIndexIfMissing("bookings", "idx_bookings_customer", "customer_id");
            addIndexIfMissing("bookings", "idx_bookings_provider", "provider_id");
            addIndexIfMissing("bookings", "idx_bookings_status", "status");
            addIndexIfMissing("bookings", "idx_bookings_date", "booking_date");
            addIndexIfMissing("messages", "idx_messages_booking", "booking_id");
            addIndexIfMissing("reviews", "idx_reviews_provider", "provider_id");
            addIndexIfMissing("reviews", "idx_reviews_customer", "customer_id");
            addIndexIfMissing("provider_availability", "idx_avail_provider", "provider_id");
            addIndexIfMissing("notifications", "idx_notif_user", "user_id");
            addIndexIfMissing("notifications", "idx_notif_read", "is_read");
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
