const crypto = require('crypto');

function genTokenPlain(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url'); // URL-safe
}

function hashToken(tokenPlain) {
  return crypto.createHash('sha256').update(String(tokenPlain)).digest('hex');
}

module.exports = { genTokenPlain, hashToken };
