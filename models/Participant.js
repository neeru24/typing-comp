import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  name: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Participant", participantSchema);
