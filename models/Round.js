import mongoose from "mongoose";

const roundSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  roundNumber: { type: Number, required: true },
  customText: { type: String, required: true },
  durationSeconds: { type: Number, required: true },
  startedAt: { type: Date },
  endedAt: { type: Date }
});

export default mongoose.model("Round", roundSchema);
