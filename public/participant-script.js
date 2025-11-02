let socket;
let competitionId = null;
let participantName = null;
let currentRound = null;
let roundText = '';
let roundDuration = 0;
let startTime = null;
let timerInterval = null;
let isPaused = false;

// Statistics
let correctChars = 0;
let totalChars = 0;
let currentCharIndex = 0;

// DOM Elements
const joinSection = document.getElementById('join-section');
const codeInput = document.getElementById('code-input');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');

const waitingSection = document.getElementById('waiting-section');
const waitingMessage = document.getElementById('waiting-message');
const participantCount = document.getElementById('participant-count');

const typingSection = document.getElementById('typing-section');
const roundInfo = document.getElementById('round-info');
const timerDisplay = document.getElementById('timer');
const typingTextDisplay = document.getElementById('typing-text');
const typingInput = document.getElementById('typing-input');
const wpmDisplay = document.getElementById('wpm');
const accuracyDisplay = document.getElementById('accuracy');

const resultsSection = document.getElementById('results-section');
const resultsTitle = document.getElementById('results-title');
const leaderboardBody = document.getElementById('leaderboard-body');
const nextRoundBtn = document.getElementById('next-round-btn');

const reconnectingOverlay = document.getElementById('reconnecting-overlay');

// ==========================
// RECONNECTION HANDLING (P0 - CRITICAL)
// ==========================

function saveStateToLocalStorage() {
  if (competitionId && participantName) {
    const state = {
      code: codeInput.value,
      name: participantName,
      competitionId: competitionId,
      currentCharIndex: currentCharIndex,
      timestamp: Date.now()
    };
    localStorage.setItem('typingCompState', JSON.stringify(state));
  }
}

function restorePreviousSession() {
  const savedState = localStorage.getItem('typingCompState');
  
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      
      if (Date.now() - state.timestamp < 30 * 60 * 1000) {
        codeInput.value = state.code || '';
        nameInput.value = state.name || '';
        
        showNotification('Attempting to reconnect to previous session...', 'info');
        
        setTimeout(() => {
          if (state.code && state.name) {
            connectSocket();
            rejoinCompetition(state.code, state.name, state.currentCharIndex);
          }
        }, 1000);
      } else {
        localStorage.removeItem('typingCompState');
      }
    } catch (e) {
      console.error('Failed to parse saved state:', e);
      localStorage.removeItem('typingCompState');
    }
  }
}

function connectSocket() {
  if (socket && socket.connected) {
    return;
  }

  socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    timeout: 20000
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    hideReconnectingOverlay();
    
    if (socket.recovered) {
      console.log('Connection recovered automatically');
      showNotification('Reconnected successfully!', 'success');
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    showReconnectingOverlay();
    saveStateToLocalStorage();
    
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.io.on('reconnect_attempt', (attemptNumber) => {
    console.log('Reconnection attempt:', attemptNumber);
    showReconnectingOverlay(`Reconnecting... (attempt ${attemptNumber})`);
  });

  socket.io.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    hideReconnectingOverlay();
    showNotification('Reconnected successfully!', 'success');
    
    if (competitionId && participantName) {
      const code = codeInput.value;
      rejoinCompetition(code, participantName, currentCharIndex);
    }
  });

  socket.io.on('reconnect_failed', () => {
    console.error('Reconnection failed');
    showNotification('Failed to reconnect. Please refresh the page.', 'error');
  });

  setupSocketListeners();
}

function rejoinCompetition(code, name, charIndex) {
  socket.emit('rejoin', {
    code: code,
    name: name,
    currentChar: charIndex,
    elapsedTime: startTime ? Date.now() - startTime : 0
  });
}

function setupSocketListeners() {
  socket.on('joinSuccess', ({ competitionId: compId, name, roundCount, currentRound: round, isPaused: paused }) => {
    competitionId = compId;
    participantName = name;
    currentRound = 0;
    isPaused = paused;
    
    saveStateToLocalStorage();
    
    joinSection.style.display = 'none';
    waitingSection.style.display = 'flex';
    waitingMessage.textContent = isPaused ? 
      'Round is paused. Waiting for organizer...' : 
      'Waiting for organizer to start the competition...';
    
    showNotification(`Joined as ${name}!`, 'success');
  });

  socket.on('rejoinSuccess', ({ competitionId: compId, name, currentRound: round, currentProgress }) => {
    competitionId = compId;
    participantName = name;
    currentRound = round;
    
    if (currentProgress) {
      currentCharIndex = currentProgress.currentChar || 0;
      correctChars = currentProgress.correctChars || 0;
      totalChars = currentProgress.totalChars || 0;
    }
    
    showNotification('Successfully rejoined competition!', 'success');
  });

  socket.on('participantJoined', ({ name, totalParticipants }) => {
    participantCount.textContent = `${totalParticipants} participant${totalParticipants !== 1 ? 's' : ''} joined`;
    
    if (name !== participantName) {
      showNotification(`${name} joined`, 'info');
    }
  });

  socket.on('participantLeft', ({ name, totalParticipants }) => {
    participantCount.textContent = `${totalParticipants} participant${totalParticipants !== 1 ? 's' : ''} joined`;
    showNotification(`${name} left`, 'info');
  });

  socket.on('roundStarted', ({ roundIndex, text, duration, startTime: sTime, elapsedTime }) => {
    currentRound = roundIndex;
    roundText = text;
    roundDuration = duration;
    
    if (elapsedTime) {
      startTime = Date.now() - (elapsedTime * 1000);
    } else {
      startTime = sTime || Date.now();
    }
    
    isPaused = false;
    
    if (!elapsedTime) {
      correctChars = 0;
      totalChars = 0;
      currentCharIndex = 0;
    }
    
    waitingSection.style.display = 'none';
    resultsSection.style.display = 'none';
    typingSection.style.display = 'flex';
    
    roundInfo.textContent = `Round ${roundIndex + 1}`;
    renderTypingText();
    typingInput.value = '';
    typingInput.disabled = false;
    typingInput.focus();
    
    updateTimer();
    timerInterval = setInterval(updateTimer, 100);
    
    saveStateToLocalStorage();
  });

  socket.on('roundPaused', () => {
    isPaused = true;
    typingInput.disabled = true;
    clearInterval(timerInterval);
    showNotification('Round paused by organizer', 'warning');
  });

  socket.on('roundResumed', ({ pauseDuration }) => {
    isPaused = false;
    startTime += pauseDuration;
    typingInput.disabled = false;
    typingInput.focus();
    
    timerInterval = setInterval(updateTimer, 100);
    showNotification('Round resumed', 'success');
  });

  socket.on('leaderboardUpdate', ({ round, leaderboard }) => {
    updateLeaderboard(leaderboard, false);
  });

  socket.on('roundEnded', ({ roundIndex, leaderboard }) => {
    clearInterval(timerInterval);
    typingInput.disabled = true;
    
    typingSection.style.display = 'none';
    resultsSection.style.display = 'flex';
    resultsTitle.textContent = `Round ${roundIndex + 1} Results`;
    nextRoundBtn.style.display = 'block';
    
    updateLeaderboard(leaderboard, true);
    
    currentCharIndex = 0;
    correctChars = 0;
    totalChars = 0;
  });

  socket.on('finalResults', ({ rankings }) => {
    clearInterval(timerInterval);
    typingInput.disabled = true;
    
    typingSection.style.display = 'none';
    waitingSection.style.display = 'none';
    resultsSection.style.display = 'flex';
    resultsTitle.textContent = '🏆 Final Rankings';
    nextRoundBtn.style.display = 'none';
    
    updateFinalRankings(rankings);
    
    localStorage.removeItem('typingCompState');
  });

  socket.on('error', ({ message }) => {
    showNotification(message, 'error');
    
    if (message.includes('not found') || message.includes('ended')) {
      joinSection.style.display = 'flex';
      waitingSection.style.display = 'none';
      typingSection.style.display = 'none';
      resultsSection.style.display = 'none';
      
      localStorage.removeItem('typingCompState');
    }
  });
}

// ==========================
// UI FUNCTIONS
// ==========================

function showReconnectingOverlay(message = 'Reconnecting...') {
  if (!reconnectingOverlay) return;
  
  const messageEl = reconnectingOverlay.querySelector('.reconnecting-message');
  if (messageEl) {
    messageEl.textContent = message;
  }
  
  reconnectingOverlay.style.display = 'flex';
}

function hideReconnectingOverlay() {
  if (reconnectingOverlay) {
    reconnectingOverlay.style.display = 'none';
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function renderTypingText() {
  typingTextDisplay.innerHTML = '';
  
  for (let i = 0; i < roundText.length; i++) {
    const charSpan = document.createElement('span');
    charSpan.textContent = roundText[i];
    charSpan.classList.add('char');
    
    if (i < currentCharIndex) {
      charSpan.classList.add('correct');
    } else if (i === currentCharIndex) {
      charSpan.classList.add('current');
    }
    
    typingTextDisplay.appendChild(charSpan);
  }
}

function updateTimer() {
  if (isPaused || !startTime) return;
  
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const remaining = Math.max(0, roundDuration - elapsed);
  
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  
  timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  if (elapsed > 0) {
    const wpm = Math.round((correctChars / 5) / (elapsed / 60));
    const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
    
    wpmDisplay.textContent = wpm;
    accuracyDisplay.textContent = accuracy;
  }
  
  if (remaining === 0) {
    clearInterval(timerInterval);
    typingInput.disabled = true;
  }
}

function updateLeaderboard(leaderboard, showRank) {
  leaderboardBody.innerHTML = '';
  
  leaderboard.forEach((entry, index) => {
    const row = document.createElement('tr');
    
    if (entry.name === participantName) {
      row.classList.add('highlight');
    }
    
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
    
    row.innerHTML = `
      <td>${showRank ? `${medal} ${index + 1}` : index + 1}</td>
      <td>${entry.name}</td>
      <td>${entry.wpm}</td>
      <td>${entry.accuracy}%</td>
    `;
    
    leaderboardBody.appendChild(row);
  });
}

function updateFinalRankings(rankings) {
  leaderboardBody.innerHTML = '';
  
  rankings.forEach((entry, index) => {
    const row = document.createElement('tr');
    
    if (entry.name === participantName) {
      row.classList.add('highlight');
    }
    
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
    
    row.innerHTML = `
      <td>${medal} ${index + 1}</td>
      <td>${entry.name}</td>
      <td>${entry.averageWpm}</td>
      <td>${entry.averageAccuracy}%</td>
    `;
    
    leaderboardBody.appendChild(row);
  });
}

// ==========================
// EVENT LISTENERS
// ==========================

joinBtn.addEventListener('click', () => {
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  
  if (!code || code.length < 5) {
    showNotification('Please enter a valid competition code', 'error');
    return;
  }
  
  if (!name || name.length < 2) {
    showNotification('Please enter a valid name (min 2 characters)', 'error');
    return;
  }
  
  if (!socket || !socket.connected) {
    connectSocket();
  }
  
  if (socket.connected) {
    socket.emit('join', { code, participantName: name });
  } else {
    socket.once('connect', () => {
      socket.emit('join', { code, participantName: name });
    });
  }
});

nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinBtn.click();
  }
});

codeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    nameInput.focus();
  }
});

typingInput.addEventListener('input', (e) => {
  if (!roundText || isPaused) return;
  
  const typed = e.target.value;
  const expectedText = roundText.substring(currentCharIndex, currentCharIndex + typed.length);
  
  let newCorrectChars = correctChars;
  let newCurrentCharIndex = currentCharIndex;
  
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === expectedText[i]) {
      newCorrectChars++;
      newCurrentCharIndex++;
    } else {
      typingInput.value = typed.substring(0, i);
      break;
    }
  }
  
  correctChars = newCorrectChars;
  currentCharIndex = newCurrentCharIndex;
  totalChars++;
  
  if (typingInput.value === typed) {
    typingInput.value = '';
  }
  
  renderTypingText();
  
  const elapsedTime = Date.now() - startTime;
  socket.emit('progress', {
    competitionId,
    correctChars,
    totalChars,
    currentChar: currentCharIndex,
    elapsedTime
  });
  
  if (totalChars % 10 === 0) {
    saveStateToLocalStorage();
  }
  
  if (currentCharIndex >= roundText.length) {
    typingInput.disabled = true;
    showNotification('Round completed!', 'success');
  }
});

typingInput.addEventListener('copy', (e) => e.preventDefault());
typingInput.addEventListener('paste', (e) => e.preventDefault());
typingInput.addEventListener('cut', (e) => e.preventDefault());

document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && typingSection.style.display === 'flex') {
    showNotification('⚠️ Warning: Tab switching detected!', 'warning');
  }
});

nextRoundBtn.addEventListener('click', () => {
  resultsSection.style.display = 'none';
  waitingSection.style.display = 'flex';
  waitingMessage.textContent = 'Waiting for next round...';
});

// ==========================
// INITIALIZATION
// ==========================

document.addEventListener('DOMContentLoaded', () => {
  restorePreviousSession();
});

setInterval(() => {
  if (typingSection.style.display === 'flex' && !isPaused) {
    saveStateToLocalStorage();
  }
}, 5000);
