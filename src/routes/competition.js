const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Competition = require('../models/Competition');
const generateCode = require('../utils/codeGenerator');
const auth = require('../middleware/auth');

const router = express.Router();

// Input validation middleware
const validateCompetitionCreation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Competition name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Competition name can only contain letters, numbers, spaces, hyphens, and underscores'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('rounds')
    .isArray({ min: 1, max: 10 })
    .withMessage('At least 1 round is required, maximum 10 rounds allowed'),
  body('rounds.*.text')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Round text must be between 10 and 2000 characters'),
  body('rounds.*.duration')
    .isInt({ min: 30, max: 600 })
    .withMessage('Round duration must be between 30 and 600 seconds')
];

const validateCompetitionCode = [
  param('code')
    .isLength({ min: 6, max: 6 })
    .withMessage('Competition code must be exactly 6 characters')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Competition code must contain only uppercase letters and numbers')
];

const validateCompetitionId = [
  param('competitionId')
    .isMongoId()
    .withMessage('Invalid competition ID format')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// CREATE COMPETITION (Protected)
router.post('/create', auth, validateCompetitionCreation, handleValidationErrors, async (req, res) => {
  try {
    const { name, description, rounds } = req.body;
    
    const code = generateCode();
    
    const competition = new Competition({
      name: name.trim(),
      description: description ? description.trim() : '',
      code,
      organizerId: req.organizer.id,
      organizer: req.organizer.name,
      rounds: rounds.map((r, index) => ({
        roundNumber: index + 1,
        text: r.text.trim(),
        duration: r.duration,
        status: 'pending',
        startedAt: null,
        endedAt: null,
        totalDuration: 0,
        participantsCompleted: 0,
        highestWpm: 0,
        lowestWpm: 0,
        averageWpm: 0,
        averageAccuracy: 0,
        results: [],
        createdAt: new Date()
      })),
      status: 'pending',
      currentRound: -1,
      totalRounds: rounds.length,
      roundsCompleted: 0,
      finalRankings: [],
      createdAt: new Date()
    });

    await competition.save();
    console.log('✓ Competition created:', code);
    res.json({ success: true, code, competitionId: competition._id });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ error: 'Failed to create competition' });
  }
});

// GET COMPETITION BY CODE
router.get('/competition/:code', validateCompetitionCode, handleValidationErrors, async (req, res) => {
  try {
    const competition = await Competition.findOne({ code: req.params.code });
    
    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    res.json({
      id: competition._id,
      name: competition.name,
      code: competition.code,
      status: competition.status,
      roundCount: competition.rounds.length,
      roundsCompleted: competition.roundsCompleted,
      participants: competition.participants.length,
      currentRound: competition.currentRound
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch competition' });
  }
});

// GET MY COMPETITIONS (Protected)
router.get('/my-competitions', auth, async (req, res) => {
  try {
    const competitions = await Competition.find({ 
      organizerId: req.organizer.id 
    })
    .select('name code status currentRound totalRounds createdAt participants')
    .sort({ createdAt: -1 })
    .limit(50);
    
    res.json({ 
      success: true, 
      competitions,
      count: competitions.length
    });
  } catch (error) {
    console.error('Fetch competitions error:', error);
    res.status(500).json({ error: 'Failed to fetch competitions' });
  }
});

// GET COMPETITION BY ID
router.get('/competition/:competitionId', validateCompetitionId, handleValidationErrors, async (req, res) => {
  try {
    const competition = await Competition.findById(req.params.competitionId);
    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    res.json({ competition });
  } catch (error) {
    console.error('Fetch competition error:', error);
    res.status(500).json({ error: 'Failed to fetch competition' });
  }
});

// GET COMPETITION RANKINGS
router.get('/competition/:competitionId/rankings', validateCompetitionId, handleValidationErrors, async (req, res) => {
  try {
    const competition = await Competition.findById(req.params.competitionId)
      .select('name code finalRankings status');
    
    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    res.json({
      success: true,
      name: competition.name,
      code: competition.code,
      rankings: competition.finalRankings,
      status: competition.status
    });
  } catch (error) {
    console.error('Fetch rankings error:', error);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

module.exports = router;