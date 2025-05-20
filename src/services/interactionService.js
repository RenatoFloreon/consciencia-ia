import { log } from '../utils/logger.js';

/**
 * Serviço para armazenar e recuperar interações dos usuários
 * Utiliza Redis para persistência temporária
 */

import Redis from 'ioredis';

// Configuração do cliente Redis
const redisUrl = process.env.REDIS_URL;
let redisClient;

if (redisUrl) {
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    });
    
    redisClient.on('error', err => {
      log('Redis interaction service error:', err);
    });
  } catch (err) {
    log('Redis interaction service initialization error:', err);
  }
}

// Fallback para armazenamento em memória
const localInteractions = [];
const MAX_LOCAL_INTERACTIONS = 100; // Limite para evitar consumo excessivo de memória

/**
 * Salva uma interação no Redis ou armazenamento local
 * @param {Object} interactionData - Dados da interação
 * @returns {Promise<boolean>} - Status de sucesso da operação
 */
async function saveInteraction(interactionData) {
  if (!interactionData) return false;
  
  // Adiciona timestamp se não existir
  if (!interactionData.timestamp) {
    interactionData.timestamp = Date.now();
  }
  
  // Gera um ID único para a interação
  const interactionId = `interaction:${Date.now()}:${Math.random().toString(36).substring(2, 10)}`;
  
  if (redisClient) {
    try {
      // Salva a interação no Redis com TTL de 30 dias
      await redisClient.set(
        interactionId,
        JSON.stringify(interactionData),
        'EX',
        2592000 // 30 dias em segundos
      );
      
      // Adiciona à lista de interações para facilitar listagem
      await redisClient.lpush('interactions:list', interactionId);
      await redisClient.ltrim('interactions:list', 0, 999); // Mantém apenas as 1000 interações mais recentes
      
      return true;
    } catch (err) {
      log('Redis saveInteraction error:', err);
      
      // Fallback para armazenamento local
      if (localInteractions.length >= MAX_LOCAL_INTERACTIONS) {
        localInteractions.shift(); // Remove a interação mais antiga
      }
      localInteractions.push({
        id: interactionId,
        data: interactionData
      });
      
      return true;
    }
  } else {
    // Armazenamento local
    if (localInteractions.length >= MAX_LOCAL_INTERACTIONS) {
      localInteractions.shift(); // Remove a interação mais antiga
    }
    localInteractions.push({
      id: interactionId,
      data: interactionData
    });
    
    return true;
  }
}

/**
 * Lista todas as interações armazenadas
 * @param {number} limit - Número máximo de interações a retornar
 * @returns {Promise<Array>} - Array de objetos de interação
 */
async function listInteractions(limit = 100) {
  const interactions = [];
  
  if (redisClient) {
    try {
      // Obtém os IDs das interações mais recentes
      const interactionIds = await redisClient.lrange('interactions:list', 0, limit - 1);
      
      // Obtém os dados de cada interação
      for (const id of interactionIds) {
        const data = await redisClient.get(id);
        if (data) {
          try {
            const interactionData = JSON.parse(data);
            interactions.push({
              id: id.replace(/^interaction:/, ''),
              ...interactionData
            });
          } catch (err) {
            log('Error parsing interaction data:', err);
          }
        }
      }
    } catch (err) {
      log('Redis listInteractions error:', err);
      
      // Fallback para interações locais
      return localInteractions.slice(0, limit).map(item => ({
        id: item.id.replace(/^interaction:/, ''),
        ...item.data
      }));
    }
  } else {
    // Retorna interações locais
    return localInteractions.slice(0, limit).map(item => ({
      id: item.id.replace(/^interaction:/, ''),
      ...item.data
    }));
  }
  
  return interactions;
}

/**
 * Obtém estatísticas das interações
 * @returns {Promise<Object>} - Objeto com estatísticas
 */
async function getInteractionStats() {
  const stats = {
    total: 0,
    completed: 0,
    error: 0,
    avgProcessingTime: 0,
    lastInteraction: null
  };
  
  const interactions = await listInteractions(1000);
  
  if (interactions.length > 0) {
    stats.total = interactions.length;
    stats.completed = interactions.filter(i => i.status === 'completed').length;
    stats.error = interactions.filter(i => i.status === 'error').length;
    
    // Calcula tempo médio de processamento
    const processingTimes = interactions
      .filter(i => i.processingTime)
      .map(i => i.processingTime);
      
    if (processingTimes.length > 0) {
      stats.avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
    }
    
    // Obtém a interação mais recente
    stats.lastInteraction = interactions.sort((a, b) => b.timestamp - a.timestamp)[0];
  }
  
  return stats;
}

export default { saveInteraction, listInteractions, getInteractionStats };
