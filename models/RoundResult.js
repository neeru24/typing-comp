import mongoose from "mongoose";

const roundResultSchema = new mongoose.Schema({
  roundId: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: "Participant", required: true },

  correctChars: { type: Number, default: 0 },
  incorrectChars: { type: Number, default: 0 },
  backspaceCount: { type: Number, default: 0 },
  progressIndex: { type: Number, default: 0 }, 

  wpm: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 },

  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("RoundResult", roundResultSchema);
