const mysql = require("mysql2");
require("dotenv").config({ path: "c:/Users/Vikas/OneDrive/Desktop/servicesphere/backend/.env" });

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

db.query("SELECT * FROM bookings", (err, results) => {
    if (err) {
        console.error("Error fetching bookings:", err);
        process.exit(1);
    }
    console.log("All Bookings:");
    console.table(results);

    db.query("SELECT * FROM users", (err, users) => {
        if (err) {
            console.error("Error fetching users:", err);
            process.exit(1);
        }
        console.log("\nAll Users:");
        console.table(users.map(u => ({ id: u.id, name: u.name, role: u.role, service: u.service })));
        process.exit(0);
    });
});
