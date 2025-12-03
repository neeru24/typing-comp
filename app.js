const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

require('./config/database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', require('./routes/competition'));

// Static files
app.use(express.static(path.join(__dirname, "./public")));

// Fallback route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/participant.html"));
});

app.get('/organizer', (req,res)=>{
  res.sendFile(path.join(__dirname, "./public/organizer.html"));
})
module.exports = app;