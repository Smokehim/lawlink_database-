import db from '../database/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const JWT_SECRET = 'your-super-secret-key-for-jwt';

const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mwambajason2@gmail.com',
        pass: 'feaa fycg nuwl wbgh'
    }
});


export default function Admins(app) {

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

                    transport.sendMail(mailOptions, function (error, info) {
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
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code are required" });
        }

        try {
            // Retrieve admin from database
            const sql = "SELECT * FROM admins WHERE email = ? AND verification_status = 'pending'";

            db.query(sql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error", error: err.message });

                if (result.length === 0) {
                    return res.status(404).json({ message: "Admin not found or already verified" });
                }

                const admin = result[0];
                const admin_id = admin.admin_id;

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
                            userId: admin_id,
                            email: admin.email,
                            fullName: admin.full_name,
                            phone_number: admin.phone_number,
                            number: admin.number,
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

    app.post('/login_admin', async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ message: "Email and password are required" });
            }

            const sql = "SELECT * FROM admins WHERE email = ?";
            db.query(sql, [email], async (err, results) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err.message });
                }

                if (results.length === 0) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }

                const admin = results[0];

                if (admin.verification_status !== 'verified') {
                    return res.status(403).json({
                        message: "Account not verified. Please complete the verification step.",
                        needsVerification: true,
                        admin_id: admin.admin_id
                    });
                }

                const isMatch = await bcrypt.compare(password, admin.password);
                if (!isMatch) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }

                const token = jwt.sign(
                    { adminId: admin.admin_id, email: admin.email },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(200).json({
                    message: "Login successful",
                    token: token,
                    user: {
                        userId: admin.admin_id,
                        email: admin.email,
                        fullName: admin.full_name,
                        phone_number: admin.phone_number,
                        number: admin.number
                    }
                });
            });
        } catch (error) {
            console.log("Server error on admin login:", error);
            res.status(500).json({ message: "Server error on admin login" });
        }
    });

    app.get('/admins', (req, res) => {
        const sql = `SELECT *FROM admins`;
        db.query(sql, (err, results) => {
            if (err) return res.status(500).json({ message: "Database error", error: err });
            res.json(results);
        });
    });
    app.put('/admins/password', async (req, res) => {
        try {
            const { current_password, new_password, email } = req.body;

            if (!current_password || !new_password || !email) {
                console.log("Current password, new password, and email are required.")
                return res.status(400).json({ message: "Current password, new password, and email are required." });
            }

            const selectSql = `SELECT password FROM admins WHERE email = ?`;
            db.query(selectSql, [email], async (error, result) => {
                if (error) {
                    console.log("Database error", error)
                    return res.status(500).json({ message: "Database error", error: error.message });
                }
                if (result.length === 0) {
                    console.log("Admin not found")
                    return res.status(404).json({ message: "Admin not found" });
                }

                const admin = result[0];
                const isMatch = await bcrypt.compare(current_password, admin.password);

                if (!isMatch) {
                    return res.status(401).json({ message: "Incorrect current password" });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedNewPassword = await bcrypt.hash(new_password, salt);

                const updateSql = `UPDATE admins SET password = ? WHERE email = ?`;
                db.query(updateSql, [hashedNewPassword, email], (updateError) => {
                    if (updateError) return res.status(500).json({ message: "Database error during password update", error: updateError.message });
                    res.status(200).json({ message: "Password updated successfully" });
                });
            });
        } catch (error) {
            console.error("Server error on changing admin password:", error);
            res.status(500).json({ message: "Server error on changing admin password" });
        }
    });

    app.put('/adminsupdate', async (req, res) => {
        const { admin_id, full_name, email, password, phone_number, number } = req.body;

        let hashedPassword = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        // Build dynamic SQL based on provided fields
        let updates = [];
        let params = [];

        if (full_name !== undefined && full_name !== null) {
            updates.push('full_name = ?');
            params.push(full_name);
        }
        if (email !== undefined && email !== null) {
            updates.push('email = ?');
            params.push(email);
        }
        if (phone_number !== undefined && phone_number !== null) {
            updates.push('phone_number = ?');
            params.push(phone_number);
        }
        if (number !== undefined && number !== null) {
            updates.push('number = ?');
            params.push(number);
        }
        if (hashedPassword !== null) {
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        params.push(admin_id);
        const sql = `UPDATE admins SET ${updates.join(', ')} WHERE admin_id = ?`;

        db.query(sql, params, (err, result) => {
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