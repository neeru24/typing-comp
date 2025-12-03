const Competition = require('../../models/Competition');

async function handleJoin(socket, io, data, activeCompetitions) {
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
}

async function handleOrganizerJoin(socket, io, data) {
  socket.join(`competition_${data.competitionId}`);
  socket.isOrganizer = true;
  console.log('✓ Organizer connected');
}

module.exports = { handleJoin, handleOrganizerJoin };