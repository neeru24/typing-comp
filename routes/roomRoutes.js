import express from "express";
import { createRoom, joinRoom, updateProgress } from "../controllers/roomController.js";

const router = express.Router();

router.post("/create-room", createRoom);
router.post("/join-room", joinRoom);
router.post("/update-progress", updateProgress);

export default router;
