import Redis from 'ioredis';
import { log } from '../utils/logger.js';

// Initialize Redis client if REDIS_URL is provided; otherwise use in-memory store
const redisUrl = process.env.REDIS_URL;
let redisClient;
if (redisUrl) {
  redisClient = new Redis(redisUrl);
  redisClient.on('error', err => log('Redis error:', err));
}

// Fallback in-memory session store (for development or if Redis is unavailable)
const localSessions = new Map();

/**
 * Retrieve the session data for a given user (phone number).
 */
async function getSession(userId) {
  if (redisClient) {
    try {
      const data = await redisClient.get(`session:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      log('Redis GET error:', err);
      return null;
    }
  } else {
    return localSessions.get(userId) || null;
  }
}

/**
 * Save or update the session data for a given user.
 */
async function saveSession(userId, sessionData) {
  if (redisClient) {
    try {
      // Set session with an expiration (e.g., 6 hours) to avoid stale data lingering
      await redisClient.set(`session:${userId}`, JSON.stringify(sessionData), 'EX', 21600);
    } catch (err) {
      log('Redis SET error:', err);
    }
  } else {
    localSessions.set(userId, sessionData);
  }
}

/**
 * Delete the session for a given user (e.g., when conversation ends).
 */
async function deleteSession(userId) {
  if (redisClient) {
    try {
      await redisClient.del(`session:${userId}`);
    } catch (err) {
      log('Redis DEL error:', err);
    }
  } else {
    localSessions.delete(userId);
  }
}

/**
 * List all active sessions (for admin/debug purposes).
 * Returns an array of { id, session } objects.
 */
async function listSessions() {
  const sessions = [];
  if (redisClient) {
    try {
      const keys = await redisClient.keys('session:*');
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          sessions.push({
            id: key.replace(/^session:/, ''),
            session: JSON.parse(data)
          });
        }
      }
    } catch (err) {
      log('Redis listSessions error:', err);
      // Return what we have so far (or empty) even if an error occurs
    }
  } else {
    for (const [id, sess] of localSessions.entries()) {
      sessions.push({ id, session: sess });
    }
  }
  return sessions;
}

export default { getSession, saveSession, deleteSession, listSessions };
