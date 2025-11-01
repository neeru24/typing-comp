const socket = io();

let competitionId = null;
let rounds = [];
let competitionCode = null;
let completedRounds = new Set();

// DOM Elements
const compNameInput = document.getElementById('compName');
const compDescriptionInput = document.getElementById('compDescription');
const addRoundBtn = document.getElementById('addRoundBtn');
const roundsList = document.getElementById('roundsList');
const createCompBtn = document.getElementById('createCompBtn');
const codeDisplay = document.getElementById('codeDisplay');
const codeValue = document.getElementById('codeValue');
const roundSelector = document.getElementById('roundSelector');
const roundButtonsList = document.getElementById('roundButtonsList');
const startRoundBtn = document.getElementById('startRoundBtn');
const leaderboardContainer = document.getElementById('leaderboardContainer');
const roundStatus = document.getElementById('roundStatus');
const participantCountDisplay = document.getElementById('participantCountDisplay');
const compInfo = document.getElementById('compInfo');
const compNameDisplay = document.getElementById('compNameDisplay');
const statusDisplay = document.getElementById('statusDisplay');

let selectedRound = null;

// Add new round
addRoundBtn.addEventListener('click', () => {
  const roundIndex = rounds.length;
  rounds.push({ text: '', duration: 60 });
  renderRounds();
});

// Render rounds UI
function renderRounds() {
  roundsList.innerHTML = '';
  
  rounds.forEach((round, index) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'round-item';
    roundDiv.innerHTML = `
      <div class="round-header">
        <h4>Round ${index + 1}</h4>
        <button class="btn-remove" onclick="removeRound(${index})">✕</button>
      </div>
      <div class="form-group">
        <label>Text to Type</label>
        <textarea placeholder="Enter paragraph..." id="text-${index}" class="round-text">${round.text}</textarea>
        <span class="char-count">Characters: <span id="count-${index}">0</span></span>
      </div>
      <div class="form-group">
        <label>Duration (seconds)</label>
        <input type="number" id="duration-${index}" value="${round.duration}" min="10" max="300" />
      </div>
    `;
    roundsList.appendChild(roundDiv);

    // Character counter
    const textarea = document.getElementById(`text-${index}`);
    textarea.addEventListener('input', function() {
      document.getElementById(`count-${index}`).textContent = this.value.length;
    });
    document.getElementById(`count-${index}`).textContent = round.text.length;
  });
}

// Remove round
function removeRound(index) {
  rounds.splice(index, 1);
  renderRounds();
}

// Create competition
createCompBtn.addEventListener('click', async () => {
  const compName = compNameInput.value.trim();
  const compDescription = compDescriptionInput.value.trim();
  
  if (!compName) {
    alert('Please enter competition name');
    return;
  }

  if (rounds.length === 0) {
    alert('Please add at least one round');
    return;
  }

  // Collect updated rounds
  rounds = rounds.map((round, index) => ({
    text: document.getElementById(`text-${index}`).value.trim(),
    duration: parseInt(document.getElementById(`duration-${index}`).value)
  }));

  if (rounds.some(r => !r.text || r.duration < 10)) {
    alert('All rounds must have text and duration >= 10s');
    return;
  }

  try {
    const response = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: compName, 
        description: compDescription,
        rounds 
      })
    });

    const data = await response.json();

    if (data.success) {
      competitionId = data.competitionId;
      competitionCode = data.code;
      codeValue.textContent = data.code;

      // Transition UI
      document.querySelector('.setup-section').style.display = 'none';
      codeDisplay.classList.remove('hidden');
      roundSelector.classList.remove('hidden');
      compInfo.classList.remove('hidden');
      
      compNameDisplay.textContent = compName;
      statusDisplay.textContent = 'Ready';

      // Render round buttons
      renderRoundButtons();

      socket.emit('organizerJoin', {
        competitionId,
        code: data.code
      });
    } else {
      alert('Failed to create competition');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Connection error');
  }
});

// Render round buttons with status
function renderRoundButtons() {
  roundButtonsList.innerHTML = '';
  rounds.forEach((round, index) => {
    const isCompleted = completedRounds.has(index);
    const btn = document.createElement('button');
    btn.className = `round-btn ${isCompleted ? 'completed' : ''}`;
    btn.textContent = `Round ${index + 1}`;
    btn.disabled = isCompleted;
    btn.style.opacity = isCompleted ? '0.5' : '1';
    btn.style.cursor = isCompleted ? 'not-allowed' : 'pointer';
    
    btn.addEventListener('click', () => {
      selectedRound = index;
      
      // Remove previous selection
      document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update round details
      document.getElementById('selectedRoundText').textContent = 
        `📄 ${round.text.substring(0, 100)}...`;
      document.getElementById('selectedRoundTime').textContent = 
        `⏱️ Duration: ${round.duration} seconds`;
      
      startRoundBtn.disabled = isCompleted;
    });

    if (index === 0) {
      btn.classList.add('active');
      selectedRound = 0;
      document.getElementById('selectedRoundText').textContent = 
        `📄 ${round.text.substring(0, 100)}...`;
      document.getElementById('selectedRoundTime').textContent = 
        `⏱️ Duration: ${round.duration} seconds`;
      startRoundBtn.disabled = false;
    }

    roundButtonsList.appendChild(btn);
  });
}

// Start round
startRoundBtn.addEventListener('click', () => {
  if (selectedRound === null || selectedRound === undefined) {
    alert('Select a round first');
    return;
  }

  if (completedRounds.has(selectedRound)) {
    alert('This round has already been completed');
    return;
  }

  socket.emit('startRound', {
    competitionId,
    roundIndex: selectedRound
  });

  startRoundBtn.disabled = true;
  showRoundStatus(selectedRound);
});

// Show round status
function showRoundStatus(roundIndex) {
  roundStatus.classList.remove('hidden');
  document.getElementById('roundNumber').textContent = roundIndex + 1;

  const duration = rounds[roundIndex].duration;
  let timeLeft = duration;

  const timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('roundTimer').textContent = timeLeft;
    
    const progress = ((duration - timeLeft) / duration) * 100;
    document.getElementById('progressFill').style.width = progress + '%';

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      roundStatus.classList.add('hidden');
      
      // Mark round as completed
      completedRounds.add(roundIndex);
      
      // Disable the round button
      const roundButtons = document.querySelectorAll('.round-btn');
      if (roundButtons[roundIndex]) {
        roundButtons[roundIndex].disabled = true;
        roundButtons[roundIndex].classList.add('completed');
        roundButtons[roundIndex].style.opacity = '0.5';
        roundButtons[roundIndex].style.cursor = 'not-allowed';
      }
      
      // Disable start button if this round was selected
      if (selectedRound === roundIndex) {
        startRoundBtn.disabled = true;
      }
    }
  }, 1000);
}

// Copy code to clipboard
function copyCode() {
  navigator.clipboard.writeText(competitionCode);
  alert('✓ Code copied: ' + competitionCode);
}

// Socket events
socket.on('participantJoined', (data) => {
  participantCountDisplay.textContent = data.totalParticipants;
  console.log(`✓ ${data.name} joined`);
});

socket.on('leaderboardUpdate', (data) => {
  const leaderboard = data.leaderboard;
  leaderboardContainer.innerHTML = leaderboard.map((item, index) => `
    <div class="leaderboard-item top-${index < 3 ? index + 1 : ''}">
      <span class="leaderboard-rank">#${index + 1}</span>
      <span class="leaderboard-name">${item.name}</span>
      <span class="leaderboard-stats">
        <span>${item.wpm} WPM</span>
        <span>${item.accuracy}%</span>
      </span>
    </div>
  `).join('');
});

socket.on('roundEnded', (data) => {
  leaderboardContainer.innerHTML = `
    <h4>Round ${data.roundIndex + 1} - Final Results</h4>
    ${data.leaderboard.map((item, index) => `
      <div class="leaderboard-item top-${index < 3 ? index + 1 : ''}">
        <span class="leaderboard-rank">#${index + 1}</span>
        <span class="leaderboard-name">${item.name}</span>
        <span class="leaderboard-stats">
          <span>${item.wpm} WPM</span>
          <span>${item.accuracy}%</span>
        </span>
      </div>
    `).join('')}
  `;
});

socket.on('finalResults', (data) => {
  console.log('Final Results:', data.rankings);
  leaderboardContainer.innerHTML = `
    <h4>🏆 Final Rankings 🏆</h4>
    ${data.rankings.map((item, index) => {
      const medals = ['🥇', '🥈', '🥉'];
      const medal = medals[index] || `#${index + 1}`;
      return `
        <div class="leaderboard-item final-rank">
          <span class="medal">${medal}</span>
          <span class="leaderboard-name">${item.name}</span>
          <span class="leaderboard-stats">
            <span>Avg: ${item.avgWpm} WPM</span>
            <span>${item.avgAccuracy}%</span>
          </span>
        </div>
      `;
    }).join('')}
  `;
});

socket.on('error', (data) => {
  console.error('Error:', data.message);
  alert('⚠️ Error: ' + data.message);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
