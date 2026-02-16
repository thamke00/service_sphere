const mysql = require("mysql2");

// Railway + Local support
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
});

module.exports = db;
