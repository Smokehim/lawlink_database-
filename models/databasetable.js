import db from '../database/database.js';

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to database for table initialization');

    // -----------------------------
    // 1. Users Table
    // -----------------------------
    const usersSql = `CREATE TABLE IF NOT EXISTS users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        profile_picture VARCHAR(255) DEFAULT NULL,
        phone_number VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        gender VARCHAR(10),
        verification_code VARCHAR(10) NULL,
        verification_status ENUM('pending', 'verified') DEFAULT 'pending',
        serial_code VARCHAR(20) NULL,
        serial_code_expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    db.query(usersSql, (err) => {
        if (err) console.error("Error creating users table:", err);
        else {
            console.log("Users Table Created");
            createLawyersTable();
        }
    });

    function createLawyersTable() {
        const lawyersSql = `CREATE TABLE IF NOT EXISTS lawyers (
            lawyer_id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            profile_picture VARCHAR(255) DEFAULT NULL,
            phone_number VARCHAR(20),
            province VARCHAR(100),
            district VARCHAR(100),
            specialization VARCHAR(100),
            attorney_status VARCHAR(50),
            bio TEXT,
            bar_number VARCHAR(100),
            password VARCHAR(255) NOT NULL,
            license_file VARCHAR(255),
            verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
            verification_code VARCHAR(10) NULL,
            serial_code VARCHAR(20) NULL,
            serial_code_expires_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        db.query(lawyersSql, (err) => {
            if (err) console.error("Error creating lawyers table:", err);
            else {
                console.log("Lawyers Table Created");
                createAdminsTable();
                createProvincesTable();
            }
        });
    }

    // Step 1: Create Provinces first (needed for districts which is needed for lawyer_locations)
    function createProvincesTable() {
        const provincesSql = `CREATE TABLE IF NOT EXISTS provinces (
            province_id INT AUTO_INCREMENT PRIMARY KEY,
            province_name VARCHAR(100) NOT NULL UNIQUE
        )`;

        db.query(provincesSql, (err) => {
            if (err) {
                console.error("Error creating provinces table:", err);
                return;
            }
            console.log("Provinces Table Created");
            seedProvinces(() => {
                createDistrictsTable();
            });
        });
    }

    // Step 2: Create Admins (no dependencies)
    function createAdminsTable() {
        const adminsSql = `CREATE TABLE IF NOT EXISTS admins (
            admin_id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            profile_picture VARCHAR(255) DEFAULT NULL,
            phone_number VARCHAR(20),
            specialization VARCHAR(100),
            province VARCHAR(100),
            district VARCHAR(100),
            status VARCHAR(20) DEFAULT 'verified',
            password VARCHAR(255) NOT NULL,
            verification_code VARCHAR(10) NULL,
            verification_status ENUM('pending', 'verified') DEFAULT 'pending',
            serial_code VARCHAR(20) NULL,
            serial_code_expires_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        db.query(adminsSql, (err) => {
            if (err) console.error("Error creating admins table:", err);
            else console.log("Admins Table Created");
        });
    }

    function createDistrictsTable() {
        const districtsSql = `CREATE TABLE IF NOT EXISTS districts (
            district_id INT AUTO_INCREMENT PRIMARY KEY,
            district_name VARCHAR(100) NOT NULL,
            province_id INT NOT NULL,
            FOREIGN KEY (province_id) REFERENCES provinces(province_id) ON DELETE CASCADE
        )`;

        db.query(districtsSql, (err) => {
            if (err) {
                console.error("Error creating districts table:", err);
                return;
            }
            console.log("Districts Table Created");
            seedDistricts();
            createLawyerLocationsTable();
        });
    }

    function createLawyerLocationsTable() {
        const locSql = `CREATE TABLE IF NOT EXISTS lawyer_locations (
            location_id INT AUTO_INCREMENT PRIMARY KEY,
            lawyer_id INT NOT NULL,
            district_id INT NOT NULL,
            physical_address VARCHAR(255),
            FOREIGN KEY (lawyer_id) REFERENCES lawyers(lawyer_id) ON DELETE CASCADE,
            FOREIGN KEY (district_id) REFERENCES districts(district_id) ON DELETE CASCADE
        )`;
        
        db.query(locSql, (err) => {
             if (err && err.code !== 'ER_NO_SUCH_TABLE') console.error("Error creating lawyer_locations table:", err.message);
             else if (!err) {
                console.log("Lawyer_locations Table Created");
                ConversationsTable();
             }
        });
    }
    function ConversationsTable() {
    const Sql = `CREATE TABLE IF NOT EXISTS conversations (
        conversation_id INT AUTO_INCREMENT PRIMARY KEY,
        lawyer_id INT NOT NULL,
        participant_id INT NOT NULL,
        participant_role ENUM('client', 'admin') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE KEY unique_conversation (participant_id, participant_role, lawyer_id),
        INDEX idx_lawyer (lawyer_id),
        INDEX idx_participant (participant_id, participant_role)
    )`;

    db.query(Sql, (err, result) => {
        if (err) console.error("Error creating conversations table:", err.message);
        else {
            console.log("Conversations Table Created");
            createMessagesTable(); // 👈 create messages AFTER conversations
        }
    });
   }
    function createMessagesTable() {
        const messagesSql = `CREATE TABLE IF NOT EXISTS messages (
        message_id INT AUTO_INCREMENT PRIMARY KEY,

        conversation_id INT NOT NULL,

        sender_id INT NOT NULL,
        sender_role ENUM('client', 'lawyer', 'admin') NOT NULL,

        message_text TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
            ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_conversation (conversation_id),
        INDEX idx_sender (sender_id, sender_role)
    )`;
        
        db.query(messagesSql, (err) => {
            if (err && err.code !== 'ER_NO_SUCH_TABLE') console.error("Error creating messages table:", err.message);
            else if (!err) {
                console.log("Messages Table Created");
                createLawyerAvailabilityTable();
            }
        });
    }

    function createLawyerAvailabilityTable() {
        const sql = `CREATE TABLE IF NOT EXISTS lawyer_availability (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lawyer_id INT NOT NULL,
            unavailable_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_lawyer_date (lawyer_id, unavailable_date),
            FOREIGN KEY (lawyer_id) REFERENCES lawyers(lawyer_id) ON DELETE CASCADE
        )`;
        db.query(sql, (err) => {
            if (err) console.error("Error creating lawyer_availability table:", err);
            else {
                console.log("Lawyer_availability Table Created");
                createWorkingHoursTable();
            }
        });
    }

    function createWorkingHoursTable() {
        const sql = `CREATE TABLE IF NOT EXISTS working_hours (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lawyer_id INT NOT NULL,
            day_of_week ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') NOT NULL,
            start_time TIME DEFAULT '09:00:00',
            end_time TIME DEFAULT '17:00:00',
            is_closed BOOLEAN DEFAULT FALSE,
            UNIQUE KEY unique_lawyer_day (lawyer_id, day_of_week),
            FOREIGN KEY (lawyer_id) REFERENCES lawyers(lawyer_id) ON DELETE CASCADE
        )`;
        db.query(sql, (err) => {
            if (err) console.error("Error creating working_hours table:", err);
            else {
                console.log("Working_hours Table Created");
                createClientRequestsTable();
            }
        });
    }

    function createClientRequestsTable() {
        const sql = `CREATE TABLE IF NOT EXISTS client_requests (
            request_id INT AUTO_INCREMENT PRIMARY KEY,
            client_id INT NOT NULL,
            lawyer_id INT NOT NULL,
            request_details TEXT NOT NULL,
            status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (lawyer_id) REFERENCES lawyers(lawyer_id) ON DELETE CASCADE
        )`;
        db.query(sql, (err) => {
            if (err) console.error("Error creating client_requests table:", err);
            else console.log("Client_requests Table Created");
        });
    }

    // -----------------------------
    // Seeding Functions
    // -----------------------------
    function seedProvinces(callback) {
        db.query('SELECT COUNT(*) AS count FROM provinces', (err, result) => {
            if (err) {
                console.error("Error checking provinces:", err);
                if (callback) callback();
                return;
            }

            if (result[0].count === 0) {
                const provinces = [
                    'Central', 'Copperbelt', 'Eastern', 'Luapula', 'Lusaka',
                    'Muchinga', 'Northern', 'North-Western', 'Southern', 'Western'
                ];
                const values = provinces.map(p => [p]);
                db.query('INSERT INTO provinces (province_name) VALUES ?', [values], (err) => {
                    if (err) console.error("Error seeding provinces:", err);
                    else console.log('Zambian provinces inserted successfully');
                    if (callback) callback();
                });
            } else {
                console.log('Provinces already seeded');
                if (callback) callback();
            }
        });
    }

    function seedDistricts() {
        db.query('SELECT COUNT(*) AS count FROM districts', (err, result) => {
            if (err) return console.error("Error checking districts:", err);

            if (result[0].count === 0) {
                const districts = [
                    // Central
                    { name: 'Chibombo', province: 'Central' }, { name: 'Chisamba', province: 'Central' },
                    { name: 'Kabwe', province: 'Central' }, { name: 'Kapiri Mposhi', province: 'Central' },
                    { name: 'Mkushi', province: 'Central' },
                    // Copperbelt
                    { name: 'Chililabombwe', province: 'Copperbelt' }, { name: 'Chingola', province: 'Copperbelt' },
                    { name: 'Kitwe', province: 'Copperbelt' }, { name: 'Luanshya', province: 'Copperbelt' },
                    { name: 'Masaiti', province: 'Copperbelt' }, { name: 'Mpongwe', province: 'Copperbelt' },
                    { name: 'Ndola', province: 'Copperbelt' },
                    // Eastern
                    { name: 'Chadiza', province: 'Eastern' }, { name: 'Chama', province: 'Eastern' },
                    { name: 'Chipata', province: 'Eastern' }, { name: 'Katete', province: 'Eastern' },
                    { name: 'Lundazi', province: 'Eastern' }, { name: 'Mambwe', province: 'Eastern' },
                    { name: 'Nyimba', province: 'Eastern' },
                    // Luapula
                    { name: 'Chienge', province: 'Luapula' }, { name: 'Chirundu', province: 'Luapula' },
                    { name: 'Kawambwa', province: 'Luapula' }, { name: 'Mansa', province: 'Luapula' },
                    { name: 'Nchelenge', province: 'Luapula' }, { name: 'Samfya', province: 'Luapula' },
                    // Lusaka
                    { name: 'Chilanga', province: 'Lusaka' }, { name: 'Chongwe', province: 'Lusaka' },
                    { name: 'Kafue', province: 'Lusaka' }, { name: 'Luangwa', province: 'Lusaka' },
                    { name: 'Lusaka', province: 'Lusaka' },
                    // Muchinga
                    { name: 'Chinsali', province: 'Muchinga' }, { name: 'Isoka', province: 'Muchinga' },
                    { name: 'Nakonde', province: 'Muchinga' }, { name: 'Mpika', province: 'Muchinga' },
                    // Northern
                    { name: 'Kaputa', province: 'Northern' }, { name: 'Mbala', province: 'Northern' },
                    { name: 'Mporokoso', province: 'Northern' }, { name: 'Mpulungu', province: 'Northern' },
                    { name: 'Mungwi', province: 'Northern' }, { name: 'Kasama', province: 'Northern' },
                    // North-Western
                    { name: 'Chavuma', province: 'North-Western' }, { name: 'Kabompo', province: 'North-Western' },
                    { name: 'Kasempa', province: 'North-Western' }, { name: 'Kipushi', province: 'North-Western' },
                    { name: 'Mwinilunga', province: 'North-Western' }, { name: 'Solwezi', province: 'North-Western' },
                    // Southern
                    { name: 'Chikankata', province: 'Southern' }, { name: 'Choma', province: 'Southern' },
                    { name: 'Gwembe', province: 'Southern' }, { name: 'Kalomo', province: 'Southern' },
                    { name: 'Kazungula', province: 'Southern' }, { name: 'Livingstone', province: 'Southern' },
                    { name: 'Mazabuka', province: 'Southern' }, { name: 'Monze', province: 'Southern' },
                    { name: 'Pemba', province: 'Southern' }, { name: 'Siavonga', province: 'Southern' },
                    // Western
                    { name: 'Kalabo', province: 'Western' }, { name: 'Kaoma', province: 'Western' },
                    { name: 'Nkeyema', province: 'Western' }, { name: 'Senanga', province: 'Western' },
                    { name: 'Sesheke', province: 'Western' }, { name: 'Mongu', province: 'Western' },
                ];

                db.query('SELECT province_id, province_name FROM provinces', (err, provincesResult) => {
                    if (err) return console.error("Error fetching provinces for seeding:", err);

                    const provinceMap = {};
                    provincesResult.forEach(p => { provinceMap[p.province_name] = p.province_id; });

                    const values = districts.map(d => [d.name, provinceMap[d.province]]);
                    
                    // Filter out any districts where province wasn't found (safety check)
                    const validValues = values.filter(v => v[1] !== undefined);

                    if (validValues.length > 0) {
                        db.query('INSERT INTO districts (district_name, province_id) VALUES ?', [validValues], (err) => {
                            if (err) console.error("Error seeding districts:", err);
                            else console.log('Zambian districts inserted successfully');
                        });
                    }
                });
            } else {
                console.log('Districts already seeded');
            }
        });
    }
});
