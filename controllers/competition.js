const Competition = require("../models/Competition");

const MAX_CODE_GENERATION_ATTEMPTS = 5;

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const createdAtCompetition = async (req, res) => {
  try {
    const { name, description, rounds } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Competition name is required" });
    }

    if (!Array.isArray(rounds) || rounds.length === 0) {
      return res.status(400).json({ error: "At least one round is required" });
    }

    // Build rounds according to RoundSchema
    const sanitizedRounds = [];
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i] || {};
      const text = typeof round.text === "string" ? round.text.trim() : "";
      const duration = Number(round.duration);

      if (!text) {
        return res.status(400).json({
          error: `Round ${i + 1}: "text" is required`,
        });
      }

      if (!Number.isFinite(duration) || duration <= 0) {
        return res.status(400).json({
          error: `Round ${i + 1}: "duration" must be a positive number`,
        });
      }

      sanitizedRounds.push({
        roundNumber: i + 1,
        text,
        duration,
        status: "pending",
        startedAt: null,
        endedAt: null,
        results: [], // RoundResultSchema; filled later when users play
      });
    }

    // Generate a unique competition code with a few retries
    let code;
    let attempts = 0;
    let existing;

    do {
      code = generateCode();
      existing = await Competition.exists({ code });
      attempts += 1;
    } while (existing && attempts < MAX_CODE_GENERATION_ATTEMPTS);

    if (existing) {
      console.error(
        "[Competition] Failed to generate unique code after attempts:",
        attempts
      );
      return res
        .status(500)
        .json({ error: "Unable to create competition at this time" });
    }

    const competition = new Competition({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      code,
      rounds: sanitizedRounds,
      status: "pending",
      currentRound: -1,
      totalRounds: sanitizedRounds.length,
      // participants, finalRankings, startedAt, completedAt use schema defaults
    });

    await competition.save();

    console.log("✓ Competition created:", {
      code,
      id: competition._id.toString(),
      name: competition.name,
    });

    return res.status(201).json({
      success: true,
      code,
      competitionId: competition._id,
    });
  } catch (error) {
    console.error("[Competition] Create error:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      error: "Failed to create competition. Please try again later.",
    });
  }
};

const getCompetitionByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const competition = await Competition.findOne({ code });

    if (!competition) {
      return res.status(404).json({ error: "Competition not found" });
    }

    // If you want how many rounds are completed:
    const roundsCompleted = competition.rounds.filter(
      (r) => r.status === "completed"
    ).length;

    return res.json({
      id: competition.id, 
      name: competition.name,
      code: competition.code,
      status: competition.status,
      totalRounds: competition.totalRounds,
      totalParticipants: competition.totalParticipants, // virtual
      currentRound: competition.currentRound,
      isLive: competition.isLive, // virtual
      roundsCompleted,
      startedAt: competition.startedAt,
      completedAt: competition.completedAt,
      createdAt: competition.createdAt,
      description: competition.description,
    });
  } catch (error) {
    console.error("[Competition] Fetch by code error:", {
      message: error.message,
      stack: error.stack,
    });
    return res
      .status(500)
      .json({ error: "Failed to fetch competition. Please try again later." });
  }
};

module.exports = {
  createdAtCompetition,
  getCompetitionByCode,
};