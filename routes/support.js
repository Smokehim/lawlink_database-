import db from '../database/database.js';

export default function Support(app) {
    // A dedicated endpoint for lawyers to send support messages to an admin.
    app.post('/support/contact-admin', (req, res) => { // This endpoint is now generic for users and lawyers
        const { sender_id, sender_role, message_text } = req.body;

        if (!sender_id || !sender_role || !message_text) {
            return res.status(400).json({ message: 'sender_id, sender_role, and message_text are required.' });
        }

        if (!['user', 'lawyer'].includes(sender_role)) {
            return res.status(400).json({ message: 'Invalid sender_role. Must be "user" or "lawyer".' });
        }

        // Find an admin to assign the conversation to.
        // For simplicity, we'll pick the first admin found.
        db.query('SELECT admin_id FROM admins ORDER BY admin_id ASC LIMIT 1', (err, admins) => {
            if (err) {
                console.error('Error finding admin for support:', err);
                return res.status(500).json({ message: 'Database error while finding an admin.' });
            }

            if (!admins || admins.length === 0) {
                return res.status(500).json({ message: 'No admin accounts found to handle support requests.' });
            }
            const supportAdminId = admins[0].admin_id;

            let conversationSql;
            let conversationParams;
            const dbSenderRole = sender_role === 'user' ? 'client' : 'lawyer';

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
}