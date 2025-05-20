import axios from 'axios';
import { log } from '../utils/logger.js';

// Configurações do WhatsApp API
const WHATSAPP_API_URL = 'https://graph.facebook.com/v17.0';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// Função para enviar mensagem de texto
async function sendTextMessage(to, text) {
  try {
    log(`Enviando mensagem para ${to}: ${text.substring(0, 50)}...`);
    
    // Verifica se o token e o ID do telefone estão configurados
    if (!WHATSAPP_TOKEN) {
      log('⚠️ ERRO CRÍTICO: Token do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    if (!WHATSAPP_PHONE_ID) {
      log('⚠️ ERRO CRÍTICO: ID do telefone do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    // Divide mensagens longas para evitar cortes
    const messages = splitLongMessage(text);
    
    // Envia cada parte da mensagem
    for (const message of messages) {
      try {
        const response = await axios({
          method: 'POST',
          url: `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          },
          data: {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: {
              preview_url: true,
              body: message
            }
          }
        });
        
        log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
      } catch (sendError) {
        log('Erro detalhado ao enviar mensagem:', sendError.response?.data || sendError.message);
        // Continua tentando enviar as outras partes da mensagem
      }
      
      // Aguarda um pequeno intervalo entre mensagens para evitar bloqueios
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return true;
  } catch (error) {
    log('Erro ao enviar mensagem de texto:', error.response?.data || error.message);
    return false;
  }
}

// Função para enviar mensagem com botões
async function sendButtonMessage(to, text, buttons) {
  try {
    log(`Enviando mensagem com botões para ${to}`);
    
    // Verifica se o token e o ID do telefone estão configurados
    if (!WHATSAPP_TOKEN) {
      log('⚠️ ERRO CRÍTICO: Token do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    if (!WHATSAPP_PHONE_ID) {
      log('⚠️ ERRO CRÍTICO: ID do telefone do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    const response = await axios({
      method: 'POST',
      url: `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: text
          },
          action: {
            buttons: buttons.map((button, index) => ({
              type: 'reply',
              reply: {
                id: `button_${index}`,
                title: button
              }
            }))
          }
        }
      }
    });
    
    log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    log('Erro ao enviar mensagem com botões:', error.response?.data || error.message);
    return false;
  }
}

// Função para enviar mensagem com lista
async function sendListMessage(to, text, sections) {
  try {
    log(`Enviando mensagem com lista para ${to}`);
    
    // Verifica se o token e o ID do telefone estão configurados
    if (!WHATSAPP_TOKEN) {
      log('⚠️ ERRO CRÍTICO: Token do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    if (!WHATSAPP_PHONE_ID) {
      log('⚠️ ERRO CRÍTICO: ID do telefone do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    const response = await axios({
      method: 'POST',
      url: `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: text
          },
          action: {
            button: 'Ver Opções',
            sections: sections
          }
        }
      }
    });
    
    log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    log('Erro ao enviar mensagem com lista:', error.response?.data || error.message);
    return false;
  }
}

// Função para obter URL de mídia
async function getMediaUrl(mediaId) {
  try {
    log(`Obtendo URL da mídia ${mediaId}`);
    
    // Verifica se o token está configurado
    if (!WHATSAPP_TOKEN) {
      log('⚠️ ERRO CRÍTICO: Token do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return null;
    }
    
    const response = await axios({
      method: 'GET',
      url: `${WHATSAPP_API_URL}/${mediaId}`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });
    
    log(`URL da mídia obtida: ${response.data.url}`);
    
    // Obtém o conteúdo da mídia
    const mediaResponse = await axios({
      method: 'GET',
      url: response.data.url,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      },
      responseType: 'arraybuffer'
    });
    
    // Converte para base64
    const mediaBase64 = Buffer.from(mediaResponse.data).toString('base64');
    return `data:${response.data.mime_type};base64,${mediaBase64}`;
  } catch (error) {
    log('Erro ao obter URL da mídia:', error.response?.data || error.message);
    return null;
  }
}

// Função para marcar mensagem como lida
async function markMessageAsRead(messageId) {
  try {
    log(`Marcando mensagem ${messageId} como lida`);
    
    // Verifica se o token e o ID do telefone estão configurados
    if (!WHATSAPP_TOKEN) {
      log('⚠️ ERRO CRÍTICO: Token do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    if (!WHATSAPP_PHONE_ID) {
      log('⚠️ ERRO CRÍTICO: ID do telefone do WhatsApp não configurado! Verifique as variáveis de ambiente.');
      return false;
    }
    
    const response = await axios({
      method: 'POST',
      url: `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      }
    });
    
    log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    log('Erro ao marcar mensagem como lida:', error.response?.data || error.message);
    return false;
  }
}

// Função para dividir mensagens longas
function splitLongMessage(text) {
  // O WhatsApp tem um limite de 4096 caracteres por mensagem
  // Vamos usar 3500 para ter uma margem de segurança
  const MAX_LENGTH = 3500;
  
  // Se a mensagem for curta, retorna ela mesma
  if (!text || text.length <= MAX_LENGTH) {
    return [text];
  }
  
  const messages = [];
  let currentMessage = '';
  
  // Divide o texto em parágrafos
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    // Se adicionar este parágrafo exceder o limite, inicia uma nova mensagem
    if (currentMessage.length + paragraph.length + 1 > MAX_LENGTH) {
      messages.push(currentMessage);
      currentMessage = paragraph;
    } else {
      // Adiciona o parágrafo à mensagem atual
      if (currentMessage) {
        currentMessage += '\n' + paragraph;
      } else {
        currentMessage = paragraph;
      }
    }
  }
  
  // Adiciona a última mensagem
  if (currentMessage) {
    messages.push(currentMessage);
  }
  
  return messages;
}

export default {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  getMediaUrl,
  markMessageAsRead
};
