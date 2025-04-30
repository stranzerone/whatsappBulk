const puppeteer = require('puppeteer'); // Use full puppeteer
const fs = require('fs');
const path = require('path');

const statusFile = path.join(__dirname, 'messageStatus.json');

function updateStatus(phone, newStatus) {
  const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  const index = data.findIndex(entry => entry.phone === phone);
  if (index !== -1) {
    data[index].status = newStatus;
    fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));
  }
}

async function startSendingMessages(messages) {
  const browser = await puppeteer.launch({
    headless: true, // use false only for local testing
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  });

  const page = await browser.newPage();

  page.on('dialog', async dialog => {
    console.log('Alert:', dialog.message());
    await dialog.accept();
  });

  await page.goto('https://web.whatsapp.com');
  console.log('🟡 Scan QR code to login...');

  await page.waitForSelector('div[role="grid"]', { timeout: 0 });
  console.log('🟢 Logged in! Starting message dispatch...');

  for (const item of messages) {
    const phone = item.Phone?.toString().replace(/[^\d]/g, '');
    const message = item.Message?.toString();

    if (!phone || !message) {
      console.log(`⚠️ Skipping invalid row: ${JSON.stringify(item)}`);
      updateStatus(phone, 'failed');
      continue;
    }

    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}&app_absent=0`;

    try {
      await page.goto(url);
      await page.waitForSelector('div[contenteditable="true"]', { timeout: 20000 });
      await page.focus('div[contenteditable="true"]');
      await page.keyboard.type(message);

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

    await new Promise(resolve => setTimeout(resolve, 3000)); // Delay between sends
  }

  await browser.close();
}

module.exports = { startSendingMessages };
