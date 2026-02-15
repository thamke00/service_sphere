const mysql = require("mysql2");

// Use environment variables for security
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "service_sphere"
});

db.connect((err) => {
    if(err) {
        console.error("Database Connection Error:", err);
        throw err;
    }
    console.log("✓ MySQL connected successfully");
});

module.exports = db;