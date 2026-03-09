import db from '../database/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads/lawyer_docs');
const profileDir = path.join(process.cwd(), 'uploads/profile_pictures');

[uploadDir, profileDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'profile_picture') cb(null, profileDir);
        else cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const prefix = file.fieldname === 'profile_picture' ? 'lawyer-pic' : 'lawyer-license';
        cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });


const JWT_SECRET = 'your-super-secret-key-for-jwt';

const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mwambajason2@gmail.com',
        pass: 'feaa fycg nuwl wbgh'
    }
});

export default function Lawyerss(app) {

    // New Lawyer Registration Endpoint
    app.post('/registration_Lawyer', upload.fields([
        { name: 'profile_picture', maxCount: 1 },
        { name: 'license_file', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { full_name, email, phone_number, password, province, district, specialization, bar_number } = req.body;
            const profilePicture = req.files['profile_picture'] ? `/uploads/profile_pictures/${req.files['profile_picture'][0].filename}` : null;
            const licenseFile = req.files['license_file'] ? `/uploads/lawyer_docs/${req.files['license_file'][0].filename}` : null;
            console.log("Received lawyer signup data:", full_name, email, phone_number, password);

            if (!password) {
                return res.status(400).json({ message: "Password is required" });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Check if lawyer already exists
            const checkSql = "SELECT email FROM lawyers WHERE email = ?";
            db.query(checkSql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });
                if (result.length > 0) return res.status(400).json({ message: "Email already registered" });

                // Generate a simple 6-digit verification code
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Verification code for new lawyer ${email} is: ${verificationCode}`);

                // Store lawyer data in database with pending status
                const insertSql = `INSERT INTO lawyers (full_name, email, phone_number, password, province, district, specialization, bar_number, profile_picture, license_file, verification_status, verification_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?)`;
                
                db.query(insertSql, [full_name, email, phone_number, hashedPassword, province, district, specialization, bar_number, profilePicture, licenseFile, verificationCode], (insertErr, insertResult) => {
                    if (insertErr) return res.status(500).json({ message: "Database error", error: insertErr.message });

                    const lawyerId = insertResult.insertId;

                    let mailOptions = {
                        from: 'mwambajason2@gmail.com',
                        to: email,
                        subject: 'Verify email for LawLink registration',
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
                        lawyer_id: lawyerId,
                        email: email
                    });
                });
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error on signup" });
        }
    });

    // Lawyer Verification Endpoint
    app.post('/verify_lawyer', (req, res) => {
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code are required" });
        }

        try {
            // Retrieve lawyer from database
            const sql = "SELECT * FROM lawyers WHERE email = ? AND (verification_status = 'pending' OR verification_status = 'unverified')";

            db.query(sql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error", error: err.message });

                if (result.length === 0) {
                    return res.status(404).json({ message: "Lawyer not found or already verified" });
                }

                const lawyer = result[0];
                const lawyer_id = lawyer.lawyer_id;

                // Verify the code matches
                if (lawyer.verification_code !== verificationCode) {
                    return res.status(400).json({ message: "Invalid verification code" });
                }

                // Generate serial code (20-character hex string)
                const serialCode = crypto.randomBytes(10).toString('hex').toUpperCase();
                // Set expiration to 20 minutes from now
                const serialCodeExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

                // Update lawyer status to verified and add serial code
                const updateSql = `UPDATE lawyers SET verification_status = 'pending', serial_code = ?, serial_code_expires_at = ?, verification_code = NULL WHERE lawyer_id = ?`;

                db.query(updateSql, [serialCode, serialCodeExpiresAt, lawyer_id], (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: "Database error", error: updateErr.message });

                    // Generate login token
                    const token = jwt.sign(
                        { lawyerId: lawyer_id, email: lawyer.email },
                        JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    res.status(200).json({
                        message: "Lawyer verified and registered successfully",
                        token,
                        user: {
                            lawyerId: lawyer_id,
                            email: lawyer.email,
                            fullName: lawyer.full_name,
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
    // testing post
    app.post('/post', (req, res) => {
        const { full_name, email, phone_number, password, province, district, specialization, bar_number } = req.body;
        const insertSql = `INSERT INTO lawyers (full_name, email, phone_number, password, province, district, specialization, bar_number, verification_status, verification_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?)`;
        db.query(insertSql, [full_name, email, phone_number, password, province, district, specialization, bar_number, null], (error, results) => {
            if (error) return res.status(500).json({ message: "db error", error: error.message });
            console.log("here is result for inserted", results);
            res.json({ message: "User inserted successfully", results });
        })
    })
    //lawstarts 

    app.get('/getlawyers', (req, res) => {
        try {
            const sql = "SELECT * FROM lawyers ";
            db.query(sql, (error, result) => {
                if (error) return res.status(500).json({ message: "Database error", error: error.message });
                res.status(200).json(result);
            })
        } catch (error) {
            console.error("Error retrieving lawyers:", error);
            res.status(500).json({ message: "Server error on retrieving lawyers" });
        }
    })

    app.get('/lawyers/verified', (req, res) => {
        try {
            const sql = "SELECT lawyer_id, full_name, email, phone_number, specialization, province, district, verification_status FROM lawyers WHERE verification_status = 'verified'";
            db.query(sql, (error, result) => {
                if (error) return res.status(500).json({ message: "Database error", error: error.message });
                res.status(200).json(result);
            });
        } catch (error) {
            console.error("Error retrieving verified lawyers:", error);
            res.status(500).json({ message: "Server error on retrieving verified lawyers" });
        }
    });

    app.post('/login_lawyer', async (req, res) => {
        try {
            const { email, password } = req.body;
            console.log("Lawyer login attempt for email:", email);

            const sql = "SELECT * FROM lawyers WHERE email = ?";
            db.query(sql, [email], async (err, results) => {
                console.log("Lawyer login results:", results);
                if (err) {
                    return res.status(500).json({ message: "Database error" });
                }

                if (results.length === 0) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }

                const lawyer = results[0];

                const isMatch = await bcrypt.compare(password, lawyer.password);
                if (!isMatch) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }

                const token = jwt.sign(
                    { userId: lawyer.lawyer_id, email: lawyer.email, role: 'lawyer' },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(200).json({
                    message: "Login successful",
                    token: token,
                    user: {
                        userId: lawyer.lawyer_id,
                        email: lawyer.email,
                        fullName: lawyer.full_name,
                        phone: lawyer.phone_number,
                        province: lawyer.province,
                        district: lawyer.district,
                        specialization: lawyer.specialization,
                        role: 'lawyer'
                    }
                });
            });

        } catch (error) {
            console.log("Server error on lawyer login:", error);
            res.status(500).json({ message: "Server error on lawyer login" });
        }
    });

    app.put('/updateLawyer/:lawyer_id', async (req, res) => {
        try {
            const { lawyer_id } = req.params;
            const { full_name, email, phone_number, gender, province, district, specialization, bio, password } = req.body;

            let updates = [];
            let params = [];

            if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
            if (email !== undefined) { updates.push('email = ?'); params.push(email); }
            if (phone_number !== undefined) { updates.push('phone_number = ?'); params.push(phone_number); }
            if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
            if (province !== undefined) { updates.push('province = ?'); params.push(province); }
            if (district !== undefined) { updates.push('district = ?'); params.push(district); }
            if (specialization !== undefined) { updates.push('specialization = ?'); params.push(specialization); }
            if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }

            if (password) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                updates.push('password = ?');
                params.push(hashedPassword);
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: "No fields to update" });
            }

            params.push(lawyer_id);
            const sql = `UPDATE lawyers SET ${updates.join(', ')} WHERE lawyer_id = ?`;

            db.query(sql, params, (error, result) => {
                if (error) return res.status(500).json({ message: "Database error", error: error.message });
                if (result.affectedRows === 0) return res.status(404).json({ message: "Lawyer not found" });
                res.status(200).json({ message: "Lawyer profile updated successfully" });
            });
        } catch (error) {
            console.error("Server error on updating lawyer profile:", error);
            res.status(500).json({ message: "Server error on updating lawyer profile" });
        }
    });

    app.post('/forgot_password_lawyer', (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const sql = "SELECT * FROM lawyers WHERE email = ?";
        db.query(sql, [email], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.length === 0) return res.status(404).json({ message: "Lawyer not found" });

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            const updateSql = "UPDATE lawyers SET verification_code = ? WHERE email = ?";
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

    app.post('/reset_password_lawyer', async (req, res) => {
        try {
            const { email, verificationCode, newPassword } = req.body;
            if (!email || !verificationCode || !newPassword) {
                return res.status(400).json({ message: "All fields are required" });
            }

            const sql = "SELECT * FROM lawyers WHERE email = ? AND verification_code = ?";
            db.query(sql, [email, verificationCode], async (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });
                if (result.length === 0) return res.status(400).json({ message: "Invalid code or email" });

                const hashedPassword = await bcrypt.hash(newPassword, 10);

                const updateSql = "UPDATE lawyers SET password = ?, verification_code = NULL WHERE email = ?";
                db.query(updateSql, [hashedPassword, email], (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: "Database error" });
                    res.status(200).json({ message: "Password updated successfully" });
                });
            });
        } catch (error) {
            console.error("Server error on resetting lawyer password:", error);
            res.status(500).json({ message: "Server error on resetting lawyer password" });
        }
    });

    app.put('/lawyers/password', async (req, res) => {
        try {
            const { current_password, new_password, email } = req.body;

            if (!current_password || !new_password || !email) {
                return res.status(400).json({ message: "Current password, new password, and email are required." });
            }

            const selectSql = `SELECT lawyer_id, password FROM lawyers WHERE email = ?`;
            db.query(selectSql, [email], async (error, result) => {
                if (error) {
                    return res.status(500).json({ message: "Database error", error: error.message });
                }
                if (result.length === 0) {
                    return res.status(404).json({ message: "Lawyer not found" });
                }

                const lawyer = result[0];
                const isMatch = await bcrypt.compare(current_password, lawyer.password);

                if (!isMatch) {
                    return res.status(401).json({ message: "Incorrect current password" });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedNewPassword = await bcrypt.hash(new_password, salt);

                const updateSql = `UPDATE lawyers SET password = ? WHERE email = ?`;
                db.query(updateSql, [hashedNewPassword, email], (updateError) => {
                    if (updateError) return res.status(500).json({ message: "Database error during password update", error: updateError.message });
                    res.status(200).json({ message: "Password updated successfully" });
                });
            });
        } catch (error) {
            console.error("Server error on changing lawyer password:", error);
            res.status(500).json({ message: "Server error on changing lawyer password" });
        }
    });

    app.delete('/lawyers/delete', async (req, res) => {
        const { email, password, user_id } = req.body;

        if (!email || !password || !user_id) {
            return res.status(400).json({ message: "Email, password and user_id are required" });
        }

        try {
            const selectSql = `SELECT * FROM lawyers WHERE lawyer_id = ? AND email = ?`;
            db.query(selectSql, [user_id, email], async (error, result) => {
                if (error) return res.status(500).json({ message: "Database error", error: error.message });
                if (result.length === 0) return res.status(404).json({ message: "Lawyer not found or email does not match" });

                const lawyer = result[0];
                const isMatch = await bcrypt.compare(password, lawyer.password);

                if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

                const deleteSql = `DELETE FROM lawyers WHERE lawyer_id = ?`;
                db.query(deleteSql, [user_id], (deleteError) => {
                    if (deleteError) return res.status(500).json({ message: "Database error during deletion", error: deleteError.message });
                    res.status(200).json({ message: "Lawyer account deleted successfully" });
                });
            });
        } catch (error) {
            console.error("Server error on deleting lawyer:", error);
            res.status(500).json({ message: "Server error on deleting lawyer" });
        }
    });

    // ── Admin Lawyer Management Routes ──

    // Admin: Update lawyer verification status (verify/reject)
    app.put('/admin/lawyers/:lawyer_id/status', (req, res) => {
        const { lawyer_id } = req.params;
        const { status } = req.body;

        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ message: "Invalid status. Must be 'verified' or 'rejected'." });
        }

        const sql = `UPDATE lawyers SET verification_status = ? WHERE lawyer_id = ?`;
        db.query(sql, [status, lawyer_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ message: "Lawyer not found" });
            res.status(200).json({ message: `Lawyer status updated to ${status}` });
        });
    });

    // Admin: Update lawyer details
    app.put('/admin/lawyers/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;
        const { full_name, email, phone_number, specialization, province, district } = req.body;

        let updates = [];
        let params = [];

        if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
        if (email !== undefined) { updates.push('email = ?'); params.push(email); }
        if (phone_number !== undefined) { updates.push('phone_number = ?'); params.push(phone_number); }
        if (specialization !== undefined) { updates.push('specialization = ?'); params.push(specialization); }
        if (province !== undefined) { updates.push('province = ?'); params.push(province); }
        if (district !== undefined) { updates.push('district = ?'); params.push(district); }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        params.push(lawyer_id);
        const sql = `UPDATE lawyers SET ${updates.join(', ')} WHERE lawyer_id = ?`;

        db.query(sql, params, (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ message: "Lawyer not found" });
            res.status(200).json({ message: "Lawyer updated successfully by admin" });
        });
    });

    // Admin: Delete a lawyer
    app.delete('/admin/lawyers/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;

        const sql = `DELETE FROM lawyers WHERE lawyer_id = ?`;
        db.query(sql, [lawyer_id], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ message: "Lawyer not found" });
            res.status(200).json({ message: "Lawyer deleted successfully by admin" });
        });
    });
}
