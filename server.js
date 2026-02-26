const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || '';
let db = null;

async function connectDB() {
  if (!MONGO_URI) {
    console.error('ERROR: MONGODB_URI environment variable is not set!');
    process.exit(1);
  }
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('clinic_attendance');
  console.log('Connected to MongoDB');

  // Initialize default data if empty
  const usersCount = await db.collection('users').countDocuments();
  if (usersCount === 0) {
    await db.collection('users').insertOne({ name: 'Admin', role: 'admin', password: 'admin123' });
  }
  const settingsCount = await db.collection('settings').countDocuments();
  if (settingsCount === 0) {
    await db.collection('settings').insertOne({ key: 'gps', lat: null, lng: null, radius: 200 });
  }
}

// Increase JSON limit for base64 photos
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper: get all data ──
async function getAllData() {
  const users = await db.collection('users').find({}, { projection: { _id: 0 } }).toArray();
  const records = await db.collection('records').find({}, { projection: { _id: 0 } }).toArray();
  const gpsDoc = await db.collection('settings').findOne({ key: 'gps' });
  const gps = gpsDoc ? { lat: gpsDoc.lat, lng: gpsDoc.lng, radius: gpsDoc.radius } : { lat: null, lng: null, radius: 200 };
  return { users, records, gps };
}

// ── API Routes ──

// Get all data
app.get('/api/data', async (req, res) => {
  try { res.json(await getAllData()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Update users (full replace)
app.post('/api/users', async (req, res) => {
  try {
    await db.collection('users').deleteMany({});
    if (req.body.users.length > 0) {
      await db.collection('users').insertMany(req.body.users);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clock in (with optional photo)
app.post('/api/clockin', async (req, res) => {
  try {
    const { name, time, date, photo } = req.body;
    const existing = await db.collection('records').findOne({ name, date });
    if (existing && existing.clockIn) {
      return res.json({ ok: false, msg: 'Already clocked in today.' });
    }

    // Store photo as base64 in a separate collection to keep records clean
    let photoId = null;
    if (photo) {
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
      photoId = `${date}_${safeName}`;
      await db.collection('photos').updateOne(
        { photoId },
        { $set: { photoId, data: photo } },
        { upsert: true }
      );
    }

    if (existing) {
      await db.collection('records').updateOne({ name, date }, { $set: { clockIn: time, photo: photoId } });
    } else {
      await db.collection('records').insertOne({ name, date, clockIn: time, clockOut: null, signatures: {}, photo: photoId });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clock out
app.post('/api/clockout', async (req, res) => {
  try {
    const { name, time, date } = req.body;
    const rec = await db.collection('records').findOne({ name, date });
    if (!rec || !rec.clockIn) {
      return res.json({ ok: false, msg: 'Not clocked in.' });
    }
    await db.collection('records').updateOne({ name, date }, { $set: { clockOut: time } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Staff sign off
app.post('/api/sign', async (req, res) => {
  try {
    const { date, internName, dept, staffName, time } = req.body;
    const rec = await db.collection('records').findOne({ name: internName, date });
    if (!rec) return res.json({ ok: false, msg: 'Record not found.' });
    const sigKey = `signatures.${dept}`;
    await db.collection('records').updateOne(
      { name: internName, date },
      { $set: { [sigKey]: { by: staffName, time } } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save GPS settings
app.post('/api/gps', async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    await db.collection('settings').updateOne(
      { key: 'gps' },
      { $set: { lat, lng, radius } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve photos
app.get('/api/photo/:photoId', async (req, res) => {
  try {
    const doc = await db.collection('photos').findOne({ photoId: req.params.photoId });
    if (!doc) return res.status(404).send('Photo not found');
    // Convert base64 data URI to buffer
    const base64Data = doc.data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    res.set('Content-Type', 'image/jpeg');
    res.send(buffer);
  } catch (e) { res.status(500).send('Error'); }
});

// Delete a record
app.post('/api/delete-record', async (req, res) => {
  try {
    const { name, date } = req.body;
    const rec = await db.collection('records').findOne({ name, date });
    if (rec && rec.photo) {
      await db.collection('photos').deleteOne({ photoId: rec.photo });
    }
    await db.collection('records').deleteOne({ name, date });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset all data
app.post('/api/reset', async (req, res) => {
  try {
    await db.collection('users').deleteMany({});
    await db.collection('records').deleteMany({});
    await db.collection('photos').deleteMany({});
    await db.collection('users').insertOne({ name: 'Admin', role: 'admin', password: 'admin123' });
    await db.collection('settings').updateOne(
      { key: 'gps' },
      { $set: { lat: null, lng: null, radius: 200 } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Start server after DB connects
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Clinic Attendance running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
