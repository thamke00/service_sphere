const mysql = require("mysql2");
const path  = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

let poolConfig;

// Support: Render DATABASE_URL, Railway MYSQL* vars, or individual DB_* vars
if (process.env.DATABASE_URL) {
    poolConfig = { uri: process.env.DATABASE_URL, waitForConnections: true, connectionLimit: 10 };
} else {
    poolConfig = {
        host:     process.env.MYSQLHOST     || process.env.DB_HOST     || "localhost",
        user:     process.env.MYSQLUSER     || process.env.DB_USER     || "root",
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
        database: process.env.MYSQLDATABASE || process.env.DB_NAME     || "servicesphere",
        port:     process.env.MYSQLPORT     || process.env.DB_PORT     || 3306,
        waitForConnections: true,
        connectionLimit: 10
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
