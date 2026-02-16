import  mysql from 'mysql2';
const db = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "",
        database: "law_link"
});

export default db;