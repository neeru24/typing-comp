# 📋 Quick Start Guide

## For Organizers

### Step 1: Create Competition
1. Navigate to `http://localhost:3000/organizer`
2. Enter competition name (e.g., "TechFest 2025")
3. Click "+ Add Round"

### Step 2: Add Rounds
For each round, configure:
- **Text to Type**: Paste the text participants will type
- **Duration**: Set time limit in seconds (10-300)

### Step 3: Create Competition
1. Click "Create Competition"
2. Your unique code will appear (e.g., "AB12C")
3. Share this code with participants

### Step 4: Manage Competition
- Click "Start Round" to begin
- Leaderboard updates in real-time
- View round results after completion
- Final rankings after all rounds

---

## For Participants

### Step 1: Join Competition
1. Navigate to `http://localhost:3000/`
2. Enter the **5-character competition code**
3. Enter your **name**
4. Click "Join Competition"

### Step 2: Waiting Lobby
- See "Waiting for organizer to start round..."
- Participant count updates live
- Cannot type yet

### Step 3: Typing Test
When organizer starts the round:
1. Click in typing area
2. Start typing immediately
3. Watch WPM and accuracy update live
4. See live leaderboard on right side

### Step 4: Round Results
When timer ends:
- Typing automatically stops
- Final WPM and accuracy displayed
- Round leaderboard shown
- Your position and score visible

### Step 5: Final Rankings
After all rounds:
- See final competition rankings
- Average WPM and accuracy
- Medal awards (🥇🥈🥉)

---

## Key Statistics Explained

### WPM (Words Per Minute)
```
WPM = (Correct Characters ÷ 5) ÷ (Elapsed Time in Minutes)

Example:
- Typed: 400 characters correctly
- Time: 1 minute
- WPM = (400 ÷ 5) ÷ 1 = 80 WPM
```

### Accuracy
```
Accuracy = (Correct Characters ÷ Total Characters) × 100

Example:
- Correct: 400 characters
- Total typed: 410 characters
- Accuracy = (400 ÷ 410) × 100 = 97.56%
```

---

## Tips for Best Performance

### For Organizers
✅ Test rounds before competition starts  
✅ Ensure all participants have joined before starting  
✅ Keep round duration consistent (30-120 seconds ideal)  
✅ Use diverse text samples for multiple rounds  

### For Participants
✅ Warm up hands before starting  
✅ Focus on accuracy over speed initially  
✅ Use proper typing posture  
✅ Keep your eyes on the screen text, not the keyboard  
✅ Type naturally without forcing speed  

---

## FAQ

**Q: How long does a competition take?**
A: 3 rounds × 1 minute + 1 minute setup = ~4 minutes total

**Q: Can I join late?**
A: No, you must join before any round starts

**Q: What happens if I disconnect?**
A: You're removed from leaderboard but can rejoin with same code

**Q: Can I redo a round?**
A: No, rounds are one-time only

**Q: Is the code secure?**
A: Yes, 5-character alphanumeric codes with socket.io validation
