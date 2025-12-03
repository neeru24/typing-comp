// sockets/competitionSocket.js
const mongoose = require("mongoose");
const Competition = require("../models/Competition");

const activeCompetitions = new Map();

/**
 * Helper: build room name
 */
const roomName = (competitionId) => `competition_${competitionId}`;

/**
 * Main registration function
 */
function registerCompetitionSocket(io) {
  io.on("connection", (socket) => {
    console.log("🔌 Connected:", socket.id);

    // If socket was authenticated as organizer in handshake middleware, auto-join the room
    if (socket.organizerAuth && socket.organizerAuth.competitionId) {
      const compId = String(socket.organizerAuth.competitionId);
      socket.join(roomName(compId));
      socket.isOrganizer = true;
      socket.competitionId = compId;
      console.log(`✓ Organizer socket auto-joined for competition ${compId} (socket ${socket.id})`);
    }

    // JOIN as participant
    socket.on("join", (data) =>
      handleJoin(io, socket, data).catch((err) =>
        console.error("Join handler error:", err)
      )
    );

    // ORGANIZER joins
    socket.on("organizerJoin", (data) => handleOrganizerJoin(socket, data));

    // START round
    socket.on("startRound", (data) =>
      handleStartRound(io, socket, data).catch((err) =>
        console.error("Start round handler error:", err)
      )
    );

    // TYPING progress
    socket.on("progress", (data) =>
      handleProgress(io, socket, data).catch((err) =>
        console.error("Progress handler error:", err)
      )
    );

    // DISCONNECT
    socket.on("disconnect", () =>
      handleDisconnect(io, socket).catch((err) =>
        console.error("Disconnect handler error:", err)
      )
    );
  });
}

/* ===================== HANDLERS ===================== */

async function handleJoin(io, socket, data) {
  const { code, participantName } = data || {};
  if (!code || !participantName) {
    socket.emit("error", { message: "Code and name are required" });
    return;
  }

  try {
    const competition = await Competition.findOne({ code });
    if (!competition) {
      socket.emit("error", { message: "Competition code not found" });
      return;
    }

    const competitionId = competition._id.toString();

    // Create in-memory state if not exists
    if (!activeCompetitions.has(competitionId)) {
      activeCompetitions.set(competitionId, {
        competitionId,
        code,
        currentRound: -1,
        roundInProgress: false,
        participants: new Map(), // key: socketId
        lastLeaderboardUpdate: 0,
        currentRoundTextLength: 0,
      });
    }

    const compData = activeCompetitions.get(competitionId);

    // Generate participantId (guest) – could be User _id in a real app
    const participantId = new mongoose.Types.ObjectId();

    const participant = {
      socketId: socket.id,
      participantId,
      name: participantName,
      joinedAt: Date.now(),
      scores: [],
      currentRoundData: {},
      roundScores: [],
    };

    compData.participants.set(socket.id, participant);

    // Persist participant in DB according to ParticipantSchema
    await Competition.findByIdAndUpdate(competitionId, {
      $push: {
        participants: {
          name: participantName,
          participantId,
          socketId: socket.id,
          joinedAt: new Date(),
          roundScores: [],
        },
      },
    });

    socket.join(roomName(competitionId));
    socket.competitionId = competitionId;
    socket.participantName = participantName;
    socket.participantId = participantId;
    socket.isOrganizer = false;

    // Notify everyone in room
    io.to(roomName(competitionId)).emit("participantJoined", {
      name: participantName,
      participantId, // optional: send ID too so frontend can distinguish
      totalParticipants: compData.participants.size,
    });

    socket.emit("joinSuccess", {
      competitionId,
      name: competition.name,
      roundCount: competition.rounds.length,
      participantId, // useful for client-side tracking
    });

    console.log(
      `✓ ${participantName} joined ${code} (Total: ${compData.participants.size})`
    );
  } catch (error) {
    console.error("Join error:", error);
    socket.emit("error", { message: "Failed to join" });
  }
}

function handleOrganizerJoin(socket, data) {
  const { competitionId } = data || {};
  if (!competitionId) {
    socket.emit('error', { message: 'competitionId required' });
    return;
  }

  // Require socket.organizerAuth to exist and match competitionId
  if (!socket.organizerAuth || String(socket.organizerAuth.competitionId) !== String(competitionId)) {
    console.warn('Organizer join attempt without valid token or mismatch', {
      socketId: socket.id,
      providedCompetitionId: competitionId,
      authCompetitionId: socket.organizerAuth ? socket.organizerAuth.competitionId : null,
    });
    socket.emit('error', { message: 'Not authorized as organizer for this competition' });
    return;
  }

  socket.join(roomName(competitionId));
  socket.isOrganizer = true;
  socket.competitionId = competitionId;
  console.log("✓ Organizer connected:", competitionId, 'socket:', socket.id);
}


async function handleStartRound(io, socket, data) {
  const { competitionId, roundIndex } = data || {};
  if (!competitionId || typeof roundIndex !== "number") {
    socket.emit("error", { message: "Invalid round data" });
    return;
  }

  // Authorization: require organizerAuth or socket.isOrganizer that matches competitionId
  const socketIsAuthorized =
    (socket.organizerAuth && String(socket.organizerAuth.competitionId) === String(competitionId)) ||
    (socket.isOrganizer && String(socket.competitionId) === String(competitionId));

  if (!socketIsAuthorized) {
    socket.emit("error", { message: "Not authorized to start round" });
    console.warn('Unauthorized startRound attempt', { socketId: socket.id, competitionId, roundIndex });
    return;
  }

  try {
    // Atomically set competition status to 'live' for this round only if it's not already live.
    // This prevents racing two devices trying to start the same round.
    const now = new Date();
    const updated = await Competition.findOneAndUpdate(
      {
        _id: competitionId,
        // ensure competition not already in-progress for this same round
        $or: [
          { currentRound: { $exists: false } },
          { currentRound: -1 },
          { currentRound: { $ne: roundIndex } }
        ],
        // optionally ensure the round status isn't already in-progress
        // and competition status is not 'completed'
        status: { $ne: 'completed' }
      },
      {
        $set: {
          currentRound: roundIndex,
          status: 'live',
          roundStartTime: now,
          [`rounds.${roundIndex}.startedAt`]: now,
          [`rounds.${roundIndex}.status`]: 'in-progress'
        }
      },
      { new: true }
    );

    if (!updated) {
      // Could not update — likely another organizer already started it or state mismatch
      socket.emit("error", { message: "Round could not be started (already started or invalid state)" });
      return;
    }

    // Proceed with in-memory state changes and broadcasting
    const competition = updated; // canonical object from DB
    const compData = activeCompetitions.get(competitionId);

    if (!compData) {
      socket.emit("error", { message: "Competition not active in memory" });
      return;
    }

    const round = competition.rounds[roundIndex];
    if (!round) {
      socket.emit("error", { message: "Round not found" });
      return;
    }

    compData.currentRound = roundIndex;
    compData.roundInProgress = true;
    compData.currentRoundTextLength = (round.text || "").length;

    // Reset per-participant round data
    compData.participants.forEach((p) => {
      p.currentRoundData = {
        correctChars: 0,
        totalChars: 0,
        incorrectChars: 0,
        wpm: 0,
        accuracy: 0,
        errors: 0,
        backspaces: 0,
        testStartTime: Date.now(),
        elapsedSeconds: 0,
      };
    });

    // Broadcast start of round (use DB start time)
    io.to(roomName(competitionId)).emit("roundStarted", {
      roundIndex,
      text: round.text,
      duration: round.duration,
      startTime: Date.now(),
    });

    console.log(`✓ Round ${roundIndex + 1} started by ${socket.id}`);

    // Auto-end after duration (still use DB-stored competition for finalization)
    setTimeout(async () => {
      const latestCompetition = await Competition.findById(competitionId);
      await endRound(io, competitionId, roundIndex, latestCompetition, compData);
    }, round.duration * 1000);
  } catch (error) {
    console.error("Start round error:", error);
    socket.emit("error", { message: "Failed to start round" });
  }
}


async function handleProgress(io, socket, data) {
  const { competitionId, correctChars, totalChars, errors = 0, backspaces = 0 } =
    data || {};

  if (!competitionId) return;

  try {
    const compData = activeCompetitions.get(competitionId);
    if (!compData || !compData.roundInProgress) return;

    const participant = compData.participants.get(socket.id);
    if (!participant) return;

    const startTime = participant.currentRoundData.testStartTime;
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    const safeCorrect = Number(correctChars) || 0;
    const safeTotal = Number(totalChars) || 0;

    const wpm =
      elapsedSeconds > 0
        ? Math.round((safeCorrect / 5) / (elapsedSeconds / 60))
        : 0;

    const accuracy =
      safeTotal > 0 ? Math.round((safeCorrect / safeTotal) * 100) : 100;

    const incorrect = safeTotal - safeCorrect;

    participant.currentRoundData = {
      correctChars: safeCorrect,
      totalChars: safeTotal,
      incorrectChars: incorrect,
      wpm,
      accuracy,
      errors: Number(errors) || 0,
      backspaces: Number(backspaces) || 0,
      testStartTime: startTime,
      elapsedSeconds,
    };

    // Throttle leaderboard updates to ~1/s
    if (
      !compData.lastLeaderboardUpdate ||
      Date.now() - compData.lastLeaderboardUpdate > 1000
    ) {
      updateAndBroadcastLeaderboard(io, competitionId, compData);
      compData.lastLeaderboardUpdate = Date.now();
    }
  } catch (error) {
    console.error("Progress error:", error);
  }
}

async function handleDisconnect(io, socket) {
  console.log("🔌 Disconnected:", socket.id);

  const competitionId = socket.competitionId;
  if (!competitionId) return;

  const compData = activeCompetitions.get(competitionId);
  if (!compData) return;

  // If organizer disconnected, just log (organizer presence not required)
  if (socket.isOrganizer) {
    console.log(`Organizer disconnected from competition ${competitionId} (socket ${socket.id})`);
    // Do NOT remove organizers from participants map (they are not in it),
    // but you could track organizer sockets in a separate map if needed.
    return;
  }

  // Remove participant
  const participant = compData.participants.get(socket.id);
  if (participant) {
    compData.participants.delete(socket.id);
    io.to(roomName(competitionId)).emit("participantLeft", {
      totalParticipants: compData.participants.size,
    });
  }
}


/* ===================== HELPERS ===================== */

function updateAndBroadcastLeaderboard(io, competitionId, compData) {
  const totalTextLength = compData.currentRoundTextLength || 0;

  const leaderboard = Array.from(compData.participants.values())
    .map((p) => ({
      name: p.name,
      participantId: p.participantId, // helpful on frontend with same names
      wpm: p.currentRoundData?.wpm || 0,
      accuracy: p.currentRoundData?.accuracy || 0,
      errors: p.currentRoundData?.errors || 0,
      backspaces: p.currentRoundData?.backspaces || 0,
      progress:
        totalTextLength > 0
          ? Math.round(
            ((p.currentRoundData?.totalChars || 0) / totalTextLength) * 100
          )
          : 0,
    }))
    .sort((a, b) => b.wpm - a.wpm);

  io.to(roomName(competitionId)).emit("leaderboardUpdate", {
    roundIndex: compData.currentRound,
    leaderboard,
  });
}

async function endRound(io, competitionId, roundIndex, competition, compData) {
  try {
    if (!compData || !compData.roundInProgress) return;

    compData.roundInProgress = false;
    const endTime = new Date();

    const participantsArray = Array.from(compData.participants.values());

    const roundResults = participantsArray.map((p) => ({
      participantName: p.name,
      participantId: p.participantId,
      wpm: p.currentRoundData.wpm || 0,
      accuracy: p.currentRoundData.accuracy || 0,
      correctChars: p.currentRoundData.correctChars || 0,
      totalChars: p.currentRoundData.totalChars || 0,
      incorrectChars: p.currentRoundData.incorrectChars || 0,
      errors: p.currentRoundData.errors || 0,
      backspaces: p.currentRoundData.backspaces || 0,
      typingTime: Math.round(p.currentRoundData.elapsedSeconds) || 0,
    }));

    // Sort by WPM to get ranks (in-memory only)
    const rankedResults = roundResults
      .slice()
      .sort((a, b) => b.wpm - a.wpm)
      .map((result, index) => ({
        ...result,
        rank: index + 1,
      }));

    // Persist ONLY what exists in schema
    await Competition.findByIdAndUpdate(competitionId, {
      $set: {
        [`rounds.${roundIndex}.results`]: rankedResults,
        [`rounds.${roundIndex}.endedAt`]: endTime,
        [`rounds.${roundIndex}.status`]: "completed",
      },
    });

    console.log(`✓ Round ${roundIndex + 1} ended`);

    // Store scores in in-memory participant object
    compData.participants.forEach((p) => {
      if (!p.scores) p.scores = [];
      const roundScore = rankedResults.find(
        (r) => r.participantId.toString() === p.participantId.toString()
      );
      if (roundScore) {
        p.scores.push({
          round: roundIndex + 1,
          wpm: roundScore.wpm,
          accuracy: roundScore.accuracy,
          rank: roundScore.rank,
          errors: roundScore.errors || 0,
          backspaces: roundScore.backspaces || 0,
        });
        if (!p.roundScores) p.roundScores = [];
        p.roundScores.push({
          roundNumber: roundIndex + 1,
          wpm: roundScore.wpm,
          accuracy: roundScore.accuracy,
          errors: roundScore.errors || 0,
          backspaces: roundScore.backspaces || 0,
        });
      }
    });

    // Emit final leaderboard for this round
    const finalLeaderboard = rankedResults
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({
        name: r.participantName,
        participantId: r.participantId,
        wpm: r.wpm,
        accuracy: r.accuracy,
        errors: r.errors || 0,
        backspaces: r.backspaces || 0,
        rank: r.rank,
      }));

    io.to(roomName(competitionId)).emit("roundEnded", {
      roundIndex,
      leaderboard: finalLeaderboard,
    });

    // If last round -> final results
    if (competition && roundIndex === competition.rounds.length - 1) {
      await showFinalResults(io, competitionId, compData);
    }
  } catch (error) {
    console.error("End round error:", error);
  }
}

async function showFinalResults(io, competitionId, compData) {
  try {
    const participantsArray = Array.from(compData.participants.values());

    const finalRankingsDetailed = participantsArray
      .map((p) => {
        const scores = p.scores || [];

        const avgWpm =
          scores.length > 0
            ? Math.round(
              scores.reduce((sum, s) => sum + s.wpm, 0) / scores.length
            )
            : 0;

        const avgAccuracy =
          scores.length > 0
            ? Math.round(
              scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length
            )
            : 0;

        return {
          participantId: p.participantId,
          participantName: p.name,
          averageWpm: avgWpm,
          averageAccuracy: avgAccuracy,
          totalRoundsCompleted: scores.length,
          roundScores: scores,
        };
      })
      .sort((a, b) => b.averageWpm - a.averageWpm)
      .map((ranking, index) => ({
        ...ranking,
        rank: index + 1,
      }));

    // Persist minimal summary in DB (schema only has name, id, totalRoundsCompleted)
    const finalRankingsForDb = finalRankingsDetailed.map((r) => ({
      participantName: r.participantName,
      participantId: r.participantId,
      totalRoundsCompleted: r.totalRoundsCompleted,
    }));

    await Competition.findByIdAndUpdate(competitionId, {
      status: "completed",
      completedAt: new Date(),
      finalRankings: finalRankingsForDb,
    });

    console.log("✓ Competition completed");

    // Emit detailed final results to clients (can include extra fields)
    io.to(roomName(competitionId)).emit("finalResults", {
      rankings: finalRankingsDetailed,
    });
  } catch (error) {
    console.error("Final results error:", error);
  }
}

module.exports = {
  registerCompetitionSocket,
};
