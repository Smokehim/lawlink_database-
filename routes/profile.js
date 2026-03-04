import db from '../database/database.js';
import bcrypt from 'bcrypt';

export default function Profile(app) {

    // Update a user's profile
    app.put('/profile/user/:user_id', async (req, res) => {
        try {
            const { user_id } = req.params;
            const { full_name, email, phone_number, gender, password } = req.body;
            let hashedPassword = null;
            if (password) {
                const salt = await bcrypt.genSalt(10);
                hashedPassword = await bcrypt.hash(password, salt);
            }

            let updates = [];
            let params = [];

            if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
            if (email !== undefined) { updates.push('email = ?'); params.push(email); }
            if (phone_number !== undefined) { updates.push('phone_number = ?'); params.push(phone_number); }
            if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
            if (hashedPassword) { updates.push('password = ?'); params.push(hashedPassword); }

            if (updates.length === 0) {
                return res.status(400).json({ message: "No fields to update" });
            }

            params.push(user_id);
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;

            db.query(sql, params, (error, result) => {
                if (error) return res.status(500).json({ message: "Database error", error: error.message });
                if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
                res.status(200).json({ message: `User updated successfully.` });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error on updating user" });
        }
    });

    // Delete a user's account (self-delete)
    app.delete('/profile/user', (req, res) => {
        try {
            const { user_id, email, password } = req.body;

            const selectSql = `SELECT * FROM users WHERE user_id = ? AND email = ?`;
            db.query(selectSql, [user_id, email], async (error, result) => {
                if (error) return res.status(500).json({ message: "Database error" });
                if (result.length === 0) return res.status(404).json({ message: "User not found" });

                const user = result[0];
                const isMatch = await bcrypt.compare(password, user.password);

                if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

                const deleteSql = `DELETE FROM users WHERE user_id = ?`;
                db.query(deleteSql, [user_id], (deleteError) => {
                    if (deleteError) return res.status(500).json({ message: "Database error during deletion" });
                    res.status(200).json({ message: "User account deleted successfully" });
                });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error on deleting user" });
        }
    });

    // Update a lawyer's profile
    app.put("/profile/lawyer/:lawyer_id", async (req, res) => {
        try {
            const { lawyer_id } = req.params;
            const { full_name, email, phone_number, specialization, attorney_status, bio, password } = req.body;

            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
            }

            let updates = [];
            let params = [];

            if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
            if (email !== undefined) { updates.push('email = ?'); params.push(email); }
            if (phone_number !== undefined) { updates.push('phone_number = ?'); params.push(phone_number); }
            if (specialization !== undefined) { updates.push('specialization = ?'); params.push(specialization); }
            if (attorney_status !== undefined) { updates.push('attorney_status = ?'); params.push(attorney_status); }
            if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
            if (hashedPassword) { updates.push('password = ?'); params.push(hashedPassword); }

            if (updates.length === 0) {
                return res.status(400).json({ message: "No fields to update" });
            }

            params.push(lawyer_id);
            const sql = `UPDATE lawyers SET ${updates.join(', ')} WHERE lawyer_id = ?`;

            db.query(sql, params, (error, result) => {
                if (error) return res.status(500).json({ message: "Database error" });
                if (result.affectedRows === 0) return res.status(404).json({ message: "Lawyer not found" });
                res.status(200).json({ message: `Lawyer updated successfully` });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error" });
        }
    });

    // Delete a lawyer's account (self-delete)
    app.delete('/profile/lawyer', async (req, res) => {
        try {
            const { lawyer_id, email, password } = req.body;

            const selectSql = `SELECT * FROM lawyers WHERE lawyer_id = ? AND email = ?`;
            db.query(selectSql, [lawyer_id, email], async (error, result) => {
                if (error) return res.status(500).json({ message: "Database error" });
                if (result.length === 0) return res.status(404).json({ message: "Lawyer not found" });

                const lawyer = result[0];
                const isMatch = await bcrypt.compare(password, lawyer.password);

                if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

                const deleteSql = `DELETE FROM lawyers WHERE lawyer_id = ?`;
                db.query(deleteSql, [lawyer_id], (deleteError) => {
                    if (deleteError) return res.status(500).json({ message: "Database error" });
                    res.status(200).json({ message: "Lawyer account deleted successfully" });
                });
            });
        } catch (error) {
            res.status(500).send("Server error");
        }
    });

    // Change a user's password
    app.put('/profile/user/:user_id/password', async (req, res) => {
        try {
            const { user_id } = req.params;
            const { current_password, new_password } = req.body;

            if (!current_password || !new_password) {
                return res.status(400).json({ message: "Current and new passwords are required." });
            }

            const selectSql = `SELECT password FROM users WHERE user_id = ?`;
            db.query(selectSql, [user_id], async (error, result) => {
                if (error) return res.status(500).json({ message: "Database error" });
                if (result.length === 0) return res.status(404).json({ message: "User not found" });

                const user = result[0];
                const isMatch = await bcrypt.compare(current_password, user.password);

                if (!isMatch) {
                    return res.status(401).json({ message: "Incorrect current password" });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedNewPassword = await bcrypt.hash(new_password, salt);

                const updateSql = `UPDATE users SET password = ? WHERE user_id = ?`;
                db.query(updateSql, [hashedNewPassword, user_id], (updateError) => {
                    if (updateError) return res.status(500).json({ message: "Database error during password update" });
                    res.status(200).json({ message: "Password updated successfully" });
                });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error on changing password" });
        }
    });

    // Change a lawyer's password
    app.put('/profile/lawyer/:lawyer_id/password', async (req, res) => {
        try {
            const { lawyer_id } = req.params;
            const { current_password, new_password } = req.body;

            if (!current_password || !new_password) {
                return res.status(400).json({ message: "Current and new passwords are required." });
            }

            const selectSql = `SELECT password FROM lawyers WHERE lawyer_id = ?`;
            db.query(selectSql, [lawyer_id], async (error, result) => {
                if (error) return res.status(500).json({ message: "Database error" });
                if (result.length === 0) return res.status(404).json({ message: "Lawyer not found" });

                const lawyer = result[0];
                const isMatch = await bcrypt.compare(current_password, lawyer.password);

                if (!isMatch) {
                    return res.status(401).json({ message: "Incorrect current password" });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedNewPassword = await bcrypt.hash(new_password, salt);

                const updateSql = `UPDATE lawyers SET password = ? WHERE lawyer_id = ?`;
                db.query(updateSql, [hashedNewPassword, lawyer_id], (updateError) => {
                    if (updateError) return res.status(500).json({ message: "Database error during password update" });
                    res.status(200).json({ message: "Password updated successfully" });
                });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error on changing password" });
        }
    });
}