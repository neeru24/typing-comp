## 📡 REST API Reference

### POST /api/create - Create Competition

**Request:**
```json
{
  "name": "TechFest 2025",
  "rounds": [
    {
      "text": "The quick brown fox...",
      "duration": 60
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "code": "AB12C",
  "competitionId": "507f1f77bcf86cd799439011"
}
```

### GET /api/competition/:code - Get by Code

**Response:**
```json
{
  "id": "507f...",
  "name": "TechFest 2025",
  "code": "AB12C",
  "status": "ongoing",
  "currentRound": 0,
  "participants": [],
  "rounds": []
}
```

### GET /api/competition/:id - Get by ID

**Response:**
```json
{
  "compid": {
    "_id": "507f...",
    "name": "TechFest 2025",
    "rounds": [],
    "finalRankings": []
  }
}
```
