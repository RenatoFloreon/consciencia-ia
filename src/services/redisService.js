/**
 * @fileoverview Serviço de integração com Redis para gerenciamento de estado
 * Este módulo fornece funções para interagir com o Redis, gerenciando o estado
 * da conversa e os dados dos usuários.
 */

import Redis from 'ioredis';
import config from '../config/env.js';
import { logInfo, logError, logWarning } from '../utils/logger.js';

// Prefixos para as chaves no Redis
const KEY_PREFIXES = {
    USER_STATE: 'user:state:',
    USER_DATA: 'user:data:',
    USER_THREAD: 'user:thread:',
    INTERACTION_LOG: 'interaction:log:',
    ADMIN_DATA: 'admin:data:'
};

// Estados possíveis da conversa
const CONVERSATION_STATES = {
    NEW: 'NEW',
    AWAITING_NAME: 'AWAITING_NAME',
    AWAITING_EMAIL: 'AWAITING_EMAIL',
    AWAITING_PROFILE: 'AWAITING_PROFILE',
    AWAITING_BUSINESS_CHALLENGE: 'AWAITING_BUSINESS_CHALLENGE',
    AWAITING_PERSONAL_CHALLENGE: 'AWAITING_PERSONAL_CHALLENGE',
    PROCESSING_LETTER: 'PROCESSING_LETTER',
    LETTER_DELIVERED: 'LETTER_DELIVERED',
    CONVERSING: 'CONVERSING'
};

// Inicialização do cliente Redis
let redis;

/**
 * Inicializa a conexão com o Redis
 * @returns {Promise<boolean>} Indica se a inicialização foi bem-sucedida
 */
const initRedis = async () => {
    if (redis) {
        return true; // Já inicializado
    }

    try {
        logInfo('REDIS_INIT', `Tentando inicializar o Redis com a URL: ${config.REDIS_URL.substring(0, config.REDIS_URL.indexOf("://") + 3)}... e REDIS_TLS_REJECT_UNAUTHORIZED: ${config.REDIS_TLS_REJECT_UNAUTHORIZED}`);
        
        const redisOptions = {
            maxRetriesPerRequest: 3,
            connectTimeout: 15000,
            retryStrategy(times) {
                const delay = Math.min(times * 200, 2000);
                logInfo('REDIS_RETRY', `Tentativa de reconexão Redis #${times}. Próxima tentativa em ${delay}ms.`);
                return delay;
            }
        };

        if (config.REDIS_URL.startsWith("rediss://")) {
            redisOptions.tls = {
                rejectUnauthorized: config.REDIS_TLS_REJECT_UNAUTHORIZED,
            };
            logInfo('REDIS_TLS', `Configuração TLS para Redis: ${JSON.stringify(redisOptions.tls)}`);
        } else {
            logInfo('REDIS_NO_TLS', 'Conectando ao Redis sem TLS (URL não começa com rediss://).');
        }

        redis = new Redis(config.REDIS_URL, redisOptions);

        redis.on("connect", () => logInfo('REDIS_EVENT', 'Conectado com sucesso ao Redis!'));
        redis.on("ready", () => logInfo('REDIS_EVENT', 'Cliente Redis pronto para uso.'));
        redis.on("error", (err) => {
            logError('REDIS_EVENT', 'Erro de conexão/operação com o Redis', err);
            if (err.message && (err.message.includes('SSL') || err.message.includes('TLS'))) {
                logError('REDIS_TLS_ERROR', `Detalhes do erro TLS: code=${err.code}, syscall=${err.syscall}, reason=${err.reason}`);
            }
        });
        redis.on("close", () => logWarning('REDIS_EVENT', 'Conexão com o Redis fechada.'));
        redis.on("reconnecting", (delay) => logInfo('REDIS_EVENT', `Tentando reconectar ao Redis... Próxima tentativa em ${delay}ms`));
        redis.on("end", () => logWarning('REDIS_EVENT', 'Conexão com o Redis terminada (não haverá mais reconexões).'));

        // Testar a conexão
        await redis.ping();
        logInfo('REDIS_INIT', 'Conexão com Redis estabelecida e testada com sucesso.');
        return true;
    } catch (error) {
        logError('REDIS_INIT', 'Erro CRÍTICO ao inicializar o cliente Redis', error);
        redis = null;
        return false;
    }
};

/**
 * Obtém o cliente Redis inicializado
 * @returns {Redis} Cliente Redis ou null se não inicializado
 */
const getRedisClient = () => {
    return redis;
};

/**
 * Salva o estado da conversa de um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @param {string} state - Estado da conversa (usar CONVERSATION_STATES)
 * @param {number} expirationHours - Tempo de expiração em horas
 * @returns {Promise<boolean>} Indica se a operação foi bem-sucedida
 */
const saveUserState = async (phoneNumber, state, expirationHours = config.THREAD_EXPIRATION_HOURS) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return false;
            }
        }

        const key = `${KEY_PREFIXES.USER_STATE}${phoneNumber}`;
        await redis.set(key, state, 'EX', expirationHours * 3600);
        logInfo('REDIS_STATE', `Estado do usuário ${phoneNumber} salvo: ${state}`);
        return true;
    } catch (error) {
        logError('REDIS_STATE', `Erro ao salvar estado do usuário ${phoneNumber}`, error);
        return false;
    }
};

/**
 * Obtém o estado da conversa de um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<string|null>} Estado da conversa ou null se não encontrado
 */
const getUserState = async (phoneNumber) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return null;
            }
        }

        const key = `${KEY_PREFIXES.USER_STATE}${phoneNumber}`;
        const state = await redis.get(key);
        logInfo('REDIS_STATE', `Estado do usuário ${phoneNumber} obtido: ${state || 'não encontrado'}`);
        return state;
    } catch (error) {
        logError('REDIS_STATE', `Erro ao obter estado do usuário ${phoneNumber}`, error);
        return null;
    }
};

/**
 * Salva dados do usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @param {Object} data - Dados do usuário a serem salvos
 * @param {number} expirationHours - Tempo de expiração em horas
 * @returns {Promise<boolean>} Indica se a operação foi bem-sucedida
 */
const saveUserData = async (phoneNumber, data, expirationHours = config.THREAD_EXPIRATION_HOURS) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return false;
            }
        }

        const key = `${KEY_PREFIXES.USER_DATA}${phoneNumber}`;
        await redis.set(key, JSON.stringify(data), 'EX', expirationHours * 3600);
        logInfo('REDIS_DATA', `Dados do usuário ${phoneNumber} salvos`);
        return true;
    } catch (error) {
        logError('REDIS_DATA', `Erro ao salvar dados do usuário ${phoneNumber}`, error);
        return false;
    }
};

/**
 * Obtém dados do usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<Object|null>} Dados do usuário ou null se não encontrado
 */
const getUserData = async (phoneNumber) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return null;
            }
        }

        const key = `${KEY_PREFIXES.USER_DATA}${phoneNumber}`;
        const dataStr = await redis.get(key);
        
        if (!dataStr) {
            logInfo('REDIS_DATA', `Dados do usuário ${phoneNumber} não encontrados`);
            return null;
        }
        
        const data = JSON.parse(dataStr);
        logInfo('REDIS_DATA', `Dados do usuário ${phoneNumber} obtidos`);
        return data;
    } catch (error) {
        logError('REDIS_DATA', `Erro ao obter dados do usuário ${phoneNumber}`, error);
        return null;
    }
};

/**
 * Atualiza dados do usuário (merge com dados existentes)
 * @param {string} phoneNumber - Número de telefone do usuário
 * @param {Object} newData - Novos dados a serem mesclados
 * @returns {Promise<Object|null>} Dados atualizados ou null se falhar
 */
const updateUserData = async (phoneNumber, newData) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return null;
            }
        }

        // Obter dados existentes
        const existingData = await getUserData(phoneNumber) || {};
        
        // Mesclar dados
        const updatedData = { ...existingData, ...newData };
        
        // Salvar dados atualizados
        const saved = await saveUserData(phoneNumber, updatedData);
        
        if (!saved) {
            return null;
        }
        
        logInfo('REDIS_DATA', `Dados do usuário ${phoneNumber} atualizados`);
        return updatedData;
    } catch (error) {
        logError('REDIS_DATA', `Erro ao atualizar dados do usuário ${phoneNumber}`, error);
        return null;
    }
};

/**
 * Salva informações do thread da OpenAI para um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @param {Object} threadInfo - Informações do thread
 * @param {number} expirationHours - Tempo de expiração em horas
 * @returns {Promise<boolean>} Indica se a operação foi bem-sucedida
 */
const saveThreadInfo = async (phoneNumber, threadInfo, expirationHours = config.THREAD_EXPIRATION_HOURS) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return false;
            }
        }

        const key = `${KEY_PREFIXES.USER_THREAD}${phoneNumber}`;
        await redis.set(key, JSON.stringify(threadInfo), 'EX', expirationHours * 3600);
        logInfo('REDIS_THREAD', `Thread do usuário ${phoneNumber} salvo: ${threadInfo.threadId}`);
        return true;
    } catch (error) {
        logError('REDIS_THREAD', `Erro ao salvar thread do usuário ${phoneNumber}`, error);
        return false;
    }
};

/**
 * Obtém informações do thread da OpenAI para um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<Object|null>} Informações do thread ou null se não encontrado
 */
const getThreadInfo = async (phoneNumber) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return null;
            }
        }

        const key = `${KEY_PREFIXES.USER_THREAD}${phoneNumber}`;
        const threadInfoStr = await redis.get(key);
        
        if (!threadInfoStr) {
            logInfo('REDIS_THREAD', `Thread do usuário ${phoneNumber} não encontrado`);
            return null;
        }
        
        const threadInfo = JSON.parse(threadInfoStr);
        logInfo('REDIS_THREAD', `Thread do usuário ${phoneNumber} obtido: ${threadInfo.threadId}`);
        return threadInfo;
    } catch (error) {
        logError('REDIS_THREAD', `Erro ao obter thread do usuário ${phoneNumber}`, error);
        return null;
    }
};

/**
 * Registra uma interação completa para análise posterior
 * @param {Object} interactionData - Dados da interação
 * @returns {Promise<boolean>} Indica se a operação foi bem-sucedida
 */
const logInteraction = async (interactionData) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return false;
            }
        }

        const timestamp = Date.now();
        const key = `${KEY_PREFIXES.INTERACTION_LOG}${timestamp}`;
        
        // Adicionar timestamp aos dados
        const dataWithTimestamp = {
            ...interactionData,
            timestamp,
            timestampFormatted: new Date(timestamp).toISOString()
        };
        
        await redis.set(key, JSON.stringify(dataWithTimestamp));
        
        // Adicionar à lista de interações para o painel administrativo
        await redis.lpush(`${KEY_PREFIXES.ADMIN_DATA}interactions`, key);
        
        logInfo('REDIS_INTERACTION', `Interação registrada com timestamp ${timestamp}`);
        return true;
    } catch (error) {
        logError('REDIS_INTERACTION', 'Erro ao registrar interação', error);
        return false;
    }
};

/**
 * Obtém todas as interações registradas
 * @param {number} limit - Limite de interações a serem retornadas
 * @returns {Promise<Array|null>} Lista de interações ou null se falhar
 */
const getAllInteractions = async (limit = 100) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return null;
            }
        }

        // Obter lista de chaves de interações
        const interactionKeys = await redis.lrange(`${KEY_PREFIXES.ADMIN_DATA}interactions`, 0, limit - 1);
        
        if (!interactionKeys || interactionKeys.length === 0) {
            logInfo('REDIS_INTERACTION', 'Nenhuma interação encontrada');
            return [];
        }
        
        // Obter dados de cada interação
        const interactionPromises = interactionKeys.map(key => redis.get(key));
        const interactionDataArray = await Promise.all(interactionPromises);
        
        // Parsear dados JSON
        const interactions = interactionDataArray
            .filter(data => data !== null)
            .map(data => JSON.parse(data));
        
        logInfo('REDIS_INTERACTION', `${interactions.length} interações obtidas`);
        return interactions;
    } catch (error) {
        logError('REDIS_INTERACTION', 'Erro ao obter interações', error);
        return null;
    }
};

/**
 * Reseta o estado da conversa de um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<boolean>} Indica se a operação foi bem-sucedida
 */
const resetUserConversation = async (phoneNumber) => {
    try {
        if (!redis) {
            const initialized = await initRedis();
            if (!initialized) {
                return false;
            }
        }

        // Obter dados existentes para preservar informações importantes
        const userData = await getUserData(phoneNumber) || {};
        
        // Preservar apenas dados básicos
        const preservedData = {
            name: userData.name,
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            resetCount: (userData.resetCount || 0) + 1,
            lastResetTime: Date.now()
        };
        
        // Salvar dados preservados
        await saveUserData(phoneNumber, preservedData);
        
        // Resetar estado
        await saveUserState(phoneNumber, CONVERSATION_STATES.NEW);
        
        // Remover thread
        const threadKey = `${KEY_PREFIXES.USER_THREAD}${phoneNumber}`;
        await redis.del(threadKey);
        
        logInfo('REDIS_RESET', `Conversa do usuário ${phoneNumber} resetada`);
        return true;
    } catch (error) {
        logError('REDIS_RESET', `Erro ao resetar conversa do usuário ${phoneNumber}`, error);
        return false;
    }
};

export default {
    initRedis,
    getRedisClient,
    saveUserState,
    getUserState,
    saveUserData,
    getUserData,
    updateUserData,
    saveThreadInfo,
    getThreadInfo,
    logInteraction,
    getAllInteractions,
    resetUserConversation,
    CONVERSATION_STATES,
    KEY_PREFIXES
};
