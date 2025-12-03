const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrganizerTokenSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, required: true, ref: 'Competition' },
  tokenHash: { type: String, required: true, index: true },
  oneTime: { type: Boolean, default: true },
  used: { type: Boolean, default: false },
  createdByIp: { type: String },
  usedByIp: { type: String },
  createdAt: { type: Date, default: Date.now },
  usedAt: { type: Date },
  expiresAt: { type: Date, required: true, index: true }
});

module.exports = mongoose.model('OrganizerToken', OrganizerTokenSchema);
