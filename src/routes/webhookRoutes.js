import express from 'express';
import conversationController from '../controllers/conversationController.js';
import whatsappService from '../services/whatsappService.js';

const router = express.Router();

// GET /webhook - Verification endpoint for WhatsApp webhook setup
router.get('/', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'verify-token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook verified successfully.');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// POST /webhook - Receive incoming WhatsApp messages
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    // Check that the webhook event is from WhatsApp
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;
      if (messages && messages[0]) {
        const message = messages[0];
        const from = message.from;                     // User's WhatsApp ID (phone number)
        const text = message.text?.body || '';         // Text of the message
        if (text) {
          // Process the incoming message through the conversation controller
          const responseMessages = await conversationController.handleIncomingMessage(from, text);
          // Send each response message via WhatsApp API
          for (const msg of responseMessages) {
            await whatsappService.sendText(from, msg);
          }
        }
      }
    }
    // Respond to WhatsApp that we received the message (status 200 OK)
    res.sendStatus(200);
  } catch (err) {
    console.error('Error handling /webhook POST:', err);
    res.sendStatus(500);
  }
});

export default router;
