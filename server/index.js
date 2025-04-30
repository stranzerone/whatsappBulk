const express = require('express');
const multer = require('multer');
const cors = require('cors');
const XLSX = require('xlsx');
const fs = require('fs').promises; // Use fs.promises for async file operations
const puppeteerService = require('./puppeteerService');
const PASSWORD = 1234
const app = express();
const port = 5000;
let isRunning = false;

const upload = multer({ dest: 'uploads/' });

app.use(cors({
  origin: 'https://whats-6mlh.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
require('dotenv').config();
// Check if the Puppeteer job is running
app.get('/api/status', (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// Upload Excel and initiate WhatsApp messaging
app.post('/api/send-messages', upload.single('file'), async (req, res) => {
  const filePath = req.file.path;
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const messages = XLSX.utils.sheet_to_json(sheet);

  // Initialize the status JSON with "pending"
  const initialStatus = messages.map(item => ({
    phone: item.Phone?.toString().replace(/[^\d]/g, ''),
    message: item.Message,
    status: 'pending'
  }));

  // Use asynchronous file writing to avoid blocking the event loop
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

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password == PASSWORD) {
    res.status(200).json({ message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid password' });
  }
});

// API to reset all logs and clear message status
app.post('/api/reset', async (req, res) => {
  try {
    // Clear the message status file
    await fs.writeFile('messageStatus.json', JSON.stringify([], null, 2)); // Empty array

    // Reset the isRunning flag and other server-side data if necessary
    isRunning = false;

    res.status(200).json({ message: 'Logs reset successfully' });
  } catch (err) {
    console.error('❌ Error resetting logs:', err.message);
    res.status(500).json({ error: 'Failed to reset logs.' });
  }
});


// API to get real-time status
app.get('/api/message-status', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile('messageStatus.json', 'utf8')); // Use async read
    res.json(data);
  } catch (err) {
    console.error('❌ Error reading status file:', err.message);
    res.status(500).json({ error: 'Could not read status log.' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
