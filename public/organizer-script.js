/* organizer-script.js
   Organizer frontend behavior (separate file)
   - Create competition (POST /api/competitions/create)
   - Persist minimal state to localStorage and rehydrate
   - Generate temporary organizer token (POST /api/organizer-token/create)
   - Socket.IO connection using token from URL or from created token
   - Handles socket events: participantJoined, leaderboardUpdate, roundStarted, roundEnded, finalResults
*/

// DOM refs
const compNameInput = document.getElementById('compName');
const compDescriptionInput = document.getElementById('compDescription');
const addRoundBtn = document.getElementById('addRoundBtn');
const roundsList = document.getElementById('roundsList');
const createCompBtn = document.getElementById('createCompBtn');

const codeDisplay = document.getElementById('codeDisplay');
const codeValue = document.getElementById('codeValue');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const genTokenBtn = document.getElementById('genTokenBtn');
const tokenInfo = document.getElementById('tokenInfo');

const compInfo = document.getElementById('compInfo');
const compNameDisplay = document.getElementById('compNameDisplay');
const participantCountDisplay = document.getElementById('participantCountDisplay');
const statusDisplay = document.getElementById('statusDisplay');

const roundSelector = document.getElementById('roundSelector');
const roundButtonsList = document.getElementById('roundButtonsList');
const startRoundBtn = document.getElementById('startRoundBtn');
const selectedRoundText = document.getElementById('selectedRoundText');
const selectedRoundTime = document.getElementById('selectedRoundTime');
const roundStatus = document.getElementById('roundStatus');
const roundNumberEl = document.getElementById('roundNumber');
const roundTimerEl = document.getElementById('roundTimer');
const progressFill = document.getElementById('progressFill');

const leaderboardContainer = document.getElementById('leaderboardContainer');
const participantCountText = document.getElementById('participantCount');

const STORAGE_KEY = 'organizer:competition';

// app state
let competitionId = null;
let competitionCode = null;
let rounds = [];
let selectedRoundIndex = 0;
let completedRounds = new Set();
let socket = null;
let roundTimerInterval = null;
let roundEndsAt = null;

// helpers
function escapeHtml(s='') { return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function show(el){ if (el) el.classList.remove('hidden'); }
function hide(el){ if (el) el.classList.add('hidden'); }
function saveLocal(obj) { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }
function loadLocal(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){ return null; } }
function clearLocal(){ localStorage.removeItem(STORAGE_KEY); }
function $(sel, root=document){ return root.querySelector(sel); }

// rounds editor
function newRound(){ return { text: '', duration: 60 }; }

function renderRoundsEditor(){
  roundsList.innerHTML = '';
  rounds.forEach((r, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'round-item';
    wrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>Round ${idx+1}</strong>
        <button data-remove="${idx}" class="btn-secondary" type="button">✕</button>
      </div>
      <div class="form-group">
        <textarea data-idx="${idx}" class="round-text" placeholder="Round ${idx+1} text">${escapeHtml(r.text)}</textarea>
      </div>
      <div class="form-group">
        <input data-idx="${idx}" type="number" min="10" max="600" value="${r.duration}" />
      </div>
    `;
    roundsList.appendChild(wrapper);

    wrapper.querySelector('.btn-secondary')?.addEventListener('click', (e) => {
      const i = Number(e.target.dataset.remove);
      rounds.splice(i,1); renderRoundsEditor();
    });
    wrapper.querySelector('.round-text')?.addEventListener('input', (e) => {
      rounds[idx].text = e.target.value;
    });
    wrapper.querySelector('input[type=number]')?.addEventListener('change', (e) => {
      rounds[idx].duration = Math.max(10, Number(e.target.value) || 60);
      e.target.value = rounds[idx].duration;
    });
  });
  if (rounds.length === 0) roundsList.innerHTML = '<div class="placeholder-text">No rounds yet. Add one.</div>';
}

// initial round
rounds.push(newRound());
renderRoundsEditor();

// add round
addRoundBtn.addEventListener('click', () => {
  rounds.push(newRound());
  renderRoundsEditor();
});

// copy competition code
copyCodeBtn.addEventListener('click', async () => {
  if (!competitionCode) return;
  try {
    await navigator.clipboard.writeText(competitionCode);
    copyCodeBtn.textContent = 'Copied ✓';
    setTimeout(()=> copyCodeBtn.textContent = '📋 Copy', 1500);
  } catch {
    alert('Code: ' + competitionCode);
  }
});

createCompBtn.addEventListener('click', async () => {
  const name = (compNameInput.value || '').trim();
  const description = (compDescriptionInput.value || '').trim();
  if (!name) { alert('Please enter competition name'); return; }
  if (!rounds.length) { alert('Add at least one round.'); return; }

  // collect round data from editor
  rounds = rounds.map((_, idx) => {
    const textEl = document.querySelector(`textarea[data-idx="${idx}"]`);
    const durEl = document.querySelector(`input[data-idx="${idx}"]`);
    return { roundNumber: idx+1, text: (textEl?.value||'').trim(), duration: Number(durEl?.value)||60 };
  });

  for (let i=0;i<rounds.length;i++){
    if (!rounds[i].text) { alert('Round ' + (i+1) + ' text required'); return; }
  }

  createCompBtn.disabled = true;
  createCompBtn.textContent = 'Creating…';

  try {
    const res = await fetch('/api/competitions/create', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, description, rounds })
    });

    // robust parsing: read text then try to parse JSON to avoid uncaught HTML parse errors
    const rawText = await res.text();
    let data;
    try { data = rawText ? JSON.parse(rawText) : {}; } 
    catch (e) {
      console.error('Invalid JSON response from /api/competitions/create:', rawText);
      throw new Error('Invalid server response');
    }

    if (!res.ok) {
      alert(data.error || 'Failed to create competition');
      return;
    }

    // expected { competitionId, code, organizerToken?, tokenExpiresAt? }
    competitionId = String(data.competitionId);
    competitionCode = data.code;
    codeValue.textContent = competitionCode;

    // UI changes
    hide(document.getElementById('setupForm'));
    show(codeDisplay);
    show(compInfo);
    show(roundSelector);
    compNameDisplay.textContent = name;
    statusDisplay.textContent = 'Ready';

    // persist minimal info (no storing of one-time token)
    saveLocal({ competitionId, competitionCode, competitionName: name, createdAt: Date.now() });

    // render round buttons (client-side)
    renderRoundButtons();
console.log('create response', data);
    // ===== handle organizer token returned from server (if any) =====
    const organizerToken = data.organizerToken || null;
    const tokenExpiresAt = data.tokenExpiresAt || null;

    if (organizerToken) {
      // Show organizer token UI (assumes these elements exist in organizer.html)
      const tokenBox = document.getElementById('organizerTokenBox');
      const tokenVal = document.getElementById('organizerTokenValue');
      const tokenExp = document.getElementById('organizerTokenExpiry');
      const copyBtn = document.getElementById('copyOrgTokenBtn');

      if (tokenBox && tokenVal && tokenExp) {
        tokenVal.textContent = organizerToken;
        tokenExp.textContent = tokenExpiresAt ? 'Expires at: ' + new Date(tokenExpiresAt).toLocaleString() : '';
        tokenBox.classList.remove('hidden');

        // one-time auto-copy (best-effort)
        try { await navigator.clipboard.writeText(organizerToken); } catch (e) { /* ignore */ }

        // add copy handler (only once)
        if (copyBtn && !copyBtn._hasHandler) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(tokenVal.textContent);
              copyBtn.textContent = 'Copied ✓';
              setTimeout(() => copyBtn.textContent = '📋 Copy', 1400);
            } catch {
              alert('Token: ' + tokenVal.textContent);
            }
          });
          copyBtn._hasHandler = true;
        }
      }

      // Connect socket using the returned token so organizer is authorized immediately.
      // connectSocket places the socket into the `socket` variable and registers handlers.
      connectSocket(organizerToken);

      // Ensure we send organizerJoin after the socket connects (middleware should validate token and allow join)
      const attemptEmitJoin = () => {
        try {
          if (socket && socket.connected) {
            socket.emit('organizerJoin', { competitionId, code: competitionCode });
          } else {
            // wait for connect then emit once
            socket && socket.once && socket.once('connect', () => {
              socket.emit('organizerJoin', { competitionId, code: competitionCode });
            });
          }
        } catch (e) {
          console.warn('emit organizerJoin failed', e);
        }
      };
      attemptEmitJoin();

    } else {
      // No token returned — use existing rehydrate/connect behavior
      connectSocketUsingSavedTokenOrDefault();
      // If no token path, emit organizerJoin once socket connected (handled inside that function)
    }

  } catch (err) {
    console.error('create error', err);
    alert(err.message || 'Connection error');
  } finally {
    createCompBtn.disabled = false;
    createCompBtn.textContent = 'Create Competition';
  }
});


// render round buttons
function renderRoundButtons(){
  roundButtonsList.innerHTML = '';
  if (!Array.isArray(rounds) || rounds.length === 0) {
    roundButtonsList.innerHTML = '<div class="placeholder-text">No rounds defined.</div>';
    return;
  }
  rounds.forEach((round, idx) => {
    const btn = document.createElement('button');
    btn.className = 'round-btn';
    btn.type = 'button';
    btn.textContent = `Round ${idx+1}`;
    btn.disabled = completedRounds.has(idx);
    if (completedRounds.has(idx)) btn.classList.add('completed');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRoundIndex = idx;
      selectedRoundText.textContent = round.text ? `📄 ${round.text.slice(0, 200)}${round.text.length > 200 ? '…' : ''}` : '📄 (no text)';
      selectedRoundTime.textContent = `⏱️ Duration: ${round.duration} seconds`;
      startRoundBtn.disabled = completedRounds.has(idx);
    });
    roundButtonsList.appendChild(btn);
  });

  const firstNotDone = rounds.findIndex((_, i) => !completedRounds.has(i));
  const toSelect = firstNotDone >= 0 ? firstNotDone : 0;
  const btns = roundButtonsList.querySelectorAll('.round-btn');
  if (btns[toSelect]) btns[toSelect].click();
}

// start round
startRoundBtn.addEventListener('click', async () => {
  if (selectedRoundIndex === null || selectedRoundIndex === undefined) { alert('Select a round first'); return; }
  if (!competitionId) { alert('Competition not initialized'); return; }
  startRoundBtn.disabled = true;
  try {
    // prefer socket start; but also fallback to REST if needed (server must accept socket event)
    if (socket && socket.connected) {
      socket.emit('startRound', { competitionId, roundIndex: selectedRoundIndex });
    } else {
      // fallback: REST request to start round (if your server exposes)
      await fetch(`/api/competitions/${encodeURIComponent(competitionCode)}/startRound`, {
        method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ roundIndex: selectedRoundIndex })
      });
    }
  } catch (err) {
    console.error('startRound error', err);
    alert('Unable to start round');
    startRoundBtn.disabled = false;
  }
});

// generate access token (magic token)
genTokenBtn.addEventListener('click', async () => {
  if (!competitionId) { alert('Create competition first'); return; }
  genTokenBtn.disabled = true;
  genTokenBtn.textContent = 'Generating…';
  tokenInfo.textContent = '';
  try {
    const res = await fetch('/api/organizer-token/create', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ competitionId, ttlSeconds: 3600, oneTime: true })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Could not generate token');
      return;
    }
    // show token and magic link (display plaintext only)
    const token = data.token;
    const expiresAt = data.expiresAt;
    tokenInfo.textContent = `Token created — expires ${new Date(expiresAt).toLocaleString()}`;
    // copy token to clipboard automatically for convenience
    try { await navigator.clipboard.writeText(token); tokenInfo.textContent += ' • Copied to clipboard'; } catch {}
    // Also display a prompt with magic link (optional)
    const magicLink = `${location.origin}${location.pathname}?token=${encodeURIComponent(token)}`;
    // show small prompt (not changing UI structure)
    setTimeout(()=> alert('Magic link (open on another device):\n\n' + magicLink), 150);
  } catch (err) {
    console.error('gen token error', err);
    alert('Error generating token');
  } finally {
    genTokenBtn.disabled = false;
    genTokenBtn.textContent = 'Generate Access Token';
  }
});

// SOCKET HANDLING
function connectSocket(token) {
  // close existing
  if (socket) { try { socket.disconnect(); } catch(e){} socket = null; }
  // create socket with token in auth if provided
  const opts = token ? { auth: { token }, transports: ['websocket','polling'] } : { transports: ['websocket','polling'] };
  socket = io(opts);

  socket.on('connect', () => {
    console.log('socket connected', socket.id);
    // if we have competitionId and server expects organizerJoin event:
    if (competitionId && (!token)) {
      // if token not used, still join as organizer by competitionId (server should verify)
      socket.emit('organizerJoin', { competitionId, code: competitionCode });
    }
    // if token used in handshake, server middleware should have validated and joined competition room
  });

  socket.on('connect_error', (err) => {
    console.error('socket connect_error', err);
    // surface minimal message
    if (err && err.message) console.warn('Socket error:', err.message);
  });

  socket.on('participantJoined', (data) => {
    if (data && typeof data.totalParticipants !== 'undefined') {
      participantCountDisplay.textContent = String(data.totalParticipants);
      participantCountText.textContent = `👥 ${data.totalParticipants} participant(s)`;
    }
  });

  socket.on('leaderboardUpdate', (data) => { renderLiveLeaderboard(data); });

  socket.on('roundStarted', (data) => {
    try {
      const { roundIndex, duration, startTime } = data || {};
      if (typeof roundIndex !== 'number') return;
      show(roundStatus);
      roundNumberEl.textContent = String(roundIndex + 1);
      progressFill.style.width = '0%';
      const serverStart = Number(startTime) || Date.now();
      roundEndsAt = serverStart + (Number(duration) || 0) * 1000;
      startCountdown(duration, serverStart);
      statusDisplay.textContent = 'Ongoing';
      const btns = document.querySelectorAll('.round-btn');
      if (btns[roundIndex]) { btns[roundIndex].disabled = true; btns[roundIndex].classList.add('active'); }
    } catch (err) { console.error(err); }
  });

  socket.on('roundEnded', (data) => {
    try {
      const { roundIndex, leaderboard } = data || {};
      if (typeof roundIndex === 'number') {
        completedRounds.add(roundIndex);
        const btns = document.querySelectorAll('.round-btn');
        if (btns[roundIndex]) { btns[roundIndex].classList.add('completed'); btns[roundIndex].disabled = true; }
      }
      renderFinalRoundResults(data.roundIndex, data.leaderboard);
      stopCountdown();
      startRoundBtn.disabled = true;
      statusDisplay.textContent = 'Ready';
    } catch (err) { console.error(err); }
  });

  socket.on('finalResults', (data) => {
    try {
      renderCompetitionFinalRankings(data.rankings || []);
      statusDisplay.textContent = 'Completed';
      hide(roundSelector);
    } catch (err) { console.error(err); }
  });

  socket.on('organizer:connected', (d) => {
    // optional ack if server emits
    console.log('organizer connected ack', d);
  });

  socket.on('error', (d) => {
    console.error('socket error event', d);
  });

  socket.on('disconnect', (reason) => {
    console.warn('socket disconnected', reason);
  });
}

// use token from URL if present, else try to use local stored info
function connectSocketUsingSavedTokenOrDefault() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  if (token) {
    // connect with token auth (one-time tokens will be consumed by server)
    connectSocket(token);
    // also attempt to fetch competition id via consume endpoint if you want:
    // optional: POST /api/organizer-token/consume { token } to get competitionId and rehydrate UI
    (async () => {
      try {
        const res = await fetch('/api/organizer-token/consume', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token })
        });
        if (res.ok) {
          const body = await res.json();
          if (body.competitionId) {
            competitionId = String(body.competitionId);
            competitionCode = body.competitionCode || competitionCode;
            saveLocal({ competitionId, competitionCode, competitionName: body.name || null, createdAt: Date.now() });
            // fetch canonical competition data
            await fetchCompetitionByCode(competitionCode);
          }
        } else {
          console.warn('token consume failed');
        }
      } catch (err) { console.error('consume token error', err); }
    })();
  } else {
    // no token in url: try rehydrate from localStorage
    const saved = loadLocal();
    if (saved && saved.competitionCode) {
      competitionId = saved.competitionId;
      competitionCode = saved.competitionCode;
      compNameDisplay.textContent = saved.competitionName || compNameDisplay.textContent;
      // fetch server metadata and join socket normally
      (async () => {
        await fetchCompetitionByCode(competitionCode);
        // connect socket (no token) and then emit organizerJoin
        connectSocket();
        if (socket && socket.connected) {
          socket.emit('organizerJoin', { competitionId, code: competitionCode });
        }
      })();
    }
  }
}

// fetch competition metadata
async function fetchCompetitionByCode(code) {
  if (!code) return;
  try {
    const res = await fetch(`/api/competitions/${encodeURIComponent(code)}`);
    if (!res.ok) {
      console.warn('Could not fetch competition by code');
      return;
    }
    const data = await res.json();
    compNameDisplay.textContent = data.name || compNameDisplay.textContent;
    participantCountDisplay.textContent = data.totalParticipants ?? '0';
    participantCountText.textContent = `👥 ${data.totalParticipants ?? 0} participant(s)`;
    statusDisplay.textContent = data.status || statusDisplay.textContent;
    // if server returns rounds, use them; else keep client rounds
    if (Array.isArray(data.rounds) && data.rounds.length) {
      rounds = data.rounds.map(r => ({ roundNumber: r.roundNumber, text: r.text, duration: r.duration }));
      renderRoundsEditor();
      renderRoundButtons();
    } else {
      renderRoundButtons();
    }
  } catch (err) { console.error('fetch competition error', err); }
}

// leaderboards rendering
function renderLiveLeaderboard(data) {
  const roundIndex = data.roundIndex;
  const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
  leaderboardContainer.innerHTML = `
    <h4 style="margin-top:6px">🏁 Live Round ${Number(roundIndex || 0) + 1}</h4>
    <div>${lb.map((item, idx) => `
      <div class="leaderboard-item" aria-label="rank-${idx+1}">
        <div><strong>#${idx+1}</strong> ${escapeHtml(item.name || "Anonymous")}</div>
        <div style="min-width:220px; text-align:right;">
          <small>WPM: <strong>${Number(item.wpm || 0)}</strong></small>
          <small style="margin-left:8px">Acc: ${Number(item.accuracy || 0)}%</small>
          <small style="margin-left:8px">Prog: ${Number(item.progress || 0)}%</small>
        </div>
      </div>
    `).join("")}</div>
  `;
}

function renderFinalRoundResults(roundIndex, leaderboard) {
  const lb = Array.isArray(leaderboard) ? leaderboard : [];
  leaderboardContainer.innerHTML = `
    <h4 style="margin-top:6px">✅ Round ${Number(roundIndex || 0) + 1} - Final Results</h4>
    <div>${lb.map((item, idx) => `
      <div class="leaderboard-item" aria-label="final-rank-${idx+1}">
        <div><strong>#${idx+1}</strong> ${escapeHtml(item.name || "Anonymous")}</div>
        <div style="text-align:right;">
          <small>WPM: <strong>${Number(item.wpm || 0)}</strong></small>
          <small style="margin-left:8px">Acc: ${Number(item.accuracy || 0)}%</small>
        </div>
      </div>
    `).join("")}</div>
  `;
}

function renderCompetitionFinalRankings(rankings) {
  leaderboardContainer.innerHTML = `
    <h4 style="margin-top:6px">🏆 Final Rankings</h4>
    <div>${rankings.map((r, idx) => `
      <div class="leaderboard-item final-rank" aria-label="winner-${idx+1}">
        <div><strong>${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "#" + (idx+1)}</strong> ${escapeHtml(r.participantName || "Anonymous")}</div>
        <div style="text-align:right;">
          <small>Avg WPM: <strong>${Number(r.averageWpm || 0)}</strong></small>
          <small style="margin-left:8px">Avg Acc: ${Number(r.averageAccuracy || 0)}%</small>
        </div>
      </div>
    `).join("")}</div>
  `;
}

// countdown helpers
function startCountdown(duration, serverStart = Date.now()) {
  stopCountdown();
  function tick() {
    const now = Date.now();
    const remainingMs = Math.max(0, roundEndsAt - now);
    const remainingSec = Math.ceil(remainingMs / 1000);
    roundTimerEl.textContent = String(remainingSec);
    const progress = Math.min(100, Math.round(((duration * 1000 - remainingMs) / (duration * 1000)) * 100));
    progressFill.style.width = progress + '%';
    if (remainingMs <= 0) {
      stopCountdown();
      hide(roundStatus);
    }
  }
  tick();
  roundTimerInterval = setInterval(tick, 250);
}

function stopCountdown() {
  if (roundTimerInterval) { clearInterval(roundTimerInterval); roundTimerInterval = null; roundEndsAt = null; }
}

// on load: try rehydrate or token-based join
(async function init() {
  // if token param present, attempt connect with token
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  if (token) {
    // connect socket with token handshake
    connectSocket(token);
    // optionally consume token via REST to get compId and rehydrate UI
    try {
      const res = await fetch('/api/organizer-token/consume', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token })
      });
      if (res.ok) {
        const body = await res.json();
        if (body.competitionId) {
          competitionId = String(body.competitionId);
          competitionCode = body.competitionCode || competitionCode;
          saveLocal({ competitionId, competitionCode, competitionName: body.name || null, createdAt: Date.now() });
          await fetchCompetitionByCode(competitionCode);
          show(codeDisplay); show(compInfo); show(roundSelector);
          if (competitionCode) codeValue.textContent = competitionCode;
        }
      } else {
        console.warn('token consume failed');
      }
    } catch (err) { console.error('consume error', err); }
    return;
  }

  // else try localStorage
  const saved = loadLocal();
  if (saved && saved.competitionCode) {
    competitionId = saved.competitionId;
    competitionCode = saved.competitionCode;
    compNameDisplay.textContent = saved.competitionName || compNameDisplay.textContent;
    await fetchCompetitionByCode(competitionCode);
    // show UI as created
    show(codeDisplay); show(compInfo); show(roundSelector);
    if (competitionCode) codeValue.textContent = competitionCode;
    // connect socket without token; then emit organizerJoin
    connectSocket();
    if (socket && socket.connected) socket.emit('organizerJoin', { competitionId, code: competitionCode });
  }
})();

// expose a copyCode function for inline onclick compatibility
async function copyCode() {
  if (!competitionCode) return;
  try { await navigator.clipboard.writeText(competitionCode); alert('Copied'); } catch { alert('Code: ' + competitionCode); }
}
window.copyCode = copyCode;

// export nothing else
