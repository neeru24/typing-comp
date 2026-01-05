const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');
const requestLogger = require('./middleware/requestLogger');

dotenv.config();

require('./config/database');

const app = express();

// Security Middleware
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

logger.info('✓ Express app initialized');


// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/competition'));

// Static files
app.use(express.static(path.join(__dirname, "./public")));

// Fallback route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/participant.html"));
});

app.get('/organizer', (req, res) => {
  res.sendFile(path.join(__dirname, "./public/organizer.html"));
})

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, "./public/login.html"));
})

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, "./public/register.html"));
})

module.exports = app;