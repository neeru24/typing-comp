const app = require('./app');
const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);

const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Initialize socket handlers
require('./socket/events')(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = { server, io };