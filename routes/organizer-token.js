// routes/organizer-token.js
const express = require('express');
const router = express.Router();
const OrganizerToken = require('../models/OrganizerToken');
const Competition = require('../models/Competition'); // optional, used for returning code/name
const { genTokenPlain, hashToken } = require('../lib/tokens');

// POST /api/organizer-token/create
router.post('/create', async (req, res) => {
  try {
    const { competitionId, ttlSeconds = 3600, oneTime = true } = req.body;
    if (!competitionId) return res.status(400).json({ error: 'competitionId required' });

    const plain = genTokenPlain(24);
    const tokenHash = hashToken(plain);
    const expiresAt = new Date(Date.now() + Number(ttlSeconds) * 1000);

    const doc = new OrganizerToken({
      competitionId,
      tokenHash,
      expiresAt,
      oneTime,
      createdByIp: req.ip
    });
    await doc.save();

    return res.json({
      token: plain,
      expiresAt: doc.expiresAt,
      oneTime: doc.oneTime,
      tokenId: doc._id
    });
  } catch (err) {
    console.error('organizer-token create error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /api/organizer-token/consume
// Accepts { token } and returns { competitionId, competitionCode?, name? }
router.post('/consume', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });

    const tokenHash = hashToken(token);
    const doc = await OrganizerToken.findOne({ tokenHash });
    if (!doc) return res.status(404).json({ error: 'invalid token' });
    if (doc.expiresAt < new Date()) return res.status(403).json({ error: 'token expired' });
    if (doc.oneTime && doc.used) return res.status(403).json({ error: 'token already used' });

    // mark one-time consumed
    if (doc.oneTime) {
      doc.used = true;
      doc.usedAt = new Date();
      doc.usedByIp = req.ip;
      await doc.save();
    }

    // optionally fetch competition metadata for convenience
    let competitionData = {};
    try {
      const comp = await Competition.findById(doc.competitionId).select('code name rounds status');
      if (comp) {
        competitionData = {
          competitionId: comp._id,
          competitionCode: comp.code,
          name: comp.name,
          rounds: comp.rounds
        };
      }
    } catch (e) {
      // ignore
    }

    return res.json({ competitionId: doc.competitionId, ...competitionData });
  } catch (err) {
    console.error('organizer-token consume error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
