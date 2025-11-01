const socket = io();

let competitionId = null;
let participantName = null;
let currentRound = -1;
let isTestInProgress = false;
let testStartTime = 0;
let typingText = '';
let currentRoundDuration = 0;

// DOM Elements
const joinScreen = document.getElementById('joinScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const testScreen = document.getElementById('testScreen');
const resultsScreen = document.getElementById('resultsScreen');
const finalScreen = document.getElementById('finalScreen');

const competitionCodeInput = document.getElementById('competitionCode');
const participantNameInput = document.getElementById('participantName');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

const welcomeName = document.getElementById('welcomeName');
const competitionNameDisplay = document.getElementById('competitionName');
const participantCountDisplay = document.getElementById('participantCountDisplay');

const typingInput = document.getElementById('typingInput');
const textDisplay = document.getElementById('textDisplay');
const wpmDisplay = document.getElementById('wpmDisplay');
const accuracyDisplay = document.getElementById('accuracyDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const focusWarning = document.getElementById('focusWarning');

// ============= ANTI-CHEATING =============
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('paste', (e) => e.preventDefault());
document.addEventListener('cut', (e) => e.preventDefault());
document.addEventListener('copy', (e) => e.preventDefault());

// Focus monitoring
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isTestInProgress) {
    focusWarning.classList.remove('hidden');
  } else if (!document.hidden) {
    focusWarning.classList.add('hidden');
  }
});

// ============= JOIN COMPETITION =============
joinBtn.addEventListener('click', () => {
  const code = competitionCodeInput.value.toUpperCase().trim();
  const name = participantNameInput.value.trim();

  if (!code || code.length !== 5) {
    showError('Competition code must be 5 characters');
    return;
  }

  if (!name || name.length === 0) {
    showError('Please enter your name');
    return;
  }

  participantName = name;
  socket.emit('join', { code, participantName: name });
});

// ============= TYPING INPUT HANDLER =============
typingInput.addEventListener('input', () => {
  if (!isTestInProgress) return;

  const inputText = typingInput.value;
  const correctChars = calculateCorrectChars(inputText, typingText);
  const totalChars = inputText.length;

  // Calculate WPM and Accuracy
  const elapsedSeconds = (Date.now() - testStartTime) / 1000;
  const wpm = elapsedSeconds > 0
    ? Math.round((correctChars / 5) / (elapsedSeconds / 60))
    : 0;
  const accuracy = totalChars > 0
    ? Math.round((correctChars / totalChars) * 100)
    : 100;

  // Update display
  wpmDisplay.textContent = wpm;
  accuracyDisplay.textContent = accuracy + '%';
  updateTextDisplay(inputText);

  // Send progress to server (server validates)
  socket.emit('progress', {
    competitionId,
    correctChars,
    totalChars
  });
});

// Calculate correct characters
function calculateCorrectChars(input, reference) {
  let correct = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === reference[i]) correct++;
  }
  return correct;
}

// Update text display with colors
function updateTextDisplay(inputText) {
  let html = '';
  for (let i = 0; i < typingText.length; i++) {
    const char = typingText[i];
    let span = `<span>${char}</span>`;

    if (i < inputText.length) {
      if (inputText[i] === char) {
        span = `<span class="correct">${char}</span>`;
      } else {
        span = `<span class="incorrect">${char}</span>`;
      }
    } else if (i === inputText.length) {
      span = `<span class="current">${char}</span>`;
    }

    html += span;
  }
  textDisplay.innerHTML = html;
}

// Start timer
function startTimer(duration) {
  currentRoundDuration = duration;
  let timeLeft = duration;
  timerDisplay.textContent = timeLeft + 's';

  const timerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft + 's';

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      isTestInProgress = false;
      typingInput.disabled = true;
    }
  }, 1000);
}

// Show error
function showError(message) {
  joinError.textContent = message;
  joinError.classList.add('show');
  setTimeout(() => joinError.classList.remove('show'), 4000);
}

// ============= SOCKET EVENTS =============

socket.on('joinSuccess', (data) => {
  competitionId = data.competitionId;
  competitionNameDisplay.textContent = data.name;
  welcomeName.textContent = participantName;

  joinScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  console.log('✓ Joined successfully');
});

socket.on('participantJoined', (data) => {
  participantCountDisplay.textContent = data.totalParticipants;
  console.log(`✓ ${data.name} joined. Total: ${data.totalParticipants}`);
});

socket.on('roundStarted', (data) => {
  currentRound = data.roundIndex;
  typingText = data.text;
  const duration = data.duration;

  // Show typing screen
  lobbyScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  testScreen.classList.remove('hidden');

  // Reset
  typingInput.value = '';
  typingInput.disabled = false;
  typingInput.focus();
  updateTextDisplay('');

  // Reset stats
  wpmDisplay.textContent = '0';
  accuracyDisplay.textContent = '100%';

  isTestInProgress = true;
  testStartTime = Date.now();

  startTimer(duration);

  console.log(`✓ Round ${currentRound + 1} started`);
});

socket.on('roundEnded', (data) => {
  isTestInProgress = false;
  typingInput.disabled = true;
  testScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');

  // Find personal result
  const personalResult = data.leaderboard.find(item => item.name === participantName);
  if (personalResult) {
    document.getElementById('resultWpm').textContent = personalResult.wpm;
    document.getElementById('resultAccuracy').textContent = personalResult.accuracy + '%';
  }

  // Show leaderboard (only results, no live tracking)
  const leaderboardHtml = data.leaderboard.map((item, index) => `
    <div class="leaderboard-item top-${index < 3 ? index + 1 : ''}">
      <span class="leaderboard-rank">#${index + 1}</span>
      <span class="leaderboard-name">${item.name}</span>
      <span class="leaderboard-stats">
        <span>${item.wpm} WPM</span>
        <span>${item.accuracy}%</span>
      </span>
    </div>
  `).join('');

  document.getElementById('roundLeaderboard').innerHTML = leaderboardHtml;

  console.log('✓ Round ended');
});

socket.on('finalResults', (data) => {
  resultsScreen.classList.add('hidden');
  finalScreen.classList.remove('hidden');

  const rankingsHtml = data.rankings.map((item, index) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[index] || `#${index + 1}`;

    return `
      <div class="rank-item">
        <div class="rank-medal">${medal}</div>
        <div class="rank-details">
          <div class="rank-name">${item.name}</div>
          <div class="rank-stats">
            <span>Avg WPM: <strong>${item.avgWpm}</strong></span>
            <span>Avg Accuracy: <strong>${item.avgAccuracy}%</strong></span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('finalRankings').innerHTML = rankingsHtml;

  console.log('✓ Competition completed');
});

socket.on('participantLeft', (data) => {
  participantCountDisplay.textContent = data.totalParticipants;
});

socket.on('error', (data) => {
  showError(data.message || 'An error occurred');
  console.error('❌ Error:', data.message);
});

socket.on('disconnect', () => {
  console.log('⚠️ Disconnected from server');
});
