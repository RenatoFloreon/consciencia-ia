import Redis from 'ioredis';
import { log } from '../utils/logger.js';

// Configuração do cliente Redis
// Prioriza Upstash Redis para melhor compatibilidade com Vercel Serverless
const redisUrl = process.env.STORAGE_URL || process.env.REDIS_URL;
let redisClient = null;
let redisConnected = false;

// Fallback para armazenamento em memória (para desenvolvimento ou se Redis estiver indisponível)
const localSessions = new Map();

// Inicializa o cliente Redis com tratamento de erros aprimorado
function initRedisClient() {
  if (!redisUrl) {
    log('Redis URL não configurada, usando armazenamento local');
    return null;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1, // Reduzido para falhar mais rápido
      connectTimeout: 5000, // Timeout de conexão reduzido
      retryStrategy: (times) => {
        if (times > 2) {
          // Após 3 tentativas, desiste de tentar reconectar
          log('Redis - Máximo de tentativas de reconexão atingido, usando armazenamento local');
          redisConnected = false;
          return null;
        }
        const delay = Math.min(times * 100, 1000);
        return delay;
      }
    });
    
    client.on('error', err => {
      log('Redis connection error:', err);
      redisConnected = false;
    });
    
    client.on('connect', () => {
      log('Redis connected successfully');
      redisConnected = true;
    });

    client.on('reconnecting', () => {
      log('Redis tentando reconectar...');
    });

    // Teste de conexão inicial
    client.ping().then(() => {
      redisConnected = true;
      log('Redis ping successful');
    }).catch(err => {
      redisConnected = false;
      log('Redis ping failed, using local storage:', err);
    });
    
    return client;
  } catch (err) {
    log('Redis initialization error:', err);
    return null;
  }
}

// Inicializa o cliente Redis
try {
  redisClient = initRedisClient();
} catch (err) {
  log('Erro ao inicializar Redis, usando armazenamento local:', err);
  redisClient = null;
}

/**
 * Recupera os dados da sessão para um determinado usuário (número de telefone).
 * @param {string} userId - ID do usuário (número de telefone)
 * @returns {Promise<Object|null>} - Dados da sessão ou null se não existir
 */
async function getSession(userId) {
  if (!userId) return null;
  
  // Verifica se o Redis está conectado
  if (redisClient && redisConnected) {
    try {
      const data = await redisClient.get(`session:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      log('Redis GET error:', err);
      // Fallback para armazenamento local em caso de erro
      return localSessions.get(userId) || null;
    }
  } else {
    // Usa armazenamento local se Redis não estiver disponível
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
  
  // Sempre salva localmente como backup
  localSessions.set(userId, sessionData);
  
  // Verifica se o Redis está conectado
  if (redisClient && redisConnected) {
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
      // Já salvou localmente, então retorna true
      return true;
    }
  } else {
    // Já salvou localmente, então retorna true
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
  
  // Sempre remove do armazenamento local
  localSessions.delete(userId);
  
  // Verifica se o Redis está conectado
  if (redisClient && redisConnected) {
    try {
      await redisClient.del(`session:${userId}`);
      return true;
    } catch (err) {
      log('Redis DEL error:', err);
      // Já removeu localmente, então retorna true
      return true;
    }
  } else {
    // Já removeu localmente, então retorna true
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
  
  // Primeiro, obtém as sessões locais
  for (const [id, sess] of localSessions.entries()) {
    sessions.push({ 
      id, 
      session: sess,
      lastUpdated: sess.lastUpdated || 0,
      source: 'local'
    });
  }
  
  // Verifica se o Redis está conectado
  if (redisClient && redisConnected) {
    try {
      const keys = await redisClient.keys('session:*');
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          try {
            const sessionData = JSON.parse(data);
            const userId = key.replace(/^session:/, '');
            
            // Verifica se já existe na lista local
            const existingIndex = sessions.findIndex(s => s.id === userId);
            
            if (existingIndex >= 0) {
              // Atualiza a sessão existente se a do Redis for mais recente
              if (sessionData.lastUpdated > sessions[existingIndex].lastUpdated) {
                sessions[existingIndex] = {
                  id: userId,
                  session: sessionData,
                  lastUpdated: sessionData.lastUpdated || 0,
                  source: 'redis'
                };
              }
            } else {
              // Adiciona nova sessão
              sessions.push({
                id: userId,
                session: sessionData,
                lastUpdated: sessionData.lastUpdated || 0,
                source: 'redis'
              });
            }
          } catch (parseErr) {
            log('Erro ao analisar dados da sessão:', parseErr);
          }
        }
      }
    } catch (err) {
      log('Redis listSessions error:', err);
      // Continua com as sessões locais
    }
  }
  
  // Ordena por timestamp de atualização (mais recente primeiro)
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
  
  return sessions;
}

// Função para verificar a conexão com o Redis
async function checkRedisConnection() {
  if (!redisClient) {
    return false;
  }
  
  try {
    await redisClient.ping();
    redisConnected = true;
    return true;
  } catch (err) {
    redisConnected = false;
    log('Redis check connection failed:', err);
    return false;
  }
}

// Exporta as funções
export default { 
  getSession, 
  saveSession, 
  deleteSession, 
  listSessions,
  checkRedisConnection,
  isRedisConnected: () => redisConnected
};
