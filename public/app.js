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
const selectionCreateBtn = document.getElementById('selection-create-btn');
const selectionClearBtn = document.getElementById('selection-clear-btn');
const selectionResultEl = document.getElementById('selection-result');

// uri -> { name, artists, date }
const selectedTracks = new Map();

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

// Splits a month's tracks into calendar-week buckets (days 1-7, 8-14, 15-21, 22-28, 29-31)
function splitIntoWeeks(tracks) {
  const weeks = new Map();
  tracks.forEach(t => {
    const date = new Date(t.addedAt || t.playedAt);
    const dayOfMonth = date.getDate();
    const weekIndex = Math.floor((dayOfMonth - 1) / 7); // 0-4
    if (!weeks.has(weekIndex)) weeks.set(weekIndex, []);
    weeks.get(weekIndex).push(t);
  });
  return Array.from(weeks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([weekIndex, weekTracks]) => {
      const startDay = weekIndex * 7 + 1;
      const endDay = Math.min(startDay + 6, 31);
      return { label: `Week ${weekIndex + 1} (${startDay}–${endDay})`, tracks: weekTracks };
    });
}

function customGroupHtml(group) {
  const weeks = splitIntoWeeks(group.tracks);
  return weeks.map(week => `
    <div class="week-block">
      <div class="week-header">
        <label class="track-row">
          <input type="checkbox" class="week-select-all" />
          <strong>${escapeHtml(week.label)}</strong> <span class="artist">(${week.tracks.length})</span>
        </label>
      </div>
      <ul>${week.tracks.map(t => trackCheckboxHtml(t)).join('')}</ul>
    </div>
  `).join('');
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

function renderGroups(groups) {
  groupsEl.innerHTML = '';
  const custom = isCustomMode();
  // groups already arrive sorted most-recent-first from the server
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <h3>
        <span class="month-heading">
          ${custom ? '<input type="checkbox" class="month-select-all" />' : ''}
          <span>${escapeHtml(group.label)} (${group.tracks.length})</span>
        </span>
        ${custom ? '' : '<button class="make-playlist-btn">Make playlist from this group</button>'}
      </h3>
      ${custom ? customGroupHtml(group) : trackListHtml(group.tracks)}
      <div class="result"></div>
    `;

    if (custom) {
      card.querySelectorAll('.track-checkbox').forEach(bindTrackCheckbox);

      card.querySelectorAll('.week-block').forEach(weekBlock => {
        const weekCheckboxes = Array.from(weekBlock.querySelectorAll('.track-checkbox'));
        const weekSelectAll = weekBlock.querySelector('.week-select-all');
        weekSelectAll.addEventListener('change', () => {
          weekCheckboxes.forEach(cb => {
            if (cb.checked !== weekSelectAll.checked) {
              cb.checked = weekSelectAll.checked;
              cb.dispatchEvent(new Event('change'));
            }
          });
        });
      });

      const monthSelectAll = card.querySelector('.month-select-all');
      const allMonthCheckboxes = Array.from(card.querySelectorAll('.track-checkbox'));
      monthSelectAll.addEventListener('change', () => {
        allMonthCheckboxes.forEach(cb => {
          if (cb.checked !== monthSelectAll.checked) {
            cb.checked = monthSelectAll.checked;
            cb.dispatchEvent(new Event('change'));
          }
        });
        card.querySelectorAll('.week-select-all').forEach(wsa => { wsa.checked = monthSelectAll.checked; });
      });
    } else {
      const btn = card.querySelector('.make-playlist-btn');
      const resultDiv = card.querySelector('.result');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          const playlistUrl = await createPlaylist(group.label, group.tracks.map(t => t.uri));
          resultDiv.innerHTML = `<a class="playlist-link" href="${playlistUrl}" target="_blank">Open playlist ↗</a>`;
          btn.remove();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Make playlist from this group';
          resultDiv.textContent = `Error: ${err.message}`;
        }
      });
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
  selectionCreateBtn.textContent = 'Creating...';
  selectionResultEl.textContent = '';
  try {
    const uris = Array.from(selectedTracks.entries())
      .sort((a, b) => new Date(a[1].date) - new Date(b[1].date))
      .map(([uri]) => uri);
    const playlistUrl = await createPlaylist(name, uris);
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
    renderGroups(data.groups);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

checkLogin();
