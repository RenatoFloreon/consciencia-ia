import axios from 'axios';
import { log } from '../utils/logger.js';

// Configurações do WhatsApp API
const WHATSAPP_API_URL = 'https://graph.facebook.com/v17.0';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// Função para verificar configurações do WhatsApp
function checkWhatsAppConfig() {
  if (!WHATSAPP_TOKEN) {
    log('⚠️ ERRO CRÍTICO: Token do WhatsApp não configurado! Verifique a variável de ambiente WHATSAPP_TOKEN no painel do Vercel.');
    return false;
  }
  
  if (!WHATSAPP_PHONE_ID) {
    log('⚠️ ERRO CRÍTICO: ID do telefone do WhatsApp não configurado! Verifique a variável de ambiente WHATSAPP_PHONE_ID no painel do Vercel.');
    return false;
  }
  
  return true;
}

// Função para enviar mensagem de texto
async function sendTextMessage(to, text) {
  try {
    if (!to || !text) {
      log('Erro: Número de telefone ou texto não fornecidos');
      return false;
    }
    
    log(`Enviando mensagem para ${to}: ${text.substring(0, 50)}...`);
    
    // Verifica configurações do WhatsApp
    if (!checkWhatsAppConfig()) {
      // Se as configurações não estiverem corretas, simula sucesso em ambiente de desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        log('Ambiente de desenvolvimento: simulando envio bem-sucedido');
        return true;
      }
      return false;
    }
    
    // Divide mensagens longas para evitar cortes
    const messages = splitLongMessage(text);
    let successCount = 0;
    
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
          },
          timeout: 10000 // 10 segundos de timeout
        });
        
        log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
        successCount++;
      } catch (sendError) {
        log('Erro detalhado ao enviar mensagem:', sendError.response?.data || sendError.message);
        // Continua tentando enviar as outras partes da mensagem
      }
      
      // Aguarda um pequeno intervalo entre mensagens para evitar bloqueios
      if (messages.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Considera sucesso se pelo menos uma parte foi enviada
    return successCount > 0;
  } catch (error) {
    log('Erro ao enviar mensagem de texto:', error.response?.data || error.message);
    return false;
  }
}

// Função para enviar mensagem com botões
async function sendButtonMessage(to, text, buttons) {
  try {
    if (!to || !text || !buttons || !buttons.length) {
      log('Erro: Parâmetros incompletos para envio de mensagem com botões');
      return false;
    }
    
    log(`Enviando mensagem com botões para ${to}`);
    
    // Verifica configurações do WhatsApp
    if (!checkWhatsAppConfig()) {
      // Se as configurações não estiverem corretas, simula sucesso em ambiente de desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        log('Ambiente de desenvolvimento: simulando envio bem-sucedido');
        return true;
      }
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
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    log('Erro ao enviar mensagem com botões:', error.response?.data || error.message);
    
    // Em ambiente de desenvolvimento, simula sucesso
    if (process.env.NODE_ENV === 'development') {
      log('Ambiente de desenvolvimento: simulando envio bem-sucedido');
      return true;
    }
    
    return false;
  }
}

// Função para enviar mensagem com lista
async function sendListMessage(to, text, sections) {
  try {
    if (!to || !text || !sections || !sections.length) {
      log('Erro: Parâmetros incompletos para envio de mensagem com lista');
      return false;
    }
    
    log(`Enviando mensagem com lista para ${to}`);
    
    // Verifica configurações do WhatsApp
    if (!checkWhatsAppConfig()) {
      // Se as configurações não estiverem corretas, simula sucesso em ambiente de desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        log('Ambiente de desenvolvimento: simulando envio bem-sucedido');
        return true;
      }
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
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    log('Erro ao enviar mensagem com lista:', error.response?.data || error.message);
    
    // Em ambiente de desenvolvimento, simula sucesso
    if (process.env.NODE_ENV === 'development') {
      log('Ambiente de desenvolvimento: simulando envio bem-sucedido');
      return true;
    }
    
    return false;
  }
}

// Função para obter URL de mídia
async function getMediaUrl(mediaId) {
  try {
    if (!mediaId) {
      log('Erro: ID da mídia não fornecido');
      return null;
    }
    
    log(`Obtendo URL da mídia ${mediaId}`);
    
    // Verifica configurações do WhatsApp
    if (!checkWhatsAppConfig()) {
      return null;
    }
    
    const response = await axios({
      method: 'GET',
      url: `${WHATSAPP_API_URL}/${mediaId}`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    log(`URL da mídia obtida: ${response.data.url}`);
    
    // Obtém o conteúdo da mídia
    const mediaResponse = await axios({
      method: 'GET',
      url: response.data.url,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      },
      responseType: 'arraybuffer',
      timeout: 10000 // 10 segundos de timeout
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
    if (!messageId) {
      log('Erro: ID da mensagem não fornecido');
      return false;
    }
    
    log(`Marcando mensagem ${messageId} como lida`);
    
    // Verifica configurações do WhatsApp
    if (!checkWhatsAppConfig()) {
      // Se as configurações não estiverem corretas, simula sucesso em ambiente de desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        log('Ambiente de desenvolvimento: simulando marcação bem-sucedida');
        return true;
      }
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
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    log(`Resposta da API do WhatsApp: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    log('Erro ao marcar mensagem como lida:', error.response?.data || error.message);
    
    // Em ambiente de desenvolvimento, simula sucesso
    if (process.env.NODE_ENV === 'development') {
      log('Ambiente de desenvolvimento: simulando marcação bem-sucedida');
      return true;
    }
    
    return false;
  }
}

// Função para dividir mensagens longas
function splitLongMessage(text) {
  // O WhatsApp tem um limite de 4096 caracteres por mensagem
  // Vamos usar 3500 para ter uma margem de segurança
  const MAX_LENGTH = 3500;
  
  // Se a mensagem for curta ou não existir, retorna ela mesma
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
  markMessageAsRead,
  checkWhatsAppConfig
};
