const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Path to message status file
const statusFile = path.join(__dirname, 'messageStatus.json');

// Function to initialize or load the message status file
function loadMessageStatus() {
  if (!fs.existsSync(statusFile)) {
    fs.writeFileSync(statusFile, JSON.stringify([], null, 2));
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
    data.push({ phone, status: newStatus }); // Add new entry if not found
  }
  fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));
}

// Function to send messages using Puppeteer
async function startSendingMessages(messages) {
  let browser;
  try {
    // Launch Puppeteer with the correct executable path
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    

    const page = await browser.newPage();

    // Automatically handle alerts/dialogs
    page.on('dialog', async dialog => {
      console.log('Alert:', dialog.message());
      await dialog.accept();
    });

    // Navigate to WhatsApp Web
    await page.goto('https://web.whatsapp.com');
    console.log('🟡 Opening WhatsApp Web...');
    
    // Wait for the QR code canvas to appear
    try {
      await page.waitForSelector('canvas', { timeout: 60000 });
      const qrPath = path.join(__dirname, 'qr-code.png');
      await page.screenshot({ path: qrPath });
      console.log('🟢 QR code screenshot saved at:', qrPath);
    } catch (err) {
      console.log('❌ QR code not found:', err.message);
    }
    
    // Wait for the QR code to disappear, indicating successful login
    console.log('🟡 Waiting for QR code scan...');
    await page.waitForSelector('div[role="grid"]', { timeout: 0 });
    console.log('🟢 Logged in! Starting to send messages...');

    // Loop through messages
    for (const item of messages) {
      const phone = item.Phone?.toString().replace(/[^\d]/g, ''); // Sanitize phone number
      const message = item.Message?.toString();

      if (!phone || !message) {
        console.log(`⚠️ Invalid row: ${JSON.stringify(item)}`);
        updateStatus(phone, 'invalid');
        continue;
      }

      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}&app_absent=0`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for the input field
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 20000 });
        console.log(`✏️ Preparing message for ${phone}...`);

        // Focus and type the message
        await page.focus('div[contenteditable="true"]');
        await page.keyboard.type(message);

        // Find and click the send button
        const sendButton = await page.waitForSelector('button[aria-label="Send"]', { timeout: 10000 });
        if (sendButton) {
          await sendButton.click();
          console.log(`✅ Message sent to ${phone}`);
          updateStatus(phone, 'sent');
        } else {
          console.log(`❌ Send button not found for ${phone}`);
          updateStatus(phone, 'failed');
        }
      } catch (error) {
        console.log(`❌ Error sending message to ${phone}: ${error.message}`);
        updateStatus(phone, 'failed');
      }

      // Add a delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3-second delay
    }
  } catch (error) {
    console.error('Critical error during Puppeteer operation:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔴 Browser closed.');
    }
  }
}

module.exports = { startSendingMessages };
