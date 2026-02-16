import db from '../database/database.js';

export default function Messages(app) {
    
    // Send a message between user and lawyer
    app.post('/send-message', (req, res) => {
        try {
            const { sender_id, receiver_id, sender_type, receiver_type, message_text } = req.body;
            
            // Validate required fields
            if (!sender_id || !receiver_id || !sender_type || !receiver_type || !message_text) {
                return res.status(400).json({ message: "All fields are required" });
            }

            // Validate sender_type and receiver_type
            if (!['user', 'lawyer'].includes(sender_type) || !['user', 'lawyer'].includes(receiver_type)) {
                return res.status(400).json({ message: "Invalid sender_type or receiver_type" });
            }

            const sql = "INSERT INTO messages (sender_id, receiver_id, sender_type, receiver_type, message_text) VALUES (?, ?, ?, ?, ?)";
            db.query(sql, [sender_id, receiver_id, sender_type, receiver_type, message_text], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(201).json({ 
                    message: "Message sent successfully",
                    message_id: result.insertId
                });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get all messages for a user (received messages)
    app.get('/messages-user/:user_id', (req, res) => {
        try {
            const { user_id } = req.params;
            
            const sql = `
                SELECT * FROM messages 
                WHERE receiver_id = ? AND receiver_type = 'user'
                ORDER BY created_at DESC
            `;
            db.query(sql, [user_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json(result);
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get all messages for a lawyer (received messages)
    app.get('/messages-lawyer/:lawyer_id', (req, res) => {
        try {
            const { lawyer_id } = req.params;
            
            const sql = `
                SELECT * FROM messages 
                WHERE receiver_id = ? AND receiver_type = 'lawyer'
                ORDER BY created_at DESC
            `;
            db.query(sql, [lawyer_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json(result);
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get conversation between a user and lawyer
    app.get('/conversation/:user_id/:lawyer_id', (req, res) => {
        try {
            const { user_id, lawyer_id } = req.params;
            
            const sql = `
                SELECT * FROM messages 
                WHERE (
                    (sender_id = ? AND sender_type = 'user' AND receiver_id = ? AND receiver_type = 'lawyer') OR
                    (sender_id = ? AND sender_type = 'lawyer' AND receiver_id = ? AND receiver_type = 'user')
                )
                ORDER BY created_at ASC
            `;
            db.query(sql, [user_id, lawyer_id, lawyer_id, user_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json(result);
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Mark message as read
    app.patch('/message-read/:message_id', (req, res) => {
        try {
            const { message_id } = req.params;
            
            const sql = "UPDATE messages SET is_read = TRUE WHERE message_id = ?";
            db.query(sql, [message_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                if (result.affectedRows === 0) {
                    return res.status(404).json({ message: "Message not found" });
                }
                
                res.status(200).json({ message: "Message marked as read" });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Mark all messages as read for a user
    app.patch('/messages-read-all-user/:user_id', (req, res) => {
        try {
            const { user_id } = req.params;
            
            const sql = "UPDATE messages SET is_read = TRUE WHERE receiver_id = ? AND receiver_type = 'user' AND is_read = FALSE";
            db.query(sql, [user_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json({ 
                    message: "All messages marked as read",
                    affected_rows: result.affectedRows
                });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Mark all messages as read for a lawyer
    app.patch('/messages-read-all-lawyer/:lawyer_id', (req, res) => {
        try {
            const { lawyer_id } = req.params;
            
            const sql = "UPDATE messages SET is_read = TRUE WHERE receiver_id = ? AND receiver_type = 'lawyer' AND is_read = FALSE";
            db.query(sql, [lawyer_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json({ 
                    message: "All messages marked as read",
                    affected_rows: result.affectedRows
                });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get unread message count for user
    app.get('/unread-count-user/:user_id', (req, res) => {
        try {
            const { user_id } = req.params;
            
            const sql = "SELECT COUNT(*) as unread_count FROM messages WHERE receiver_id = ? AND receiver_type = 'user' AND is_read = FALSE";
            db.query(sql, [user_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json({ unread_count: result[0].unread_count });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get unread message count for lawyer
    app.get('/unread-count-lawyer/:lawyer_id', (req, res) => {
        try {
            const { lawyer_id } = req.params;
            
            const sql = "SELECT COUNT(*) as unread_count FROM messages WHERE receiver_id = ? AND receiver_type = 'lawyer' AND is_read = FALSE";
            db.query(sql, [lawyer_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json({ unread_count: result[0].unread_count });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Delete a message
    app.delete('/message/:message_id', (req, res) => {
        try {
            const { message_id } = req.params;
            
            const sql = "DELETE FROM messages WHERE message_id = ?";
            db.query(sql, [message_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                if (result.affectedRows === 0) {
                    return res.status(404).json({ message: "Message not found" });
                }
                
                res.status(200).json({ message: "Message deleted successfully" });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get all sent messages by a user
    app.get('/sent-messages-user/:user_id', (req, res) => {
        try {
            const { user_id } = req.params;
            
            const sql = `
                SELECT * FROM messages 
                WHERE sender_id = ? AND sender_type = 'user'
                ORDER BY created_at DESC
            `;
            db.query(sql, [user_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json(result);
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // Get all sent messages by a lawyer
    app.get('/sent-messages-lawyer/:lawyer_id', (req, res) => {
        try {
            const { lawyer_id } = req.params;
            
            const sql = `
                SELECT * FROM messages 
                WHERE sender_id = ? AND sender_type = 'lawyer'
                ORDER BY created_at DESC
            `;
            db.query(sql, [lawyer_id], (err, result) => {
                if (err) {
                    return res.status(500).json({ message: "Database error", error: err });
                }
                
                res.status(200).json(result);
            });
        } catch (error) {
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });
}
