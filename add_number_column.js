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
    const sql = "ALTER TABLE admins ADD COLUMN number VARCHAR(50) AFTER phone_number";
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error adding column:', err.message);
        } else {
            console.log('Column added successfully');
        }
        db.end();
    });
});
