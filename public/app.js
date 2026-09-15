const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const whoEl = document.getElementById('who');
const statusEl = document.getElementById('status');
const groupsEl = document.getElementById('groups');
const loadBtn = document.getElementById('loadBtn');
const sourceSelect = document.getElementById('source');
const groupBySelect = document.getElementById('groupBy');

const groupSelectionBar = document.getElementById('group-selection-bar');
const groupSelectionCountEl = document.getElementById('group-selection-count');
const groupSelectionTargetSelect = document.getElementById('group-selection-target');
const groupSelectionNameInput = document.getElementById('group-selection-name');
const groupSelectionCreateBtn = document.getElementById('group-selection-create-btn');
const groupSelectionClearBtn = document.getElementById('group-selection-clear-btn');
const groupSelectionResultEl = document.getElementById('group-selection-result');

// Existing playlists the user can add songs to, fetched once after login.
let userPlaylists = [];

// label -> group, for groups checked to be combined into one playlist via the bottom bar.
const selectedGroups = new Map();

function updateGroupSelectionBar() {
  const count = selectedGroups.size;
  groupSelectionBar.hidden = count === 0;
  const songCount = Array.from(selectedGroups.values()).reduce((n, g) => n + g.tracks.length, 0);
  groupSelectionCountEl.textContent = `${count} group${count === 1 ? '' : 's'} selected (${songCount} song${songCount === 1 ? '' : 's'})`;
}

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

// select + a name field (used only when "+ New playlist" is chosen) so users can
// rename the playlist before creating it.
function playlistTargetControlsHtml(selectCls, nameCls, placeholder) {
  return `
    ${playlistTargetSelectHtml(selectCls)}
    <input type="text" class="playlist-name-input ${nameCls}" placeholder="${escapeHtml(placeholder)}" />
  `;
}

function playlistIdFromUrl(url) {
  const m = url.match(/playlist\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// Adds uris to an existing playlist (if playlistId is set) or creates a new one.
// Returns { url, message } — for an existing playlist, songs already in it are skipped
// server-side and message notes how many were added vs. skipped.
async function addTracksToTarget(playlistId, label, uris) {
  if (!playlistId) {
    const url = await createPlaylist(label, uris);
    return { url, message: null };
  }
  const res = await fetch('/api/add-to-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId, uris })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  const playlist = userPlaylists.find(p => p.id === playlistId);
  const url = playlist ? playlist.url : `https://open.spotify.com/playlist/${playlistId}`;
  const message = data.skipped > 0
    ? `Added ${data.added}, skipped ${data.skipped} already in playlist`
    : `Added ${data.added}`;
  return { url, message };
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

function trackListHtml(tracks) {
  return `<ul>${tracks.map(t => `<li><div class="track-row"><span>${escapeHtml(t.name)} <span class="artist">— ${escapeHtml(t.artists)}</span></span></div></li>`).join('')}</ul>`;
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
          ${playlistTargetControlsHtml('overall-top-played-target', 'overall-top-played-name', 'Overall Top Played')}
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
  const nameInput = card.querySelector('.overall-top-played-name');
  const resultDiv = card.querySelector('.overall-top-played-result');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Adding...';
    try {
      const label = nameInput.value.trim() || 'Overall Top Played';
      const { url, message } = await addTracksToTarget(select.value, label, overallTopPlayed.map(t => t.uri));
      // Left active (not removed) — the top-played list changes over time, so the
      // user can reload and add again later without re-adding songs already there.
      resultDiv.innerHTML = `<a class="playlist-link" href="${url}" target="_blank">Open playlist ↗</a>${message ? ` <span class="artist">— ${escapeHtml(message)}</span>` : ''}`;
      // Point future clicks (and other groups' dropdowns) at the playlist just used.
      const newId = !select.value ? playlistIdFromUrl(url) : select.value;
      if (newId) {
        await loadUserPlaylists();
        select.value = newId;
      }
    } catch (err) {
      resultDiv.textContent = `Error: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add overall top played';
    }
  });
}

function renderGroups(groups, showTopPlayed, overallTopPlayed) {
  groupsEl.innerHTML = '';

  if (showTopPlayed && overallTopPlayed && overallTopPlayed.length > 0) {
    groupsEl.insertAdjacentHTML('beforeend', overallTopPlayedCardHtml(overallTopPlayed));
    bindOverallTopPlayedCard(overallTopPlayed);
  }

  // groups already arrive sorted most-recent-first from the server
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <h3>
        <span class="month-heading">
          <input type="checkbox" class="group-select-checkbox" ${selectedGroups.has(group.label) ? 'checked' : ''} title="Select this group to combine with others below" />
          <span>${escapeHtml(group.label)} (${group.tracks.length})</span>
        </span>
        <span class="playlist-action">${playlistTargetControlsHtml('group-target', 'group-name', `${group.label} — auto-sorted`)}<button class="make-playlist-btn">Add this group</button></span>
      </h3>
      ${trackListHtml(group.tracks)}
      <div class="result"></div>
    `;

    const groupCheckbox = card.querySelector('.group-select-checkbox');
    groupCheckbox.addEventListener('change', () => {
      if (groupCheckbox.checked) {
        selectedGroups.set(group.label, group);
      } else {
        selectedGroups.delete(group.label);
      }
      updateGroupSelectionBar();
    });

    const btn = card.querySelector('.make-playlist-btn');
    const select = card.querySelector('.group-target');
    const nameInput = card.querySelector('.group-name');
    const resultDiv = card.querySelector('.result');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Adding...';
      try {
        const label = nameInput.value.trim() || `${group.label} — auto-sorted`;
        const { url, message } = await addTracksToTarget(select.value, label, group.tracks.map(t => t.uri));
        resultDiv.innerHTML = `<a class="playlist-link" href="${url}" target="_blank">Open playlist ↗</a>${message ? ` <span class="artist">— ${escapeHtml(message)}</span>` : ''}`;
        // Left active — lets you keep adding other groups into this same playlist.
        const newId = !select.value ? playlistIdFromUrl(url) : select.value;
        if (newId) {
          await loadUserPlaylists();
          select.value = newId;
        }
      } catch (err) {
        resultDiv.textContent = `Error: ${err.message}`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Add this group';
      }
    });

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

groupSelectionCreateBtn.addEventListener('click', async () => {
  if (selectedGroups.size === 0) return;
  const groupsList = Array.from(selectedGroups.values());
  const defaultName = groupsList.map(g => g.label).join(' + ');
  const name = groupSelectionNameInput.value.trim() || defaultName;
  groupSelectionCreateBtn.disabled = true;
  groupSelectionCreateBtn.textContent = groupSelectionTargetSelect.value ? 'Adding...' : 'Creating...';
  groupSelectionResultEl.textContent = '';
  try {
    const seen = new Set();
    const uris = [];
    for (const g of groupsList) {
      for (const t of g.tracks) {
        if (!seen.has(t.uri)) {
          seen.add(t.uri);
          uris.push(t.uri);
        }
      }
    }
    const { url, message } = await addTracksToTarget(groupSelectionTargetSelect.value, name, uris);
    groupSelectionResultEl.innerHTML = `<a class="playlist-link" href="${url}" target="_blank">Open playlist ↗</a>${message ? ` — ${escapeHtml(message)}` : ''}`;
    selectedGroups.clear();
    document.querySelectorAll('.group-select-checkbox').forEach(cb => { cb.checked = false; });
    updateGroupSelectionBar();
    groupSelectionNameInput.value = '';
    // Point future selections at the playlist just used.
    const newId = !groupSelectionTargetSelect.value ? playlistIdFromUrl(url) : groupSelectionTargetSelect.value;
    if (newId) {
      await loadUserPlaylists();
      groupSelectionTargetSelect.value = newId;
    }
  } catch (err) {
    groupSelectionResultEl.textContent = `Error: ${err.message}`;
  } finally {
    groupSelectionCreateBtn.disabled = false;
    groupSelectionCreateBtn.textContent = 'Create playlist';
  }
});

groupSelectionClearBtn.addEventListener('click', () => {
  selectedGroups.clear();
  document.querySelectorAll('.group-select-checkbox').forEach(cb => { cb.checked = false; });
  groupSelectionResultEl.textContent = '';
  updateGroupSelectionBar();
});

// Recently Played only ever returns ~50 tracks, so splitting them by month/season
// mostly just makes one group — disable Group By there to avoid the false impression
// that it's doing something meaningful.
function updateGroupByAvailability() {
  const isRecent = sourceSelect.value === 'recent';
  groupBySelect.disabled = isRecent;
  if (isRecent) groupBySelect.value = 'month';
}
sourceSelect.addEventListener('change', updateGroupByAvailability);
updateGroupByAvailability();

loadBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Loading your songs from Spotify...';
  groupsEl.innerHTML = '';
  selectedGroups.clear();
  updateGroupSelectionBar();
  const source = sourceSelect.value;
  const groupBy = groupBySelect.value;
  const endpoint = source === 'recent' ? '/api/recent-by-bucket' : '/api/liked-by-bucket';
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
