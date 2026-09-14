const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const whoEl = document.getElementById('who');
const statusEl = document.getElementById('status');
const groupsEl = document.getElementById('groups');
const loadBtn = document.getElementById('loadBtn');
const sourceSelect = document.getElementById('source');
const groupBySelect = document.getElementById('groupBy');

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

function trackListHtml(tracks) {
  return `<ul>${tracks.map(t =>
    `<li>${escapeHtml(t.name)} <span class="artist">— ${escapeHtml(t.artists)}</span></li>`
  ).join('')}</ul>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderGroups(groups) {
  groupsEl.innerHTML = '';
  groups
    .sort((a, b) => b.tracks.length - a.tracks.length)
    .forEach(group => {
      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `
        <h3>
          <span>${escapeHtml(group.label)} (${group.tracks.length})</span>
          <button class="make-playlist-btn">Make playlist</button>
        </h3>
        ${trackListHtml(group.tracks)}
        <div class="result"></div>
      `;
      const btn = card.querySelector('.make-playlist-btn');
      const resultDiv = card.querySelector('.result');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          const res = await fetch('/api/create-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: group.label,
              uris: group.tracks.map(t => t.uri)
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed');
          resultDiv.innerHTML = `<a class="playlist-link" href="${data.playlistUrl}" target="_blank">Open playlist ↗</a>`;
          btn.remove();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Make playlist';
          resultDiv.textContent = `Error: ${err.message}`;
        }
      });
      groupsEl.appendChild(card);
    });
}

loadBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Loading your songs from Spotify...';
  groupsEl.innerHTML = '';
  const source = sourceSelect.value;
  const groupBy = groupBySelect.value;
  const endpoint = source === 'recent' ? '/api/recent-by-bucket' : '/api/liked-by-bucket';
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
