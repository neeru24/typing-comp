const mongoose = require("mongoose");
const { Schema } = mongoose;

const RoundResultSchema = new Schema(
  {
    participantName: { type: String, required: true, trim: true },

    participantId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    wpm: { type: Number, min: 0, default: 0 },
    accuracy: { type: Number, min: 0, max: 100, default: 0 },

    correctChars: { type: Number, min: 0, default: 0 },
    totalChars: { type: Number, min: 0, default: 0 },
    incorrectChars: { type: Number, min: 0, default: 0 },

    errors: { type: Number, min: 0, default: 0 },
    backspaces: { type: Number, min: 0, default: 0 },

    typingTime: { type: Number, min: 0, default: 0 },
  },
  {
    _id: false,
    timestamps: true,
  }
);

const RoundSchema = new Schema(
  {
    roundNumber: { type: Number, required: true, min: 1 },
    text: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
      index: true,
    },

    startedAt: { type: Date },
    endedAt: { type: Date },

    results: { type: [RoundResultSchema], default: [] },
  },
  {
    _id: false,
    timestamps: true,
  }
);

const ParticipantRoundScoreSchema = new Schema(
  {
    roundNumber: { type: Number, min: 1, default: 1 },
    wpm: { type: Number, min: 0, default: 0 },
    accuracy: { type: Number, min: 0, max: 100, default: 0 },
    errors: { type: Number, min: 0, default: 0 },
    backspaces: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const ParticipantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    participantId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    socketId: { type: String, trim: true },

    joinedAt: { type: Date, default: Date.now },

    roundScores: { type: [ParticipantRoundScoreSchema], default: [] },
  },
  {
    _id: false,
    timestamps: true,
  }
);

const FinalRankingSchema = new Schema(
  {
    participantName: { type: String, trim: true },

    participantId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    totalRoundsCompleted: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const CompetitionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 4,
      maxlength: 12,
      index: true,
    },

    organizer: { type: String, default: "Admin", trim: true },

    status: {
      type: String,
      enum: ["pending", "ongoing", "completed"],
      default: "pending",
      index: true,
    },

    rounds: { type: [RoundSchema], default: [] },
    participants: { type: [ParticipantSchema], default: [] },

    currentRound: { type: Number, default: -1, min: -1 },
    totalRounds: { type: Number, default: 0, min: 0 },

    finalRankings: { type: [FinalRankingSchema], default: [] },

    startedAt: { type: Date },
    completedAt: { type: Date },

    description: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true,
    minimize: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

CompetitionSchema.virtual("totalParticipants").get(function () {
  return this.participants.length;
});

CompetitionSchema.virtual("isLive").get(function () {
  return this.status === "ongoing";
});

CompetitionSchema.virtual("competitionDuration").get(function () {
  if (!this.startedAt || !this.completedAt) return 0;
  return this.completedAt - this.startedAt;
});

CompetitionSchema.virtual("activeRound").get(function () {
  return this.rounds.find((r) => r.roundNumber === this.currentRound + 1);
});

// Top-level indexes
CompetitionSchema.index({ code: 1 }, { unique: true });
CompetitionSchema.index({ status: 1, createdAt: -1 });

// Useful nested-field indexes (optional; remove if you don't need them)
CompetitionSchema.index({ "participants.participantId": 1 });
CompetitionSchema.index({ "rounds.results.participantId": 1 });
CompetitionSchema.index({ "finalRankings.participantId": 1 });

module.exports = mongoose.model("Competition", CompetitionSchema);
