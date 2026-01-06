const socket = io();

let competitionId = null;
let rounds = [];
let competitionCode = null;
let completedRounds = new Set();

// Check authentication
const authToken = localStorage.getItem('authToken');
if (!authToken) {
  window.location.href = '/login';
}

// Helper function to get auth headers
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
}

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
const exportSection = document.getElementById('exportSection');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

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
        <button class="btn-remove">✕</button>
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

    // Delete-Round button listener
    const deleteBtn = roundDiv.querySelector('.btn-remove');
    deleteBtn.addEventListener('click', () => removeRound(index));

    // Persist text input into state
    const textarea = document.getElementById(`text-${index}`);
    textarea.addEventListener('input', function () {
      rounds[index].text = this.value;
      // Character counter
      document.getElementById(`count-${index}`).textContent = this.value.length;
    });

    // Persist duration input into state
    const durationInput = document.getElementById(`duration-${index}`);
    durationInput.addEventListener('input', function () {
      rounds[index].duration = Number(this.value);
    });
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
 const maxPlayersInput = document.getElementById("maxPlayers");
const maxPlayers = maxPlayersInput && maxPlayersInput.value
  ? parseInt(maxPlayersInput.value, 10)
  : null;

  if (maxPlayers !== null && (isNaN(maxPlayers) || maxPlayers < 1)) {
  alert("Maximum players must be a number greater than 0");
  return;
}


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
      headers: getAuthHeaders(),
    body: JSON.stringify({ 
  name: compName, 
  description: compDescription,
  rounds,
  maxPlayers // 👈 ADD THIS
})

    });

    const data = await response.json();

    if (response.status === 401) {
      alert('Session expired. Please login again.');
      localStorage.clear();
      window.location.href = '/login';
      return;
    }

    if (data.success) {
      competitionId = data.competitionId;
      competitionCode = data.code;
      codeValue.textContent = data.code;

      // Transition UI - hide form, show code
      document.getElementById('setupForm').classList.add('hidden');
      codeDisplay.classList.remove('hidden');
      codeDisplay.classList.add('show');
      
      // Show control panel elements
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
  const codeEl = document.getElementById("codeValue");
  if (!codeEl) return;

  const text = codeEl.textContent || codeEl.innerText || "";
  if (!text) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error("Clipboard copy failed:", err);
    });
  } else {
    // Fallback for older browsers
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand("copy");
    } catch (e) {
      console.error("execCommand copy failed:", e);
    }
    document.body.removeChild(temp);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", copyCode);
  }
});


// Socket events
socket.on('participantJoined', (data) => {
  participantCountDisplay.textContent = data.totalParticipants;
  console.log(`✓ ${data.name} joined`);
});

socket.on('leaderboardUpdate', (data) => {
  const leaderboard = data.leaderboard;
  leaderboardContainer.innerHTML = `
    <h4>🏁 Live Round ${data.roundIndex + 1}</h4>
    ${leaderboard.map((item, index) => `
      <div class="leaderboard-item top-${index < 3 ? index + 1 : ''}">
        <span class="leaderboard-rank">#${index + 1}</span>
        <span class="leaderboard-name">${item.name}</span>
        <span class="leaderboard-stats">
          <span>🏃 ${item.wpm} WPM</span>
          <span>🎯 ${item.accuracy}%</span>
          <span class="text-red">❌ ${item.errors ?? 0}</span>
          <span class="text-yellow">⌫ ${item.backspaces ?? 0}</span>
        </span>
      </div>
    `).join('')}
  `;
});

socket.on('roundEnded', (data) => {
  leaderboardContainer.innerHTML = `
    <h4>✅ Round ${data.roundIndex + 1} - Final Results</h4>
    ${data.leaderboard.map((item, index) => `
      <div class="leaderboard-item top-${index < 3 ? index + 1 : ''}">
        <span class="leaderboard-rank">#${index + 1}</span>
        <span class="leaderboard-name">${item.name}</span>
        <span class="leaderboard-stats">
          <span>🏃 ${item.wpm} WPM</span>
          <span>🎯 ${item.accuracy}%</span>
          <span class="text-red">❌ ${item.errors ?? 0}</span>
          <span class="text-yellow">⌫ ${item.backspaces ?? 0}</span>
        </span>
      </div>
    `).join('')}
  `;
});

socket.on('finalResults', (data) => {
  console.log('Final Results:', data.rankings);
  statusDisplay.textContent = 'Completed';
  statusDisplay.className = 'status-badge completed';
  
  // Show export section
  exportSection.classList.remove('hidden');
  
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
            <span>🎯 ${item.avgAccuracy}%</span>
            <span class="text-red">❌ ${item.totalErrors ?? 0}</span>
            <span class="text-yellow">⌫ ${item.totalBackspaces ?? 0}</span>
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

// Display organizer name
const organizerName = localStorage.getItem('organizerName');
if (organizerName) {
  document.getElementById('organizerName').textContent = organizerName;
}

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.clear();
    window.location.href = '/login';
  }
});

// Export Functionality
async function fetchRankings() {
  try {
    const response = await fetch(`/api/competition/${competitionId}/rankings`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (data.success) {
      return data;
    }
    throw new Error(data.error || 'Failed to fetch rankings');
  } catch (error) {
    console.error('Export error:', error);
    alert('Error fetching rankings for export: ' + error.message);
    return null;
  }
}

exportExcelBtn.addEventListener('click', async () => {
  const data = await fetchRankings();
  if (!data) return;

  try {
    const sheetData = [
      [data.name],
      ['Generated on', new Date().toLocaleString()],
      [],
      ['Rank', 'Participant Name', 'Average WPM', 'Average Accuracy (%)', 'Total Rounds Completed', 'Highest WPM', 'Lowest WPM']
    ];

    data.rankings.forEach(item => {
      sheetData.push([
        item.rank,
        item.participantName,
        item.averageWpm,
        item.averageAccuracy,
        item.totalRoundsCompleted,
        item.highestWpm,
        item.lowestWpm
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rankings');
    XLSX.writeFile(wb, `${data.code}_rankings_${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (error) {
    alert('Error generating Excel: ' + error.message);
  }
});

exportPdfBtn.addEventListener('click', async () => {
  const data = await fetchRankings();
  if (!data) return;

  try {
    const element = document.createElement('div');
    element.style.padding = '20px';
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.color = '#000000'; // Force black text for PDF
    element.style.backgroundColor = '#ffffff'; // Force white background for PDF

    let html = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #218080; margin: 10px 0;">${data.name}</h1>
        <p style="color: #666; margin: 5px 0;">Competition Code: ${data.code}</p>
        <p style="color: #999; font-size: 12px;">Generated on ${new Date().toLocaleString()}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; color: #000000;">
        <thead>
          <tr style="background-color: #218080; color: #ffffff;">
            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Rank</th>
            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Participant Name</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Avg WPM</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Accuracy</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Rounds</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.rankings.forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
      html += `
        <tr style="background-color: ${rowBg}; color: #000000;">
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${item.rank}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${item.participantName}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.averageWpm}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.averageAccuracy}%</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.totalRoundsCompleted}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    element.innerHTML = html;

    const options = {
      margin: 10,
      filename: `${data.code}_rankings.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
    };

    html2pdf().set(options).from(element).save();
  } catch (error) {
    alert('Error generating PDF: ' + error.message);
  }
});
