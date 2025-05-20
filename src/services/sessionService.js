import Redis from 'ioredis';
import { log } from '../utils/logger.js';

// Configuração do cliente Redis
// Prioriza Upstash Redis para melhor compatibilidade com Vercel Serverless
const redisUrl = process.env.REDIS_URL;
let redisClient;

if (redisUrl) {
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        // Estratégia de retry com backoff exponencial
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    });
    
    redisClient.on('error', err => {
      log('Redis connection error:', err);
    });
    
    redisClient.on('connect', () => {
      log('Redis connected successfully');
    });
  } catch (err) {
    log('Redis initialization error:', err);
  }
}

// Fallback para armazenamento em memória (para desenvolvimento ou se Redis estiver indisponível)
const localSessions = new Map();

/**
 * Recupera os dados da sessão para um determinado usuário (número de telefone).
 * @param {string} userId - ID do usuário (número de telefone)
 * @returns {Promise<Object|null>} - Dados da sessão ou null se não existir
 */
async function getSession(userId) {
  if (!userId) return null;
  
  if (redisClient) {
    try {
      const data = await redisClient.get(`session:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      log('Redis GET error:', err);
      // Fallback para armazenamento local em caso de erro
      return localSessions.get(userId) || null;
    }
  } else {
    return localSessions.get(userId) || null;
  }
}

/**
 * Salva ou atualiza os dados da sessão para um determinado usuário.
 * @param {string} userId - ID do usuário (número de telefone)
 * @param {Object} sessionData - Dados da sessão a serem salvos
 * @returns {Promise<boolean>} - Status de sucesso da operação
 */
async function saveSession(userId, sessionData) {
  if (!userId || !sessionData) return false;
  
  // Adiciona timestamp de última atualização
  sessionData.lastUpdated = Date.now();
  
  if (redisClient) {
    try {
      // Define sessão com expiração (6 horas) para evitar dados obsoletos
      await redisClient.set(
        `session:${userId}`, 
        JSON.stringify(sessionData), 
        'EX', 
        21600
      );
      return true;
    } catch (err) {
      log('Redis SET error:', err);
      // Fallback para armazenamento local em caso de erro
      localSessions.set(userId, sessionData);
      return true;
    }
  } else {
    localSessions.set(userId, sessionData);
    return true;
  }
}

/**
 * Exclui a sessão para um determinado usuário (por exemplo, quando a conversa termina).
 * @param {string} userId - ID do usuário (número de telefone)
 * @returns {Promise<boolean>} - Status de sucesso da operação
 */
async function deleteSession(userId) {
  if (!userId) return false;
  
  if (redisClient) {
    try {
      await redisClient.del(`session:${userId}`);
      return true;
    } catch (err) {
      log('Redis DEL error:', err);
      // Fallback para armazenamento local em caso de erro
      localSessions.delete(userId);
      return true;
    }
  } else {
    localSessions.delete(userId);
    return true;
  }
}

/**
 * Lista todas as sessões ativas (para fins administrativos/depuração).
 * Retorna um array de objetos { id, session }.
 * @returns {Promise<Array>} - Array de objetos com ID e dados da sessão
 */
async function listSessions() {
  const sessions = [];
  
  if (redisClient) {
    try {
      const keys = await redisClient.keys('session:*');
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          const sessionData = JSON.parse(data);
          sessions.push({
            id: key.replace(/^session:/, ''),
            session: sessionData,
            lastUpdated: sessionData.lastUpdated || 0
          });
        }
      }
      
      // Ordena por timestamp de atualização (mais recente primeiro)
      sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (err) {
      log('Redis listSessions error:', err);
      // Retorna o que temos até agora (ou vazio) mesmo se ocorrer um erro
    }
  } else {
    for (const [id, sess] of localSessions.entries()) {
      sessions.push({ 
        id, 
        session: sess,
        lastUpdated: sess.lastUpdated || 0
      });
    }
    
    // Ordena por timestamp de atualização (mais recente primeiro)
    sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }
  
  return sessions;
}

export default { getSession, saveSession, deleteSession, listSessions };
