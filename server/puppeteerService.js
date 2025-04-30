const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Path to the message status file
const statusFile = path.join(__dirname, 'messageStatus.json');

// Function to load or initialize the message status file
function loadMessageStatus() {
  if (!fs.existsSync(statusFile)) {
    fs.writeFileSync(statusFile, JSON.stringify([], null, 2)); // Initialize as an empty array if the file does not exist
  }
  return JSON.parse(fs.readFileSync(statusFile, 'utf8'));
}

// Function to update the status of the message for the given phone number
function updateStatus(phone, newStatus) {
  const data = loadMessageStatus();
  const index = data.findIndex(entry => entry.phone === phone);
  if (index !== -1) {
    data[index].status = newStatus;
  } else {
    data.push({ phone, status: newStatus }); // Add a new entry if it doesn't exist
  }
  fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));
}

// Function to send messages using Puppeteer
async function startSendingMessages(messages) {
  // Set executable path using environment variable or fallback to Puppeteer default
  const executablePath =
    process.env.PUPPETEER_EXEC_PATH || '/opt/render/.cache/puppeteer/chrome/linux-135.0.7049.114/chrome-linux64/chrome';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
      executablePath, // Use the specified Chrome executable
    });

    const page = await browser.newPage();

    // Automatically handle any alerts or dialogs
    page.on('dialog', async dialog => {
      console.log('Alert:', dialog.message());
      await dialog.accept();
    });

    // Navigate to WhatsApp Web
    console.log('🟡 Opening WhatsApp Web...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });

    // Wait for the QR code to disappear, indicating login is complete
    console.log('🟡 Waiting for QR code scan...');
    await page.waitForSelector('div[role="grid"]', { timeout: 0 });
    console.log('🟢 Logged in! Starting to send messages...');

    // Loop through each message and send it
    for (const item of messages) {
      const phone = item.Phone?.toString().replace(/[^\d]/g, ''); // Sanitize phone number
      const message = item.Message?.toString();

      // Skip invalid entries
      if (!phone || !message) {
        console.log(`⚠️ Skipping invalid entry: ${JSON.stringify(item)}`);
        updateStatus(phone, 'invalid');
        continue;
      }

      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}&app_absent=0`;

      try {
        // Navigate to the phone-specific WhatsApp message page
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for the message input field to be available
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 20000 });
        console.log(`✏️ Preparing message for ${phone}...`);

        // Click on the input field (focus) and type the message
        await page.focus('div[contenteditable="true"]');

        // Explicitly type the message to avoid duplication
        await page.keyboard.type(message);

        // Wait for and click the "Send" button
        const sendButton = await page.waitForSelector('button[aria-label="Send"]', { timeout: 10000 });
        if (sendButton) {
          await sendButton.click();
          console.log(`✅ Message successfully sent to ${phone}`);
          updateStatus(phone, 'sent');
        } else {
          console.log(`❌ Send button not found for ${phone}`);
          updateStatus(phone, 'failed');
        }
      } catch (err) {
        console.log(`❌ Failed to send message to ${phone}: ${err.message}`);
        updateStatus(phone, 'failed');
      }

      // Wait before processing the next message (to avoid WhatsApp rate limiting)
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3-second delay
    }
  } catch (error) {
    console.error('Critical error during Puppeteer operation:', error);
  } finally {
    // Ensure the browser is closed properly
    if (browser) await browser.close();
    console.log('🔴 Browser closed.');
  }
}

module.exports = { startSendingMessages };
