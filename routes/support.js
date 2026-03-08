import db from '../database/database.js';

export default function Support(app) {
    // A dedicated endpoint for lawyers to send support messages to an admin.
    app.post('/support/contact-admin', (req, res) => { // This endpoint is now generic for users and lawyers
        const { sender_id, sender_role, message_text } = req.body;

        if (!sender_id || !sender_role || !message_text) {
            console.log('sender_id, sender_role, and message_text are required.', sender_id, sender_role, message_text)
            return res.status(400).json({ message: 'sender_id, sender_role, and message_text are required.' });
        }

        if (!['user', 'lawyer'].includes(sender_role)) {
            console.log('Invalid sender_role. Must be "user" or "lawyer".')
            return res.status(400).json({ message: 'Invalid sender_role. Must be "user" or "lawyer".' });
        }

        // Find an admin to assign the conversation to.
        // For simplicity, we'll pick the first admin found.
        db.query('SELECT admin_id FROM admins ORDER BY admin_id ASC LIMIT 1', (err, admins) => {
            console.log('Database in admin.')

            if (err) {
                console.error('Error finding admin for support:', err);
                return res.status(500).json({ message: 'Database error while finding an admin.' });
            }

            if (!admins || admins.length === 0) {
                console.log('No admin accounts found to handle support requests.')
                return res.status(500).json({ message: 'No admin accounts found to handle support requests.' });
            }
            const supportAdminId = admins[0].admin_id;

            let conversationSql;
            let conversationParams;
            const dbSenderRole = sender_role === 'user' ? 'client' : 'lawyer';
            console.log("almost there")

            if (sender_role === 'lawyer') {
                // Lawyer is contacting Admin. Admin is the 'participant'.
                conversationSql = `
                    INSERT INTO conversations (participant_id, participant_role, lawyer_id) 
                    VALUES (?, 'admin', ?)
                    ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id);
                `;
                conversationParams = [supportAdminId, sender_id];
            } else { // sender_role === 'user'
                // User is contacting Admin. User is the 'participant', Admin is the 'lawyer' (workaround).
                conversationSql = `
                    INSERT INTO conversations (participant_id, participant_role, lawyer_id) 
                    VALUES (?, 'client', ?)
                    ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id);
                `;
                conversationParams = [sender_id, supportAdminId];
            }

            db.query(conversationSql, conversationParams, (convErr, convResult) => {
                console.log("done")
                if (convErr) {
                    console.error(`Error creating/getting ${sender_role} support conversation:`, convErr);
                    return res.status(500).json({ message: 'Failed to create support conversation.', error: convErr.message });
                }

                const conversationId = convResult.insertId;

                const messageSql = `
                    INSERT INTO messages (conversation_id, sender_id, sender_role, message_text) 
                    VALUES (?, ?, ?, ?);
                `;
                db.query(messageSql, [conversationId, sender_id, dbSenderRole, message_text], (msgErr, msgResult) => {
                    if (msgErr) {
                        console.error('Error inserting support message:', msgErr);
                        return res.status(500).json({ message: 'Failed to send support message.', error: msgErr.message });
                    }

                    res.status(201).json({
                        message: 'Support message sent successfully.',
                        conversation_id: conversationId,
                        message_id: msgResult.insertId
                    });
                });
            });
        });
    });

    // Get all support conversations for an admin
    app.get('/support/conversations/:admin_id', (req, res) => {
        const { admin_id } = req.params;
        console.log(`Fetching support conversations for admin_id: ${admin_id}`);

        const sql = `
            SELECT 
                c.conversation_id,
                CASE 
                    WHEN c.participant_role = 'admin' THEN l.full_name
                    WHEN c.participant_role = 'client' THEN u.full_name
                END AS sender_name,
                CASE 
                    WHEN c.participant_role = 'admin' THEN 'lawyer'
                    WHEN c.participant_role = 'client' THEN 'user'
                END AS sender_role,
                (SELECT m.message_text FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
                (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
            FROM conversations c
            LEFT JOIN lawyers l ON c.lawyer_id = l.lawyer_id AND c.participant_role = 'admin'
            LEFT JOIN users u ON c.participant_id = u.user_id AND c.participant_role = 'client'
            WHERE (c.participant_id = ? AND c.participant_role = 'admin')
               OR (c.lawyer_id = ? AND c.participant_role = 'client')
            ORDER BY last_message_at DESC;
        `;

        db.query(sql, [admin_id, admin_id], (err, results) => {
            if (err) {
                console.error('Error fetching admin support conversations:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            console.log(`Successfully fetched ${results.length} support conversations for admin_id: ${admin_id}`);
            res.status(200).json(results);
        });
    });
}