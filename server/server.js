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


const port = 3002;


Admins(app);
District(app);
Lawyers(app);
Lawslocation(app);
Province(app);
Users(app);
Messages(app);

app.listen(port, ()=>{
    console.log(`server is running on port ${port}`);
});

db.connect((error)=>{
    if(error) return console.log("Error connecting to database:", error);
    console.log("database connected successfully");
});












 
