/**
 * @fileoverview Serviço de integração com a API do WhatsApp (Meta).
 * Fornece funções para enviar mensagens via API do WhatsApp e processar webhooks recebidos.
 */

const fetch = require('node-fetch');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

/**
 * Divide uma mensagem muito longa em blocos menores, respeitando o limite de caracteres.
 * @param {string} message - Mensagem para dividir.
 * @param {number} maxLength - Tamanho máximo de cada bloco.
 * @returns {string[]} Array de blocos de mensagem.
 */
const splitMessage = (message, maxLength) => {
    if (!message || message.length <= maxLength) {
        return [message];
    }
    const chunks = [];
    let current = 0;
    while (current < message.length) {
        chunks.push(message.slice(current, current + maxLength));
        current += maxLength;
    }
    return chunks;
};

/**
 * Envia uma mensagem de texto para um usuário via WhatsApp Cloud API.
 * @param {string} phoneNumber - Número do destinatário (WhatsApp ID do usuário).
 * @param {string|string[]} message - Mensagem a ser enviada (ou array de mensagens para enviar em sequência).
 * @param {number} attempt - Tentativa atual (controle interno de reenvio em caso de falha).
 * @param {number} maxAttempts - Número máximo de tentativas em caso de erro temporário.
 * @returns {Promise<boolean>} Retorna true se enviado com sucesso, false em caso de erro.
 */
const sendWhatsappMessage = async (phoneNumber, message, attempt = 1, maxAttempts = 2) => {
    if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
        logError('WHATSAPP_SEND', 'WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não definidos. Mensagem não enviada.');
        return false;
    }
    try {
        // Certificar que a mensagem seja um array (pode já ser array ou string única)
        const messageBlocks = Array.isArray(message) ? message : [message];
        // Enviar cada bloco de mensagem separadamente
        for (const msg of messageBlocks) {
            // Dividir mensagens muito longas conforme limite
            const segments = splitMessage(msg, config.WHATSAPP_MAX_MESSAGE_LENGTH || 4000);
            for (const segment of segments) {
                logInfo('WHATSAPP_SEND', `Enviando mensagem para ${phoneNumber}: "${segment.substring(0, 50)}..."`);
                const response = await fetch(`https://graph.facebook.com/v17.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: phoneNumber,
                        type: "text",
                        text: { body: segment }
                    })
                });
                const data = await response.json();
                if (!response.ok) {
                    // Se a API do WhatsApp retornar erro, lançar para cair no catch
                    throw new Error(JSON.stringify(data));
                }
            }
        }
        return true;
    } catch (error) {
        logError('WHATSAPP_SEND', `Erro ao enviar mensagem para ${phoneNumber}: ${error.message}`);
        if (attempt < maxAttempts) {
            logWarning('WHATSAPP_SEND', `Tentando reenviar mensagem... Tentativa ${attempt + 1} de ${maxAttempts}`);
            return sendWhatsappMessage(phoneNumber, message, attempt + 1, maxAttempts);
        }
        return false;
    }
};

/**
 * Processa os dados brutos do webhook do WhatsApp e extrai as informações relevantes da mensagem recebida.
 * @param {Object} webhookData - Objeto JSON recebido no webhook do WhatsApp.
 * @returns {Object|null} Objeto contendo from, text, etc., ou null se não for um evento de mensagem.
 */
const processWebhookMessage = (webhookData) => {
    try {
        // Verificar estrutura básica do webhook
        if (!webhookData || !webhookData.entry || !webhookData.entry[0] || !webhookData.entry[0].changes || !webhookData.entry[0].changes[0]) {
            return null;
        }
        const change = webhookData.entry[0].changes[0];
        // Confirmar se é mensagem de WhatsApp
        if (!change.value || change.value.messaging_product !== 'whatsapp' || !change.value.messages || !change.value.messages[0]) {
            return null;
        }
        const message = change.value.messages[0];
        const sender = change.value.contacts && change.value.contacts[0];
        // Extrair informações principais
        const messageInfo = {
            messageId: message.id,
            timestamp: message.timestamp,
            from: message.from,  // telefone do remetente
            type: message.type,
            text: message.text?.body || '',
            name: sender ? sender.profile.name : undefined
        };
        logInfo('WHATSAPP_WEBHOOK', `Mensagem recebida de ${messageInfo.from}: "${messageInfo.text}"`);
        return messageInfo;
    } catch (error) {
        logError('WHATSAPP_WEBHOOK', 'Erro ao processar webhook de mensagem', error);
        return null;
    }
};

/**
 * Verifica o token de confirmação do webhook (chamada GET) para configuração inicial na Meta.
 * @param {Object} queryParams - Os parâmetros de query da requisição GET.
 * @returns {Object} Objeto com { isValid: boolean, challenge: string } para responder.
 */
const verifyWebhook = (queryParams) => {
    const mode = queryParams['hub.mode'];
    const token = queryParams['hub.verify_token'];
    const challenge = queryParams['hub.challenge'];
    if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
        logInfo('WHATSAPP_WEBHOOK', 'Verificação do webhook bem-sucedida');
        return { isValid: true, challenge: challenge };
    } else {
        logWarning('WHATSAPP_WEBHOOK', 'Verificação do webhook falhou');
        return { isValid: false, challenge: null };
    }
};

module.exports = {
    sendWhatsappMessage,
    processWebhookMessage,
    verifyWebhook
};
