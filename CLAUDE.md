# CLAUDE.md — CUSV Clinic Attendance System

## Project Overview

A clinic intern attendance tracking system for CUSV (university veterinary clinic). Interns clock in/out with GPS verification and selfie photos. Staff from four departments verify intern attendance. Admins manage users, view records, and export data.

**Tech stack:** Node.js, Express, MongoDB, vanilla HTML/CSS/JS (no build step, no framework)

**Hosted on:** Glitch (see `glitch.json`)

## Repository Structure

```
clinic-attendance/
├── server.js           # Express backend — all API routes and MongoDB logic
├── index.html          # Root copy of the frontend (not served by Express)
├── public/
│   ├── index.html      # Frontend SPA served by Express (the live version)
│   └── logo.svg        # CUSV logo
├── package.json        # Dependencies: express, mongodb
└── glitch.json         # Glitch hosting config
```

**Important:** There are two copies of `index.html` — the one in `public/` is the version Express actually serves via `express.static`. The root `index.html` is a working copy that may have newer changes. When editing the frontend, update `public/index.html` (the served file). Keep both files in sync if the root copy is used as a staging file.

## Running the Application

```bash
# Requires MONGODB_URI environment variable
export MONGODB_URI="mongodb+srv://..."
npm install
npm start          # runs: node server.js
```

The server starts on `process.env.PORT || 3000`. MongoDB connection is required — the process exits if `MONGODB_URI` is not set.

There is **no test suite, linter, or build step**. The app runs directly with `node server.js`.

## Architecture

### Backend (server.js)

Express server with JSON API. No authentication middleware — login validation happens by matching user/password against the `users` collection on the client side (passwords sent in plaintext from the frontend, compared server-side via the client fetching all users).

**MongoDB database:** `clinic_attendance`

**Collections:**
- `users` — `{ name, role, password }` — roles: `"intern"`, `"admin"`, `"Front Desk"`, `"Supervisor"`, `"Clinic Manager"`, `"Academic Office"`
- `records` — `{ name, date, clockIn, clockOut, signatures: { [dept]: { by, time } }, photo }` — one record per intern per day
- `photos` — `{ photoId, data }` — base64-encoded selfie images, stored separately from records
- `settings` — `{ key: "gps", lat, lng, radius }` — clinic GPS coordinates for geofencing

**API Routes:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/data` | Fetch all users, records, and GPS settings |
| POST | `/api/users` | Replace entire users collection |
| POST | `/api/clockin` | Clock in with optional selfie photo |
| POST | `/api/clockout` | Clock out |
| POST | `/api/sign` | Staff sign-off for a department |
| POST | `/api/gps` | Update GPS geofence settings |
| GET | `/api/photo/:photoId` | Serve a selfie photo as JPEG |
| POST | `/api/delete-record` | Delete a single attendance record |
| POST | `/api/reset` | Reset all data to defaults |

**Default data on first run:** Creates an `Admin` user with password `admin123` and default GPS coordinates if the database is empty.

### Frontend (public/index.html)

Single-file SPA with inline `<style>` and `<script>`. No framework, no external JS/CSS dependencies (except browser APIs). All state is managed in global variables.

**Key globals:**
- `DATA` — `{ users, records, gps }` fetched from `/api/data`
- `CUR` — current logged-in user `{ name, role }`
- `DEPTS` — `['Front Desk', 'Supervisor', 'Clinic Manager', 'Academic Office']`

**Three role-based views after login:**
1. **Intern view** — Clock in/out with live timer, session info, selfie capture, verification status, history table
2. **Staff view** — List of today's clocked-in interns with sign-off buttons for the staff member's department
3. **Admin view** — Tabbed interface: Users (CRUD), Records (filterable table with CSV export), Statistics (per-intern metrics), Settings (GPS geofence config)

**Browser features used:**
- `navigator.geolocation` — GPS geofencing (Haversine distance calculation)
- `navigator.mediaDevices.getUserMedia` — Camera for selfie clock-in
- Canvas API — Photo capture from video stream
- Auto-refresh every 15 seconds for real-time sync

## Conventions and Patterns

### Code Style
- Frontend JS uses terse, minified-style variable names (e.g., `P()` for pad, `E()` for HTML escape, `cH()` for calculate hours, `fH()` for format hours)
- CSS uses CSS custom properties (variables) defined in `:root` with short names (e.g., `--p` for primary, `--ok` for success, `--g50`–`--g900` for grays)
- Functions prefixed with `r` are render/refresh functions (e.g., `rIntern()`, `rStaff()`, `rAdmin()`, `rRecords()`, `rStats()`, `rUsers()`)
- No semicolons are sometimes omitted in chained single-line statements in the frontend

### Data Flow
- All data is fetched via `GET /api/data` which returns the full dataset
- Mutations go through specific POST endpoints, then `reload()` re-fetches everything
- The `POST /api/users` endpoint does a full collection replace (delete all + insert many)

### Date/Time Format
- Dates: `YYYY-MM-DD` string format
- Times: `HH:MM:SS` 24-hour string format
- Both are generated client-side via `todayStr()` and `nowTime()`

## Known Security Considerations

These are existing design decisions in the codebase, not bugs to fix unilaterally:

- Passwords stored in plaintext in MongoDB (no hashing)
- No server-side session/token auth — client fetches all users including passwords via `/api/data`
- GPS verification is client-side only
- No CSRF protection
- No rate limiting on API endpoints

When making changes, do not introduce additional security issues. If adding new endpoints, follow the existing patterns (try/catch with 500 error responses, JSON request/response).

## Development Guidelines

1. **No build step** — edit files directly; changes take effect on server restart
2. **Frontend changes** — edit `public/index.html`; it is a single monolithic file with HTML + CSS + JS
3. **Backend changes** — edit `server.js`; restart the server to apply
4. **Adding new API routes** — follow the existing `app.post`/`app.get` pattern with try/catch error handling
5. **JSON body limit** — set to 10MB to accommodate base64-encoded selfie photos
6. **No external frontend dependencies** — do not add npm packages for frontend use; keep it vanilla
7. **MongoDB queries** — use `{ projection: { _id: 0 } }` when returning data to the client (existing pattern)
