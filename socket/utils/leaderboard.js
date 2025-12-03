function typingTextLengthFor(compData) {
  try {
    const compDoc = compData.competitionDoc;
    const idx = compData.currentRound;
    if (!compDoc || idx == null || idx < 0) return 0;
    const text = compDoc.rounds[idx].text || '';
    return text.length;
  } catch (e) {
    return 0;
  }
}

function updateAndBroadcastLeaderboard(competitionId, compData, io) {
  const totalTextLength = typingTextLengthFor(compData) || 0;
  
  const leaderboard = Array.from(compData.participants.values())
    .map(p => ({
      name: p.name,
      wpm: p.currentRoundData?.wpm || 0,
      accuracy: p.currentRoundData?.accuracy || 0,
      errors: p.currentRoundData?.errors || 0,
      backspaces: p.currentRoundData?.backspaces || 0,
      progress: totalTextLength > 0 
        ? Math.round(((p.currentRoundData?.totalChars || 0) / totalTextLength) * 100) 
        : 0
    }))
    .sort((a, b) => b.wpm - a.wpm);

  io.to(`competition_${competitionId}`).emit('leaderboardUpdate', {
    roundIndex: compData.currentRound,
    leaderboard
  });
}

module.exports = { updateAndBroadcastLeaderboard, typingTextLengthFor };