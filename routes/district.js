import db from "../database/database.js";

export default function District(app) {
    app.post('/districts', (req, res) => {
        const { district_name, province_id } = req.body;

        if (!district_name || !province_id) {
            return res.status(400).json({
                message: "district_name and province_id are required"
            });
        }

        // Check province exists
        const provinceCheck = `SELECT province_id FROM provinces WHERE province_id = ?`;

        db.query(provinceCheck, [province_id], (err, province) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (province.length === 0) {
                return res.status(404).json({ message: "Province not found" });
            }

            const sql = `
                INSERT INTO districts (district_name, province_id)
                VALUES (?, ?)
            `;

            db.query(sql, [district_name, province_id], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });

                res.status(201).json({
                    message: "District created successfully",
                    district_id: result.insertId
                });
            });
        });
    });
    app.get('/districts', (req, res) => {
        const sql = `
            SELECT d.district_id, d.district_name,
                   p.province_id, p.province_name
            FROM districts d
            JOIN provinces p ON d.province_id = p.province_id
            ORDER BY d.district_name ASC
        `;

        db.query(sql, (err, results) => {
            if (err) return res.status(500).json({ message: "Database error" });
            res.status(200).json(results);
        });
    });
    app.get('/districts/province/:province_id', (req, res) => {
        const { province_id } = req.params;

        const sql = `
            SELECT district_id, district_name
            FROM districts
            WHERE province_id = ?
            ORDER BY district_name ASC
        `;

        db.query(sql, [province_id], (err, results) => {
            if (err) return res.status(500).json({ message: "Database error" });
            res.status(200).json(results);
        });
    });
    app.get('/districts/:district_id', (req, res) => {
        const { district_id } = req.params;

        const sql = `
            SELECT d.district_id, d.district_name,
                   p.province_id, p.province_name
            FROM districts d
            JOIN provinces p ON d.province_id = p.province_id
            WHERE d.district_id = ?
        `;

        db.query(sql, [district_id], (err, results) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (results.length === 0) {
                return res.status(404).json({ message: "District not found" });
            }

            res.status(200).json(results[0]);
        });
    });
    app.put('/districts/:district_id', (req, res) => {
        const { district_id } = req.params;
        const { district_name, province_id } = req.body;

        if (!district_name || !province_id) {
            return res.status(400).json({
                message: "district_name and province_id are required"
            });
        }

        const sql = `
            UPDATE districts
            SET district_name = ?, province_id = ?
            WHERE district_id = ?
        `;

        db.query(sql, [district_name, province_id, district_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "District not found" });
            }

            res.status(200).json({ message: "District updated successfully" });
        });
    });
    app.delete('/districts/:district_id', (req, res) => {
        const { district_id } = req.params;

        const sql = `DELETE FROM districts WHERE district_id = ?`;

        db.query(sql, [district_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "District not found" });
            }

            res.status(200).json({ message: "District deleted successfully" });
        });
    });
}