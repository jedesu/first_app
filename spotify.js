const fetch = require('node-fetch');

const SEASON_BY_MONTH = [
  'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
  'Summer', 'Summer', 'Fall', 'Fall', 'Fall', 'Winter'
];

function monthLabel(date) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function seasonLabel(date) {
  return `${SEASON_BY_MONTH[date.getMonth()]} ${date.getFullYear()}`;
}

async function apiFetch(url, accessToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getAllLikedSongs(accessToken) {
  const tracks = [];
  let url = 'https://api.spotify.com/v1/me/tracks?limit=50';
  while (url) {
    const data = await apiFetch(url, accessToken);
    for (const item of data.items) {
      tracks.push({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map(a => a.name).join(', '),
        addedAt: new Date(item.added_at),
        uri: item.track.uri
      });
    }
    url = data.next;
  }
  return tracks;
}

async function getRecentlyPlayed(accessToken) {
  const data = await apiFetch(
    'https://api.spotify.com/v1/me/player/recently-played?limit=50',
    accessToken
  );
  return data.items.map(item => ({
    id: item.track.id,
    name: item.track.name,
    artists: item.track.artists.map(a => a.name).join(', '),
    playedAt: new Date(item.played_at),
    uri: item.track.uri
  }));
}

function groupByBucket(tracks, dateField, groupBy) {
  const labelFn = groupBy === 'season' ? seasonLabel : monthLabel;
  const groups = new Map();
  for (const track of tracks) {
    const label = labelFn(track[dateField]);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(track);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, tracks: items }));
}

async function getMe(accessToken) {
  return apiFetch('https://api.spotify.com/v1/me', accessToken);
}

async function createPlaylist(accessToken, userId, name, description) {
  return apiFetch(`https://api.spotify.com/v1/users/${userId}/playlists`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false })
  });
}

async function addTracksToPlaylist(accessToken, playlistId, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await apiFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk })
    });
  }
}

module.exports = {
  getAllLikedSongs,
  getRecentlyPlayed,
  groupByBucket,
  getMe,
  createPlaylist,
  addTracksToPlaylist
};
