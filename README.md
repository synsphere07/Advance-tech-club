# Advanced Tech Club - Code in Air Quiz

A Mentimeter-style real-time quiz for Advanced Tech Club events.

## Features

- Host/admin screen with live QR code
- Phone-friendly participant join page
- Participants enter a name and receive an animal avatar
- Host-controlled 5-second countdown before each question
- 10 Code in Air questions and correct answers built in
- 15-second answer timer
- Speed-based scoring
- Per-question result screen on the host display
- Colorful live leaderboard with points bars
- No database required for a single quiz session

## Run Locally

1. Install Node.js 20 or newer.
2. Open a terminal in this folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm start
   ```

5. Open the host screen:

   ```text
   http://localhost:3000/
   ```

6. Participants join from:

   ```text
   http://localhost:3000/join.html
   ```

## Use On The Same Wi-Fi

For an event in one room, the host laptop and participant phones must be on the same Wi-Fi network.

Open the host page using the laptop LAN IP instead of `localhost`, for example:

```text
http://192.168.1.10:3000/
```

The QR code will then point phones to:

```text
http://192.168.1.10:3000/join.html
```

## Deploy To Render

This app is a Node.js + Express + Socket.IO server, so it must be deployed as a web service, not a static site.

1. Push this folder to a GitHub repository.
2. In Render, create a new Web Service from that repository.
3. Use these settings if Render does not detect `render.yaml` automatically:

   ```text
   Runtime: Node
   Build Command: npm ci
   Start Command: npm start
   Health Check Path: /healthz
   ```

4. After deploy, open the Render URL as the host screen.
5. The QR code on the host screen will automatically use the deployed HTTPS URL.

## Deployment Files

- `render.yaml` - Render Blueprint configuration
- `Procfile` - Heroku/Railway-style process command
- `Dockerfile` - Container deployment option
- `.gitignore` - Keeps `node_modules` and local files out of deploys

## Project Structure

```text
advanced-tech-club-quiz/
├── public/
│   ├── index.html
│   ├── join.html
│   ├── styles.css
│   └── atc-logo.jpg.jpeg
├── Dockerfile
├── Procfile
├── package.json
├── render.yaml
└── server.js
```
