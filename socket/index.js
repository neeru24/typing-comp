import { io } from "../app.js";

export function initSockets() {
  io.on("connection", (socket) => {

    // Join Room Channel
    socket.on("joinRoom", ({ roomCode, participantId }) => {
      socket.join(roomCode);
      io.to(roomCode).emit("participantJoined", { participantId });
    });

    // Live typing updates
    socket.on("typingProgress", (data) => {
      // broadcast to organizer (but not back to sender)
      socket.to(data.roomCode).emit("liveUpdate", data);
    });

    // Organizer starts round
    socket.on("startRound", ({ roomCode, roundNumber }) => {
      io.to(roomCode).emit("roundStarted", { roundNumber });
    });

    // End round
    socket.on("endRound", ({ roomCode }) => {
      io.to(roomCode).emit("roundEnded");
    });

    // Disconnect
    socket.on("disconnect", () => {});
  });
}
