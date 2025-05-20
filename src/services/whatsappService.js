import axios from 'axios';
import { log } from '../utils/logger.js';

// No início do arquivo whatsappService.js
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_API_VERSION = 'v18.0'; // Versão mais recente da API
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Limite de caracteres para mensagens do WhatsApp
const MAX_MESSAGE_LENGTH = 1000;

/**
 * Divide uma mensagem longa em partes menores
 * @param {string} text - Texto da mensagem
 * @returns {Array<string>} - Array de partes da mensagem
 */
function splitLongMessage(text) {
  if (!text || text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }
  
  const parts = [];
  let remainingText = text;
  
  while (remainingText.length > 0) {
    // Encontra um ponto final, interrogação ou exclamação próximo ao limite
    let splitIndex = MAX_MESSAGE_LENGTH;
    
    // Procura por um ponto final, interrogação ou exclamação antes do limite
    const lastPeriod = remainingText.lastIndexOf('.', MAX_MESSAGE_LENGTH);
    const lastQuestion = remainingText.lastIndexOf('?', MAX_MESSAGE_LENGTH);
    const lastExclamation = remainingText.lastIndexOf('!', MAX_MESSAGE_LENGTH);
    const lastNewLine = remainingText.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    
    // Encontra o último ponto de quebra válido
    const possibleBreaks = [lastPeriod, lastQuestion, lastExclamation, lastNewLine]
      .filter(index => index > 0)
      .sort((a, b) => b - a);
    
    if (possibleBreaks.length > 0) {
      splitIndex = possibleBreaks[0] + 1; // Inclui o caractere de pontuação
    }
    
    // Se não encontrou um ponto de quebra adequado, divide no limite
    if (splitIndex <= 0 || splitIndex > MAX_MESSAGE_LENGTH) {
      splitIndex = MAX_MESSAGE_LENGTH;
      
      // Tenta não cortar palavras
      const lastSpace = remainingText.lastIndexOf(' ', splitIndex);
      if (lastSpace > splitIndex * 0.8) { // Se o último espaço estiver a pelo menos 80% do caminho
        splitIndex = lastSpace + 1;
      }
    }
    
    // Adiciona a parte atual
    parts.push(remainingText.substring(0, splitIndex).trim());
    
    // Atualiza o texto restante
    remainingText = remainingText.substring(splitIndex).trim();
  }
  
  return parts;
}

/**
 * Envia uma mensagem de texto via WhatsApp, dividindo automaticamente mensagens longas
 * @param {string} to - Número de telefone do destinatário
 * @param {string} text - Texto da mensagem
 * @returns {Promise<Object>} - Resposta da API
 */
async function sendTextMessage(to, text) {
  try {
    if (!to || !text) {
      throw new Error('Número de telefone e texto são obrigatórios');
    }
    
    // Divide mensagens longas
    const messageParts = splitLongMessage(text);
    let finalResponse = null;
    
    // Envia cada parte da mensagem
    for (const part of messageParts) {
      const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
      
      const data = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: true,
          body: part
        }
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      };
      
      // Adiciona um pequeno atraso entre mensagens para evitar problemas de ordem
      if (messageParts.length > 1 && messageParts.indexOf(part) > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const response = await axios.post(url, data, { headers });
      finalResponse = response.data;
      
      // Log para depuração
      log(`Mensagem enviada (parte ${messageParts.indexOf(part) + 1}/${messageParts.length}): ${part.substring(0, 50)}...`);
    }
    
    return finalResponse;
  } catch (error) {
    log('Erro ao enviar mensagem de texto:', error);
    
    // Tenta novamente com backoff exponencial se for um erro de rate limit
    if (error.response && (error.response.status === 429 || error.response.status === 500)) {
      const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5 segundos
      log(`Tentando novamente em ${delay}ms...`);
      
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const retryResponse = await sendTextMessage(to, text);
            resolve(retryResponse);
          } catch (retryError) {
            log('Erro na segunda tentativa:', retryError);
            resolve(null);
          }
        }, delay);
      });
    }
    
    return null;
  }
}

/**
 * Envia uma mensagem com template via WhatsApp
 * @param {string} to - Número de telefone do destinatário
 * @param {string} templateName - Nome do template
 * @param {string} language - Código do idioma (ex: pt_BR)
 * @param {Array} components - Componentes do template
 * @returns {Promise<Object>} - Resposta da API
 */
async function sendTemplateMessage(to, templateName, language = 'pt_BR', components = []) {
  try {
    if (!to || !templateName) {
      throw new Error('Número de telefone e nome do template são obrigatórios');
    }

    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: language
        },
        components
      }
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`
    };
    
    const response = await axios.post(url, data, { headers });
    return response.data;
  } catch (error) {
    log('Erro ao enviar mensagem de template:', error);
    return null;
  }
}

/**
 * Obtém a URL de uma mídia enviada pelo usuário
 * @param {string} mediaId - ID da mídia
 * @returns {Promise<string>} - URL da mídia
 */
async function getMediaUrl(mediaId) {
  try {
    if (!mediaId) {
      throw new Error('ID da mídia é obrigatório');
    }

    const url = `${WHATSAPP_API_URL}/${mediaId}`;
    
    const headers = {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`
    };
    
    const response = await axios.get(url, { headers });
    
    if (response.data && response.data.url) {
      // Obtém a mídia da URL retornada
      const mediaUrl = response.data.url;
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        },
        responseType: 'arraybuffer'
      });
      
      // Converte para base64 para uso com a API da OpenAI
      const base64 = Buffer.from(mediaResponse.data).toString('base64');
      return `data:${response.data.mime_type};base64,${base64}`;
    }
    
    return null;
  } catch (error) {
    log('Erro ao obter URL da mídia:', error);
    return null;
  }
}

/**
 * Envia uma imagem via WhatsApp
 * @param {string} to - Número de telefone do destinatário
 * @param {string} imageUrl - URL da imagem
 * @param {string} caption - Legenda da imagem (opcional)
 * @returns {Promise<Object>} - Resposta da API
 */
async function sendImageMessage(to, imageUrl, caption = '') {
  try {
    if (!to || !imageUrl) {
      throw new Error('Número de telefone e URL da imagem são obrigatórios');
    }

    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        link: imageUrl,
        caption
      }
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`
    };
    
    const response = await axios.post(url, data, { headers });
    return response.data;
  } catch (error) {
    log('Erro ao enviar mensagem de imagem:', error);
    return null;
  }
}

/**
 * Marca uma mensagem como lida
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<Object>} - Resposta da API
 */
async function markMessageAsRead(messageId) {
  try {
    if (!messageId) {
      throw new Error('ID da mensagem é obrigatório');
    }

    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`
    };
    
    const response = await axios.post(url, data, { headers });
    return response.data;
  } catch (error) {
    log('Erro ao marcar mensagem como lida:', error);
    return null;
  }
}

export default {
  sendTextMessage,
  sendTemplateMessage,
  getMediaUrl,
  sendImageMessage,
  markMessageAsRead
};
