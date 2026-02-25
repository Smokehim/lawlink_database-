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

export default function Lawyerss(app){
    
    // New Lawyer Registration Endpoint
    app.post('/registration_Lawyer', async (req, res) => {
        try {
            const { full_name, email, phone_number, password, province, district, specialization, bar_number } = req.body;
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
                const insertSql = `INSERT INTO lawyers (full_name, email, phone_number, password, province, district, specialization, bar_number, verification_status, verification_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`;
                
                db.query(insertSql, [full_name, email, phone_number, hashedPassword, province, district, specialization, bar_number, verificationCode], (insertErr, insertResult) => {
                    if (insertErr) return res.status(500).json({ message: "Database error", error: insertErr.message });
                    
                    const lawyerId = insertResult.insertId;
                    
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
        const { lawyer_id, verificationCode } = req.body;

        if (!lawyer_id || !verificationCode) {
            return res.status(400).json({ message: "Lawyer ID and verification code are required" });
        }

        try {
            // Retrieve lawyer from database
            const sql = "SELECT * FROM lawyers WHERE lawyer_id = ? AND verification_status = 'pending'";
            
            db.query(sql, [lawyer_id], (err, result) => {
                if (err) return res.status(500).json({ message: "Database error", error: err.message });
                
                if (result.length === 0) {
                    return res.status(404).json({ message: "Lawyer not found or already verified" });
                }

                const lawyer = result[0];
                
                // Verify the code matches
                if (lawyer.verification_code !== verificationCode) {
                    return res.status(400).json({ message: "Invalid verification code" });
                }

                // Generate serial code (20-character hex string)
                const serialCode = crypto.randomBytes(10).toString('hex').toUpperCase();
                // Set expiration to 20 minutes from now
                const serialCodeExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

                // Update lawyer status to verified and add serial code
                const updateSql = `UPDATE lawyers SET verification_status = 'verified', serial_code = ?, serial_code_expires_at = ?, verification_code = NULL WHERE lawyer_id = ?`;
                
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
    //lawstarts 

app.get('/getlawyers', (req, res)=>{
    try {
        const sql = "SELECT * FROM lawyers";
        db.query(sql, (error, result) => {
            if(error) return res.status(500).json({ message: "Database error", error: error.message });
            res.status(200).json(result);
        })
    } catch (error) {
        console.error("Error retrieving lawyers:", error);
        res.status(500).json({ message: "Server error on retrieving lawyers" });
    }
})
app.post('/login_lawyer', async (req, res) => { // Changed to POST and a more descriptive name
    try {
        const { email, password } = req.body;
        console.log("Login attempt for email:", email, password);
        

        const sql = "SELECT * FROM lawyers WHERE email = ?";
        console.log("Executing SQL:", sql, "with email:", email);
        db.query(sql, [email], async (err, results) => {
            console.log("Database query executed");
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
                { lawyerId: lawyer.lawyer_id, email: lawyer.email },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.status(200).json({ message: "Login successful", token, lawyer: { lawyerId: lawyer.lawyer_id, email: lawyer.email, fullName: lawyer.full_name } });
        });

    } catch (error) {
        res.status(500).json({ message: "Server error on lawyer login" });
        console.log("Server error on lawyer login", error);
    }
});
// error on hash password
app.put("/updatelawyers/:lawyer_id", async (req, res) => {
  try {
    const { lawyer_id } = req.params;
    const {
      full_name,
      email,
      phone_number,
      specialization,
      attorney_status,
      bio,
      password
    } = req.body;

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
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
    if (specialization !== undefined && specialization !== null) {
      updates.push('specialization = ?');
      params.push(specialization);
    }
    if (attorney_status !== undefined && attorney_status !== null) {
      updates.push('attorney_status = ?');
      params.push(attorney_status);
    }
    if (bio !== undefined && bio !== null) {
      updates.push('bio = ?');
      params.push(bio);
    }
    if (hashedPassword !== null) {
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    params.push(lawyer_id);
    const sql = `UPDATE lawyers SET ${updates.join(', ')} WHERE lawyer_id = ?`;

    db.query(sql, params, (error, result) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ message: "Database error" });
      }
      res.status(200).json({
        message: `Lawyer updated successfully ${result.affectedRows} row(s) affected`
      });
    });

  } catch (error) {
    console.error("Error updating lawyer:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete('/deletelawyers', async (req, res) => {
    try {
        const { lawyer_id, email, password } = req.body; // <-- change here

        const selectSql = `SELECT * FROM lawyers WHERE lawyer_id = ? AND email = ?`;
        db.query(selectSql, [lawyer_id, email], async (error, result) => {
            if (error) return res.status(500).json({ message: "Database error" });
            if (result.length === 0) return res.status(404).json({ message: "Lawyer not found" });

            const lawyer = result[0];
            const isMatch = await bcrypt.compare(password, lawyer.password);

            if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

            const deleteSql = `DELETE FROM lawyers WHERE lawyer_id = ?`;
            db.query(deleteSql, [lawyer_id], (error) => {
                if (error) return res.status(500).json({ message: "Database error" });
                res.status(200).json({ message: "Lawyer deleted successfully" });
            });
        });
    } catch (error) {
        console.log("Error deleting lawyer:", error);
        res.status(500).send("Server error");
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
});

}