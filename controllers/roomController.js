import { nanoid } from "nanoid";
import Room from "../models/Room.js";
import Participant from "../models/Participant.js";
import RoundResult from "../models/RoundResult.js";
import { io } from "../app.js";

export const createRoom = async (req, res) => {
  const roomCode = nanoid(6).toUpperCase();
  const room = await Room.create({
    organizerName: req.body.organizerName,
    roomCode,
  });
  res.json({ roomCode, roomId: room._id });
};

export const joinRoom = async (req, res) => {
  const { name, roomCode } = req.body;
  const room = await Room.findOne({ roomCode });

  if (!room) return res.status(404).json({ error: "Room not found" });

  const participant = await Participant.create({
    name,
    roomId: room._id,
  });

  // Notify others live
  io.to(roomCode).emit("participantJoined", { id: participant._id, name });

  res.json({ participantId: participant._id, roomId: room._id });
};

export const updateProgress = async (req, res) => {
  const { roundId, participantId, correctChars, incorrectChars, backspaceCount, progressIndex } = req.body;

  const result = await RoundResult.findOneAndUpdate(
    { roundId, participantId },
    {
      correctChars,
      incorrectChars,
      backspaceCount,
      progressIndex,
      updatedAt: Date.now()
    },
    { upsert: true, new: true }
  );

  // Broadcast live to organizer
  const room = await Participant.findById(participantId).select("roomId");
  const activeRoom = await Room.findById(room.roomId).select("roomCode");

  io.to(activeRoom.roomCode).emit("liveUpdate", {
    participantId,
    correctChars,
    incorrectChars,
    backspaceCount,
    progressIndex
  });

  res.json({ status: "saved" });
};
