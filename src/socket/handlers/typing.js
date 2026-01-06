const { updateAndBroadcastLeaderboard } = require('../utils/leaderboard');
const logger = require('../../config/logger');

async function handleProgress(socket, io, data, activeCompetitions) {
  const { competitionId, correctChars, totalChars, errors = 0, backspaces = 0 } = data;
  
  try {
    const compData = activeCompetitions.get(competitionId);
    if (!compData || !compData.roundInProgress) return;

    const participant = compData.participants.get(socket.id);
    if (!participant) return;

    const startTime = participant.currentRoundData.testStartTime;
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Compute WPM and Accuracy
    // Only calculate WPM after at least 1 second to prevent inflated scores from very short times
    const wpm = elapsedSeconds >= 1
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
      errors,
      backspaces,
      testStartTime: startTime,
      elapsedSeconds
    };

    // Update leaderboard every 1 second
    if (!compData.lastLeaderboardUpdate || Date.now() - compData.lastLeaderboardUpdate > 1000) {
      updateAndBroadcastLeaderboard(competitionId, compData, io);
      compData.lastLeaderboardUpdate = Date.now();
    }
  } catch (error) {
    logger.error('Progress error:', error);
  }
}

module.exports = { handleProgress };