const puppeteer = require('puppeteer'); // Use full puppeteer
const fs = require('fs');
const path = require('path');

// Path to message status file
const statusFile = path.join(__dirname, 'messageStatus.json');

// Function to update the status of the message for the given phone number
function updateStatus(phone, newStatus) {
  const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  const index = data.findIndex(entry => entry.phone === phone);
  if (index !== -1) {
    data[index].status = newStatus;
    fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));
  }
}

// Function to send messages using Puppeteer
async function startSendingMessages(messages) {
  // Launch browser with headless mode (use `false` for debugging, `true` for production)
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ],
    executablePath: puppeteer.executablePath()  // ✅ Ensures bundled Chrome is used
  });
  
  
  const page = await browser.newPage();

  // Automatically accept dialogs (useful for confirmation prompts)
  page.on('dialog', async dialog => {
    console.log('Alert:', dialog.message());
    await dialog.accept();
  });

  // Navigate to WhatsApp Web
  await page.goto('https://web.whatsapp.com');
  console.log('🟡 Scan QR code to login...');

  // Wait for the grid to appear (this means the user is logged in)
  await page.waitForSelector('div[role="grid"]', { timeout: 0 });
  console.log('🟢 Logged in! Starting message dispatch...');

  // Loop through each message and send it
  for (const item of messages) {
    const phone = item.Phone?.toString().replace(/[^\d]/g, ''); // Sanitize phone number (remove non-digits)
    const message = item.Message?.toString();

    // Skip invalid rows
    if (!phone || !message) {
      console.log(`⚠️ Skipping invalid row: ${JSON.stringify(item)}`);
      updateStatus(phone, 'failed');
      continue;
    }

    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}&app_absent=0`;

    try {
      // Navigate to the specific phone number's WhatsApp URL
      await page.goto(url);
      // Wait for the message input field to be available
      await page.waitForSelector('div[contenteditable="true"]', { timeout: 20000 });
      await page.focus('div[contenteditable="true"]');
      await page.keyboard.type(message);

      // Wait for and click the "Send" button
      const sendButton = await page.waitForSelector('button[aria-label="Send"]', { timeout: 10000 });
      if (sendButton) {
        await page.evaluate(button => button.click(), sendButton);
        console.log(`✅ Message sent to ${phone}`);
        updateStatus(phone, 'sent');
      } else {
        console.log(`❌ Send button not found for ${phone}`);
        updateStatus(phone, 'failed');
      }
    } catch (err) {
      console.log(`❌ Failed to send to ${phone}: ${err.message}`);
      updateStatus(phone, 'failed');
    }

    // Wait before sending the next message to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3-second delay
  }

  // Close the browser after all messages are sent
  await browser.close();
}

module.exports = { startSendingMessages };
