const fs = require('fs');
const path = require('path');

let statusList = [];

function updateStatus(phone, status, reason = '') {
  statusList.push({ phone, status, reason });
  fs.writeFileSync('messageStatus.json', JSON.stringify(statusList, null, 2));
}

async function startSendingMessages(messages) {
  for (const item of messages) {
    const phone = item.Phone?.toString().replace(/[^\d]/g, '');
    const message = item.Message?.toString();

    if (!phone || !message) {
      updateStatus(phone || 'N/A', 'invalid', 'Missing phone or message');
      continue;
    }

    try {
      // Your puppeteer logic here (simplified)
      await sendWhatsAppMessage(phone, message);
      updateStatus(phone, 'sent');
    } catch (err) {
      updateStatus(phone, 'failed', err.message);
    }
  }
}

module.exports = { startSendingMessages };
