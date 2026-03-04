import db from '../database/database.js';

export default function Conversations(app) {

    // Start or get a conversation between a client and a lawyer
    app.post('/conversations', (req, res) => {
        const { participant_id, participant_role, lawyer_id } = req.body;

        if (!participant_id || !participant_role || !lawyer_id) {
            return res.status(400).json({ message: 'participant_id, participant_role, and lawyer_id are required' });
        }

        if (!['client', 'admin'].includes(participant_role)) {
            return res.status(400).json({ message: 'Invalid participant_role. Must be "client" or "admin".' });
        }

        // Atomically find or create a conversation using the unique key on (client_id, lawyer_id).
        const sql = `
            INSERT INTO conversations (participant_id, participant_role, lawyer_id) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id);
        `;

        db.query(sql, [participant_id, participant_role, lawyer_id], (err, result) => {
            if (err) {
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            
            const conversation_id = result.insertId;
            // affectedRows is 1 for a new insert, 2 for an update that changes a value.
            const wasCreated = result.affectedRows === 1;
            
            res.status(wasCreated ? 201 : 200).json({ 
                message: wasCreated ? 'Conversation created successfully' : 'Conversation already exists', 
                conversation_id
            });
        });
    });

    // Get all conversations for a specific client
    app.get('/conversations/client/:client_id', (req, res) => {
        const { client_id } = req.params;

        const sql = `
            SELECT 
                c.conversation_id,
                c.lawyer_id,
                l.full_name AS lawyer_name,
                l.specialization AS lawyer_specialization,
                (SELECT m.message_text FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
            FROM conversations c
            JOIN lawyers l ON c.lawyer_id = l.lawyer_id
            WHERE c.participant_id = ? AND c.participant_role = 'client'
            ORDER BY last_message_at DESC;
        `;

        db.query(sql, [client_id], (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.status(200).json(results);
        });
    });

    // Get all conversations for a specific lawyer
    app.get('/conversations/lawyer/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;

        const sql = `
            SELECT 
                c.conversation_id,
                c.participant_id,
                c.participant_role,
                CASE
                    WHEN c.participant_role = 'client' THEN u.full_name
                    WHEN c.participant_role = 'admin' THEN a.full_name
                END AS participant_name,
                (SELECT m.message_text FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
            FROM conversations c
            LEFT JOIN users u ON c.participant_id = u.user_id AND c.participant_role = 'client'
            LEFT JOIN admins a ON c.participant_id = a.admin_id AND c.participant_role = 'admin'
            WHERE c.lawyer_id = ?
            ORDER BY last_message_at DESC;
        `;

        db.query(sql, [lawyer_id], (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.status(200).json(results);
        });
    });

    // Get all conversations for a specific admin
    app.get('/conversations/admin/:admin_id', (req, res) => {
        const { admin_id } = req.params;

        const sql = `
            SELECT 
                c.conversation_id,
                c.lawyer_id,
                l.full_name AS lawyer_name,
                l.specialization AS lawyer_specialization,
                (SELECT m.message_text FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
            FROM conversations c
            JOIN lawyers l ON c.lawyer_id = l.lawyer_id
            WHERE c.participant_id = ? AND c.participant_role = 'admin'
            ORDER BY last_message_at DESC;
        `;

        db.query(sql, [admin_id], (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.status(200).json(results);
        });
    });
}