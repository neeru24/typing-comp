## 🧪 Testing Guide

### Manual Testing Checklist

#### Organizer Features
- [ ] Create competition with multiple rounds
- [ ] Auto-generated code appears
- [ ] Start round manually
- [ ] Leaderboard updates in real-time
- [ ] Final rankings shown after all rounds

#### Participant Features
- [ ] Join with competition code
- [ ] Real-time WPM/accuracy updates
- [ ] Live leaderboard during round
- [ ] Cannot paste (anti-cheat)
- [ ] Round ends automatically

#### Anti-Cheating
- [ ] Right-click disabled
- [ ] Ctrl+C/X/V don't work
- [ ] Tab switch shows warning
- [ ] Server validates WPM
- [ ] Post-round submissions ignored

### Load Testing

```bash
# Test with 50 concurrent users
ab -n 5000 -c 50 http://localhost:3000/

# Expected:
# - Response time: <100ms
# - Success rate: 99%+
# - Memory: ~150MB
# - CPU: <5%
```
