import mysql from 'mysql2';

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "law_link"
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to DB:', err);
        return;
    }
    console.log('Connected to DB');
    
    db.query("DESCRIBE admins", (err, results) => {
        if (err) {
            console.error('Error describing table:', err);
        } else {
            console.log('Table Structure:', JSON.stringify(results, null, 2));
        }
        db.end();
    });
});
