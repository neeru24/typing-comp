const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "/frontend")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "/frontend/participant.html"));
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/typing-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✓ MongoDB connected'))
.catch(err => console.error('❌ MongoDB error:', err));

const Competition = require('./models/Competition');

// ============= API ROUTES =============

app.post('/api/create', async (req, res) => {
  try {
    const { name, description, rounds } = req.body;

    if (!name || !rounds || rounds.length === 0) {
      return res.status(400).json({ error: 'Name and rounds required' });
    }

    const code = generateCode();
    const competition = new Competition({
      name,
      description: description || '',
      code,
      rounds: rounds.map((r, index) => ({
        roundNumber: index + 1,
        text: r.text,
        duration: r.duration,
        status: 'pending',
        startedAt: null,
        endedAt: null,
        totalDuration: 0,
        participantsCompleted: 0,
        highestWpm: 0,
        lowestWpm: 0,
        averageWpm: 0,
        averageAccuracy: 0,
        results: [],
        createdAt: new Date()
      })),
      status: 'pending',
      currentRound: -1,
      totalRounds: rounds.length,
      roundsCompleted: 0,
      finalRankings: [],
      createdAt: new Date()
    });

    await competition.save();
    console.log('✓ Competition created:', code);
    res.json({ success: true, code, competitionId: competition._id });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ error: 'Failed to create competition' });
  }
});

app.get('/api/competition/:code', async (req, res) => {
  try {
    const competition = await Competition.findOne({ code: req.params.code });
    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    res.json({
      id: competition._id,
      name: competition.name,
      code: competition.code,
      status: competition.status,
      roundCount: competition.rounds.length,
      roundsCompleted: competition.roundsCompleted,
      participants: competition.participants.length,
      currentRound: competition.currentRound
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch competition' });
  }
});

// ============= SOCKET.IO =============

const activeCompetitions = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);

  // PARTICIPANT JOINS
  socket.on('join', async (data) => {
    const { code, participantName } = data;
    try {
      const competition = await Competition.findOne({ code });
      if (!competition) {
        socket.emit('error', { message: 'Competition code not found' });
        return;
      }

      if (!activeCompetitions.has(competition._id.toString())) {
        activeCompetitions.set(competition._id.toString(), {
          competitionId: competition._id.toString(),
          code,
          currentRound: -1,
          roundInProgress: false,
          participants: new Map(),
          competitionDoc: competition
        });
      }

      const compData = activeCompetitions.get(competition._id.toString());
      
      // Check if already joined
      const existingParticipant = Array.from(compData.participants.values())
        .find(p => p.name === participantName);
      
      if (existingParticipant) {
        socket.emit('error', { message: 'Name already taken' });
        return;
      }

      const participant = {
        socketId: socket.id,
        name: participantName,
        joinedAt: Date.now(),
        scores: [],
        currentRoundData: {},
        roundScores: []
      };

      compData.participants.set(socket.id, participant);

      // Add to MongoDB
      await Competition.findByIdAndUpdate(
        competition._id,
        {
          $push: {
            participants: {
              name: participantName,
              socketId: socket.id,
              joinedAt: new Date(),
              totalWpm: 0,
              totalAccuracy: 0,
              roundsCompleted: 0,
              finalRank: null,
              roundScores: []
            }
          }
        }
      );

      socket.join(`competition_${competition._id}`);
      socket.competitionId = competition._id.toString();
      socket.participantName = participantName;
      socket.isOrganizer = false;

      // Notify all
      io.to(`competition_${competition._id}`).emit('participantJoined', {
        name: participantName,
        totalParticipants: compData.participants.size
      });

      socket.emit('joinSuccess', {
        competitionId: competition._id,
        name: competition.name,
        roundCount: competition.rounds.length
      });

      console.log(`✓ ${participantName} joined ${code} (Total: ${compData.participants.size})`);
    } catch (error) {
      console.error('Join error:', error);
      socket.emit('error', { message: 'Failed to join' });
    }
  });

  // ORGANIZER JOINS
  socket.on('organizerJoin', (data) => {
    socket.join(`competition_${data.competitionId}`);
    socket.isOrganizer = true;
    console.log('✓ Organizer connected');
  });

  // START ROUND
  socket.on('startRound', async (data) => {
    const { competitionId, roundIndex } = data;
    try {
      const competition = await Competition.findById(competitionId);
      if (!competition) {
        socket.emit('error', { message: 'Competition not found' });
        return;
      }

      const compData = activeCompetitions.get(competitionId);
      if (!compData) return;

      const round = competition.rounds[roundIndex];
      if (!round) {
        socket.emit('error', { message: 'Round not found' });
        return;
      }

      compData.currentRound = roundIndex;
      compData.roundInProgress = true;
      const startTime = new Date();
      round.startedAt = startTime;
      round.status = 'in-progress';

      // Reset participant data for this round
      compData.participants.forEach((p) => {
        p.currentRoundData = {
          correctChars: 0,
          totalChars: 0,
          wpm: 0,
          accuracy: 0,
          testStartTime: Date.now()
        };
      });

      // Update in MongoDB
      await Competition.findByIdAndUpdate(
        competitionId,
        {
          currentRound: roundIndex,
          $set: {
            [`rounds.${roundIndex}.startedAt`]: startTime,
            [`rounds.${roundIndex}.status`]: 'in-progress'
          }
        }
      );

      // Broadcast to all
      io.to(`competition_${competitionId}`).emit('roundStarted', {
        roundIndex,
        text: round.text,
        duration: round.duration,
        startTime: Date.now()
      });

      console.log(`✓ Round ${roundIndex + 1} started`);

      // Auto-end after duration
      setTimeout(async () => {
        await endRound(competitionId, roundIndex, competition, compData);
      }, round.duration * 1000);

    } catch (error) {
      console.error('Start round error:', error);
      socket.emit('error', { message: 'Failed to start round' });
    }
  });

  // TYPING PROGRESS
  socket.on('progress', async (data) => {
    const { competitionId, correctChars, totalChars } = data;

    try {
      const compData = activeCompetitions.get(competitionId);
      if (!compData || !compData.roundInProgress) return;

      const participant = compData.participants.get(socket.id);
      if (!participant) return;

      const startTime = participant.currentRoundData.testStartTime;
      const elapsedSeconds = (Date.now() - startTime) / 1000;

      // Validate WPM server-side
      const wpm = elapsedSeconds > 0 
        ? Math.round((correctChars / 5) / (elapsedSeconds / 60)) 
        : 0;
      const accuracy = totalChars > 0 
        ? Math.round((correctChars / totalChars) * 100) 
        : 100;
      const incorrectChars = totalChars - correctChars;

      participant.currentRoundData = {
        correctChars,
        totalChars,
        incorrectChars,
        wpm,
        accuracy,
        testStartTime: startTime,
        elapsedSeconds
      };

      // Update leaderboard every 1 second
      if (!compData.lastLeaderboardUpdate || Date.now() - compData.lastLeaderboardUpdate > 1000) {
        updateAndBroadcastLeaderboard(competitionId, compData);
        compData.lastLeaderboardUpdate = Date.now();
      }

    } catch (error) {
      console.error('Progress error:', error);
    }
  });

  // DISCONNECT
  socket.on('disconnect', async () => {
    console.log('🔌 Disconnected:', socket.id);

    if (socket.competitionId) {
      const compData = activeCompetitions.get(socket.competitionId);
      if (compData && !socket.isOrganizer) {
        const participant = compData.participants.get(socket.id);
        if (participant) {
          compData.participants.delete(socket.id);
          io.to(`competition_${socket.competitionId}`).emit('participantLeft', {
            totalParticipants: compData.participants.size
          });
        }
      }
    }
  });
});

// ============= HELPER FUNCTIONS =============

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function updateAndBroadcastLeaderboard(competitionId, compData) {
  const leaderboard = Array.from(compData.participants.values())
    .map(p => ({
      name: p.name,
      wpm: p.currentRoundData?.wpm || 0,
      accuracy: p.currentRoundData?.accuracy || 0
    }))
    .sort((a, b) => b.wpm - a.wpm);

  // Send to all (organizer + participants)
  io.to(`competition_${competitionId}`).emit('leaderboardUpdate', {
    round: compData.currentRound + 1,
    leaderboard
  });
}

async function endRound(competitionId, roundIndex, competition, compData) {
  try {
    if (!compData || !compData.roundInProgress) return;

    compData.roundInProgress = false;
    const endTime = new Date();

    // Calculate round statistics
    const participantsArray = Array.from(compData.participants.values());
    const roundResults = participantsArray.map((p, index) => ({
      participantName: p.name,
      participantId: p.socketId,
      wpm: p.currentRoundData.wpm || 0,
      accuracy: p.currentRoundData.accuracy || 0,
      correctChars: p.currentRoundData.correctChars || 0,
      totalChars: p.currentRoundData.totalChars || 0,
      incorrectChars: p.currentRoundData.incorrectChars || 0,
      typingTime: Math.round(p.currentRoundData.elapsedSeconds) || 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    // Sort by WPM to get ranks
    const rankedResults = roundResults
      .sort((a, b) => b.wpm - a.wpm)
      .map((result, index) => ({
        ...result,
        rank: index + 1
      }));

    // Calculate round statistics
    const wpmValues = rankedResults.map(r => r.wpm).filter(w => w > 0);
    const accuracyValues = rankedResults.map(r => r.accuracy);

    const highestWpm = wpmValues.length > 0 ? Math.max(...wpmValues) : 0;
    const lowestWpm = wpmValues.length > 0 ? Math.min(...wpmValues) : 0;
    const averageWpm = wpmValues.length > 0 
      ? Math.round(wpmValues.reduce((a, b) => a + b, 0) / wpmValues.length) 
      : 0;
    const averageAccuracy = accuracyValues.length > 0
      ? Math.round(accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length)
      : 0;

    // Save round results to database
    await Competition.findByIdAndUpdate(
      competitionId,
      {
        $set: {
          [`rounds.${roundIndex}.results`]: rankedResults,
          [`rounds.${roundIndex}.endedAt`]: endTime,
          [`rounds.${roundIndex}.status`]: 'completed',
          [`rounds.${roundIndex}.participantsCompleted`]: rankedResults.length,
          [`rounds.${roundIndex}.highestWpm`]: highestWpm,
          [`rounds.${roundIndex}.lowestWpm`]: lowestWpm,
          [`rounds.${roundIndex}.averageWpm`]: averageWpm,
          [`rounds.${roundIndex}.averageAccuracy`]: averageAccuracy,
          [`rounds.${roundIndex}.totalDuration`]: endTime - new Date(competition.rounds[roundIndex].startedAt)
        },
        roundsCompleted: compData.currentRound + 1
      }
    );

    console.log(`✓ Round ${roundIndex + 1} ended - Stats: Avg ${averageWpm} WPM, ${averageAccuracy}% accuracy`);

    // Store scores in participant object
    compData.participants.forEach((p) => {
      if (!p.scores) p.scores = [];
      const roundScore = rankedResults.find(r => r.participantName === p.name);
      if (roundScore) {
        p.scores.push({
          round: roundIndex,
          wpm: roundScore.wpm,
          accuracy: roundScore.accuracy,
          rank: roundScore.rank
        });
        if (!p.roundScores) p.roundScores = [];
        p.roundScores.push({
          roundNumber: roundIndex + 1,
          wpm: roundScore.wpm,
          accuracy: roundScore.accuracy,
          rank: roundScore.rank
        });
      }
    });

    // Send round end to all participants
    const finalLeaderboard = rankedResults
      .sort((a, b) => a.rank - b.rank)
      .map(r => ({
        name: r.participantName,
        wpm: r.wpm,
        accuracy: r.accuracy,
        rank: r.rank
      }));

    io.to(`competition_${competitionId}`).emit('roundEnded', {
      roundIndex,
      leaderboard: finalLeaderboard
    });

    // If all rounds complete
    if (roundIndex === competition.rounds.length - 1) {
      await showFinalResults(competitionId, compData, competition);
    }

  } catch (error) {
    console.error('End round error:', error);
  }
}

async function showFinalResults(competitionId, compData, competition) {
  try {
    const participantsArray = Array.from(compData.participants.values());

    // Calculate final rankings
    const finalRankings = participantsArray
      .map(p => {
        const scores = p.scores || [];
        
        const avgWpm = scores.length > 0 
          ? Math.round(scores.reduce((sum, s) => sum + s.wpm, 0) / scores.length)
          : 0;
        
        const avgAccuracy = scores.length > 0 
          ? Math.round(scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length)
          : 0;

        const highestWpm = scores.length > 0
          ? Math.max(...scores.map(s => s.wpm))
          : 0;

        const lowestWpm = scores.length > 0
          ? Math.min(...scores.map(s => s.wpm))
          : 0;

        return {
          participantName: p.name,
          averageWpm: avgWpm,
          averageAccuracy: avgAccuracy,
          totalRoundsCompleted: scores.length,
          highestWpm,
          lowestWpm,
          roundScores: scores
        };
      })
      .sort((a, b) => b.averageWpm - a.averageWpm)
      .map((ranking, index) => ({
        ...ranking,
        rank: index + 1
      }));

    // Save final results to database
    await Competition.findByIdAndUpdate(
      competitionId,
      {
        status: 'completed',
        completedAt: new Date(),
        finalRankings: finalRankings.map(r => ({
          rank: r.rank,
          participantName: r.participantName,
          averageWpm: r.averageWpm,
          averageAccuracy: r.averageAccuracy,
          totalRoundsCompleted: r.totalRoundsCompleted,
          highestWpm: r.highestWpm,
          lowestWpm: r.lowestWpm
        }))
      }
    );

    // Update each participant's final data
    for (const ranking of finalRankings) {
      await Competition.findByIdAndUpdate(
        competitionId,
        {
          $set: {
            'participants.$[elem].finalRank': ranking.rank,
            'participants.$[elem].totalWpm': ranking.averageWpm,
            'participants.$[elem].totalAccuracy': ranking.averageAccuracy,
            'participants.$[elem].roundsCompleted': ranking.totalRoundsCompleted,
            'participants.$[elem].roundScores': ranking.roundScores
          }
        },
        {
          arrayFilters: [{ 'elem.name': ranking.participantName }],
          new: true
        }
      );
    }

    console.log(`✓ Competition completed - Winner: ${finalRankings.participantName} (${finalRankings.averageWpm} WPM)`);

    // Emit final results
    io.to(`competition_${competitionId}`).emit('finalResults', {
      rankings: finalRankings.map(r => ({
        name: r.participantName,
        avgWpm: r.averageWpm,
        avgAccuracy: r.averageAccuracy,
        rank: r.rank,
        rounds: r.roundScores
      }))
    });

  } catch (error) {
    console.error('Final results error:', error);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
