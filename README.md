# first_app

A web app that uses your webcam to detect hand gestures (swipe left/right, double tap)
and controls Spotify playback — even while you're on a different tab.

## Status
Early scaffold — in progress.

## How it will work
- Hand tracking runs in the browser using MediaPipe Hands (via a Picture-in-Picture window so it keeps running while you use other tabs).
- Detected gestures (swipe left, swipe right, double tap) map to playback actions.
- Actions are sent to Spotify via the Spotify Web API (play/pause/next/previous), so control works regardless of which tab has focus.

## Setup
See `docs/spotify-setup.md` (coming soon) for connecting a Spotify Developer app.
