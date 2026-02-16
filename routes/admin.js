import db from '../database/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mwambajason2@gmail.com',
    pass: 'feaa fycg nuwl wbgh'
  }
});


export default function Admins(app){
    
    // New Admin Registration Endpoint
    app.post('/registration_Admin', async (req, res) => {
        try {
            const { full_name, email, phone_number, password } = req.body;
            console.log("Received admin signup data:", full_name, email, phone_number);
    
            if (!password) {
                return res.status(400).json({ message: "Password is required" });
            }
    
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Check if admin already exists
            const checkSql = "SELECT email FROM admins WHERE email = ?";
            db.query(checkSql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });
                if (result.length > 0) return res.status(400).json({ message: "Email already registered" });

                // Generate a simple 6-digit verification code
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Verification code for new admin ${email} is: ${verificationCode}`);
                
                // Store admin data in database with pending status
                const insertSql = `INSERT INTO admins (full_name, email, phone_number, password, verification_status, verification_code) VALUES (?, ?, ?, ?, 'pending', ?)`;
                
                db.query(insertSql, [full_name, email, phone_number, hashedPassword, verificationCode], (insertErr, insertResult) => {
                    if (insertErr) return res.status(500).json({ message: "Database error", error: insertErr.message });
                    
                    const adminId = insertResult.insertId;
                    
                    let mailOptions = {
                        from: 'mwambajason2@gmail.com',
                        to: email,
                        subject: 'Verify email for LawLink Admin registration',
                        text: `Your verification code is: ${verificationCode}`
                    };

                    transport.sendMail(mailOptions, function(error, info){
                        if (error) {
                            console.log(error);
                        } else {
                            console.log('Email sent: ' + info.response);
                        }
                    });

                    res.status(200).json({
                        message: "Verification code sent to your email. Please verify to complete registration.",
                        admin_id: adminId,
                        email: email
                    });
                });
            });
    
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error on signup" });
        }
    });

    // Admin Verification Endpoint
    app.post('/verify_admin', (req, res) => {
        const { admin_id, verificationCode } = req.body;

        if (!admin_id || !verificationCode) {
            return res.status(400).json({ message: "Admin ID and verification code are required" });
        }

        try {
            // Retrieve admin from database
            const sql = "SELECT * FROM admins WHERE admin_id = ? AND verification_status = 'pending'";
            
            db.query(sql, [admin_id], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error", error: err.message });
                
                if (result.length === 0) {
                    return res.status(404).json({ message: "Admin not found or already verified" });
                }

                const admin = result[0];
                
                // Verify the code matches
                if (admin.verification_code !== verificationCode) {
                    return res.status(400).json({ message: "Invalid verification code" });
                }

                // Generate serial code (20-character hex string)
                const serialCode = crypto.randomBytes(10).toString('hex').toUpperCase();
                // Set expiration to 20 minutes from now
                const serialCodeExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

                // Update admin status to verified and add serial code
                const updateSql = `UPDATE admins SET verification_status = 'verified', serial_code = ?, serial_code_expires_at = ?, verification_code = NULL WHERE admin_id = ?`;
                
                db.query(updateSql, [serialCode, serialCodeExpiresAt, admin_id], (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: "Database error", error: updateErr.message });

                    // Generate login token
                    const token = jwt.sign(
                        { adminId: admin_id, email: admin.email },
                        JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    res.status(200).json({ 
                        message: "Admin verified and registered successfully", 
                        token, 
                        user: { 
                            adminId: admin_id, 
                            email: admin.email, 
                            fullName: admin.full_name, 
                            serialCode: serialCode, 
                            expiresAt: serialCodeExpiresAt 
                        } 
                    });
                });
            });
        } catch (err) {
            console.log('Verification error:', err);
            return res.status(400).json({ message: "Verification failed" });
        }
    });

    app.get('/admins', (req, res) => {
    const sql = `SELECT admin_id, full_name, email, created_at FROM admins`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        res.json(results);
    });
});
app.put('/admins/:admin_id', async (req, res) => {
    const { admin_id } = req.params;
    const { full_name, email, password } = req.body;

    let hashedPassword;
    if (password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
    }

    const sql = `
        UPDATE admins
        SET full_name = COALESCE(?, full_name),
            email = COALESCE(?, email),
            password = COALESCE(?, password)
        WHERE admin_id = ?
    `;

    db.query(sql, [full_name, email, hashedPassword, admin_id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        res.json({ message: `Admin updated successfully ${result.affectedRows} row(s) affected` });
    });
});
app.delete('/admins/:admin_id', (req, res) => {
    const { admin_id } = req.params;
    const sql = `DELETE FROM admins WHERE admin_id = ?`;

    db.query(sql, [admin_id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        res.json({ message: `Admin deleted successfully ${result.affectedRows} row(s) affected` });
    });
});

    // --- Lawyer Management by Admin ---

    // Get all lawyers for admin view
    app.get('/admins/lawyers', (req, res) => {
        const sql = "SELECT * FROM lawyers ORDER BY created_at DESC";
        db.query(sql, (err, results) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            res.json(results);
        });
    });

    // Update a lawyer's profile (by admin)
    app.put('/admins/lawyers/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;
        const {
            full_name, email, phone_number, province, district,
            specialization, attorney_status, bio, bar_number, verification_status
        } = req.body;

        const sql = `
            UPDATE lawyers
            SET
                full_name = COALESCE(?, full_name),
                email = COALESCE(?, email),
                phone_number = COALESCE(?, phone_number),
                province = COALESCE(?, province),
                district = COALESCE(?, district),
                specialization = COALESCE(?, specialization),
                attorney_status = COALESCE(?, attorney_status),
                bio = COALESCE(?, bio),
                bar_number = COALESCE(?, bar_number),
                verification_status = COALESCE(?, verification_status)
            WHERE lawyer_id = ?
        `;

        db.query(sql, [
            full_name, email, phone_number, province, district,
            specialization, attorney_status, bio, bar_number,
            verification_status, lawyer_id
        ], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Lawyer not found" });
            }
            res.json({ message: "Lawyer profile updated successfully by admin" });
        });
    });

    // Update lawyer verification status (by admin)
    app.put('/admins/lawyers/:lawyer_id/verification', (req, res) => {
        const { lawyer_id } = req.params;
        const { status } = req.body;

        if (!status || !['verified', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ message: "Invalid status. Must be 'verified', 'rejected', or 'pending'." });
        }

        const sql = "UPDATE lawyers SET verification_status = ? WHERE lawyer_id = ?";
        db.query(sql, [status, lawyer_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Lawyer not found" });
            }
            res.json({ message: `Lawyer verification status updated to ${status}` });
        });
    });

    // Delete a lawyer (by admin)
    app.delete('/admins/lawyers/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;
        const sql = "DELETE FROM lawyers WHERE lawyer_id = ?";
        db.query(sql, [lawyer_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Lawyer not found" });
            }
            res.json({ message: "Lawyer deleted successfully" });
        });
    });

    // --- User (Client) Management by Admin ---

    // Get all users for admin view (excluding password)
    app.get('/admins/users', (req, res) => {
        const sql = "SELECT user_id, full_name, email, phone_number, gender, created_at FROM users ORDER BY created_at DESC";
        db.query(sql, (err, results) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            res.json(results);
        });
    });

    // Delete a user (by admin)
    app.delete('/admins/users/:user_id', (req, res) => {
        const { user_id } = req.params;
        const sql = "DELETE FROM users WHERE user_id = ?";
        db.query(sql, [user_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({ message: "User deleted successfully" });
        });
    });

    app.post('/forgot_password_admin', (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const sql = "SELECT * FROM admins WHERE email = ?";
        db.query(sql, [email], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.length === 0) return res.status(404).json({ message: "Admin not found" });

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            const updateSql = "UPDATE admins SET verification_code = ? WHERE email = ?";
            db.query(updateSql, [verificationCode, email], (updateErr) => {
                if (updateErr) return res.status(500).json({ message: "Database error" });

                let mailOptions = {
                    from: 'mwambajason2@gmail.com',
                    to: email,
                    subject: 'Password Recovery Code',
                    text: `Your password recovery code is: ${verificationCode}`
                };

                transport.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.log(error);
                        return res.status(500).json({ message: "Error sending email" });
                    }
                    res.status(200).json({ message: "Recovery code sent to email" });
                });
            });
        });
    });

    app.post('/reset_password_admin', async (req, res) => {
        const { email, verificationCode, newPassword } = req.body;
        if (!email || !verificationCode || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const sql = "SELECT * FROM admins WHERE email = ? AND verification_code = ?";
        db.query(sql, [email, verificationCode], async (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.length === 0) return res.status(400).json({ message: "Invalid code or email" });

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            const updateSql = "UPDATE admins SET password = ?, verification_code = NULL WHERE email = ?";
            db.query(updateSql, [hashedPassword, email], (updateErr) => {
                if (updateErr) return res.status(500).json({ message: "Database error" });
                res.status(200).json({ message: "Password updated successfully" });
            });
        });
    });
}