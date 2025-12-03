// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const connectDB = require("./config/db");
const competitionRoutes = require("./routes/competition");
const organizerTokenRoutes = require('./routes/organizer-token');
const { registerCompetitionSocket } = require("./sockets/competition");

// --- NEW imports for token auth middleware ---
const OrganizerToken = require('./models/OrganizerToken'); // add this file
const { hashToken } = require('./lib/tokens'); // add this file

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ====== DB ======
connectDB();

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json());

// ====== API ROUTES ======
app.use("/api/competitions", competitionRoutes);
app.use('/api/organizer-token', organizerTokenRoutes);

// ====== STATIC FILES (after API) ======
app.use(express.static(path.join(__dirname, "/public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/participant.html"));
});

app.get("/organizer", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/organizer.html"));
});

// ====== SOCKET.IO AUTH MIDDLEWARE (INSERT HERE) ======
io.use(async (socket, next) => {
  try {
    const tokenPlain = socket.handshake.auth && socket.handshake.auth.token;
    if (!tokenPlain) return next(); // allow anonymous participants

    const tokenHash = hashToken(tokenPlain);
    const doc = await OrganizerToken.findOne({ tokenHash });

    if (!doc) return next(new Error('invalid_token'));
    if (doc.expiresAt < new Date()) return next(new Error('token_expired'));
    if (doc.oneTime && doc.used) return next(new Error('token_used'));

    // mark used if oneTime (optional race note below)
    if (doc.oneTime) {
      doc.used = true;
      doc.usedAt = new Date();
      doc.usedByIp = socket.handshake.address;
      await doc.save();
    }

    // attach organizer meta so handlers can trust socket.organizerAuth
    socket.organizerAuth = {
      competitionId: String(doc.competitionId),
      tokenId: String(doc._id)
    };

    return next();
  } catch (err) {
    console.error('socket auth error', err);
    return next(new Error('auth_error'));
  }
});

// ====== SOCKET.IO registration (after middleware) ======
registerCompetitionSocket(io);

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
