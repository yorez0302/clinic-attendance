const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '.data', 'db.json');
const PHOTOS_DIR = path.join(__dirname, '.data', 'photos');

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, '.data'))) {
  fs.mkdirSync(path.join(__dirname, '.data'), { recursive: true });
}
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

// Default data
const DEFAULT_DATA = {
  users: [{ name: 'Admin', role: 'admin', password: 'admin123' }],
  records: [],
  gps: { lat: null, lng: null, radius: 200 }
};

function readDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('DB read error:', e); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Init DB if not exists
if (!fs.existsSync(DATA_FILE)) writeDB(DEFAULT_DATA);

// Increase JSON limit for base64 photos
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──

// Get all data
app.get('/api/data', (req, res) => {
  res.json(readDB());
});

// Update users
app.post('/api/users', (req, res) => {
  const db = readDB();
  db.users = req.body.users;
  writeDB(db);
  res.json({ ok: true });
});

// Clock in (with photo)
app.post('/api/clockin', (req, res) => {
  const { name, time, date, photo } = req.body;
  const db = readDB();
  const existing = db.records.find(r => r.name === name && r.date === date);
  if (existing && existing.clockIn) {
    return res.json({ ok: false, msg: 'Already clocked in today.' });
  }

  // Save photo if provided
  let photoFile = null;
  if (photo) {
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
    photoFile = `${date}_${safeName}.jpg`;
    const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(PHOTOS_DIR, photoFile), base64Data, 'base64');
  }

  if (existing) {
    existing.clockIn = time;
    existing.photo = photoFile;
  } else {
    db.records.push({ name, date, clockIn: time, clockOut: null, signatures: {}, photo: photoFile });
  }
  writeDB(db);
  res.json({ ok: true });
});

// Clock out
app.post('/api/clockout', (req, res) => {
  const { name, time, date } = req.body;
  const db = readDB();
  const rec = db.records.find(r => r.name === name && r.date === date);
  if (!rec || !rec.clockIn) {
    return res.json({ ok: false, msg: 'Not clocked in.' });
  }
  rec.clockOut = time;
  writeDB(db);
  res.json({ ok: true });
});

// Staff sign off
app.post('/api/sign', (req, res) => {
  const { date, internName, dept, staffName, time } = req.body;
  const db = readDB();
  const rec = db.records.find(r => r.name === internName && r.date === date);
  if (!rec) return res.json({ ok: false, msg: 'Record not found.' });
  if (!rec.signatures) rec.signatures = {};
  rec.signatures[dept] = { by: staffName, time };
  writeDB(db);
  res.json({ ok: true });
});

// Save GPS settings
app.post('/api/gps', (req, res) => {
  const db = readDB();
  db.gps = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// Serve photos
app.get('/api/photo/:filename', (req, res) => {
  const filePath = path.join(PHOTOS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Photo not found');
  }
});

// Delete a record
app.post('/api/delete-record', (req, res) => {
  const { name, date } = req.body;
  const db = readDB();
  // Also delete photo file
  const rec = db.records.find(r => r.name === name && r.date === date);
  if (rec && rec.photo) {
    const photoPath = path.join(PHOTOS_DIR, rec.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }
  db.records = db.records.filter(r => !(r.name === name && r.date === date));
  writeDB(db);
  res.json({ ok: true });
});

// Reset all data
app.post('/api/reset', (req, res) => {
  writeDB(JSON.parse(JSON.stringify(DEFAULT_DATA)));
  // Clear all photos
  if (fs.existsSync(PHOTOS_DIR)) {
    fs.readdirSync(PHOTOS_DIR).forEach(f => fs.unlinkSync(path.join(PHOTOS_DIR, f)));
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Clinic Attendance running on port ${PORT}`);
});
