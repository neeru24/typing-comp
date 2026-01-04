## 🔌 Socket.io Events Reference

### Client → Server Events

#### join
```javascript
socket.emit('join', {
  code: "AB12C",
  participantName: "John"
});
```

#### startRound
```javascript
socket.emit('startRound', {
  competitionId: "507f...",
  roundIndex: 0
});
```

#### progress
```javascript
socket.emit('progress', {
  competitionId: "507f...",
  correctChars: 125,
  totalChars: 130,
  currentChar: 'o',
  elapsedTime: 15.3
});
```

### Server → Client Events

#### joinSuccess
```javascript
socket.on('joinSuccess', {
  competitionId: "507f...",
  participantName: "John",
  roundCount: 3
});
```

#### roundStarted
```javascript
socket.on('roundStarted', {
  roundIndex: 0,
  text: "The quick brown fox...",
  duration: 60,
  startTime: 1704384000000
});
```

#### leaderboardUpdate (Every 1 second)
```javascript
socket.on('leaderboardUpdate', {
  round: 0,
  leaderboard: [
    { rank: 1, name: "John", wpm: 85.5, accuracy: 97.3 }
  ]
});
```

#### roundEnded
```javascript
socket.on('roundEnded', {
  roundIndex: 0,
  leaderboard: [...]
});
```

#### finalResults
```javascript
socket.on('finalResults', {
  rankings: [
    {
      rank: 1,
      name: "John",
      averageWpm: 84.2,
      averageAccuracy: 97.0,
      medal: "🥇"
    }
  ]
});
```

