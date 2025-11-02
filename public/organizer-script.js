let socket;
let competitionId = null;
let competitionCode = null;
let currentRound = 0;
let totalRounds = 0;
let isPaused = false;

// DOM Elements
// Change these lines (around line 9-15):
const createSection = document.getElementById('setupSection');  // was 'create-section'
const competitionNameInput = document.getElementById('compName');  // was 'competition-name'
const roundsContainer = document.getElementById('roundsList');  // was 'rounds-container'
const addRoundBtn = document.getElementById('addRoundBtn');  // was 'add-round-btn'
const createCompBtn = document.getElementById('createCompBtn');  // was 'create-competition-btn'

const dashboardSection = document.getElementById('dashboard-section');  // Add this
const competitionCodeDisplay = document.getElementById('codeValue');  // was 'competition-code'
const participantCountDisplay = document.getElementById('participantCountDisplay');  // was 'participant-count-display'
const currentRoundDisplay = document.getElementById('current-round-display');  // Add this
const startRoundBtn = document.getElementById('startRoundBtn');  // was 'start-round-btn'
const pauseRoundBtn = document.getElementById('pause-round-btn');
const organizerLeaderboard = document.getElementById('organizer-leaderboard-body');  // Add this


let roundCount = 0;

// ==========================
// SOCKET CONNECTION WITH RECONNECTION
// ==========================

function connectSocket() {
  if (socket && socket.connected) return;

  socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    console.log('Organizer socket connected');
    
    if (socket.recovered && competitionId) {
      console.log('Connection recovered');
      showNotification('Reconnected successfully!', 'success');
    }
  });

  socket.on('disconnect', () => {
    console.log('Organizer socket disconnected');
    showNotification('Connection lost. Reconnecting...', 'warning');
  });

  socket.io.on('reconnect', () => {
    showNotification('Reconnected!', 'success');
  });

  setupSocketListeners();
}

function setupSocketListeners() {
  socket.on('participantJoined', ({ name, totalParticipants }) => {
    participantCountDisplay.textContent = totalParticipants;
    showNotification(`${name} joined (${totalParticipants} total)`, 'info');
  });

  socket.on('participantLeft', ({ name, totalParticipants }) => {
    participantCountDisplay.textContent = totalParticipants;
    showNotification(`${name} left (${totalParticipants} remaining)`, 'info');
  });

  socket.on('leaderboardUpdate', ({ round, leaderboard }) => {
    updateOrganizerLeaderboard(leaderboard);
  });

  socket.on('roundEnded', ({ roundIndex }) => {
    currentRound = roundIndex + 1;
    currentRoundDisplay.textContent = `${currentRound} / ${totalRounds}`;
    
    if (currentRound < totalRounds) {
      startRoundBtn.textContent = 'Start Next Round';
      startRoundBtn.disabled = false;
      pauseRoundBtn.disabled = true;
      pauseRoundBtn.textContent = 'Pause Round';
      isPaused = false;
    } else {
      startRoundBtn.disabled = true;
      pauseRoundBtn.disabled = true;
      showNotification('Competition completed!', 'success');
    }
  });

  socket.on('error', ({ message }) => {
    showNotification(message, 'error');
  });
}

// ==========================
// CREATE COMPETITION
// ==========================

addRoundBtn.addEventListener('click', () => {
  if (roundCount >= 10) {
    showNotification('Maximum 10 rounds allowed', 'warning');
    return;
  }

  roundCount++;
  const roundDiv = document.createElement('div');
  roundDiv.className = 'round-input';
  roundDiv.innerHTML = `
    <h3>Round ${roundCount}</h3>
    <label>Text to Type:</label>
    <textarea class="round-text" rows="3" placeholder="Enter the text participants will type..." required minlength="10" maxlength="5000"></textarea>
    
    <label>Duration (seconds):</label>
    <input type="number" class="round-duration" min="10" max="600" value="60" required>
    
    <button class="remove-round-btn" onclick="removeRound(this)">Remove Round</button>
  `;
  
  roundsContainer.appendChild(roundDiv);
});

window.removeRound = function(button) {
  const roundDiv = button.closest('.round-input');
  roundDiv.remove();
  roundCount--;
  
  const rounds = document.querySelectorAll('.round-input');
  rounds.forEach((round, index) => {
    round.querySelector('h3').textContent = `Round ${index + 1}`;
  });
};

createCompBtn.addEventListener('click', async () => {
  const name = competitionNameInput.value.trim();
  
  if (!name || name.length < 3) {
    showNotification('Competition name must be at least 3 characters', 'error');
    return;
  }

  const roundInputs = document.querySelectorAll('.round-input');
  
  if (roundInputs.length === 0) {
    showNotification('Add at least one round', 'error');
    return;
  }

  const rounds = [];
  let isValid = true;

  roundInputs.forEach((roundDiv, index) => {
    const text = roundDiv.querySelector('.round-text').value.trim();
    const duration = parseInt(roundDiv.querySelector('.round-duration').value);

    if (!text || text.length < 10) {
      showNotification(`Round ${index + 1}: Text must be at least 10 characters`, 'error');
      isValid = false;
      return;
    }

    if (!duration || duration < 10 || duration > 600) {
      showNotification(`Round ${index + 1}: Duration must be 10-600 seconds`, 'error');
      isValid = false;
      return;
    }

    rounds.push({ text, duration });
  });

  if (!isValid) return;

  createCompBtn.disabled = true;
  createCompBtn.textContent = 'Creating...';

  try {
    const response = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rounds })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create competition');
    }

    if (data.success) {
      competitionId = data.competitionId;
      competitionCode = data.code;
      totalRounds = rounds.length;

      connectSocket();
      
      socket.emit('join', {
        code: data.code,
        participantName: '__ORGANIZER__'
      });

      createSection.style.display = 'none';
      dashboardSection.style.display = 'flex';

      competitionCodeDisplay.textContent = data.code;
      currentRoundDisplay.textContent = `0 / ${totalRounds}`;
      participantCountDisplay.textContent = '0';

      showNotification(`Competition created! Code: ${data.code}`, 'success');
      
      navigator.clipboard.writeText(data.code).catch(() => {});
    }
  } catch (error) {
    showNotification(error.message, 'error');
    createCompBtn.disabled = false;
    createCompBtn.textContent = 'Create Competition';
  }
});

// ==========================
// START ROUND
// ==========================

startRoundBtn.addEventListener('click', () => {
  if (!competitionId) return;

  if (parseInt(participantCountDisplay.textContent) === 0) {
    if (!confirm('No participants have joined yet. Start anyway?')) {
      return;
    }
  }

  startRoundBtn.disabled = true;
  startRoundBtn.textContent = 'Starting...';

  socket.emit('startRound', {
    competitionId,
    roundIndex: currentRound
  });

  setTimeout(() => {
    startRoundBtn.textContent = 'Round Started';
    pauseRoundBtn.disabled = false;
  }, 1000);
});

// ==========================
// PAUSE/RESUME ROUND
// ==========================

pauseRoundBtn.addEventListener('click', () => {
  if (!competitionId) return;

  if (!isPaused) {
    socket.emit('pauseRound', { competitionId });
    pauseRoundBtn.textContent = 'Resume Round';
    isPaused = true;
    showNotification('Round paused', 'warning');
  } else {
    socket.emit('resumeRound', { competitionId });
    pauseRoundBtn.textContent = 'Pause Round';
    isPaused = false;
    showNotification('Round resumed', 'success');
  }
});

// ==========================
// LEADERBOARD
// ==========================

function updateOrganizerLeaderboard(leaderboard) {
  organizerLeaderboard.innerHTML = '';

  leaderboard.forEach((entry, index) => {
    const row = document.createElement('tr');
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
    
    const suspiciousWPM = entry.wpm > 200 ? ' ⚠️' : '';
    
    row.innerHTML = `
      <td>${index + 1}${medal}</td>
      <td>${entry.name}</td>
      <td>${entry.wpm}${suspiciousWPM}</td>
      <td>${entry.accuracy}%</td>
    `;
    
    if (entry.wpm > 200) {
      row.style.background = 'rgba(255, 152, 0, 0.1)';
    }
    
    organizerLeaderboard.appendChild(row);
  });
}

// ==========================
// UTILITIES
// ==========================

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'copy-code-btn') {
    navigator.clipboard.writeText(competitionCode)
      .then(() => showNotification('Code copied to clipboard!', 'success'))
      .catch(() => showNotification('Failed to copy code', 'error'));
  }
});

connectSocket();
