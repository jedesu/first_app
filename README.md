# first_app

A web app that connects to your Spotify account, pulls your **Liked Songs** and
**Recently Played** tracks, and auto-sorts them into groups by **month** or
**season** — with one click to turn any group into a real Spotify playlist.

## Why

Spotify's Liked Songs is one big flat list. This app groups those songs by the
month/season they were added (and, separately, your recently played tracks by
when you played them), so you can revisit "what was I listening to last winter"
without manually building playlists.

Note: Spotify's API only exposes the date a song was **added** to Liked Songs,
plus a rolling window (~50) of **recently played** tracks — it doesn't expose a
full historical listening log. This app uses both: "date added" grouping for
your whole Liked Songs library, and a recently-played view for actual listening
activity.

## Setup

### 1. Create a Spotify Developer app
1. Go to https://developer.spotify.com/dashboard and log in.
2. Click **Create app**.
3. Set **Redirect URI** to `http://127.0.0.1:8888/callback`.
4. Save, then open the app's settings to copy the **Client ID** and **Client Secret**.

### 2. Configure environment variables
Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
SESSION_SECRET=any_random_string
PORT=8888
```

### 3. Install and run

```bash
npm install
npm start
```

Then open http://127.0.0.1:8888 and click **Connect with Spotify**.

## How it works
- `server.js` — Express server handling Spotify OAuth (Authorization Code flow) and API routes.
- `spotify.js` — Helpers for fetching liked songs / recently played, grouping by month or season, and creating playlists.
- `public/` — Frontend: connect button, source/group-by selectors, grouped song lists, "Make playlist" per group.
