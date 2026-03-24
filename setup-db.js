const db = require('./backend/db');

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

