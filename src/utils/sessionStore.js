/**
 * @fileoverview Armazenamento de sessão do usuário usando Redis.
 * Guarda estado da conversa e dados dos usuários entre mensagens.
 */

const redis = require('redis');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

// Prefixos para chaves Redis
const KEY_PREFIX = {
    STATE: 'user:state:',
    DATA: 'user:data:',
    INTERACTIONS_LIST: 'admin:data:interactions',  // lista de chaves de interações
    INTERACTION_LOG: 'interaction:log:'           // prefixo para dados de cada interação
};

let client;  // cliente Redis (será inicializado sob demanda)

/**
 * Garante que a conexão com o Redis esteja ativa.
 */
async function ensureConnected() {
    if (!client) {
        client = redis.createClient({ url: config.REDIS_URL });
        client.on('error', (err) => logError('REDIS', 'Erro na conexão Redis: ' + err));
        try {
            await client.connect();
            logInfo('REDIS', 'Conectado ao Redis com sucesso');
        } catch (err) {
            logError('REDIS', 'Falha ao conectar ao Redis', err);
            client = null;
        }
    }
}

/**
 * Salva/atualiza o estado atual do usuário.
 * @param {string} phoneNumber - ID do usuário (telefone).
 * @param {string} state - Estado da conversa a ser salvo.
 */
async function saveUserState(phoneNumber, state) {
    try {
        await ensureConnected();
        if (!client) return;
        await client.set(KEY_PREFIX.STATE + phoneNumber, state);
    } catch (error) {
        logError('SESSION_STORE', `Erro ao salvar estado do usuário ${phoneNumber}: ${error.message}`);
    }
}

/**
 * Obtém o estado atual do usuário.
 * @param {string} phoneNumber - ID do usuário.
 * @returns {Promise<string|null>} Estado da conversa ou null se não encontrado.
 */
async function getUserState(phoneNumber) {
    try {
        await ensureConnected();
        if (!client) return null;
        const state = await client.get(KEY_PREFIX.STATE + phoneNumber);
        return state;
    } catch (error) {
        logError('SESSION_STORE', `Erro ao obter estado do usuário ${phoneNumber}: ${error.message}`);
        return null;
    }
}

/**
 * Salva/atualiza os dados do usuário.
 * @param {string} phoneNumber - ID do usuário.
 * @param {Object} data - Objeto contendo os dados do usuário.
 */
async function updateUserData(phoneNumber, data) {
    try {
        await ensureConnected();
        if (!client) return;
        await client.set(KEY_PREFIX.DATA + phoneNumber, JSON.stringify(data));
    } catch (error) {
        logError('SESSION_STORE', `Erro ao salvar dados do usuário ${phoneNumber}: ${error.message}`);
    }
}

/**
 * Obtém os dados armazenados de um usuário.
 * @param {string} phoneNumber - ID do usuário.
 * @returns {Promise<Object|null>} Objeto de dados do usuário ou null se não houver.
 */
async function getUserData(phoneNumber) {
    try {
        await ensureConnected();
        if (!client) return null;
        const dataStr = await client.get(KEY_PREFIX.DATA + phoneNumber);
        return dataStr ? JSON.parse(dataStr) : null;
    } catch (error) {
        logError('SESSION_STORE', `Erro ao obter dados do usuário ${phoneNumber}: ${error.message}`);
        return null;
    }
}

/**
 * Reseta a conversa de um usuário, apagando estado e dados armazenados.
 * @param {string} phoneNumber - ID do usuário.
 */
async function resetUserConversation(phoneNumber) {
    try {
        await ensureConnected();
        if (!client) return false;
        await client.del(KEY_PREFIX.STATE + phoneNumber);
        await client.del(KEY_PREFIX.DATA + phoneNumber);
        return true;
    } catch (error) {
        logError('SESSION_STORE', `Erro ao resetar conversa do usuário ${phoneNumber}: ${error.message}`);
        return false;
    }
}

/**
 * Registra uma interação (evento importante) para fins de histórico/monitoramento.
 * @param {Object} interactionData - Dados da interação (tipo, phoneNumber, demais campos relevantes).
 */
async function logInteraction(interactionData) {
    try {
        await ensureConnected();
        if (!client) return false;
        const timestamp = Date.now();
        const key = KEY_PREFIX.INTERACTION_LOG + timestamp;
        // Incluir timestamp nos dados
        const dataWithTimestamp = {
            ...interactionData,
            timestamp,
            timestampFormatted: new Date(timestamp).toISOString()
        };
        // Salvar dados da interação e adicionar referência à lista
        await client.set(key, JSON.stringify(dataWithTimestamp));
        await client.lpush(KEY_PREFIX.INTERACTIONS_LIST, key);
        return true;
    } catch (error) {
        logError('SESSION_STORE', 'Erro ao registrar interação: ' + error.message);
        return false;
    }
}

/**
 * Obtém uma lista das interações registradas (para uso no painel admin).
 * @param {number} limit - Quantidade máxima de interações a obter (ordem das mais recentes).
 * @returns {Promise<Object[]|null>} Lista de interações (objetos) ou null em caso de erro.
 */
async function getAllInteractions(limit = 100) {
    try {
        await ensureConnected();
        if (!client) return null;
        // Obter a lista de chaves de interações armazenadas
        const keys = await client.lrange(KEY_PREFIX.INTERACTIONS_LIST, 0, limit - 1);
        if (!keys || keys.length === 0) {
            logInfo('SESSION_STORE', 'Nenhuma interação registrada no momento.');
            return [];
        }
        // Buscar dados de cada interação em paralelo
        const interactionDataArray = await Promise.all(keys.map(key => client.get(key)));
        // Remover possíveis nulos e converter para objeto
        const interactions = interactionDataArray
            .filter(item => item)
            .map(item => JSON.parse(item));
        return interactions;
    } catch (error) {
        logError('SESSION_STORE', 'Erro ao obter interações: ' + error.message);
        return null;
    }
}

module.exports = {
    saveUserState,
    getUserState,
    updateUserData,
    getUserData,
    resetUserConversation,
    logInteraction,
    getAllInteractions
};
