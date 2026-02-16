import db from '../database/database.js';



export default function Lawslocation(app){
    app.post('/lawyer-location', (req, res) => {
        const { lawyer_id, district_id, physical_address } = req.body;
    
        const sql = `
            INSERT INTO lawyer_locations (lawyer_id, district_id, physical_address)
            VALUES (?, ?, ?)
        `;
    
        db.query(sql, [lawyer_id, district_id, physical_address], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({
                message: 'Lawyer location added successfully',
                location_id: result.insertId
            });
        });
    });
    app.get('/lawyer-locations', (req, res) => {
        const sql = `
            SELECT ll.location_id, ll.physical_address,
                   l.full_name AS lawyer_name,
                   d.district_name
            FROM lawyer_locations ll
            JOIN lawyers l ON ll.lawyer_id = l.lawyer_id
            JOIN districts d ON ll.district_id = d.district_id
        `;
    
        db.query(sql, (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(results);
        });
    });
    app.get('/lawyer-locations/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;
    
        const sql = `
            SELECT ll.location_id, ll.physical_address, d.district_name
            FROM lawyer_locations ll
            JOIN districts d ON ll.district_id = d.district_id
            WHERE ll.lawyer_id = ?
        `;
    
        db.query(sql, [lawyer_id], (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(results);
        });
    });
    app.put('/lawyer-location/:location_id', (req, res) => {
        const { location_id } = req.params;
        const { district_id, physical_address } = req.body;
    
        const sql = `
            UPDATE lawyer_locations
            SET
                district_id = COALESCE(?, district_id),
                physical_address = COALESCE(?, physical_address)
            WHERE location_id = ?
        `;
    
        db.query(sql, [district_id, physical_address, location_id], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Lawyer location updated successfully' });
        });
    });
    app.delete('/lawyer-location/:location_id', (req, res) => {
        const { location_id } = req.params;
    
        const sql = `DELETE FROM lawyer_locations WHERE location_id = ?`;
    
        db.query(sql, [location_id], (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Lawyer location deleted successfully' });
        });
    });
    
}