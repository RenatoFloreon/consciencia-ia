import axios from 'axios';
import { log } from '../utils/logger.js';

const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;   // Your WhatsApp Phone Number ID (from Meta)
const WA_TOKEN = process.env.WHATSAPP_TOKEN;         // Your WhatsApp API Bearer token

/**
 * Sends a text message to a WhatsApp user via the WhatsApp Cloud API.
 * @param {string} to - The WhatsApp ID (phone number) of the recipient.
 * @param {string} text - The text content of the message to send.
 */
async function sendText(to, text) {
  const url = `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: text }
  };
  try {
    await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    log('WhatsApp API sendText error:', err.response?.data || err.message);
    // We choose to throw so the caller can handle errors if needed
    throw err;
  }
}

/**
 * Splits a long text message into an array of smaller messages, each not exceeding maxLength characters.
 * Tries to split at paragraph boundaries if possible.
 * @param {string} message - The full text message to split.
 * @param {number} maxLength - Maximum allowed length of each message chunk.
 * @returns {string[]} - Array of message parts.
 */
function splitMessage(message, maxLength) {
  if (!message || message.length <= maxLength) {
    return [ message ];
  }
  const parts = [];
  const paragraphs = message.split(/\n\s*\n/);  // split on blank lines (paragraph breaks)
  let currentPart = '';
  for (const para of paragraphs) {
    if (currentPart.length + para.length + 2 < maxLength) {
      // +2 for the two newlines we'll add if concatenating paragraphs
      currentPart += (currentPart ? '\n\n' : '') + para;
    } else {
      if (currentPart) {
        parts.push(currentPart);
        currentPart = '';
      }
      if (para.length <= maxLength) {
        // Start a new part with this paragraph
        currentPart = para;
      } else {
        // If a single paragraph is still too long, split it by sentences or chunks
        let chunk = '';
        const words = para.split(' ');
        for (const word of words) {
          if (chunk.length + word.length + 1 < maxLength) {
            chunk += (chunk ? ' ' : '') + word;
          } else {
            parts.push(chunk);
            chunk = word;
          }
        }
        if (chunk) parts.push(chunk);
        currentPart = '';
      }
    }
  }
  if (currentPart) {
    parts.push(currentPart);
  }
  return parts;
}

export default { sendText, splitMessage };
