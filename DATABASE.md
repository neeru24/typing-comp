## 🗄️ MongoDB Database Schema

### Connection String

```
Local: mongodb://localhost:27017/typing-platform
Cloud: mongodb+srv://username:password@cluster.mongodb.net/typing-platform
```

### Competition Document Structure

```javascript
{
  _id: ObjectId,
  name: "TechFest 2025",
  code: "AB12C",
  status: "ongoing",
  currentRound: 0,
  totalRounds: 3,
  rounds: [
    {
      text: "The quick brown fox...",
      duration: 60,
      startedAt: ISODate,
      endedAt: ISODate,
      results: [
        {
          participantName: "John",
          wpm: 85,
          accuracy: 97
        }
      ]
    }
  ],
  participants: [
    {
      name: "John Doe",
      socketId: "socket123",
      joinedAt: ISODate
    }
  ],
  finalRankings: [],
  createdAt: ISODate,
  completedAt: ISODate
}
```

### Recommended Indexes

```javascript
db.competitions.createIndex({ code: 1 }, { unique: true })
db.competitions.createIndex({ createdAt: -1 })
db.competitions.createIndex({ status: 1 })
db.competitions.createIndex({ "participants.name": 1 })
```
