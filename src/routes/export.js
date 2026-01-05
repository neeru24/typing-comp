const express = require('express');
const { Parser } = require('json2csv');
const Competition = require('../models/Competition');
const auth = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Helper function to format date
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Helper function to sanitize filename
const sanitizeFilename = (name) => {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

// EXPORT RANKINGS AS CSV
router.get('/:competitionId/csv', auth, async (req, res) => {
  try {
    const { competitionId } = req.params;

    const competition = await Competition.findById(competitionId);

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    // Verify organizer owns this competition
    if (competition.organizerId && competition.organizerId.toString() !== req.organizer.id) {
      return res.status(403).json({ error: 'You do not have permission to export this competition' });
    }

    // Check if competition has final rankings
    if (!competition.finalRankings || competition.finalRankings.length === 0) {
      return res.status(400).json({ 
        error: 'No rankings available. Competition may not be completed or has no participants.' 
      });
    }

    // Prepare data for CSV
    const csvData = competition.finalRankings.map(ranking => ({
      Rank: ranking.rank,
      'Participant Name': ranking.participantName,
      'Average WPM': ranking.averageWpm || 0,
      'Average Accuracy': ranking.averageAccuracy ? `${ranking.averageAccuracy.toFixed(2)}%` : '0%',
      'Rounds Completed': ranking.totalRoundsCompleted || 0,
      'Highest WPM': ranking.highestWpm || 0,
      'Lowest WPM': ranking.lowestWpm || 0
    }));

    // Add competition metadata as header
    const metadata = [
      { 'Competition Name': competition.name },
      { 'Competition Code': competition.code },
      { 'Total Participants': competition.participants.length },
      { 'Total Rounds': competition.totalRounds },
      { 'Completed On': competition.completedAt ? formatDate(competition.completedAt) : 'N/A' },
      { 'Status': competition.status },
      {}  // Empty row for spacing
    ];

    // Convert to CSV
    const parser = new Parser({ 
      fields: ['Rank', 'Participant Name', 'Average WPM', 'Average Accuracy', 'Rounds Completed', 'Highest WPM', 'Lowest WPM']
    });
    const rankingsCSV = parser.parse(csvData);

    // Create metadata CSV
    const metadataParser = new Parser({ header: false });
    const metadataCSV = metadataParser.parse(metadata);

    // Combine metadata and rankings
    const fullCSV = `${metadataCSV}\n\n${rankingsCSV}`;

    // Set headers for file download
    const filename = `${sanitizeFilename(competition.name)}_rankings_${formatDate(new Date())}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info(`✓ Exported rankings as CSV: ${competition.code}`);

    res.send(fullCSV);
  } catch (error) {
    logger.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export rankings' });
  }
});

// EXPORT RANKINGS AS JSON
router.get('/:competitionId/json', auth, async (req, res) => {
  try {
    const { competitionId } = req.params;

    const competition = await Competition.findById(competitionId);

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    // Verify organizer owns this competition
    if (competition.organizerId && competition.organizerId.toString() !== req.organizer.id) {
      return res.status(403).json({ error: 'You do not have permission to export this competition' });
    }

    // Check if competition has data
    if (!competition.finalRankings || competition.finalRankings.length === 0) {
      return res.status(400).json({ 
        error: 'No rankings available. Competition may not be completed or has no participants.' 
      });
    }

    // Prepare JSON export data
    const exportData = {
      competition: {
        id: competition._id,
        name: competition.name,
        code: competition.code,
        status: competition.status,
        totalRounds: competition.totalRounds,
        roundsCompleted: competition.roundsCompleted,
        totalParticipants: competition.participants.length,
        createdAt: competition.createdAt,
        completedAt: competition.completedAt
      },
      finalRankings: competition.finalRankings.map(ranking => ({
        rank: ranking.rank,
        participantName: ranking.participantName,
        averageWpm: ranking.averageWpm,
        averageAccuracy: ranking.averageAccuracy,
        roundsCompleted: ranking.totalRoundsCompleted,
        highestWpm: ranking.highestWpm,
        lowestWpm: ranking.lowestWpm
      })),
      roundResults: competition.rounds.map(round => ({
        roundNumber: round.roundNumber,
        status: round.status,
        duration: round.duration,
        startedAt: round.startedAt,
        endedAt: round.endedAt,
        averageWpm: round.averageWpm,
        averageAccuracy: round.averageAccuracy,
        results: round.results.map(result => ({
          participantName: result.participantName,
          wpm: result.wpm,
          accuracy: result.accuracy,
          rank: result.rank,
          errors: result.errors,
          backspaces: result.backspaces
        }))
      })),
      exportedAt: new Date(),
      exportedBy: req.organizer.email
    };

    // Set headers for file download
    const filename = `${sanitizeFilename(competition.name)}_rankings_${formatDate(new Date())}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info(`✓ Exported rankings as JSON: ${competition.code}`);

    res.json(exportData);
  } catch (error) {
    logger.error('JSON export error:', error);
    res.status(500).json({ error: 'Failed to export rankings' });
  }
});

// EXPORT ROUND DETAILS AS CSV
router.get('/:competitionId/rounds/csv', auth, async (req, res) => {
  try {
    const { competitionId } = req.params;

    const competition = await Competition.findById(competitionId);

    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    // Verify organizer owns this competition
    if (competition.organizerId && competition.organizerId.toString() !== req.organizer.id) {
      return res.status(403).json({ error: 'You do not have permission to export this competition' });
    }

    // Prepare round-by-round data
    const roundData = [];
    competition.rounds.forEach(round => {
      round.results.forEach(result => {
        roundData.push({
          'Round Number': round.roundNumber,
          'Participant Name': result.participantName,
          'WPM': result.wpm,
          'Accuracy': result.accuracy ? `${result.accuracy.toFixed(2)}%` : '0%',
          'Correct Chars': result.correctChars,
          'Total Chars': result.totalChars,
          'Errors': result.errors || 0,
          'Backspaces': result.backspaces || 0,
          'Rank': result.rank,
          'Typing Time (s)': result.typingTime || 0
        });
      });
    });

    if (roundData.length === 0) {
      return res.status(400).json({ error: 'No round data available' });
    }

    // Convert to CSV
    const parser = new Parser();
    const csv = parser.parse(roundData);

    // Set headers for file download
    const filename = `${sanitizeFilename(competition.name)}_rounds_${formatDate(new Date())}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info(`✓ Exported round details as CSV: ${competition.code}`);

    res.send(csv);
  } catch (error) {
    logger.error('Round CSV export error:', error);
    res.status(500).json({ error: 'Failed to export round details' });
  }
});

module.exports = router;
