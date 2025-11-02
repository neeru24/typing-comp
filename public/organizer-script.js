let socket;
let competitionId = null;
let competitionCode = null;
let currentRound = 0;
let totalRounds = 0;
let isPaused = false;

// DOM Elements - TUMHARE EXACT IDs
const createSection = document.getElementById('setupSection');
const competitionNameInput = document.getElementById('compName');
const roundsContainer = document.getElementById('roundsList');
const addRoundBtn = document.getElementById('addRoundBtn');
const createCompBtn = document.getElementById('createCompBtn');

const dashboardSection = document.getElementById('dashboard-section');
const competitionCodeDisplay = document.getElementById('codeValue');
const participantCountDisplay = document.getElementById('participantCountDisplay');
const currentRoundDisplay = document.getElementById('current-round-display');
const startRoundBtn = document.getElementById('startRoundBtn');
const pauseRoundBtn = document.getElementById('pause-round-btn');
const organizerLeaderboard = document.getElementById('organizer-leaderboard-body');

let roundCount = 1; // Fixed: 0 se 1 kiya

// Socket Connection
function connectSocket() {
  if (socket && socket.connected) return;

  socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    timeout: 20000
  });

  socket.on('connect', () => {
    console.log('✅ Organizer connected:', socket.id);
    
    if (socket.recovered && competitionId) {
      showNotification('Reconnected!', 'success');
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Disconnected:', reason);
    showNotification('Connection lost...', 'warning');
  });

  socket.io.on('reconnect', () => {
    showNotification('Reconnected!', 'success');
  });

  setupSocketListeners();
}

function setupSocketListeners() {
  socket.on('participantJoined', ({ name, totalParticipants }) => {
    if (participantCountDisplay) {
      participantCountDisplay.textContent = totalParticipants;
    }
    showNotification(`${name} joined (${totalParticipants} total)`, 'info');
  });

  socket.on('participantLeft', ({ name, totalParticipants }) => {
    if (participantCountDisplay) {
      participantCountDisplay.textContent = totalParticipants;
    }
    showNotification(`${name} left`, 'info');
  });

  socket.on('leaderboardUpdate', ({ round, leaderboard }) => {
    updateOrganizerLeaderboard(leaderboard);
  });

  socket.on('roundEnded', ({ roundIndex, leaderboard }) => {
    currentRound = roundIndex + 1;
    if (currentRoundDisplay) {
      currentRoundDisplay.textContent = `${currentRound} / ${totalRounds}`;
    }
    
    updateOrganizerLeaderboard(leaderboard);
    
    if (currentRound < totalRounds) {
      startRoundBtn.textContent = 'Start Next Round';
      startRoundBtn.disabled = false;
      pauseRoundBtn.disabled = true;
      pauseRoundBtn.textContent = 'Pause Round';
      isPaused = false;
      showNotification(`Round ${roundIndex + 1} complete!`, 'success');
    } else {
      startRoundBtn.disabled = true;
      startRoundBtn.textContent = 'Competition Completed';
      pauseRoundBtn.disabled = true;
      showNotification('🎉 Competition completed!', 'success');
    }
  });

  socket.on('error', ({ message }) => {
    showNotification(message, 'error');
  });
}

// Initialize first round automatically
function initFirstRound() {
  const firstRound = document.createElement('div');
  firstRound.className = 'round-input';
  firstRound.innerHTML = `
    <h3>Round 1</h3>
    <label>Text to Type:</label>
    <textarea class="round-text" rows="3" placeholder="Enter text..." required></textarea>
    
    <label>Duration (seconds):</label>
    <input type="number" class="round-duration" min="10" max="600" value="60" required>
    
    <button class="remove-round-btn" onclick="removeRound(this)">Remove</button>
  `;
  if (roundsContainer) {
    roundsContainer.appendChild(firstRound);
  }
}

// Add Round
if (addRoundBtn) {
  addRoundBtn.addEventListener('click', () => {
    if (roundCount >= 10) {
      showNotification('Max 10 rounds allowed', 'warning');
      return;
    }

    roundCount++;
    const roundDiv = document.createElement('div');
    roundDiv.className = 'round-input';
    roundDiv.innerHTML = `
      <h3>Round ${roundCount}</h3>
      <label>Text to Type:</label>
      <textarea class="round-text" rows="3" placeholder="Enter text..." required></textarea>
      
      <label>Duration (seconds):</label>
      <input type="number" class="round-duration" min="10" max="600" value="60" required>
      
      <button class="remove-round-btn" onclick="removeRound(this)">Remove</button>
    `;
    
    roundsContainer.appendChild(roundDiv);
    showNotification(`Round ${roundCount} added`, 'success');
  });
}

// Remove Round
window.removeRound = function(button) {
  const roundDiv = button.closest('.round-input');
  const allRounds = document.querySelectorAll('.round-input');
  
  if (allRounds.length <= 1) {
    showNotification('Cannot remove last round', 'warning');
    return;
  }
  
  roundDiv.remove();
  
  // Renumber rounds
  const rounds = document.querySelectorAll('.round-input');
  rounds.forEach((round, index) => {
    round.querySelector('h3').textContent = `Round ${index + 1}`;
  });
  
  roundCount = rounds.length;
  showNotification('Round removed', 'info');
};

// Create Competition
if (createCompBtn) {
  createCompBtn.addEventListener('click', async () => {
    const name = competitionNameInput.value.trim();
    
    if (!name || name.length < 3) {
      showNotification('Name must be 3+ characters', 'error');
      competitionNameInput.focus();
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
        showNotification(`Round ${index + 1}: Min 10 characters`, 'error');
        isValid = false;
        return;
      }

      if (!duration || duration < 10 || duration > 600) {
        showNotification(`Round ${index + 1}: Duration 10-600s`, 'error');
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
        throw new Error(data.message || 'Failed to create');
      }

      if (data.success) {
        competitionId = data.competitionId;
        competitionCode = data.code;
        totalRounds = rounds.length;

        if (!socket || !socket.connected) {
          connectSocket();
        }
        
        if (socket.connected) {
          socket.emit('join', { code: data.code, participantName: '__ORGANIZER__' });
        } else {
          socket.once('connect', () => {
            socket.emit('join', { code: data.code, participantName: '__ORGANIZER__' });
          });
        }

        if (createSection) createSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';

        if (competitionCodeDisplay) competitionCodeDisplay.textContent = data.code;
        if (currentRoundDisplay) currentRoundDisplay.textContent = `0 / ${totalRounds}`;
        if (participantCountDisplay) participantCountDisplay.textContent = '0';

        showNotification(`✅ Created! Code: ${data.code}`, 'success');
        
        navigator.clipboard.writeText(data.code)
          .then(() => showNotification('Code copied!', 'success'))
          .catch(() => {});
      }
    } catch (error) {
      showNotification(error.message, 'error');
    } finally {
      createCompBtn.disabled = false;
      createCompBtn.textContent = 'Create Competition';
    }
  });
}

// Start Round
if (startRoundBtn) {
  startRoundBtn.addEventListener('click', () => {
    if (!competitionId) {
      showNotification('No competition active', 'error');
      return;
    }

    const count = parseInt(participantCountDisplay?.textContent || '0');
    
    if (count === 0) {
      if (!confirm('No participants. Start anyway?')) {
        return;
      }
    }

    startRoundBtn.disabled = true;
    startRoundBtn.textContent = 'Starting...';

    socket.emit('startRound', { competitionId, roundIndex: currentRound });

    setTimeout(() => {
      startRoundBtn.textContent = 'Round In Progress...';
      if (pauseRoundBtn) pauseRoundBtn.disabled = false;
      showNotification(`Round ${currentRound + 1} started!`, 'success');
    }, 500);
  });
}

// Pause/Resume
if (pauseRoundBtn) {
  pauseRoundBtn.addEventListener('click', () => {
    if (!competitionId) return;

    if (!isPaused) {
      socket.emit('pauseRound', { competitionId });
      pauseRoundBtn.textContent = 'Resume Round';
      isPaused = true;
      showNotification('⏸️ Paused', 'warning');
    } else {
      socket.emit('resumeRound', { competitionId });
      pauseRoundBtn.textContent = 'Pause Round';
      isPaused = false;
      showNotification('▶️ Resumed', 'success');
    }
  });
}

// Update Leaderboard
function updateOrganizerLeaderboard(leaderboard) {
  if (!organizerLeaderboard) return;

  if (!leaderboard || leaderboard.length === 0) {
    organizerLeaderboard.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--color-text-secondary);">Waiting for participants...</td></tr>';
    return;
  }

  organizerLeaderboard.innerHTML = '';

  leaderboard.forEach((entry, index) => {
    const row = document.createElement('tr');
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
    const warning = entry.wpm > 200 ? ' <span title="Suspicious WPM">⚠️</span>' : '';
    
    row.innerHTML = `
      <td>${index + 1}${medal}</td>
      <td>${escapeHtml(entry.name)}</td>
      <td>${entry.wpm}${warning}</td>
      <td>${entry.accuracy}%</td>
    `;
    
    if (entry.wpm > 200) {
      row.style.background = 'rgba(230, 129, 97, 0.15)';
    }
    
    organizerLeaderboard.appendChild(row);
  });
}

// Utilities
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

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Copy code button
document.addEventListener('click', (e) => {
  if (e.target.id === 'copy-code-btn' || e.target.closest('#copy-code-btn')) {
    if (competitionCode) {
      navigator.clipboard.writeText(competitionCode)
        .then(() => showNotification('📋 Copied!', 'success'))
        .catch(() => showNotification('Failed to copy', 'error'));
    }
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Organizer loaded');
  connectSocket();
  
  if (roundsContainer && roundsContainer.children.length === 0) {
    initFirstRound();
  }
  
  if (dashboardSection) {
    dashboardSection.style.display = 'none';
  }
});

// Prevent accidental close
window.addEventListener('beforeunload', (e) => {
  if (competitionId && currentRound < totalRounds) {
    e.preventDefault();
    e.returnValue = 'Competition running. Leave?';
    return e.returnValue;
  }
});
