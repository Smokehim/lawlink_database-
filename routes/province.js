import db from '../database/database.js';


export default function Province(app){
    app.post('/provinces', (req, res) => {
    const { province_name } = req.body;

    if (!province_name) {
        return res.status(400).json({ message: "Province name is required" });
    }

    const sql = `INSERT INTO provinces (province_name) VALUES (?)`;

    db.query(sql, [province_name], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: "Province already exists" });
            }
            return res.status(500).json({ message: "Database error" });
        }

        res.status(201).json({
            message: "Province created successfully",
            province_id: result.insertId
        });
    });
});

app.get('/provinces', (req, res) => {
    const sql = `SELECT * FROM provinces ORDER BY province_name ASC`;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });

        res.status(200).json(results);
    });
});
app.get('/provinces/:province_id', (req, res) => {
    const { province_id } = req.params;

    const sql = `SELECT * FROM provinces WHERE province_id = ?`;

    db.query(sql, [province_id], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (results.length === 0) {
            return res.status(404).json({ message: "Province not found" });
        }

        res.status(200).json(results[0]);
    });
});
app.put('/provinces/:province_id', (req, res) => {
    const { province_id } = req.params;
    const { province_name } = req.body;

    if (!province_name) {
        return res.status(400).json({ message: "Province name is required" });
    }

    const sql = `
        UPDATE provinces 
        SET province_name = ?
        WHERE province_id = ?
    `;

    db.query(sql, [province_name, province_id], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: "Province name already exists" });
            }
            return res.status(500).json({ message: "Database error" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Province not found" });
        }

        res.status(200).json({ message: "Province updated successfully" });
    });
});
app.delete('/provinces/:province_id', (req, res) => {
    const { province_id } = req.params;

    const checkSql = `
        SELECT * FROM districts WHERE province_id = ?
    `;

    db.query(checkSql, [province_id], (err, rows) => {
        if (err) return res.status(500).json({ message: "Database error" });

        if (rows.length > 0) {
            return res.status(400).json({
                message: "Cannot delete province with existing districts"
            });
        }

        const deleteSql = `DELETE FROM provinces WHERE province_id = ?`;

        db.query(deleteSql, [province_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Province not found" });
            }

            res.status(200).json({ message: "Province deleted successfully" });
        });
    });
});
}