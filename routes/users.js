import db from '../database/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

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
    
    app.post('/registration_User', async (req, res) => {
        try {
            const { full_name, email, phone_number, password, gender } = req.body;
            console.log("Received signup data:", full_name, email, phone_number, password, gender);
    
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
            const insertSql = `INSERT INTO users (full_name, email, phone_number, password, gender, verification_status, serial_code, serial_code_expires_at) VALUES (?, ?, ?, ?, ?, 'verified', ?, ?)`;
            
            db.query(insertSql, [pendingUser.full_name, pendingUser.email, pendingUser.phone_number, pendingUser.password, pendingUser.gender, serialCode, serialCodeExpiresAt], (insertErr, insertResult) => {
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
            db.query(sql, [email, password], async (err, results) => {
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
    // error on hash password
    app.put('/updateUser/:user_id', async(req, res)=>{
        try {
            const { user_id } = req.params;
            const { full_name, email, phone_number, gender, password } = req.body;
            let hashedPassword = null;
            if(password){
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
            if (gender !== undefined && gender !== null) {
                updates.push('gender = ?');
                params.push(gender);
            }
            if (hashedPassword !== null) {
                updates.push('password = ?');
                params.push(hashedPassword);
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: "No fields to update" });
            }

            params.push(user_id);
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
            
            db.query(sql, params, (error, result)=>{
                if(error) {
                    console.error("Error updating user:", error);
                    return res.status(500).json({ message: "Database error", error: error.message });
                }
                res.status(200).json({ message: `User updated successfully. ${result.affectedRows} row(s) affected.`, result });
            })
        } catch (error) {
            console.error("Error updating user:", error);
            res.status(500).json({ message: "Server error on updating user" });
        }
    })
    app.delete('/deleteUser', (req, res) => {
        try {
            const { user_id, email, password }= req.body;
        
        const selectSql = `SELECT * FROM users WHERE user_id = ? AND email = ?`;
        db.query(selectSql, [user_id, email], async(error, result) => {
            if (error) {
                return res.status(500).json({ message: "Database error" });
            }
    
            if (result.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }
    
            const user = result[0];
            const isMatch = await bcrypt.compare(password, user.password);
    
            if (!isMatch) {
                return res.status(401).json({ message: "Incorrect password" });
           }
           const sql = `DELETE FROM users WHERE user_id = ?`;
    
           db.query(sql, [user_id], (error, results) => {
               if (error) {
                   return res.status(500).json({ message: "Database error" });
               }
               res.status(200).json({ message: "User deleted successfully", results });
           });
        });
            
        } catch (error) {
            console.log("Error deleting user:", error);
            res.status(500).json({ message: "Server error on deleting user" });
        }
    });

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
            if (err) return res.status(500).json({ message: "Database error" });
            if (result.length === 0) return res.status(400).json({ message: "Invalid code or email" });

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            const updateSql = "UPDATE users SET password = ?, verification_code = NULL WHERE email = ?";
            db.query(updateSql, [hashedPassword, email], (updateErr) => {
                if (updateErr) return res.status(500).json({ message: "Database error" });
                res.status(200).json({ message: "Password updated successfully" });
            });
        });
    });

    // ==================== ADMIN REGISTRATION & VERIFICATION ====================
    
    app.post('/registration_admin', async (req, res) => {
        try {
            const { full_name, email, phone_number, password, gender } = req.body;
            console.log("Received admin signup data:", full_name, email, phone_number, password, gender);
    
            if (!password) {
                return res.status(400).json({ message: "Password is required" });
            }
    
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Check if admin already exists in database
            const checkSql = "SELECT email FROM admins WHERE email = ?";
            db.query(checkSql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });
                if (result.length > 0) return res.status(400).json({ message: "Email already registered" });

                // Generate verification code (6 digits)
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

                // Store in pending registrations
                pendingRegistrations.set(email, {
                    full_name,
                    email,
                    phone_number,
                    password: hashedPassword,
                    gender,
                    verificationCode,
                    createdAt: Date.now(),
                    type: 'admin'
                });

                // Send verification email
                let mailOptions = {
                    from: 'mwambajason2@gmail.com',
                    to: email,
                    subject: 'Email Verification - LawLink Admin',
                    text: `Your verification code is: ${verificationCode}`
                };

                transport.sendMail(mailOptions, (error) => {
                    if (error) {
                        console.log(error);
                        return res.status(500).json({ message: "Error sending email" });
                    }
                    res.status(200).json({ message: "Verification code sent to email. Please verify to complete registration.", email });
                });
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error on signup" });
        }
    });

    app.post('/verify_admin', (req, res) => {
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code are required" });
        }

        try {
            const pendingUser = pendingRegistrations.get(email);
            
            if (!pendingUser) {
                return res.status(404).json({ message: "No pending registration found for this email" });
            }
            
            if (pendingUser.verificationCode !== verificationCode) {
                return res.status(400).json({ message: "Invalid verification code" });
            }

            const serialCode = crypto.randomBytes(10).toString('hex').toUpperCase();
            const serialCodeExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

            const insertSql = `INSERT INTO admins (full_name, email, phone_number, password, gender, verification_status, serial_code, serial_code_expires_at) VALUES (?, ?, ?, ?, ?, 'verified', ?, ?)`;
            
            db.query(insertSql, [pendingUser.full_name, pendingUser.email, pendingUser.phone_number, pendingUser.password, pendingUser.gender, serialCode, serialCodeExpiresAt], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error("Database error:", insertErr);
                    return res.status(500).json({ message: "Database error", error: insertErr.message });
                }

                const admin_id = insertResult.insertId;
                pendingRegistrations.delete(email);

                const token = jwt.sign(
                    { adminId: admin_id, email: pendingUser.email },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(200).json({ 
                    message: "Email verified and admin registered successfully", 
                    token, 
                    user: { 
                        userId: admin_id, 
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

    app.post('/login_admin', async (req, res) => {
        try {
            const { email, password } = req.body;
            console.log("Admin login attempt for email:", email);
            
            const sql = "SELECT * FROM admins WHERE email = ?";
            db.query(sql, [email], async (err, results) => {
                if (err) {
                    return res.status(500).json({ message: "Database error" });
                }
    
                if (results.length === 0) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }
    
                const admin = results[0];

                const isPasswordValid = await bcrypt.compare(password, admin.password);
                if (!isPasswordValid) {
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
                        serialCode: admin.serial_code, 
                        serialCodeExpiresAt: admin.serial_code_expires_at 
                    } 
                });
            });
    
        } catch (error) {
            console.log("Server error on login:", error);
            res.status(500).json({ message: "Server error on login" });
        }
    });

    // ==================== LAWYER REGISTRATION & VERIFICATION ====================

    app.post('/registration_lawyer', async (req, res) => {
        try {
            const { full_name, email, phone_number, password, gender, specialization, province } = req.body;
            console.log("Received lawyer signup data:", full_name, email, phone_number, password, gender);
    
            if (!password) {
                return res.status(400).json({ message: "Password is required" });
            }
    
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Check if lawyer already exists in database
            const checkSql = "SELECT email FROM lawyers WHERE email = ?";
            db.query(checkSql, [email], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error" });
                if (result.length > 0) return res.status(400).json({ message: "Email already registered" });

                // Generate verification code (6 digits)
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

                // Store in pending registrations
                pendingRegistrations.set(email, {
                    full_name,
                    email,
                    phone_number,
                    password: hashedPassword,
                    gender,
                    specialization,
                    province,
                    verificationCode,
                    createdAt: Date.now(),
                    type: 'lawyer'
                });

                // Send verification email
                let mailOptions = {
                    from: 'mwambajason2@gmail.com',
                    to: email,
                    subject: 'Email Verification - LawLink Lawyer',
                    text: `Your verification code is: ${verificationCode}`
                };

                transport.sendMail(mailOptions, (error) => {
                    if (error) {
                        console.log(error);
                        return res.status(500).json({ message: "Error sending email" });
                    }
                    res.status(200).json({ message: "Verification code sent to email. Please verify to complete registration.", email });
                });
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error on signup" });
        }
    });

    app.post('/verify_lawyer', (req, res) => {
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code are required" });
        }

        try {
            const pendingUser = pendingRegistrations.get(email);
            
            if (!pendingUser) {
                return res.status(404).json({ message: "No pending registration found for this email" });
            }
            
            if (pendingUser.verificationCode !== verificationCode) {
                return res.status(400).json({ message: "Invalid verification code" });
            }

            const serialCode = crypto.randomBytes(10).toString('hex').toUpperCase();
            const serialCodeExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

            const insertSql = `INSERT INTO lawyers (full_name, email, phone_number, password, gender, specialization, province, verification_status, serial_code, serial_code_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?)`;
            
            db.query(insertSql, [pendingUser.full_name, pendingUser.email, pendingUser.phone_number, pendingUser.password, pendingUser.gender, pendingUser.specialization, pendingUser.province, serialCode, serialCodeExpiresAt], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error("Database error:", insertErr);
                    return res.status(500).json({ message: "Database error", error: insertErr.message });
                }

                const lawyer_id = insertResult.insertId;
                pendingRegistrations.delete(email);

                const token = jwt.sign(
                    { lawyerId: lawyer_id, email: pendingUser.email },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(200).json({ 
                    message: "Email verified and lawyer registered successfully", 
                    token, 
                    user: { 
                        userId: lawyer_id, 
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

    app.post('/login_lawyer', async (req, res) => {
        try {
            const { email, password } = req.body;
            console.log("Lawyer login attempt for email:", email);
            
            const sql = "SELECT * FROM lawyers WHERE email = ?";
            db.query(sql, [email], async (err, results) => {
                if (err) {
                    return res.status(500).json({ message: "Database error" });
                }
    
                if (results.length === 0) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }
    
                const lawyer = results[0];

                const isPasswordValid = await bcrypt.compare(password, lawyer.password);
                if (!isPasswordValid) {
                    return res.status(401).json({ message: "Invalid email or password" });
                }

                const token = jwt.sign(
                    { lawyerId: lawyer.lawyer_id, email: lawyer.email },
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
                        serialCode: lawyer.serial_code, 
                        serialCodeExpiresAt: lawyer.serial_code_expires_at 
                    } 
                });
            });
    
        } catch (error) {
            console.log("Server error on login:", error);
            res.status(500).json({ message: "Server error on login" });
        }
    });
}