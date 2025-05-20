import axios from 'axios';
import { log } from '../utils/logger.js';

const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WA_TOKEN = process.env.WHATSAPP_TOKEN;

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
  }
}

/**
 * Splits a long message into smaller chunks (WhatsApp limit ~1600 chars per message).
 * @param {string} message - The message text to split.
 * @param {number} maxLength - Maximum length per chunk.
 * @returns {string[]} Array of message parts.
 */
function splitMessage(message, maxLength) {
  const parts = [];
  let str = message;
  while (str.length > maxLength) {
    parts.push(str.slice(0, maxLength));
    str = str.slice(maxLength);
  }
  parts.push(str);
  return parts;
}

/**
 * Fetches the direct URL of a media file (image) from WhatsApp API using the media ID.
 * @param {string} mediaId - The ID of the media to fetch.
 * @returns {Promise<{ url: string, mimeType: string }|null>} Object with URL and MIME type, or null on failure.
 */
async function fetchMediaUrl(mediaId) {
  try {
    const mediaRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
      params: { access_token: WA_TOKEN }
    });
    const mediaData = mediaRes.data;
    if (mediaData.url) {
      return { url: mediaData.url, mimeType: mediaData.mime_type || null };
    }
    return null;
  } catch (err) {
    log('WhatsApp API fetchMediaUrl error:', err.response?.data || err.message);
    return null;
  }
}

export default { sendText, splitMessage, fetchMediaUrl };
