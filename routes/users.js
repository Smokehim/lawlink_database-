import db from '../database/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads/profile_pictures');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `user-reg-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });


const JWT_SECRET = 'your-super-secret-key-for-jwt';

// In-memory storage for pending user registrations
const pendingRegistrations = new Map();

// Cleanup expired pending registrations every 5 minutes
setInterval(() => {
    const now = Date.now();
    const expirationTime = 10 * 60 * 1000; // 10 minutes
    
    for (const [email, userData] of pendingRegistrations.entries()) {
        if (now - userData.createdAt > expirationTime) {
            pendingRegistrations.delete(email);
            console.log(`Cleaned up expired pending registration for ${email}`);
        }
    }
}, 5 * 60 * 1000);

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mwambajason2@gmail.com',
    pass: 'feaa fycg nuwl wbgh'
  }
});
export default function Users(app){
    
    app.post('/registration_User', upload.single('profile_picture'), async (req, res) => {
        try {
            const { full_name, email, phone_number, password, gender } = req.body;
            const profilePicture = req.file ? `/uploads/profile_pictures/${req.file.filename}` : null;
            console.log("Received signup data:", req.body);
    
            if (!password) {
                return res.status(400).json({ message: "Password is required" });
            }
    
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Check if user already exists in database
            const checkSql = "SELECT email FROM users WHERE email = ?";
            db.query(checkSql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });
                if (result.length > 0) return res.status(400).json({ message: "Email already registered" });

                // Check if email is already in pending registrations
                if (pendingRegistrations.has(email)) {
                    return res.status(400).json({ message: "Registration already pending for this email" });
                }

                // Generate a simple 6-digit verification code
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`Verification code for new user ${email} is: ${verificationCode}`); // For development/testing
                
                // Generate temporary ID for tracking
                const tempUserId = crypto.randomBytes(8).toString('hex');
                
                // Store user data temporarily in memory (not in database)
                pendingRegistrations.set(email, {
                    tempUserId,
                    full_name,
                    email,
                    phone_number,
                    password: hashedPassword,
                    gender,
                    profilePicture,
                    verificationCode,
                    createdAt: Date.now()
                });
                
                let mailOptions = {
                    from: 'mwambajason2@gmail.com',
                    to: email,
                    subject: 'Verify email for LawLink registration',
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
                    temp_user_id: tempUserId,
                    email: email
                });
            });
    
    
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error on signup" });
        }
    });
    
    app.post('/verify_user', (req, res) => {
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code are required" });
        }

        try {
            // Retrieve pending registration from memory
            const pendingUser = pendingRegistrations.get(email);
            
            if (!pendingUser) {
                return res.status(404).json({ message: "No pending registration found for this email" });
            }
            
            // Verify the code matches
            if (pendingUser.verificationCode !== verificationCode) {
                return res.status(400).json({ message: "Invalid verification code" });
            }

            // creating serial code (20-character hex string)
            const serialCode = crypto.randomBytes(10).toString('hex').toUpperCase();
            // Set expiration to 20 minutes from now
            const serialCodeExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

            // Now insert the verified user into the database
            const insertSql = `INSERT INTO users (full_name, email, phone_number, password, gender, profile_picture, verification_status, serial_code, serial_code_expires_at) VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?)`;
            
            db.query(insertSql, [pendingUser.full_name, pendingUser.email, pendingUser.phone_number, pendingUser.password, pendingUser.gender, pendingUser.profilePicture, serialCode, serialCodeExpiresAt], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error("Database error:", insertErr);
                    return res.status(500).json({ message: "Database error", error: insertErr.message });
                }

                const user_id = insertResult.insertId;
                
                // Remove from pending registrations
                pendingRegistrations.delete(email);

                // Generate login token
                const token = jwt.sign(
                    { userId: user_id, email: pendingUser.email },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(200).json({ 
                    message: "Email verified and user registered successfully", 
                    token, 
                    user: { 
                        userId: user_id, 
                        email: pendingUser.email, 
                        fullName: pendingUser.full_name, 
                        serialCode: serialCode, 
                        expiresAt: serialCodeExpiresAt 
                    } 
                });
            });
        } catch (err) {
            console.log('Verification error:', err);
            return res.status(400).json({ message: "Verification failed" });
        }
    });
    
    app.get('/getUsers', (req, res)=>{
        try {
            const sql = "SELECT * FROM users";
            db.query(sql, (error, result) => {
                if(error) return res.status(500).json({ message: "Database error", error: error.message });
                res.status(200).json({message: "Users retrieved successfully", users: result });
            })
        } catch (error) {
            console.error("Error retrieving users:", error);
            res.status(500).json({ message: "Server error on retrieving users" });
        }
    })
    app.post('/login_user', async (req, res) => { // Changed from GET to POST
        try {
            const { email, password } = req.body;
            console.log("Login attempt for email:", email);
            
    
            const sql = "SELECT * FROM users WHERE email = ?";
            db.query(sql, [email], async (err, results) => {
                console.log("Database query executed");
                if (err) {
                    return res.status(500).json({ message: "Database error" });
                }
    
                if (results.length === 0) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }
    
                const user = results[0];
                

                // Check if account is verified
                if (user.verification_status !== 'verified') {
                    return res.status(403).json({
                        message: "Account not verified. Please complete the verification step.",
                        needsVerification: true,
                        userId: user.user_id
                    });
                }
    
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }
    
                // Generate JWT on successful login
                const token = jwt.sign(
                    { userId: user.user_id, email: user.email },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(200).json({ message: "Login successful", token: token, user: { userId: user.user_id, email: user.email, fullName: user.full_name, serialCode: user.serial_code, serialCodeExpiresAt: user.serial_code_expires_at } });
            });
    
        } catch (error) {
            console.log("Server error on login:", error);
            res.status(500).json({ message: "Server error on login" });
        }
    });

    //checing post 
    app.post('/userspost', async (req, res)=>{
        const { full_name, email, phone_number, password, gender } = req.body;

        if (!password) {
            return res.status(400).json({ message: "Password is required." });
        }

        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            const insertSql = `INSERT INTO users (full_name, email, phone_number, password, gender) VALUES (?, ?, ?, ?, ?)`;
            db.query(insertSql, [full_name, email, phone_number, hashedPassword, gender], (error, results)=>{
                if(error) return res.status(500).json({message:"db error",error });
                res.status(201).json({message: "User inserted successfully", results});
            });
        } catch (error) {
            res.status(500).json({ message: "Server error during user creation." });
        }
    })
    app.post('/forgot_password_user', (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const sql = "SELECT * FROM users WHERE email = ?";
        db.query(sql, [email], (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.length === 0) return res.status(404).json({ message: "User not found" });

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            const updateSql = "UPDATE users SET verification_code = ? WHERE email = ?";
            db.query(updateSql, [verificationCode, email], (updateErr) => {
                if (updateErr) return res.status(500).json({ message: "Database error" });

                let mailOptions = {
                    from: 'mwambajason2@gmail.com',
                    to: email,
                    subject: 'Password Recovery Code',
                    text: `Your password recovery code is: ${verificationCode}`
                };

                transport.sendMail(mailOptions, (error) => {
                    if (error) {
                        console.log(error);
                        return res.status(500).json({ message: "Error sending email" });
                    }
                    res.status(200).json({ message: "Recovery code sent to email" });
                });
            });
        });
    });

    app.post('/reset_password_user', async (req, res) => {
        const { email, verificationCode, newPassword } = req.body;
        if (!email || !verificationCode || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const sql = "SELECT * FROM users WHERE email = ? AND verification_code = ?";
        db.query(sql, [email, verificationCode], async (err, result) => {
            if (err) return res.status(500).json({ message: "Database error", error: err.message });
            if (result.length === 0) return res.status(400).json({ message: "Invalid code or email" });

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            const updateSql = "UPDATE users SET password = ?, verification_code = NULL WHERE email = ?";
            db.query(updateSql, [hashedPassword, email], (updateErr) => {
                if (updateErr) return res.status(500).json({ message: "Database error", error: updateErr.message });
                res.status(200).json({ message: "Password updated successfully" });
            });
        });
    });

    // Update user profile
    app.put('/users/:user_id', async (req, res) => {
        try {
            const { user_id } = req.params;
            const { full_name, phone_number, gender } = req.body;

            let updates = [];
            let params = [];

            if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
            if (phone_number !== undefined) { updates.push('phone_number = ?'); params.push(phone_number); }
            if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }

            if (updates.length === 0) {
                return res.status(400).json({ message: "No fields to update" });
            }

            params.push(user_id);
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;

            db.query(sql, params, (error, result) => {
                if (error) return res.status(500).json({ message: "Database error", error: error.message });
                if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
                res.status(200).json({ message: `User profile updated successfully.` });
            });
        } catch (error) {
            console.error("Server error on updating user profile:", error);
            res.status(500).json({ message: "Server error on updating user profile" });
        }
    });

   

    // Change a user's password
    app.put('/userspassword', async (req, res) => {
        try {
            const { current_password, new_password, user_id } = req.body;

            if (!current_password || !new_password || !user_id) {
                return res.status(400).json({ message: "Current password, new password, and user_id are required." });
            }

            const selectSql = `SELECT password FROM users WHERE user_id = ?`;
            db.query(selectSql, [user_id], async (error, result) => {
                if (error) {
                    return res.status(500).json({ message: "Database error", error: error.message });
                }
                if (result.length === 0) {
                    console.log("user not found", error, result);
                    return res.status(404).json({ message: "User not found" });
                }

                const user = result[0];
                const isMatch = await bcrypt.compare(current_password, user.password);

                if (!isMatch) {
                    return res.status(401).json({ message: "Incorrect current password" });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedNewPassword = await bcrypt.hash(new_password, salt);

                const updateSql = `UPDATE users SET password = ? WHERE user_id = ?`;
                db.query(updateSql, [hashedNewPassword, user_id], (updateError) => {
                    if (updateError) return res.status(500).json({ message: "Database error during password update", error: updateError.message });
                    res.status(200).json({ message: "Password updated successfully" });
                });
            });
        } catch (error) {
            console.error("Server error on changing password:", error);
            res.status(500).json({ message: "Server error on changing password" });
        }
    });

    app.delete('/delete_user', async (req, res) => {
        const { email, password, user_id } = req.body;

        if (!email || !password || !user_id) {
             return res.status(400).json({ message: "Email, password and user_id are required" });
        }

        try {
            console.log(`Attempting to delete user_ID: ${user_id}, Email: ${email} ${user_id}`);

            const selectSql = `SELECT * FROM users WHERE user_id = ? AND email = ?`;
            db.query(selectSql, [user_id, email], async (error, result) => {
                if (error) {
                    return res.status(500).json({ message: "Database error", error: error.message });
                }
                if (result.length === 0) {
                    return res.status(404).json({ message: "User not found or email does not match" });
                }

                const user = result[0];
                const isMatch = await bcrypt.compare(password, user.password);

                if (!isMatch) {
                    return res.status(401).json({ message: "Incorrect password" });
                }

                const deleteSql = `DELETE FROM users WHERE user_id = ?`;
                db.query(deleteSql, [user_id], (deleteError) => {
                    if (deleteError) return res.status(500).json({ message: "Database error during deletion", error: deleteError.message });
                    res.status(200).json({ message: "User account deleted successfully" });
                });
            });
        } catch (error) {
            console.error("Server error on deleting user:", error);
            res.status(500).json({ message: "Server error on deleting user" });
        }
    });

    // Admin-specific route to update a user.
    app.put('/admin/users/:user_id', async (req, res) => {
        const { user_id } = req.params;
        const { full_name, email, phone_number, password } = req.body;

        try {
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
            if (hashedPassword) { updates.push('password = ?'); params.push(hashedPassword); }

            if (updates.length === 0) {
                return res.status(400).json({ message: "No fields to update" });
            }

            params.push(user_id);
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;

            db.query(sql, params, (err, result) => {
                if (err) return res.status(500).json({ message: "Database error", error: err.message });
                if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
                res.json({ message: `User updated successfully by admin.` });
            });
        } catch (error) {
            console.error("Server error on admin updating user:", error);
            res.status(500).json({ message: "Server error on admin updating user" });
        }
    });

    // Admin-specific route to delete a user.
    // In a real application, this should be protected by an admin authentication middleware.
    app.delete('/admin/users/:user_id', (req, res) => {
        const { user_id } = req.params;

        const deleteSql = `DELETE FROM users WHERE user_id = ?`;
        db.query(deleteSql, [user_id], (deleteError, result) => {
            if (deleteError) return res.status(500).json({ message: "Database error during deletion", error: deleteError.message });
            if (result.affectedRows === 0) return res.status(404).json({ message: "User not found" });
            res.status(200).json({ message: "User account deleted successfully by admin" });
        });
    });
 
}