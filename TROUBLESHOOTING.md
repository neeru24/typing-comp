## 🐛 Troubleshooting Guide

### MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:**
- Ensure MongoDB running: `mongod`
- Check MONGODB_URI in .env
- Verify IP whitelist (Atlas)

### Port Already in Use
```
Error: listen EADDRINUSE :::3000
```
**Solution:**
```bash
PORT=3001 npm start  # Use different port
# Or kill process: lsof -ti:3000 | xargs kill -9
```

### WebSocket Connection Failed
```
WebSocket is closed before connection
```
**Solution:**
- Verify server running: `curl http://localhost:3000`
- Check Network → WS tab in DevTools
- Clear browser cache

### WPM Shows 0
**Solution:**
- Verify timer started
- Check if typing registered
- Clear cache and refresh

### Leaderboard Not Updating
**Solution:**
- Check Network → WS messages
- Browser console for errors
- Refresh and rejoin
