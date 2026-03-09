import db from './database.js';

const queries = [
    "ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;",
    "ALTER TABLE lawyers ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;",
    "ALTER TABLE admins ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;"
];

let completed = 0;

queries.forEach(query => {
    db.query(query, (err) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log(`Column already exists for query: ${query.split(' ')[2]}`);
            } else {
                console.error(`Error executing query: ${query}`, err);
            }
        } else {
            console.log(`Successfully added profile_picture to table.`);
        }
        
        completed++;
        if (completed === queries.length) {
            console.log("Migration complete.");
            process.exit(0);
        }
    });
});
