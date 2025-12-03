const { handleJoin, handleOrganizerJoin } = require('./handlers/join');
const { handleProgress } = require('./handlers/typing');
const { handleStartRound } = require('./handlers/round');

const activeCompetitions = new Map();

function initializeSocketEvents(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Connected:', socket.id);

    // JOIN COMPETITION
    socket.on('join', (data) => handleJoin(socket, io, data, activeCompetitions));

    // ORGANIZER JOINS
    socket.on('organizerJoin', (data) => handleOrganizerJoin(socket, io, data));

    // START ROUND
    socket.on('startRound', (data) => handleStartRound(socket, io, data, activeCompetitions));

    // TYPING PROGRESS
    socket.on('progress', (data) => handleProgress(socket, io, data, activeCompetitions));

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
}

module.exports = initializeSocketEvents;
module.exports.activeCompetitions = activeCompetitions;