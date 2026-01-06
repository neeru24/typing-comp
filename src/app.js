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


// Security headers (including CSP) via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Fallback for any resource type not explicitly listed
        defaultSrc: ["'self'"],

        // Allow scripts from our own origin + specific CDNs we use
        scriptSrc: [
          "'self'",
          "https://cdn.socket.io",    // Socket.IO client CDN
          "https://cdn.sheetjs.com",  // SheetJS (xlsx) CDN
          "https://cdnjs.cloudflare.com", // html2pdf and other libs from cdnjs
          "https://cdn.jsdelivr.net", // Chart.js CDN
        ],

        // Allow XHR / fetch / WebSocket connections to our backend
        connectSrc: [
          "'self'",
          "ws://localhost:3000",      // Socket.IO / WS endpoint in dev
          "http://localhost:3000",    // REST API endpoint in dev
          "https://cdn.socket.io", // allow Socket.IO source map / any XHR from this CDN
        ],

        // Allow images from same origin and inline data URLs (e.g. base64)
        imgSrc: ["'self'", "data:"],

        // Allow styles from same origin and inline styles (for convenience in this app)
        styleSrc: ["'self'", "'unsafe-inline'"],

        // Block inline JS attributes like onclick="" for better XSS protection
        scriptSrcAttr: ["'none'"],
      },
    },
  }),
);


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// API Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

logger.info('✓ Express app initialized');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/export', require('./routes/export'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api', require('./routes/competition'));

// Static files
app.use(express.static(path.join(__dirname, './public')));

// Fallback route
// Fallback route
app.get('/participant', (req, res) => {
  res.sendFile(path.join(__dirname, './public/participant.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './public/index.html'));
});

app.get('/organizer', (req, res) => {
  res.sendFile(path.join(__dirname, './public/organizer.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, './public/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, './public/register.html'));
});

app.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, './public/analytics.html'));
});

module.exports = app;
