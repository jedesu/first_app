const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const whoEl = document.getElementById('who');
const statusEl = document.getElementById('status');
const groupsEl = document.getElementById('groups');
const loadBtn = document.getElementById('loadBtn');
const sourceSelect = document.getElementById('source');
const groupBySelect = document.getElementById('groupBy');

const selectionBar = document.getElementById('selection-bar');
const selectionCountEl = document.getElementById('selection-count');
const selectionNameInput = document.getElementById('selection-name');
const selectionTargetSelect = document.getElementById('selection-target');
const selectionCreateBtn = document.getElementById('selection-create-btn');
const selectionClearBtn = document.getElementById('selection-clear-btn');
const selectionResultEl = document.getElementById('selection-result');

// uri -> { name, artists, date }
const selectedTracks = new Map();

// Existing playlists the user can add songs to, fetched once after login.
let userPlaylists = [];

async function loadUserPlaylists() {
  try {
    const res = await fetch('/api/playlists');
    if (!res.ok) return;
    const data = await res.json();
    userPlaylists = data.playlists;
    refreshPlaylistTargetSelects();
  } catch (err) {
    // Non-fatal — "+ New playlist" still works without the existing-playlist list.
  }
}

function playlistTargetOptionsHtml() {
  return `<option value="">+ New playlist</option>${userPlaylists.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}`;
}

function refreshPlaylistTargetSelects() {
  document.querySelectorAll('.playlist-target').forEach(sel => {
    const current = sel.value;
    sel.innerHTML = playlistTargetOptionsHtml();
    sel.value = current;
  });
}

function playlistTargetSelectHtml(cls) {
  return `<select class="playlist-target ${cls}">${playlistTargetOptionsHtml()}</select>`;
}

// Adds uris to an existing playlist (if playlistId is set) or creates a new one, returning its URL.
async function addTracksToTarget(playlistId, label, uris) {
  if (!playlistId) return createPlaylist(label, uris);
  const res = await fetch('/api/add-to-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId, uris })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  const playlist = userPlaylists.find(p => p.id === playlistId);
  return playlist ? playlist.url : `https://open.spotify.com/playlist/${playlistId}`;
}

function isCustomMode() {
  return groupBySelect.value === 'custom';
}

async function checkLogin() {
  const res = await fetch('/api/me');
  if (res.ok) {
    const me = await res.json();
    whoEl.textContent = `Logged in as ${me.name || me.id}`;
    loginSection.hidden = true;
    appSection.hidden = false;
    loadUserPlaylists();
  } else {
    loginSection.hidden = false;
    appSection.hidden = true;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateSelectionBar() {
  const count = selectedTracks.size;
  selectionBar.hidden = !isCustomMode() || count === 0;
  selectionCountEl.textContent = `${count} song${count === 1 ? '' : 's'} selected`;
}

function trackListHtml(tracks) {
  return `<ul>${tracks.map(t => `<li><div class="track-row"><span>${escapeHtml(t.name)} <span class="artist">— ${escapeHtml(t.artists)}</span></span></div></li>`).join('')}</ul>`;
}

function trackCheckboxHtml(t) {
  const date = t.addedAt || t.playedAt || '';
  return `
    <li>
      <label class="track-row">
        <input type="checkbox" class="track-checkbox" data-uri="${escapeHtml(t.uri)}" data-name="${escapeHtml(t.name)}" data-artists="${escapeHtml(t.artists)}" data-date="${escapeHtml(date)}" ${selectedTracks.has(t.uri) ? 'checked' : ''} />
        <span>${escapeHtml(t.name)} <span class="artist">— ${escapeHtml(t.artists)}</span></span>
      </label>
    </li>
  `;
}

function customGroupHtml(group) {
  return `<ul>${group.tracks.map(t => trackCheckboxHtml(t)).join('')}</ul>`;
}

function topPlayedHtml(group) {
  const items = group.topPlayed.map(t => `
    <li><div class="track-row"><span>${escapeHtml(t.name)} <span class="artist">— ${escapeHtml(t.artists)} (${t.count}x)</span></span></div></li>
  `).join('');
  return `
    <div class="top-played">
      <h4>
        Top played
        <span class="playlist-action">
          ${playlistTargetSelectHtml('top-played-target')}
          <button class="make-playlist-btn make-top-playlist-btn">Add top played</button>
        </span>
      </h4>
      <ul>${items}</ul>
      <div class="result top-played-result"></div>
    </div>
  `;
}

function bindTrackCheckbox(cb) {
  cb.addEventListener('change', () => {
    const uri = cb.dataset.uri;
    if (cb.checked) {
      selectedTracks.set(uri, { name: cb.dataset.name, artists: cb.dataset.artists, date: cb.dataset.date });
    } else {
      selectedTracks.delete(uri);
    }
    updateSelectionBar();
  });
}

function overallTopPlayedCardHtml(overallTopPlayed) {
  const items = overallTopPlayed.map(t => `
    <li><div class="track-row"><span>${escapeHtml(t.name)} <span class="artist">— ${escapeHtml(t.artists)} (${t.count}x)</span></span></div></li>
  `).join('');
  return `
    <div class="group-card overall-top-played">
      <h3>
        <span>Overall Top Played <span class="artist">(across all recent plays)</span></span>
        <span class="playlist-action">
          ${playlistTargetSelectHtml('overall-top-played-target')}
          <button class="make-playlist-btn make-overall-top-playlist-btn">Add overall top played</button>
        </span>
      </h3>
      <ul>${items}</ul>
      <div class="result overall-top-played-result"></div>
    </div>
  `;
}

function bindOverallTopPlayedCard(overallTopPlayed) {
  const card = groupsEl.querySelector('.overall-top-played');
  if (!card) return;
  const btn = card.querySelector('.make-overall-top-playlist-btn');
  const select = card.querySelector('.overall-top-played-target');
  const resultDiv = card.querySelector('.overall-top-played-result');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Adding...';
    try {
      const playlistUrl = await addTracksToTarget(select.value, 'Overall Top Played', overallTopPlayed.map(t => t.uri));
      resultDiv.innerHTML = `<a class="playlist-link" href="${playlistUrl}" target="_blank">Open playlist ↗</a>`;
      btn.remove();
      select.remove();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Add overall top played';
      resultDiv.textContent = `Error: ${err.message}`;
    }
  });
}

function renderGroups(groups, showTopPlayed, overallTopPlayed) {
  groupsEl.innerHTML = '';
  const custom = isCustomMode();

  if (showTopPlayed && !custom && overallTopPlayed && overallTopPlayed.length > 0) {
    groupsEl.insertAdjacentHTML('beforeend', overallTopPlayedCardHtml(overallTopPlayed));
    bindOverallTopPlayedCard(overallTopPlayed);
  }

  // groups already arrive sorted most-recent-first from the server
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    const hasTopPlayed = showTopPlayed && !custom && group.topPlayed && group.topPlayed.length > 0;
    card.innerHTML = `
      <h3>
        <span class="month-heading">
          ${custom ? '<input type="checkbox" class="month-select-all" />' : ''}
          <span>${escapeHtml(group.label)} (${group.tracks.length})</span>
        </span>
        ${custom ? '' : `<span class="playlist-action">${playlistTargetSelectHtml('group-target')}<button class="make-playlist-btn">Add this group</button></span>`}
      </h3>
      ${custom ? customGroupHtml(group) : trackListHtml(group.tracks)}
      <div class="result"></div>
      ${hasTopPlayed ? topPlayedHtml(group) : ''}
    `;

    if (custom) {
      card.querySelectorAll('.track-checkbox').forEach(bindTrackCheckbox);

      const monthSelectAll = card.querySelector('.month-select-all');
      const allMonthCheckboxes = Array.from(card.querySelectorAll('.track-checkbox'));
      monthSelectAll.addEventListener('change', () => {
        allMonthCheckboxes.forEach(cb => {
          if (cb.checked !== monthSelectAll.checked) {
            cb.checked = monthSelectAll.checked;
            cb.dispatchEvent(new Event('change'));
          }
        });
      });
    } else {
      const btn = card.querySelector('.make-playlist-btn');
      const select = card.querySelector('.group-target');
      const resultDiv = card.querySelector('.result');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        try {
          const playlistUrl = await addTracksToTarget(select.value, group.label, group.tracks.map(t => t.uri));
          resultDiv.innerHTML = `<a class="playlist-link" href="${playlistUrl}" target="_blank">Open playlist ↗</a>`;
          btn.remove();
          select.remove();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Add this group';
          resultDiv.textContent = `Error: ${err.message}`;
        }
      });

      if (hasTopPlayed) {
        const topBtn = card.querySelector('.make-top-playlist-btn');
        const topSelect = card.querySelector('.top-played-target');
        const topResultDiv = card.querySelector('.top-played-result');
        topBtn.addEventListener('click', async () => {
          topBtn.disabled = true;
          topBtn.textContent = 'Adding...';
          try {
            const playlistUrl = await addTracksToTarget(topSelect.value, `${group.label} — Top Played`, group.topPlayed.map(t => t.uri));
            topResultDiv.innerHTML = `<a class="playlist-link" href="${playlistUrl}" target="_blank">Open playlist ↗</a>`;
            topBtn.remove();
            topSelect.remove();
          } catch (err) {
            topBtn.disabled = false;
            topBtn.textContent = 'Add top played';
            topResultDiv.textContent = `Error: ${err.message}`;
          }
        });
      }
    }
    groupsEl.appendChild(card);
  });
}

async function createPlaylist(label, uris) {
  const res = await fetch('/api/create-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, uris })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data.playlistUrl;
}

selectionCreateBtn.addEventListener('click', async () => {
  if (selectedTracks.size === 0) return;
  const name = selectionNameInput.value.trim() || 'My custom mix';
  selectionCreateBtn.disabled = true;
  selectionCreateBtn.textContent = selectionTargetSelect.value ? 'Adding...' : 'Creating...';
  selectionResultEl.textContent = '';
  try {
    const uris = Array.from(selectedTracks.entries())
      .sort((a, b) => new Date(a[1].date) - new Date(b[1].date))
      .map(([uri]) => uri);
    const playlistUrl = await addTracksToTarget(selectionTargetSelect.value, name, uris);
    selectionResultEl.innerHTML = `<a class="playlist-link" href="${playlistUrl}" target="_blank">Open playlist ↗</a>`;
    selectedTracks.clear();
    document.querySelectorAll('.track-row input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateSelectionBar();
  } catch (err) {
    selectionResultEl.textContent = `Error: ${err.message}`;
  } finally {
    selectionCreateBtn.disabled = false;
    selectionCreateBtn.textContent = 'Create playlist';
  }
});

selectionClearBtn.addEventListener('click', () => {
  selectedTracks.clear();
  document.querySelectorAll('.track-row input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  selectionResultEl.textContent = '';
  updateSelectionBar();
});

loadBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Loading your songs from Spotify...';
  groupsEl.innerHTML = '';
  const source = sourceSelect.value;
  // "custom" isn't a real server-side bucket — browse by month underneath, then pick songs individually
  const groupBy = isCustomMode() ? 'month' : groupBySelect.value;
  const endpoint = source === 'recent' ? '/api/recent-by-bucket' : '/api/liked-by-bucket';
  if (!isCustomMode()) {
    selectedTracks.clear();
    updateSelectionBar();
  }
  try {
    const res = await fetch(`${endpoint}?groupBy=${groupBy}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');
    statusEl.textContent = `Found ${data.groups.reduce((n, g) => n + g.tracks.length, 0)} songs across ${data.groups.length} groups.`;
    renderGroups(data.groups, source === 'recent', data.overallTopPlayed);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

checkLogin();
