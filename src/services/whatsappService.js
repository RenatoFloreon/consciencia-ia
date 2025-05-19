/**
 * @fileoverview Serviço de integração com a API do WhatsApp
 * Este módulo fornece funções para enviar mensagens através da API do WhatsApp
 * e processar webhooks recebidos.
 */

const fetch = require('node-fetch');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

/**
 * Divide uma mensagem longa em blocos menores para envio
 * @param {string} message - Mensagem a ser dividida
 * @param {number} maxLength - Tamanho máximo de cada bloco
 * @returns {Array<string>} Array de blocos de mensagem
 */
const splitMessageIntoChunks = (message, maxLength = config.WHATSAPP_MAX_MESSAGE_LENGTH) => {
    if (!message) return [];
    if (message.length <= maxLength) return [message];

    const chunks = [];
    let currentChunk = "";
    
    // Dividir por parágrafos para manter a formatação
    const paragraphs = message.split('\n\n');
    
    for (const paragraph of paragraphs) {
        // Se o parágrafo for maior que o tamanho máximo, dividir por frases
        if (paragraph.length > maxLength) {
            const sentences = paragraph.split(/(?<=\.|\?|\!)\s+/);
            
            for (const sentence of sentences) {
                // Se a frase for maior que o tamanho máximo, dividir por caracteres
                if (sentence.length > maxLength) {
                    let remainingSentence = sentence;
                    
                    while (remainingSentence.length > 0) {
                        // Verificar se adicionar a parte da frase excederia o tamanho máximo
                        if (currentChunk.length + Math.min(remainingSentence.length, maxLength) > maxLength) {
                            chunks.push(currentChunk);
                            currentChunk = "";
                        }
                        
                        const chunkToAdd = remainingSentence.substring(0, maxLength - currentChunk.length);
                        currentChunk += chunkToAdd;
                        remainingSentence = remainingSentence.substring(chunkToAdd.length);
                        
                        // Se a parte restante não couber no chunk atual, finalizar o chunk
                        if (remainingSentence.length > 0 && currentChunk.length >= maxLength) {
                            chunks.push(currentChunk);
                            currentChunk = "";
                        }
                    }
                } else {
                    // Verificar se adicionar a frase excederia o tamanho máximo
                    if (currentChunk.length + sentence.length + 1 > maxLength) {
                        chunks.push(currentChunk);
                        currentChunk = sentence;
                    } else {
                        currentChunk += (currentChunk ? " " : "") + sentence;
                    }
                }
            }
        } else {
            // Verificar se adicionar o parágrafo excederia o tamanho máximo
            if (currentChunk.length + paragraph.length + 2 > maxLength) {
                chunks.push(currentChunk);
                currentChunk = paragraph;
            } else {
                currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
            }
        }
    }
    
    // Adicionar o último chunk se não estiver vazio
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
};

/**
 * Envia uma mensagem para um número de telefone via WhatsApp
 * @param {string} phoneNumber - Número de telefone do destinatário
 * @param {string|Array<string>} message - Mensagem ou array de mensagens a serem enviadas
 * @param {number} attempt - Número da tentativa atual (para retry)
 * @param {number} maxAttempts - Número máximo de tentativas
 * @returns {Promise<boolean>} Indica se o envio foi bem-sucedido
 */
const sendWhatsappMessage = async (phoneNumber, message, attempt = 1, maxAttempts = 2) => {
    if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_ID) {
        logError('WHATSAPP_SEND', 'WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID não definidos. Não é possível enviar mensagem.');
        return false;
    }

    // Converter mensagem única em array
    const messageBlocks = Array.isArray(message) 
        ? message 
        : splitMessageIntoChunks(message);
    
    if (messageBlocks.length === 0) {
        logWarning('WHATSAPP_SEND', `[${phoneNumber}] Tentativa de enviar mensagem vazia.`);
        return false;
    }

    let allSuccessful = true;

    for (let i = 0; i < messageBlocks.length; i++) {
        const messageData = {
            messaging_product: "whatsapp",
            to: phoneNumber,
            text: { body: messageBlocks[i] },
        };
        
        const chunkInfo = `Bloco ${i + 1}/${messageBlocks.length}`;
        logInfo('WHATSAPP_SEND', `[${phoneNumber}] Enviando ${chunkInfo}: "${messageBlocks[i].substring(0,50)}..."`);
        
        try {
            const response = await fetch(`https://graph.facebook.com/v19.0/${config.WHATSAPP_PHONE_ID}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(messageData),
                timeout: config.FETCH_TIMEOUT_MS,
            });
            
            const responseText = await response.text(); 
            
            if (!response.ok) {
                logError('WHATSAPP_SEND', `[${phoneNumber}] Erro ao enviar ${chunkInfo}. Status: ${response.status} ${response.statusText}. Resposta: ${responseText}`);
                allSuccessful = false;
                continue; 
            }
            
            logInfo('WHATSAPP_SEND', `[${phoneNumber}] ${chunkInfo} enviado. Status: ${response.status}. Resposta: ${responseText}`);
        } catch (error) {
            logError('WHATSAPP_SEND', `[${phoneNumber}] Erro de rede ao enviar ${chunkInfo}`, error);
            
            if (attempt < maxAttempts && (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.code === 'ECONNRESET')) {
                logInfo('WHATSAPP_SEND', `[${phoneNumber}] Tentando novamente (${attempt + 1}/${maxAttempts}) para ${chunkInfo} em 2 segundos...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                const retryResult = await sendWhatsappMessage(phoneNumber, [messageBlocks[i]], attempt + 1, maxAttempts);
                
                if (!retryResult) {
                    allSuccessful = false;
                }
            } else {
                logError('WHATSAPP_SEND', `[${phoneNumber}] Falha final ao enviar ${chunkInfo} após ${attempt} tentativas.`);
                allSuccessful = false;
            }
        }
        
        // Adicionar um pequeno delay entre mensagens para evitar rate limiting
        if (i < messageBlocks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 700)); 
        }
    }
    
    return allSuccessful;
};

/**
 * Envia uma mensagem personalizada substituindo placeholders
 * @param {string} phoneNumber - Número de telefone do destinatário
 * @param {string} templateMessage - Mensagem com placeholders {nome}, {email}, etc.
 * @param {Object} userData - Dados do usuário para substituição
 * @returns {Promise<boolean>} Indica se o envio foi bem-sucedido
 */
const sendPersonalizedMessage = async (phoneNumber, templateMessage, userData = {}) => {
    if (!templateMessage) {
        return false;
    }
    
    // Substituir placeholders
    let personalizedMessage = templateMessage;
    
    Object.keys(userData).forEach(key => {
        const regex = new RegExp(`{${key}}`, 'g');
        personalizedMessage = personalizedMessage.replace(regex, userData[key] || `{${key}}`);
    });
    
    // Enviar mensagem personalizada
    return await sendWhatsappMessage(phoneNumber, personalizedMessage);
};

/**
 * Processa uma mensagem recebida do webhook do WhatsApp
 * @param {Object} webhookData - Dados recebidos do webhook
 * @returns {Object|null} Informações extraídas da mensagem ou null se inválido
 */
const processWebhookMessage = (webhookData) => {
    try {
        // Verificar se é uma notificação de mensagem válida
        if (!webhookData || !webhookData.entry || !webhookData.entry[0] || !webhookData.entry[0].changes || !webhookData.entry[0].changes[0]) {
            return null;
        }
        
        const change = webhookData.entry[0].changes[0];
        
        // Verificar se é uma mensagem do WhatsApp
        if (!change.value || change.value.messaging_product !== 'whatsapp' || !change.value.messages || !change.value.messages[0]) {
            return null;
        }
        
        const message = change.value.messages[0];
        const sender = change.value.contacts && change.value.contacts[0];
        
        // Extrair informações relevantes
        const messageInfo = {
            messageId: message.id,
            timestamp: message.timestamp,
            from: message.from,
            type: message.type,
            text: message.type === 'text' ? message.text.body : null,
            senderName: sender ? sender.profile.name : null,
            senderWaId: sender ? sender.wa_id : null
        };
        
        logInfo('WHATSAPP_WEBHOOK', `Mensagem recebida de ${messageInfo.from}: ${messageInfo.text ? messageInfo.text.substring(0, 50) : '[não é texto]'}`);
        return messageInfo;
    } catch (error) {
        logError('WHATSAPP_WEBHOOK', 'Erro ao processar mensagem do webhook', error);
        return null;
    }
};

/**
 * Verifica se um webhook é válido para verificação
 * @param {Object} query - Parâmetros da query string
 * @returns {Object} Resultado da verificação
 */
const verifyWebhook = (query) => {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    
    if (mode === 'subscribe' && token === config.VERIFY_TOKEN) {
        logInfo('WHATSAPP_WEBHOOK', 'Verificação de webhook bem-sucedida');
        return { isValid: true, challenge };
    } else {
        logWarning('WHATSAPP_WEBHOOK', 'Falha na verificação de webhook: token inválido');
        return { isValid: false };
    }
};

module.exports = {
    sendWhatsappMessage,
    sendPersonalizedMessage,
    processWebhookMessage,
    verifyWebhook,
    splitMessageIntoChunks
};
