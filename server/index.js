const express = require('express');
const multer = require('multer');
const cors = require('cors');
const XLSX = require('xlsx');
const fs = require('fs').promises;
const path = require('path');
const puppeteerService = require('./puppeteerService');
require('dotenv').config();

const PASSWORD = 1234;
const app = express();
const port = 5000;
let isRunning = false;

// Setup file upload
const upload = multer({ dest: 'uploads/' });

// CORS setup
app.use(cors({
  origin: 'https://whats-6mlh.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Serve QR code image and other static files
app.use('/static', express.static(path.join(__dirname)));

// Route to serve QR code directly
app.get('/qr', (req, res) => {
  const qrPath = path.join(__dirname, 'qr-code.png');
  res.sendFile(qrPath);
});

// Health check route
app.get('/api/status', (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// Send WhatsApp messages from uploaded Excel
app.post('/api/send-messages', upload.single('file'), async (req, res) => {
  const filePath = req.file.path;
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const messages = XLSX.utils.sheet_to_json(sheet);

  // Save initial status
  const initialStatus = messages.map(item => ({
    phone: item.Phone?.toString().replace(/[^\d]/g, ''),
    message: item.Message,
    status: 'pending'
  }));

  try {
    await fs.writeFile('messageStatus.json', JSON.stringify(initialStatus, null, 2));
  } catch (err) {
    console.error('❌ Error writing status file:', err.message);
    return res.status(500).json({ error: 'Failed to write status file.' });
  }

  isRunning = true;

  puppeteerService.startSendingMessages(messages)
    .then(() => {
      isRunning = false;
      console.log('✅ All messages sent.');
    })
    .catch(err => {
      console.error('❌ Messaging failed:', err.message);
      isRunning = false;
    });

  res.json({ status: 'started' });
});

// Login endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password == PASSWORD) {
    res.status(200).json({ message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid password' });
  }
});

// Reset logs
app.post('/api/reset', async (req, res) => {
  try {
    await fs.writeFile('messageStatus.json', JSON.stringify([], null, 2));
    isRunning = false;
    res.status(200).json({ message: 'Logs reset successfully' });
  } catch (err) {
    console.error('❌ Error resetting logs:', err.message);
    res.status(500).json({ error: 'Failed to reset logs.' });
  }
});

// Fetch message status
app.get('/api/message-status', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile('messageStatus.json', 'utf8'));
    res.json(data);
  } catch (err) {
    console.error('❌ Error reading status file:', err.message);
    res.status(500).json({ error: 'Could not read status log.' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
