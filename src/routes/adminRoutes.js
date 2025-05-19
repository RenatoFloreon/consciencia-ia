import express from 'express';
import sessionService from '../services/sessionService.js';

const router = express.Router();

// GET /admin/sessions - List all active sessions (for debugging/monitoring)
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await sessionService.listSessions();
    return res.json(sessions);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    return res.status(500).send('Failed to retrieve sessions.');
  }
});

// GET /admin/health - Simple health check endpoint
router.get('/health', (req, res) => {
  res.send('OK');
});

export default router;
