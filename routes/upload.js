import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/database.js';

const router = express.Router();

// Ensure the upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads/profile_pictures');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${req.body.role}-${req.body.userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Endpoint to upload profile picture
router.post('/upload-profile-picture', upload.single('profile_picture'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded or invalid file format' });
    }

    const { userId, role } = req.body;
    
    if (!userId || !role) {
        // delete the uploaded file if we don't have user info
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'User ID and role are required' });
    }

    const pictureUrl = `/uploads/profile_pictures/${req.file.filename}`;
    let tableName = '';
    let idColumn = '';

    if (role === 'client' || role === 'user') {
        tableName = 'users';
        idColumn = 'user_id';
    } else if (role === 'lawyer') {
        tableName = 'lawyers';
        idColumn = 'lawyer_id';
    } else if (role === 'admin') {
        tableName = 'admins';
        idColumn = 'admin_id';
    } else {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Invalid role provided' });
    }

    // First fetch the old profile picture to delete it (optional, to save space)
    const selectSql = `SELECT profile_picture FROM ${tableName} WHERE ${idColumn} = ?`;
    db.query(selectSql, [userId], (err, results) => {
        if (!err && results.length > 0 && results[0].profile_picture) {
            const oldPath = path.join(process.cwd(), results[0].profile_picture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Now update the database with the new profile picture path
        const updateSql = `UPDATE ${tableName} SET profile_picture = ? WHERE ${idColumn} = ?`;
        db.query(updateSql, [pictureUrl, userId], (err) => {
            if (err) {
                fs.unlinkSync(req.file.path);
                return res.status(500).json({ message: 'Database error while updating profile picture' });
            }
            
            res.status(200).json({ 
                message: 'Profile picture updated successfully',
                profile_picture: pictureUrl
            });
        });
    });
});

export default function Uploads(app) {
    app.use('/', router);
}
