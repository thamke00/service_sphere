const mysql = require("mysql2");
require("dotenv").config();

/* ===================================================
   DATABASE CONNECTION (LOCAL ENV VERSION)
=================================================== */

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


/* ===================================================
   TEST DATABASE CONNECTION
=================================================== */

db.getConnection((err, connection) => {

    if (err) {
        console.error("❌ Database Connection Error:", err.message);
        return;
    }

    console.log("✓ MySQL connected successfully");
    connection.release();
});

module.exports = db;
