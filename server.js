require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const spotify = require('./spotify');

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SESSION_SECRET,
  PORT = 8888
} = process.env;

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false
}));

const SCOPES = [
  'user-library-read',
  'user-read-recently-played',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public'
].join(' ');

app.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.state = state;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!state || state !== req.session.state) {
    return res.status(400).send('State mismatch.');
  }
  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));
    req.session.accessToken = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Login failed.');
  }
});

function requireAuth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Not logged in' });
  next();
}

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const me = await spotify.getMe(req.session.accessToken);
    res.json({ id: me.id, name: me.display_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/liked-by-bucket', requireAuth, async (req, res) => {
  const groupBy = req.query.groupBy === 'season' ? 'season' : 'month';
  try {
    const tracks = await spotify.getAllLikedSongs(req.session.accessToken);
    const groups = spotify.groupByBucket(tracks, 'addedAt', groupBy);
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recent-by-bucket', requireAuth, async (req, res) => {
  try {
    const tracks = await spotify.getRecentlyPlayed(req.session.accessToken);
    // Recently Played only ever covers the last ~50 plays (usually a day or two),
    // so splitting it by month/season just produces one oddly-labeled bucket.
    // Show it as a single flat group instead.
    const dedupedTracks = spotify.dedupeTracks(tracks);
    const groups = dedupedTracks.length > 0
      ? [{ label: 'Recently Played', tracks: dedupedTracks }]
      : [];
    const overallTopPlayed = spotify.topPlayedByCount(tracks, 20);
    res.json({ groups, overallTopPlayed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/playlists', requireAuth, async (req, res) => {
  try {
    const playlists = await spotify.getUserPlaylists(req.session.accessToken);
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/add-to-playlist', requireAuth, async (req, res) => {
  const { playlistId, uris } = req.body;
  if (!playlistId || !Array.isArray(uris) || uris.length === 0) {
    return res.status(400).json({ error: 'playlistId and uris are required' });
  }
  try {
    const existingUris = await spotify.getPlaylistTrackUris(req.session.accessToken, playlistId);
    const newUris = uris.filter(uri => !existingUris.has(uri));
    if (newUris.length > 0) {
      await spotify.addTracksToPlaylist(req.session.accessToken, playlistId, newUris);
    }
    res.json({ ok: true, added: newUris.length, skipped: uris.length - newUris.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-playlist', requireAuth, async (req, res) => {
  const { label, uris } = req.body;
  if (!label || !Array.isArray(uris) || uris.length === 0) {
    return res.status(400).json({ error: 'label and uris are required' });
  }
  try {
    const playlist = await spotify.createPlaylist(
      req.session.accessToken,
      label,
      `Made with Playlist Grouper`
    );
    await spotify.addTracksToPlaylist(req.session.accessToken, playlist.id, uris);
    res.json({ playlistUrl: playlist.external_urls.spotify });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`first_app listening on http://127.0.0.1:${PORT}`);
});
