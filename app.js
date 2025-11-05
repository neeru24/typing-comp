import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import roomRoutes from "./routes/roomRoutes.js";
import cors from 'cors';
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve public folder so your HTML files are accessible in browser
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", roomRoutes);

// HTTP + WebSocket
const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: "*" }
});

import { initSockets } from "./socket/index.js";
initSockets();

// Connect MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/typing-app")
  .then(() => console.log("✅ MongoDB Connected"));

// ✅ Default route (load organizer page or landing)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "organizer.html"));
});

server.listen(4000, () => console.log("🚀 Server running on :4000"));
