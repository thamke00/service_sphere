const mysql = require("mysql2");
require("dotenv").config({ path: "c:/Users/Vikas/OneDrive/Desktop/servicesphere/backend/.env" });

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

db.query("SELECT * FROM users", (err, results) => {
    if (err) {
        console.error("Error fetching users:", err);
        process.exit(1);
    }
    console.log(`Total Users: ${results.length}`);
    results.forEach(u => {
        console.log(`ID: ${u.id}, Name: "${u.name}", Role: ${u.role}, Service: ${u.service}`);
    });

    db.query("SELECT * FROM bookings ORDER BY id DESC LIMIT 10", (err, bookings) => {
        if (err) {
            console.error("Error fetching bookings:", err);
            process.exit(1);
        }
        console.log(`\nRecent Bookings:`);
        bookings.forEach(b => {
            console.log(`ID: ${b.id}, Customer: "${b.customer_name}", Provider: "${b.provider}", Service: "${b.service}"`);
        });
        process.exit(0);
    });
});
