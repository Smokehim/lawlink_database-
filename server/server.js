import app from './app.js';
import db from '../database/database.js';
import '../models/databasetable.js';

// Import route handlers
import Admins from '../routes/admin.js';
import District from '../routes/district.js';
import Lawyers from '../routes/lawyers.js';
import Lawslocation from '../routes/lawslocation.js';
import Province from '../routes/province.js';
import Users from '../routes/users.js';
import Messages from '../routes/messages.js';
import Conversations from '../routes/conversations.js';
import Profile from '../routes/profile.js';
import Support from '../routes/support.js';
import Availability from '../routes/availability.js';
import ClientRequests from '../routes/clients.js';
import Uploads from '../routes/upload.js';

const port = 3002;


Admins(app);
District(app);
Lawyers(app);
Lawslocation(app);
Province(app);
Users(app);
Messages(app);
Conversations(app);
Profile(app);
Support(app);
Availability(app);
ClientRequests(app);
Uploads(app);
app.listen(port, ()=>{
    console.log(`server is running on port ${port}`);
});

db.connect((error)=>{
    if(error) return console.log("Error connecting to database:", error);
    console.log("database connected successfully");
});












 
