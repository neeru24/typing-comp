import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  organizerName: { type: String, required: true },
  status: { type: String, enum: ["waiting", "in_progress", "finished"], default: "waiting" },
  currentRound: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Room", roomSchema);
