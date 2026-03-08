import db from '../database/database.js';

export default function AvailabilityRoutes(app) {

    // GET availability for a lawyer
    app.get('/availability/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;
        console.log(`Fetching availability for lawyer_id: ${lawyer_id}`);

        const unavailableSql = "SELECT id, unavailable_date FROM lawyer_availability WHERE lawyer_id = ?";
        const workingHoursSql = "SELECT * FROM working_hours WHERE lawyer_id = ?";

        db.query(unavailableSql, [lawyer_id], (err, unavailable) => {
            if (err) {
                console.error("Error fetching unavailable dates:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }

            db.query(workingHoursSql, [lawyer_id], (err2, workingHours) => {
                if (err2) {
                    console.error("Error fetching working hours:", err2);
                    return res.status(500).json({ message: "Database error", error: err2.message });
                }

                console.log(`Successfully fetched availability for lawyer_id: ${lawyer_id}`);

                res.status(200).json({
                    unavailable_dates: unavailable.map(d => d.unavailable_date),
                    working_hours: workingHours
                });
            });
        });
    });

    // POST add unavailable date
    app.post('/availability/unavailable-dates', (req, res) => {
        const { lawyer_id, date } = req.body;
        console.log(`Adding unavailable date: ${date} for lawyer_id: ${lawyer_id}`);

        if (!lawyer_id || !date) {
            console.warn("Missing lawyer_id or date in POST request");
            return res.status(400).json({ message: "lawyer_id and date are required" });
        }
        const sql = "INSERT INTO lawyer_availability (lawyer_id, unavailable_date) VALUES (?, ?)";
        db.query(sql, [lawyer_id, date], (err, result) => {
            console.log("here is your data", result);
            if (err) {
                console.error("Error inserting unavailable date:", err);
                if (err.code === 'ER_DUP_ENTRY') {
                    console.log("Date already marked as unavailable");
                    return res.status(400).json({ message: "Date already marked as unavailable" });
                }
                console.error("Database error on availability", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            console.log("Data added successfully", result);
            res.status(201).json({ message: "Unavailable date added", id: result.insertId });
        });
    });

    // DELETE remove unavailable date
    app.delete('/availability/unavailable-dates', (req, res) => {
        const { lawyer_id, date } = req.body;
        console.log(`Deleting unavailable date: ${date} for lawyer_id: ${lawyer_id}`);

        if (!lawyer_id || !date) {
            return res.status(400).json({ message: "lawyer_id and date are required in the body" });
        }

        const sql = "DELETE FROM lawyer_availability WHERE lawyer_id = ? AND unavailable_date = ?";
        db.query(sql, [lawyer_id, date], (err, result) => {
            if (err) {
                console.error("Error deleting unavailable date:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }

            if (result.affectedRows === 0) {
                console.warn(`No record found to delete for lawyer_id: ${lawyer_id}, date: ${date}`);
                return res.status(404).json({ message: "Date not found for this lawyer" });
            }
            console.log("Unavailable date successfully removed");
            res.status(200).json({ message: "Unavailable date removed" });
        });
    });

    // DELETE clear all unavailable dates for a lawyer
    app.delete('/availability/clear-all', (req, res) => {
        const { lawyer_id } = req.body;
        console.log(`Clearing all unavailable dates for lawyer_id: ${lawyer_id}`);

        if (!lawyer_id) {
            return res.status(400).json({ message: "lawyer_id is required in the body" });
        }

        const sql = "DELETE FROM lawyer_availability WHERE lawyer_id = ?";
        db.query(sql, [lawyer_id], (err, result) => {
            if (err) {
                console.error("Error clearing all dates:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            console.log(`Successfully cleared ${result.affectedRows} dates for lawyer_id: ${lawyer_id}`);
            res.status(200).json({ message: "All unavailable dates cleared" });
        });
    });

    // PUT update working hours
    app.put('/availability/working-hours', (req, res) => {
        const { lawyer_id, day_of_week, start_time, end_time, is_closed } = req.body;
        console.log(`Updating working hours for lawyer_id: ${lawyer_id}, day: ${day_of_week}`);

        if (!lawyer_id || !day_of_week) {
            console.warn("Missing lawyer_id or day_of_week in PUT request");
            return res.status(400).json({ message: "lawyer_id and day_of_week are required" });
        }

        const sql = `
            INSERT INTO working_hours (lawyer_id, day_of_week, start_time, end_time, is_closed)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                start_time = VALUES(start_time),
                end_time = VALUES(end_time),
                is_closed = VALUES(is_closed)
        `;

        db.query(sql, [lawyer_id, day_of_week, start_time, end_time, is_closed], (err, result) => {
            if (err) {
                console.error("Error updating working hours:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            console.log(`Successfully updated working hours for ${day_of_week}`);
            res.status(200).json({ message: "Working hours updated" });
        });
    });
}
