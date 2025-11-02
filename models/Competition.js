const mongoose = require('mongoose');

const ParticipantSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  socketId: String,
  joinedAt: { 
    type: Date, 
    default: Date.now 
  }
});

const ResultSchema = new mongoose.Schema({
  participantName: { 
    type: String, 
    required: true 
  },
  wpm: { 
    type: Number, 
    required: true,
    min: 0,
    max: 300
  },
  accuracy: { 
    type: Number, 
    required: true,
    min: 0,
    max: 100
  },
  correctChars: { 
    type: Number, 
    required: true,
    min: 0
  }
});

const RoundSchema = new mongoose.Schema({
  text: { 
    type: String, 
    required: true,
    minlength: 10,
    maxlength: 5000
  },
  duration: { 
    type: Number, 
    required: true,
    min: 10,
    max: 600
  },
  startedAt: Date,
  endedAt: Date,
  results: [ResultSchema]
});

const CompetitionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100
  },
  code: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    minlength: 5,
    maxlength: 8
  },
  organizer: { 
    type: String, 
    default: 'TechFest' 
  },
  status: { 
    type: String, 
    enum: ['waiting', 'ongoing', 'completed'],
    default: 'waiting'
  },
  rounds: {
    type: [RoundSchema],
    validate: {
      validator: function(v) {
        return v && v.length > 0 && v.length <= 10;
      },
      message: 'Competition must have between 1 and 10 rounds'
    }
  },
  participants: [ParticipantSchema],
  currentRound: { 
    type: Number, 
    default: 0,
    min: 0
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  completedAt: Date
}, {
  timestamps: true
});

// Indexes for better query performance (P1)
CompetitionSchema.index({ code: 1 });
CompetitionSchema.index({ status: 1, createdAt: -1 });
CompetitionSchema.index({ 'participants.socketId': 1 });
CompetitionSchema.index({ createdAt: -1 });

// Auto-delete completed competitions after 7 days
CompetitionSchema.index({ completedAt: 1 }, { 
  expireAfterSeconds: 7 * 24 * 60 * 60 
});

module.exports = mongoose.model('Competition', CompetitionSchema);
