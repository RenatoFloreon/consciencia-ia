/**
 * Serviço de integração entre o app principal e o painel administrativo
 * Garante que as interações do usuário sejam salvas no formato correto para visualização no dashboard
 */

import { log } from '../utils/logger.js';
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
      log('Redis dashboard integration service error:', err);
    });
  } catch (err) {
    log('Redis dashboard integration service initialization error:', err);
  }
}

/**
 * Salva uma interação de usuário no formato compatível com o painel administrativo
 * @param {Object} sessionData - Dados da sessão do usuário
 * @returns {Promise<boolean>} - Status de sucesso da operação
 */
async function saveInteractionFromSession(sessionData) {
  if (!sessionData || !sessionData.phoneNumber) {
    log('Dados de sessão inválidos para salvar interação');
    return false;
  }
  
  try {
    // Formata os dados da sessão no formato esperado pelo painel
    const interactionData = {
      // Dados básicos
      phoneNumber: sessionData.phoneNumber,
      name: sessionData.name || 'Não informado',
      timestamp: Date.now(),
      startTimestamp: sessionData.startTimestamp || Date.now(),
      endTimestamp: Date.now(),
      
      // Dados do perfil
      profileUrl: sessionData.profileUrl || '',
      inputType: sessionData.inputType || 'text',
      imageUrl: sessionData.imageUrl || '',
      
      // Dados da carta
      mainChallenge: sessionData.challenge || 'Não informado',
      letterContent: sessionData.letterContent || '',
      
      // Status da interação
      status: sessionData.letterContent ? 'completed' : 'error',
      
      // Métricas
      processingTime: sessionData.startTimestamp ? 
        (Date.now() - sessionData.startTimestamp) / 1000 : 0
    };
    
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
        
        log(`Interação salva com sucesso para o painel: ${sessionData.phoneNumber}`);
        return true;
      } catch (err) {
        log('Erro ao salvar interação para o painel:', err);
        return false;
      }
    } else {
      log('Redis não disponível para salvar interação para o painel');
      return false;
    }
  } catch (error) {
    log('Erro ao processar dados para o painel:', error);
    return false;
  }
}

export default { saveInteractionFromSession };
