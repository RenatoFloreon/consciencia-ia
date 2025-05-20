import Redis from 'ioredis';
import { log } from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL;
let redisClient;
if (redisUrl) {
  redisClient = new Redis(redisUrl, {
    tls: { rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'false' ? false : true }
  });
  redisClient.on('error', err => log('Redis error:', err));
}

// Fallback in-memory store for interactions (if Redis not configured)
const localInteractions = [];

/**
 * Save a completed interaction record.
 * @param {Object} interaction - The interaction data object to save.
 */
async function saveInteraction(interaction) {
  try {
    if (redisClient) {
      // Store interaction as a JSON string in a Redis list
      await redisClient.rpush('interactions', JSON.stringify(interaction));
    } else {
      localInteractions.push(interaction);
    }
  } catch (err) {
    log('Error saving interaction:', err);
  }
}

/**
 * Retrieve all stored interactions.
 * @returns {Promise<Object[]>} Array of interaction objects.
 */
async function getAllInteractions() {
  try {
    if (redisClient) {
      const data = await redisClient.lrange('interactions', 0, -1);
      return data.map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      }).filter(item => item);
    } else {
      return [...localInteractions];
    }
  } catch (err) {
    log('Error retrieving interactions:', err);
    return [];
  }
}

/**
 * Compute summary statistics from stored interactions.
 * @returns {Promise<Object>} Stats object with totalInteractions, lettersDelivered, profilesAnalyzed, followupQuestions.
 */
async function getStats() {
  const interactions = await getAllInteractions();
  const totalInteractions = interactions.length;
  let lettersDelivered = 0;
  let profilesAnalyzed = 0;
  let followupQuestions = 0;
  interactions.forEach(inter => {
    if (inter.type === 'letter_delivered') {
      lettersDelivered++;
      // Count as profile analyzed if a profile URL or image was provided (i.e., not generic)
      if ((inter.profileUrl && inter.profileUrl !== '') || (inter.imageId && inter.imageId !== '')) {
        profilesAnalyzed++;
      }
    } else if (inter.type === 'followup_question') {
      followupQuestions++;
    }
  });
  return {
    totalInteractions,
    lettersDelivered,
    profilesAnalyzed,
    followupQuestions
  };
}

export default { saveInteraction, getAllInteractions, getStats };
