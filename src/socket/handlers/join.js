const Competition = require('../../models/Competition');
const logger = require('../../config/logger');
const mongoose = require('mongoose');



async function handleJoin(socket, io, data, activeCompetitions) {
  const { code, participantName } = data;

  // ✅ NEW: Check MongoDB connection FIRST
  if (mongoose.connection.readyState !== 1) {
    logger.error('MongoDB not connected. Rejecting join request.', {
      code,
      participantName
    });

    socket.emit('joinError', {
      message: 'Server error: Database unavailable. Please try again later.'
    });
    return;
  }

  try {
    const competition = await Competition.findOne({ code }).lean();

    if (!competition) {
      logger.warn(`Competition code not found: ${code}`);
      socket.emit('joinError', {
        message: 'Invalid competition code. Please check and try again.'
      });
      return;
    }

    if (competition.status === 'completed') {
      socket.emit('joinError', {
        message: 'This competition has already ended.'
      });
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

    const existingParticipant = Array.from(compData.participants.values())
      .find(p => p.name === participantName);

    if (existingParticipant) {
      socket.emit('joinError', {
        message: 'This name is already taken in the competition.'
      });
      return;
    }

    // ===== SUCCESS =====
    socket.join(`competition_${competition._id}`);
    socket.competitionId = competition._id.toString();
    socket.participantName = participantName;
    socket.isOrganizer = false;

    socket.emit('joinSuccess', {
      competitionId: competition._id,
      name: competition.name,
      roundCount: competition.rounds.length
    });

    logger.info(`✓ Participant joined: ${participantName}`, {
      code,
      socketId: socket.id
    });

  } catch (error) {
    logger.error(`Join error: ${error.message}`, {
      code,
      participantName,
      stack: error.stack
    });

    // ✅ ALWAYS respond
    socket.emit('joinError', {
      message: 'Server error occurred. Please try again later.'
    });
  }
}


async function handleOrganizerJoin(socket, io, data) {
  try {
    socket.join(`competition_${data.competitionId}`);
    socket.isOrganizer = true;
    logger.info(`✓ Organizer connected`, { 
      socketId: socket.id,
      competitionId: data.competitionId 
    });
  } catch (error) {
    logger.error(`Organizer join error: ${error.message}`, {
      competitionId: data.competitionId,
      stack: error.stack
    });
  }
}

module.exports = { handleJoin, handleOrganizerJoin };
