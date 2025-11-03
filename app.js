const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const winston = require('winston');

// Import models
const Competition = require('./models/Competition');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// ==========================
// WINSTON LOGGER SETUP (P0)
// ==========================
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'typing-competition' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ==========================
// SOCKET.IO SETUP WITH CONNECTION STATE RECOVERY (P0)
// ==========================
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ==========================
// MIDDLEWARE SETUP
// ==========================
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // IMPORTANT: Changed from '../frontend' to 'public'

// Rate limiting middleware (P1)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const createCompetitionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many competitions created, please try again later.'
});

app.use('/api', apiLimiter);

// ==========================
// IN-MEMORY COMPETITION STATE
// ==========================
const competitionsData = new Map();

// ==========================
// MONGODB CONNECTION WITH ERROR HANDLING (P0)
// ==========================
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  logger.info('✓ MongoDB connected successfully');
  recoverActiveCompetitions();
})
.catch(err => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

mongoose.connection.on('error', err => {
  logger.error('MongoDB runtime error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

// ==========================
// CRASH RECOVERY FUNCTION (P0 - CRITICAL)
// ==========================
async function recoverActiveCompetitions() {
  try {
    const activeCompetitions = await Competition.find({
      status: 'ongoing',
      $or: [
        { 'rounds.startedAt': { $exists: true, $ne: null } },
        { completedAt: { $exists: false } }
      ]
    });

    logger.info(`Found ${activeCompetitions.length} active competitions to recover`);

    for (const comp of activeCompetitions) {
      const compData = {
        participants: new Map(),
        currentRound: comp.currentRound || 0,
        lastLeaderboardUpdate: null,
        isPaused: false,
        pausedAt: null
      };

      if (comp.participants && comp.participants.length > 0) {
        comp.participants.forEach(p => {
          compData.participants.set(p.name, {
            name: p.name,
            socketId: null,
            joinedAt: p.joinedAt,
            isReconnecting: true
          });
        });
      }

      competitionsData.set(comp._id.toString(), compData);
      logger.info(`Recovered competition: ${comp.name} (${comp.code}) with ${compData.participants.size} participants`);

      const currentRound = comp.rounds[comp.currentRound];
      if (currentRound && currentRound.startedAt && !currentRound.endedAt) {
        const now = Date.now();
        const elapsedTime = now - new Date(currentRound.startedAt).getTime();
        const roundDuration = currentRound.duration * 1000;

        if (elapsedTime >= roundDuration) {
          logger.warn(`Round ${comp.currentRound} in competition ${comp.code} should have ended, ending now`);
          await endRound(comp._id.toString(), comp.currentRound);
        } else {
          const remainingTime = roundDuration - elapsedTime;
          setTimeout(() => endRound(comp._id.toString(), comp.currentRound), remainingTime);
          logger.info(`Round ${comp.currentRound} in competition ${comp.code} will end in ${Math.round(remainingTime/1000)}s`);
        }
      }
    }
  } catch (error) {
    logger.error('Error recovering active competitions:', error);
  }
}

// ==========================
// HELPER FUNCTIONS
// ==========================

function sanitizeInput(input, type = 'string') {
  if (!input) return '';
  
  let sanitized = String(input).trim();
  
  switch(type) {
    case 'name':
      sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-_.()]/g, '');
      break;
    case 'code':
      sanitized = sanitized.toUpperCase().replace(/[^A-Z0-9]/g, '');
      break;
    case 'text':
      sanitized = validator.escape(sanitized);
      break;
    default:
      sanitized = validator.escape(sanitized);
  }
  
  return sanitized.substring(0, 500);
}

function generateCompetitionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function validateWPM(wpm, elapsedTime, correctChars) {
  if (wpm > 200) {
    logger.warn(`Suspicious WPM detected: ${wpm}`);
    return { valid: false, reason: 'WPM too high (>200)' };
  }
  
  if (elapsedTime < 1000 && correctChars > 10) {
    return { valid: false, reason: 'Too fast typing detected' };
  }
  
  const expectedWPM = (correctChars / 5) / (elapsedTime / 60000);
  const diff = Math.abs(wpm - expectedWPM);
  
  if (diff > 20) {
    logger.warn(`WPM mismatch: reported ${wpm}, expected ${expectedWPM}`);
    return { valid: false, reason: 'WPM calculation mismatch' };
  }
  
  return { valid: true };
}

async function updateAndBroadcastLeaderboard(competitionId, compData) {
  try {
    const competition = await Competition.findById(competitionId);
    if (!competition || !competition.rounds[compData.currentRound]) return;

    const currentRound = competition.rounds[compData.currentRound];
    if (!currentRound.startedAt) return;

    const leaderboard = [];

    for (const [name, participant] of compData.participants) {
      if (participant.currentProgress) {
        const elapsedTime = Math.min(
          participant.currentProgress.elapsedTime || 0,
          currentRound.duration * 1000
        );
        
        const wpm = Math.round(
          (participant.currentProgress.correctChars / 5) / (elapsedTime / 60000)
        ) || 0;
        
        const accuracy = Math.round(
          (participant.currentProgress.correctChars / 
          Math.max(participant.currentProgress.totalChars, 1)) * 100
        ) || 0;

        leaderboard.push({
          name,
          wpm,
          accuracy,
          correctChars: participant.currentProgress.correctChars || 0
        });
      }
    }

    leaderboard.sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);

    io.to(competitionId).emit('leaderboardUpdate', {
      round: compData.currentRound,
      leaderboard
    });

    compData.lastLeaderboardUpdate = Date.now();
  } catch (error) {
    logger.error('Error updating leaderboard:', error);
  }
}

async function endRound(competitionId, roundIndex) {
  try {
    const competition = await Competition.findById(competitionId);
    const compData = competitionsData.get(competitionId);
    
    if (!competition || !compData) return;

    const round = competition.rounds[roundIndex];
    if (!round || round.endedAt) return;

    round.endedAt = new Date();
    const results = [];

    for (const [name, participant] of compData.participants) {
      if (participant.currentProgress) {
        const elapsedTime = Math.min(
          participant.currentProgress.elapsedTime || 0,
          round.duration * 1000
        );
        
        const wpm = Math.round(
          (participant.currentProgress.correctChars / 5) / (elapsedTime / 60000)
        ) || 0;
        
        const accuracy = Math.round(
          (participant.currentProgress.correctChars / 
          Math.max(participant.currentProgress.totalChars, 1)) * 100
        ) || 0;

        results.push({
          participantName: name,
          wpm,
          accuracy,
          correctChars: participant.currentProgress.correctChars || 0
        });
      }
    }

    round.results = results.sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);
    await competition.save();

    logger.info(`Round ${roundIndex} ended for competition ${competition.code}`);

    io.to(competitionId).emit('roundEnded', {
      roundIndex,
      leaderboard: round.results
    });

    for (const participant of compData.participants.values()) {
      participant.currentProgress = null;
    }

    if (roundIndex === competition.rounds.length - 1) {
      competition.status = 'completed';
      competition.completedAt = new Date();
      await competition.save();

      const finalRankings = calculateFinalRankings(competition);
      
      io.to(competitionId).emit('finalResults', { rankings: finalRankings });
      
      logger.info(`Competition ${competition.code} completed`);
      
      setTimeout(() => {
        competitionsData.delete(competitionId);
        logger.info(`Cleaned up competition ${competition.code} from memory`);
      }, 5 * 60 * 1000);
    }
  } catch (error) {
    logger.error('Error ending round:', error);
  }
}

function calculateFinalRankings(competition) {
  const participantStats = new Map();

  competition.rounds.forEach(round => {
    round.results.forEach(result => {
      if (!participantStats.has(result.participantName)) {
        participantStats.set(result.participantName, {
          name: result.participantName,
          totalWpm: 0,
          totalAccuracy: 0,
          roundsCompleted: 0
        });
      }
      
      const stats = participantStats.get(result.participantName);
      stats.totalWpm += result.wpm;
      stats.totalAccuracy += result.accuracy;
      stats.roundsCompleted++;
    });
  });

  const rankings = Array.from(participantStats.values())
    .map(stats => ({
      name: stats.name,
      averageWpm: Math.round(stats.totalWpm / stats.roundsCompleted),
      averageAccuracy: Math.round(stats.totalAccuracy / stats.roundsCompleted),
      roundsCompleted: stats.roundsCompleted
    }))
    .sort((a, b) => b.averageWpm - a.averageWpm || b.averageAccuracy - a.averageAccuracy);

  return rankings;
}

function getUniqueName(competitionId, requestedName) {
  const compData = competitionsData.get(competitionId);
  if (!compData) return requestedName;

  let uniqueName = requestedName;
  let counter = 2;

  while (compData.participants.has(uniqueName)) {
    uniqueName = `${requestedName} (${counter})`;
    counter++;
  }

  if (uniqueName !== requestedName) {
    logger.info(`Duplicate name ${requestedName} changed to ${uniqueName}`);
  }

  return uniqueName;
}

// ==========================
// API ROUTES
// ==========================

app.post('/api/create', 
  createCompetitionLimiter,
  [
    body('name').trim().isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 characters'),
    body('rounds').isArray({ min: 1, max: 10 }).withMessage('Must have 1-10 rounds'),
    body('rounds.*.text').trim().isLength({ min: 10, max: 5000 }).withMessage('Text must be 10-5000 characters'),
    body('rounds.*.duration').isInt({ min: 10, max: 600 }).withMessage('Duration must be 10-600 seconds')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Validation errors in create competition:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, rounds } = req.body;

      const sanitizedName = sanitizeInput(name, 'name');
      const sanitizedRounds = rounds.map(r => ({
        text: sanitizeInput(r.text, 'text'),
        duration: parseInt(r.duration)
      }));

      let code;
      let codeExists = true;
      let attempts = 0;
      
      while (codeExists && attempts < 10) {
        code = generateCompetitionCode();
        const existing = await Competition.findOne({ code });
        codeExists = !!existing;
        attempts++;
      }

      if (codeExists) {
        return res.status(500).json({ success: false, message: 'Failed to generate unique code' });
      }

      const competition = new Competition({
        name: sanitizedName,
        code,
        organizer: 'TechFest',
        status: 'waiting',
        rounds: sanitizedRounds,
        participants: [],
        currentRound: 0
      });

      await competition.save();

      competitionsData.set(competition._id.toString(), {
        participants: new Map(),
        currentRound: 0,
        lastLeaderboardUpdate: null,
        isPaused: false,
        pausedAt: null
      });

      logger.info(`Competition created: ${sanitizedName} (${code})`);

      res.json({
        success: true,
        code,
        competitionId: competition._id
      });
    } catch (error) {
      logger.error('Error creating competition:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

app.get('/api/competition/:code', async (req, res) => {
  try {
    const code = sanitizeInput(req.params.code, 'code');
    
    if (!code || code.length < 5) {
      return res.status(400).json({ success: false, message: 'Invalid code' });
    }

    const competition = await Competition.findOne({ code });
    
    if (!competition) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    const compData = competitionsData.get(competition._id.toString());

    res.json({
      success: true,
      id: competition._id,
      name: competition.name,
      code: competition.code,
      status: competition.status,
      roundCount: competition.rounds.length,
      participants: compData ? compData.participants.size : 0,
      currentRound: competition.currentRound
    });
  } catch (error) {
    logger.error('Error fetching competition:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    activeCompetitions: competitionsData.size
  };
  
  res.json(health);
});

// ==========================
// SOCKET.IO EVENT HANDLERS
// ==========================

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}, recovered: ${socket.recovered}`);

  if (socket.recovered) {
    logger.info(`Socket ${socket.id} recovered successfully`);
  }

  socket.on('join', async ({ code, participantName }) => {
    try {
      if (!code || !participantName) {
        return socket.emit('error', { message: 'Code and name are required' });
      }

      const sanitizedCode = sanitizeInput(code, 'code');
      let sanitizedName = sanitizeInput(participantName, 'name');

      if (sanitizedCode.length < 5 || sanitizedName.length < 2) {
        return socket.emit('error', { message: 'Invalid code or name format' });
      }

      const competition = await Competition.findOne({ code: sanitizedCode });
      
      if (!competition) {
        logger.warn(`Join attempt with invalid code: ${sanitizedCode}`);
        return socket.emit('error', { message: 'Competition not found' });
      }

      if (competition.status === 'completed') {
        return socket.emit('error', { message: 'Competition has ended' });
      }

      const competitionId = competition._id.toString();
      let compData = competitionsData.get(competitionId);

      if (!compData) {
        compData = {
          participants: new Map(),
          currentRound: competition.currentRound || 0,
          lastLeaderboardUpdate: null,
          isPaused: false,
          pausedAt: null
        };
        competitionsData.set(competitionId, compData);
      }

      sanitizedName = getUniqueName(competitionId, sanitizedName);

      if (compData.participants.size >= 200) {
        return socket.emit('error', { message: 'Competition is full (max 200 participants)' });
      }

      const existingParticipant = Array.from(compData.participants.values())
        .find(p => p.name === sanitizedName || p.socketId === socket.id);

      if (existingParticipant) {
        existingParticipant.socketId = socket.id;
        existingParticipant.isReconnecting = false;
        logger.info(`Participant reconnected: ${sanitizedName} in ${sanitizedCode}`);
      } else {
        compData.participants.set(sanitizedName, {
          name: sanitizedName,
          socketId: socket.id,
          joinedAt: new Date(),
          currentProgress: null,
          isReconnecting: false
        });

        competition.participants.push({
          name: sanitizedName,
          socketId: socket.id,
          joinedAt: new Date()
        });
        await competition.save();

        logger.info(`Participant joined: ${sanitizedName} in ${sanitizedCode} (total: ${compData.participants.size})`);
      }

      socket.join(competitionId);
      socket.competitionId = competitionId;
      socket.participantName = sanitizedName;

      socket.emit('joinSuccess', {
        competitionId,
        name: sanitizedName,
        roundCount: competition.rounds.length,
        currentRound: compData.currentRound,
        isPaused: compData.isPaused
      });

      io.to(competitionId).emit('participantJoined', {
        name: sanitizedName,
        totalParticipants: compData.participants.size
      });

      const currentRound = competition.rounds[compData.currentRound];
      if (currentRound && currentRound.startedAt && !currentRound.endedAt) {
        const elapsedTime = Date.now() - new Date(currentRound.startedAt).getTime();
        const remainingTime = (currentRound.duration * 1000) - elapsedTime;

        if (remainingTime > 0 && !compData.isPaused) {
          socket.emit('roundStarted', {
            roundIndex: compData.currentRound,
            text: currentRound.text,
            duration: currentRound.duration,
            startTime: new Date(currentRound.startedAt).getTime(),
            elapsedTime: Math.floor(elapsedTime / 1000)
          });
        }
      }
    } catch (error) {
      logger.error('Error in join event:', error);
      socket.emit('error', { message: 'Failed to join competition' });
    }
  });

  socket.on('rejoin', async ({ code, name, currentChar, elapsedTime }) => {
    try {
      const sanitizedCode = sanitizeInput(code, 'code');
      const sanitizedName = sanitizeInput(name, 'name');

      const competition = await Competition.findOne({ code: sanitizedCode });
      if (!competition) {
        return socket.emit('error', { message: 'Competition not found' });
      }

      const competitionId = competition._id.toString();
      const compData = competitionsData.get(competitionId);

      if (!compData) {
        return socket.emit('error', { message: 'Competition not active' });
      }

      const participant = compData.participants.get(sanitizedName);
      if (!participant) {
        return socket.emit('error', { message: 'Participant not found' });
      }

      participant.socketId = socket.id;
      participant.isReconnecting = false;

      if (participant.currentProgress) {
        participant.currentProgress.currentChar = currentChar || participant.currentProgress.currentChar;
        participant.currentProgress.elapsedTime = elapsedTime || participant.currentProgress.elapsedTime;
      }

      socket.join(competitionId);
      socket.competitionId = competitionId;
      socket.participantName = sanitizedName;

      logger.info(`Participant rejoined: ${sanitizedName} in ${sanitizedCode}`);

      socket.emit('rejoinSuccess', {
        competitionId,
        name: sanitizedName,
        currentRound: compData.currentRound,
        currentProgress: participant.currentProgress
      });
    } catch (error) {
      logger.error('Error in rejoin event:', error);
      socket.emit('error', { message: 'Failed to rejoin' });
    }
  });

  socket.on('startRound', async ({ competitionId, roundIndex }) => {
    try {
      const competition = await Competition.findById(competitionId);
      const compData = competitionsData.get(competitionId);

      if (!competition || !compData) {
        return socket.emit('error', { message: 'Competition not found' });
      }

      if (roundIndex < 0 || roundIndex >= competition.rounds.length) {
        return socket.emit('error', { message: 'Invalid round index' });
      }

      const round = competition.rounds[roundIndex];
      if (round.startedAt) {
        return socket.emit('error', { message: 'Round already started' });
      }

      if (compData.participants.size === 0) {
        return socket.emit('error', { message: 'Cannot start with 0 participants' });
      }

      round.startedAt = new Date();
      compData.currentRound = roundIndex;
      compData.isPaused = false;
      competition.currentRound = roundIndex;
      competition.status = 'ongoing';
      
      await competition.save();

      logger.info(`Round ${roundIndex} started for competition ${competition.code} with ${compData.participants.size} participants`);

      for (const participant of compData.participants.values()) {
        participant.currentProgress = {
          correctChars: 0,
          totalChars: 0,
          currentChar: 0,
          elapsedTime: 0
        };
      }

      io.to(competitionId).emit('roundStarted', {
        roundIndex,
        text: round.text,
        duration: round.duration,
        startTime: Date.now()
      });

      setTimeout(() => endRound(competitionId, roundIndex), round.duration * 1000);
    } catch (error) {
      logger.error('Error starting round:', error);
      socket.emit('error', { message: 'Failed to start round' });
    }
  });

  socket.on('progress', async ({ competitionId, correctChars, totalChars, currentChar, elapsedTime }) => {
    try {
      const compData = competitionsData.get(competitionId);
      if (!compData || !socket.participantName) return;

      const participant = compData.participants.get(socket.participantName);
      if (!participant) return;

      const competition = await Competition.findById(competitionId);
      if (!competition) return;

      const round = competition.rounds[compData.currentRound];
      if (!round || !round.startedAt || round.endedAt || compData.isPaused) return;

      const actualElapsedTime = Date.now() - new Date(round.startedAt).getTime();
      if (elapsedTime > actualElapsedTime + 1000) {
        logger.warn(`Time manipulation detected from ${socket.participantName}`);
        return;
      }

      if (correctChars < 0 || totalChars < 0 || currentChar < 0) return;
      if (totalChars > round.text.length || currentChar > round.text.length) return;
      if (correctChars > totalChars) return;

      const wpm = Math.round((correctChars / 5) / (elapsedTime / 60000)) || 0;
      const validation = validateWPM(wpm, elapsedTime, correctChars);
      
      if (!validation.valid) {
        logger.warn(`Invalid WPM from ${socket.participantName}: ${validation.reason}`);
      }

      participant.currentProgress = {
        correctChars,
        totalChars,
        currentChar,
        elapsedTime
      };

      if (!compData.lastLeaderboardUpdate || 
          Date.now() - compData.lastLeaderboardUpdate > 1000) {
        updateAndBroadcastLeaderboard(competitionId, compData);
      }
    } catch (error) {
      logger.error('Error processing progress:', error);
    }
  });

  socket.on('pauseRound', async ({ competitionId }) => {
    try {
      const competition = await Competition.findById(competitionId);
      const compData = competitionsData.get(competitionId);

      if (!competition || !compData) {
        return socket.emit('error', { message: 'Competition not found' });
      }

      if (compData.isPaused) {
        return socket.emit('error', { message: 'Round already paused' });
      }

      compData.isPaused = true;
      compData.pausedAt = Date.now();

      io.to(competitionId).emit('roundPaused', { 
        pausedAt: compData.pausedAt 
      });

      logger.info(`Round paused for competition ${competition.code}`);
    } catch (error) {
      logger.error('Error pausing round:', error);
    }
  });

  socket.on('resumeRound', async ({ competitionId }) => {
    try {
      const competition = await Competition.findById(competitionId);
      const compData = competitionsData.get(competitionId);

      if (!competition || !compData) {
        return socket.emit('error', { message: 'Competition not found' });
      }

      if (!compData.isPaused) {
        return socket.emit('error', { message: 'Round not paused' });
      }

      const pauseDuration = Date.now() - compData.pausedAt;
      compData.isPaused = false;

      const round = competition.rounds[compData.currentRound];
      if (round && round.startedAt) {
        round.startedAt = new Date(new Date(round.startedAt).getTime() + pauseDuration);
        await competition.save();
      }

      io.to(competitionId).emit('roundResumed', { 
        resumedAt: Date.now(),
        pauseDuration 
      });

      logger.info(`Round resumed for competition ${competition.code}`);
    } catch (error) {
      logger.error('Error resuming round:', error);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);

    if (socket.competitionId && socket.participantName) {
      const compData = competitionsData.get(socket.competitionId);
      
      if (compData) {
        const participant = compData.participants.get(socket.participantName);
        
        if (participant) {
          participant.isReconnecting = true;
          participant.disconnectedAt = Date.now();

          setTimeout(() => {
            if (participant.isReconnecting && 
                Date.now() - participant.disconnectedAt > 2 * 60 * 1000) {
              compData.participants.delete(socket.participantName);
              
              io.to(socket.competitionId).emit('participantLeft', {
                name: socket.participantName,
                totalParticipants: compData.participants.size
              });

              logger.info(`Participant ${socket.participantName} removed after timeout`);
            }
          }, 2 * 60 * 1000);
        }
      }
    }
  });
});

// ==========================
// ERROR HANDLING MIDDLEWARE (P0)
// ==========================
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
