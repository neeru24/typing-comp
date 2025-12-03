const Competition = require('../../models/Competition');
const { updateAndBroadcastLeaderboard } = require('../utils/leaderboard');

async function handleStartRound(socket, io, data, activeCompetitions) {
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

    // Reset participant data
    compData.participants.forEach((p) => {
      p.currentRoundData = {
        correctChars: 0,
        totalChars: 0,
        wpm: 0,
        accuracy: 0,
        errors: 0,
        backspaces: 0,
        testStartTime: Date.now()
      };
    });

    // Update DB
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

    // Broadcast
    io.to(`competition_${competitionId}`).emit('roundStarted', {
      roundIndex,
      text: round.text,
      duration: round.duration,
      startTime: Date.now()
    });

    console.log(`✓ Round ${roundIndex + 1} started`);

    // Auto-end after duration
    setTimeout(async () => {
      const competitionDoc = await Competition.findById(competitionId);
      await handleEndRound(competitionId, roundIndex, competitionDoc, compData, io);
    }, round.duration * 1000);

  } catch (error) {
    console.error('Start round error:', error);
    socket.emit('error', { message: 'Failed to start round' });
  }
}

async function handleEndRound(competitionId, roundIndex, competition, compData, io) {
  try {
    if (!compData || !compData.roundInProgress) return;
    compData.roundInProgress = false;

    const endTime = new Date();
    const participantsArray = Array.from(compData.participants.values());

    const roundResults = participantsArray.map((p) => ({
      participantName: p.name,
      participantId: p.socketId,
      wpm: p.currentRoundData.wpm || 0,
      accuracy: p.currentRoundData.accuracy || 0,
      correctChars: p.currentRoundData.correctChars || 0,
      totalChars: p.currentRoundData.totalChars || 0,
      incorrectChars: p.currentRoundData.incorrectChars || 0,
      errors: p.currentRoundData.errors || 0,
      backspaces: p.currentRoundData.backspaces || 0,
      typingTime: Math.round(p.currentRoundData.elapsedSeconds) || 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    // Sort by WPM
    const rankedResults = roundResults
      .sort((a, b) => b.wpm - a.wpm)
      .map((result, index) => ({
        ...result,
        rank: index + 1
      }));

    // Calculate stats
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

    // Save to DB
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

    console.log(`✓ Round ${roundIndex + 1} ended - Avg ${averageWpm} WPM`);

    // Store scores in memory
    compData.participants.forEach((p) => {
      if (!p.scores) p.scores = [];
      const roundScore = rankedResults.find(r => r.participantName === p.name);
      if (roundScore) {
        p.scores.push({
          round: roundIndex,
          wpm: roundScore.wpm,
          accuracy: roundScore.accuracy,
          rank: roundScore.rank,
          errors: roundScore.errors || 0,
          backspaces: roundScore.backspaces || 0
        });
        if (!p.roundScores) p.roundScores = [];
        p.roundScores.push({
          roundNumber: roundIndex + 1,
          wpm: roundScore.wpm,
          accuracy: roundScore.accuracy,
          rank: roundScore.rank,
          errors: roundScore.errors || 0,
          backspaces: roundScore.backspaces || 0
        });
      }
    });

    // Send results
    const finalLeaderboard = rankedResults
      .sort((a, b) => a.rank - b.rank)
      .map(r => ({
        name: r.participantName,
        wpm: r.wpm,
        accuracy: r.accuracy,
        errors: r.errors || 0,
        backspaces: r.backspaces || 0,
        rank: r.rank
      }));

    io.to(`competition_${competitionId}`).emit('roundEnded', {
      roundIndex,
      leaderboard: finalLeaderboard
    });

    // Check if final round
    if (roundIndex === competition.rounds.length - 1) {
      await handleShowFinalResults(competitionId, compData, competition, io);
    }

  } catch (error) {
    console.error('End round error:', error);
  }
}

async function handleShowFinalResults(competitionId, compData, competition, io) {
  try {
    const participantsArray = Array.from(compData.participants.values());

    const finalRankings = participantsArray
      .map(p => {
        const scores = p.scores || [];
        const avgWpm = scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s.wpm, 0) / scores.length)
          : 0;
        const avgAccuracy = scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length)
          : 0;
        const highestWpm = scores.length > 0 ? Math.max(...scores.map(s => s.wpm)) : 0;
        const lowestWpm = scores.length > 0 ? Math.min(...scores.map(s => s.wpm)) : 0;
        const totalErrors = scores.length > 0
          ? scores.reduce((sum, s) => sum + (s.errors || 0), 0)
          : 0;
        const totalBackspaces = scores.length > 0
          ? scores.reduce((sum, s) => sum + (s.backspaces || 0), 0)
          : 0;

        return {
          participantName: p.name,
          averageWpm: avgWpm,
          averageAccuracy: avgAccuracy,
          totalRoundsCompleted: scores.length,
          highestWpm,
          lowestWpm,
          totalErrors,
          totalBackspaces,
          roundScores: scores
        };
      })
      .sort((a, b) => b.averageWpm - a.averageWpm)
      .map((ranking, index) => ({
        ...ranking,
        rank: index + 1
      }));

    // Save to DB
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

    // Update each participant
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

    console.log('✓ Competition completed');

    // Emit final results
    io.to(`competition_${competitionId}`).emit('finalResults', {
      rankings: finalRankings.map(r => ({
        name: r.participantName,
        avgWpm: r.averageWpm,
        avgAccuracy: r.averageAccuracy,
        rank: r.rank,
        rounds: r.roundScores,
        totalErrors: r.totalErrors,
        totalBackspaces: r.totalBackspaces
      }))
    });

  } catch (error) {
    console.error('Final results error:', error);
  }
}

module.exports = { handleStartRound, handleEndRound, handleShowFinalResults }