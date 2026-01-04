
## 🏗️ Project Architecture

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Backend** | Node.js + Express | v14+ |
| **Real-time** | Socket.io | v4+ |
| **Frontend** | HTML5 + CSS3 + Vanilla JavaScript | ES6+ |
| **Database** | MongoDB + Mongoose | v5+ |

### Project Structure

```
typing-platform/
├── app.js                      # Express app configuration
├── server.js                   # Server startup
├── package.json                # Dependencies
├── config/
│   └── database.js            # MongoDB connection
├── models/
│   └── Competition.js         # Mongoose schema
├── public/                     # Frontend files
│   ├── organizer/
│   │   ├── index.html
│   │   └── js/
│   ├── participant/
│   │   ├── index.html
│   │   └── js/
│   └── shared/
│       ├── css/
│       └── js/
├── routes/
│   └── competition.js         # REST API routes
└── socket/
    ├── events.js
    ├── handlers/
    └── utils/
```