import db from '../database/database.js';

export default function Messages(app) {
    
    // Send a message between user and lawyer
    app.post('/messages', (req, res) => {
        const { conversation_id, sender_id, sender_role, message_text } = req.body;
        console.log(`Sending message in conversation: ${conversation_id} from: ${sender_id} (${sender_role})`);
        
        if (!conversation_id || !sender_id || !sender_role || !message_text) {
            console.warn("Missing required fields for message");
            return res.status(400).json({ message: "conversation_id, sender_id, sender_role, and message_text are required" });
        }

        const sql = "INSERT INTO messages (conversation_id, sender_id, sender_role, message_text) VALUES (?, ?, ?, ?)";
        db.query(sql, [conversation_id, sender_id, sender_role, message_text], (err, result) => {
            if (err) {
                console.error("Error inserting message:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            console.log(`Message successfully sent. ID: ${result.insertId}`);
            
            res.status(201).json({ 
                message: "Message sent successfully",
                message_id: result.insertId
            });
        });
    });

    // Get all messages for a conversation
    app.get('/messages/:conversation_id', (req, res) => {
        const { conversation_id } = req.params;
        console.log(`Fetching messages for conversation_id: ${conversation_id}`);
        
        const sql = `
            SELECT * FROM messages 
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        `;
        db.query(sql, [conversation_id], (err, result) => {
            if (err) {
                console.error("Error fetching messages:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            console.log(`Successfully fetched ${result.length} messages`);
            
            res.status(200).json(result);
        });
    });

    // Mark a message as read
    app.patch('/messages/:message_id/read', (req, res) => {
        const { message_id } = req.params;
        
        const sql = "UPDATE messages SET is_read = TRUE WHERE message_id = ?";
        db.query(sql, [message_id], (err, result) => {
            if (err) {
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Message not found" });
            }
            
            res.status(200).json({ message: "Message marked as read" });
        });
    });
}
