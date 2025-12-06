const socket = io();

let competitionId = null;
let participantName = null;
let currentRound = -1;
let isTestInProgress = false;
let testStartTime = 0;
let typingText = '';
let currentRoundDuration = 0;
let totalErrors = 0;
let backspaceCount = 0;
let typedChars = [];
let errorIndices = new Set();

// DOM Elements
const joinScreen = document.getElementById('joinScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const testScreen = document.getElementById('testScreen');
const resultsScreen = document.getElementById('resultsScreen');
const completionScreen = document.getElementById('completionScreen');
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
typingInput.addEventListener('keydown', (e) => {
  if (!isTestInProgress) return;

  // Backspace handling
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (typedChars.length > 0) {
      const removedIndex = typedChars.length - 1;
      if (errorIndices.has(removedIndex)) {
        errorIndices.delete(removedIndex);
        totalErrors = Math.max(0, totalErrors - 1);
      }
      backspaceCount++;
      typedChars.pop();
      typingInput.value = typedChars.join('');
      updateTypingStats();
    }
    return;
  }

  // Printable character
  if (e.key.length === 1) {
    e.preventDefault();
    const nextIndex = typedChars.length;
    const expectedChar = typingText[nextIndex] || '';
    typedChars.push(e.key);
    typingInput.value = typedChars.join('');

    if (e.key !== expectedChar) {
      totalErrors++;
      errorIndices.add(nextIndex);
    }

    updateTypingStats();
  }
});

// ============= CORE UPDATE FUNCTION =============
function updateTypingStats() {
  const inputText = typedChars.join('');
  const correctChars = calculateCorrectChars(inputText, typingText);
  const totalChars = inputText.length;
  const incorrectChars = totalChars - correctChars;
  const elapsedSeconds = (Date.now() - testStartTime) / 1000;

  const wpm = elapsedSeconds > 0
    ? Math.round((correctChars / 5) / (elapsedSeconds / 60))
    : 0;

  const accuracy = totalChars > 0
    ? Math.round((correctChars / totalChars) * 100)
    : 100;

  wpmDisplay.textContent = wpm;
  accuracyDisplay.textContent = accuracy + '%';
  updateTextDisplay(inputText);

  // Emit progress (server validates)
  socket.emit('progress', {
    competitionId,
    correctChars,
    totalChars,
    errors: totalErrors,
    backspaces: backspaceCount,
  });
}

// ============= SUPPORTING FUNCTIONS =============
function calculateCorrectChars(input, reference) {
  let correct = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === reference[i]) correct++;
  }
  return correct;
}

function updateTextDisplay(inputText) {
  let html = '';
  for (let i = 0; i < typingText.length; i++) {
    const char = typingText[i];
    let span = `${char}`;

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

// Timer
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

// Error display
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
});

socket.on('participantJoined', (data) => {
  participantCountDisplay.textContent = data.totalParticipants;
});

socket.on('roundStarted', (data) => {
  currentRound = data.roundIndex;
  typingText = data.text;
  const duration = data.duration;

  typedChars = [];
  totalErrors = 0;
  backspaceCount = 0;
  errorIndices.clear();

  lobbyScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  completionScreen.classList.add('hidden');
  testScreen.classList.remove('hidden');

  typingInput.value = '';
  typingInput.disabled = false;
  typingInput.focus();
  updateTextDisplay('');
  wpmDisplay.textContent = '0';
  accuracyDisplay.textContent = '100%';

  isTestInProgress = true;
  testStartTime = Date.now();
  startTimer(duration);
});

socket.on('roundEnded', (data) => {
  isTestInProgress = false;
  typingInput.disabled = true;
  testScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');

  const personalResult = data.leaderboard.find(item => item.name === participantName);

  if (personalResult) {
    document.getElementById('resultWpm').textContent = personalResult.wpm;
    document.getElementById('resultAccuracy').textContent = personalResult.accuracy + '%';
    document.getElementById('resultErrors').textContent = personalResult.errors;
    document.getElementById('resultBackspaces').textContent = personalResult.backspaces;
  }
});

// ============= FINAL RESULTS - SHOW COMPLETION SCREEN =============
socket.on('finalResults', (data) => {
  // Hide all other screens
  joinScreen.classList.add('hidden');
  lobbyScreen.classList.add('hidden');
  testScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  
  // Show completion screen with save notification
  completionScreen.classList.remove('hidden');
});

socket.on('disconnect', () => {
  showError('Disconnected from server');
  joinScreen.classList.remove('hidden');
  lobbyScreen.classList.add('hidden');
  testScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  completionScreen.classList.add('hidden');
});


const joinNewCompetitionBtn = document.getElementById('joinNewCompetitionBtn');

if (joinNewCompetitionBtn) {
  joinNewCompetitionBtn.addEventListener('click', () => {

    window.location.href = '/'; 
  });
}
