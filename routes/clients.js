import db from '../database/database.js';
import nodemailer from 'nodemailer';

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mwambajason2@gmail.com',
    pass: 'feaa fycg nuwl wbgh'
  }
});

export default function ClientRequests(app) {
    // 1. Client sends a request to a lawyer
    app.post('/client-requests', (req, res) => {
        const { client_id, lawyer_id, request_details } = req.body;
        console.log(`New client request from ${client_id} to ${lawyer_id}`);

        if (!client_id || !lawyer_id || !request_details) {
            return res.status(400).json({ message: "client_id, lawyer_id, and request_details are required" });
        }

        // Step 1: Insert the client request record
        const requestSql = "INSERT INTO client_requests (client_id, lawyer_id, request_details) VALUES (?, ?, ?)";
        db.query(requestSql, [client_id, lawyer_id, request_details], (err, result) => {
            if (err) {
                console.error("Error creating client request:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }

            const request_id = result.insertId;

            // Step 2: Find or create a conversation between client and lawyer immediately
            const convSql = `
                INSERT INTO conversations (participant_id, participant_role, lawyer_id)
                VALUES (?, 'client', ?)
                ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id)
            `;
            db.query(convSql, [client_id, lawyer_id], (convErr, convResult) => {
                if (convErr) {
                    console.error("Error creating conversation for request:", convErr);
                    // Request was saved, still return success even if conversation fails
                    return res.status(201).json({ message: "Request sent successfully", request_id });
                }

                const conversation_id = convResult.insertId;

                // Step 3: Insert the request details as the first message (from the client)
                const msgSql = "INSERT INTO messages (conversation_id, sender_id, sender_role, message_text) VALUES (?, ?, 'client', ?)";
                db.query(msgSql, [conversation_id, client_id, request_details], (msgErr) => {
                    if (msgErr) {
                        console.error("Error inserting request message:", msgErr);
                    }
                    res.status(201).json({
                        message: "Request sent successfully",
                        request_id,
                        conversation_id
                    });
                });
            });
        });
    });

    // 2. Lawyer fetches their requests
    app.get('/client-requests/lawyer/:lawyer_id', (req, res) => {
        const { lawyer_id } = req.params;
        console.log(`Fetching requests for lawyer ${lawyer_id}`);

        const sql = `
            SELECT cr.*, u.full_name as client_name, u.email as client_email, u.phone_number as client_phone
            FROM client_requests cr
            JOIN users u ON cr.client_id = u.user_id
            WHERE cr.lawyer_id = ?
            ORDER BY cr.created_at DESC
        `;
        db.query(sql, [lawyer_id], (err, results) => {
            if (err) {
                console.error("Error fetching client requests:", err);
                return res.status(500).json({ message: "Database error", error: err.message });
            }
            res.status(200).json(results);
        });
    });

    // 3. Lawyer accepts or rejects a request
    app.put('/client-requests/:request_id/action', (req, res) => {
        const { request_id } = req.params;
        const { action, initial_message } = req.body; // 'accepted' or 'rejected'
        console.log(`Action ${action} for request ${request_id}`);

        if (!['accepted', 'rejected'].includes(action)) {
            return res.status(400).json({ message: "Invalid action. Must be 'accepted' or 'rejected'." });
        }

        // First, get the request details (client info)
        const getRequestSql = `
            SELECT cr.*, u.full_name as client_name, u.email as client_email, l.full_name as lawyer_name
            FROM client_requests cr
            JOIN users u ON cr.client_id = u.user_id
            JOIN lawyers l ON cr.lawyer_id = l.lawyer_id
            WHERE cr.request_id = ?
        `;

        db.query(getRequestSql, [request_id], (err, results) => {
            if (err || results.length === 0) {
                console.error("Request not found:", err);
                return res.status(404).json({ message: "Request not found" });
            }

            const request = results[0];

            // Update request status
            const updateSql = "UPDATE client_requests SET status = ? WHERE request_id = ?";
            db.query(updateSql, [action, request_id], (updateErr) => {
                if (updateErr) {
                    console.error("Error updating request status:", updateErr);
                    return res.status(500).json({ message: "Database error", error: updateErr.message });
                }

                // If accepted, create a conversation
                if (action === 'accepted') {
                    const convSql = `
                        INSERT INTO conversations (participant_id, participant_role, lawyer_id) 
                        VALUES (?, 'client', ?)
                        ON DUPLICATE KEY UPDATE conversation_id = LAST_INSERT_ID(conversation_id)
                    `;
                    db.query(convSql, [request.client_id, request.lawyer_id], (convErr, convResult) => {
                        if (convErr) {
                            console.error("Error creating conversation on acceptance:", convErr);
                            return res.status(500).json({ message: "Error creating conversation" });
                        }
                        
                        const conversation_id = convResult.insertId;

                        // Insert initial message if provided
                        if (initial_message) {
                            const msgSql = "INSERT INTO messages (conversation_id, sender_id, sender_role, message_text) VALUES (?, ?, 'lawyer', ?)";
                            db.query(msgSql, [conversation_id, request.lawyer_id, initial_message], (msgErr) => {
                                if (msgErr) console.error("Error sending initial message:", msgErr);
                            });
                        }

                        // Send email notification anyway
                        sendNotificationEmail(request, action);
                        res.status(200).json({ message: `Request ${action} successfully`, conversation_id });
                    });
                } else {
                    // Just send email for rejection
                    sendNotificationEmail(request, action);
                    res.status(200).json({ message: `Request ${action} successfully` });
                }
            });
        });
    });

    function sendNotificationEmail(request, action) {
        const subject = action === 'accepted' ? 'Request Accepted - LawLink' : 'Request Update - LawLink';
        const text = action === 'accepted' 
            ? `Hello ${request.client_name},\n\nYour request to ${request.lawyer_name} has been accepted. You can now communicate via the Messaging section in your dashboard.\n\nBest regards,\nLawLink Team`
            : `Hello ${request.client_name},\n\nWe regret to inform you that your request to ${request.lawyer_name} has been rejected at this time.\n\nBest regards,\nLawLink Team`;

        const mailOptions = {
            from: 'mwambajason2@gmail.com',
            to: request.client_email,
            subject: subject,
            text: text
        };

        transport.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending notification email:", error);
            } else {
                console.log("Notification email sent: " + info.response);
            }
        });
    }
}
