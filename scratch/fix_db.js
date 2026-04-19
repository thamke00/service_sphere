const db = require('./backend/db');
db.query("UPDATE users SET service = 'Electrician' WHERE name = 'ramesh'", (err) => {
    if (err) console.error(err);
    db.query("UPDATE users SET service = 'Chef' WHERE name = 'Sanskruti'", (err) => {
        if (err) console.error(err);
        console.log('✓ Database Cleaned & Updated');
        process.exit(0);
    });
});
