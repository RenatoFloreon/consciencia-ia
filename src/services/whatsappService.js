import axios from 'axios';
import { log } from '../utils/logger.js';

// Configurações
const WHATSAPP_API_VERSION = 'v22.0'; // Atualizado para a versão v22.0 que funcionou no curl
const MAX_RETRIES = 3;
const INITIAL_TIMEOUT = 30000; // 30 segundos
const RETRY_DELAY = 2000; // 2 segundos
const MAX_MESSAGE_LENGTH = 1000; // Limite de caracteres para mensagens do WhatsApp

/**
 * Obtém o valor de uma variável de ambiente de forma robusta
 * @param {string} name - Nome da variável de ambiente
 * @param {string} defaultValue - Valor padrão caso a variável não exista
 * @returns {string} - Valor da variável de ambiente ou valor padrão
 */
function getEnvVar(name, defaultValue = '') {
  // Tenta várias formas de acessar a variável (maiúsculas, minúsculas, com/sem espaços)
  const variations = [
    name,
    name.toUpperCase(),
    name.toLowerCase(),
    name.replace(/[-_]/g, ''),
    name.replace(/[-_]/g, ' '),
    name.toUpperCase().replace(/[-_]/g, ''),
    name.toLowerCase().replace(/[-_]/g, '')
  ];
  
  for (const variation of variations) {
    if (process.env[variation]) {
      return process.env[variation];
    }
  }
  
  log(`Variável de ambiente ${name} não encontrada, usando valor padrão: ${defaultValue}`);
  return defaultValue;
}

// Obtém as variáveis de ambiente de forma robusta
const WHATSAPP_TOKEN = getEnvVar('WHATSAPP_TOKEN', '');
const WHATSAPP_PHONE_ID = getEnvVar('WHATSAPP_PHONE_ID', '');
const WHATSAPP_VERIFY_TOKEN = getEnvVar('WHATSAPP_VERIFY_TOKEN', 'consciencia-ia-token');

// Verifica se as variáveis essenciais estão definidas
if (!WHATSAPP_TOKEN) {
  log('ERRO: WHATSAPP_TOKEN não está definido!');
}

if (!WHATSAPP_PHONE_ID) {
  log('ERRO: WHATSAPP_PHONE_ID não está definido!');
}

// Configuração do cliente axios com timeout aumentado
const whatsappClient = axios.create({
  baseURL: `https://graph.facebook.com/${WHATSAPP_API_VERSION}/`,
  timeout: INITIAL_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
  }
});

/**
 * Função de sleep para implementar delay entre retries
 * @param {number} ms - Tempo em milissegundos
 * @returns {Promise} - Promise que resolve após o tempo especificado
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
 * Envia uma mensagem de texto para um número de telefone via WhatsApp
 * Implementa retry com backoff exponencial
 * @param {string} to - Número de telefone de destino
 * @param {string} text - Texto da mensagem
 * @returns {Promise<boolean>} - Sucesso ou falha no envio
 */
export async function sendTextMessage(to, text) {
  try {
    if (!to || !text) {
      log('ERRO: Número de telefone e texto são obrigatórios');
      return false;
    }
    
    log(`Enviando mensagem para ${to}: ${text.substring(0, 50)}...`);
    
    // Verifica se as variáveis essenciais estão definidas
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      log('ERRO: Variáveis de ambiente WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID não definidas');
      return false;
    }
    
    // Divide mensagens longas
    const messageParts = splitLongMessage(text);
    let finalSuccess = true;
    
    // Envia cada parte da mensagem
    for (const part of messageParts) {
      // Payload exatamente igual ao formato do curl que funcionou
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { 
          preview_url: true,
          body: part 
        }
      };
      
      log(`Payload: ${JSON.stringify(payload)}`);
      
      // Implementa retry com backoff exponencial
      let success = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          log(`Tentativa ${attempt} de enviar mensagem para ${to}`);
          
          // Aumenta o timeout a cada tentativa
          const timeout = INITIAL_TIMEOUT * attempt;
          
          // Usando o formato exato da URL que funcionou no curl
          const url = `${WHATSAPP_PHONE_ID}/messages`;
          log(`URL: https://graph.facebook.com/${WHATSAPP_API_VERSION}/${url}`);
          
          const response = await whatsappClient({
            method: 'post',
            url: url,
            data: payload,
            timeout: timeout
          });
          
          log(`Mensagem enviada com sucesso para ${to}. Status: ${response.status}`);
          log(`Resposta: ${JSON.stringify(response.data)}`);
          success = true;
          break;
        } catch (error) {
          const errorMessage = error.response?.data?.error?.message || error.message || 'Erro desconhecido';
          const errorCode = error.response?.data?.error?.code || 'N/A';
          const statusCode = error.response?.status || 'N/A';
          
          log(`Erro na tentativa ${attempt} ao enviar mensagem: ${errorMessage} (Código: ${errorCode}, Status: ${statusCode})`);
          
          // Se for a última tentativa, registra falha
          if (attempt === MAX_RETRIES) {
            log(`Erro detalhado ao enviar mensagem: ${error}`);
            log('Resultado do envio de mensagem: Falha');
            finalSuccess = false;
          } else {
            // Calcula o delay com backoff exponencial
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
            log(`Aguardando ${delay}ms antes da próxima tentativa...`);
            await sleep(delay);
          }
        }
      }
      
      // Adiciona um pequeno atraso entre mensagens para evitar problemas de ordem
      if (messageParts.length > 1 && messageParts.indexOf(part) < messageParts.length - 1) {
        await sleep(500);
      }
    }
    
    return finalSuccess;
  } catch (error) {
    log(`Erro geral ao enviar mensagem: ${error.message}`);
    return false;
  }
}

/**
 * Envia uma mensagem com template via WhatsApp
 * @param {string} to - Número de telefone do destinatário
 * @param {string} templateName - Nome do template
 * @param {string} language - Código do idioma (ex: pt_BR)
 * @param {Array} components - Componentes do template
 * @returns {Promise<Object|null>} - Resposta da API ou null em caso de erro
 */
async function sendTemplateMessage(to, templateName, language = 'pt_BR', components = []) {
  try {
    if (!to || !templateName) {
      log('ERRO: Número de telefone e nome do template são obrigatórios');
      return null;
    }

    // Payload para mensagem de template
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: language
        }
      }
    };
    
    // Adiciona componentes se fornecidos
    if (components && components.length > 0) {
      payload.template.components = components;
    }
    
    // Implementa retry com backoff exponencial
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log(`Tentativa ${attempt} de enviar template ${templateName} para ${to}`);
        
        // Aumenta o timeout a cada tentativa
        const timeout = INITIAL_TIMEOUT * attempt;
        
        // Usando o formato exato da URL que funcionou no curl
        const url = `${WHATSAPP_PHONE_ID}/messages`;
        
        const response = await whatsappClient({
          method: 'post',
          url: url,
          data: payload,
          timeout: timeout
        });
        
        log(`Template enviado com sucesso para ${to}. Status: ${response.status}`);
        return response.data;
      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message || 'Erro desconhecido';
        const errorCode = error.response?.data?.error?.code || 'N/A';
        const statusCode = error.response?.status || 'N/A';
        
        log(`Erro na tentativa ${attempt} ao enviar template: ${errorMessage} (Código: ${errorCode}, Status: ${statusCode})`);
        
        // Se for a última tentativa, retorna null
        if (attempt === MAX_RETRIES) {
          log(`Erro detalhado ao enviar template: ${error}`);
          return null;
        }
        
        // Calcula o delay com backoff exponencial
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
        log(`Aguardando ${delay}ms antes da próxima tentativa...`);
        await sleep(delay);
      }
    }
    
    return null;
  } catch (error) {
    log(`Erro geral ao enviar template: ${error.message}`);
    return null;
  }
}

/**
 * Obtém a URL de uma mídia do WhatsApp
 * @param {string} mediaId - ID da mídia
 * @returns {Promise<string|null>} - URL da mídia ou null em caso de erro
 */
export async function getMediaUrl(mediaId) {
  try {
    log(`Obtendo URL da mídia ${mediaId}`);
    
    // Verifica se as variáveis essenciais estão definidas
    if (!WHATSAPP_TOKEN) {
      log('ERRO: Variável de ambiente WHATSAPP_TOKEN não definida');
      return null;
    }
    
    const response = await whatsappClient.get(`${mediaId}`);
    
    if (response.data && response.data.url) {
      log(`URL da mídia obtida com sucesso: ${response.data.url.substring(0, 50)}...`);
      return response.data.url;
    }
    
    log('URL da mídia não encontrada na resposta');
    return null;
  } catch (error) {
    log(`Erro ao obter URL da mídia: ${error.message}`);
    return null;
  }
}

/**
 * Baixa uma mídia do WhatsApp
 * @param {string} mediaUrl - URL da mídia
 * @returns {Promise<Buffer|null>} - Buffer com os dados da mídia ou null em caso de erro
 */
export async function downloadMedia(mediaUrl) {
  try {
    log(`Baixando mídia de ${mediaUrl}`);
    
    // Verifica se as variáveis essenciais estão definidas
    if (!WHATSAPP_TOKEN) {
      log('ERRO: Variável de ambiente WHATSAPP_TOKEN não definida');
      return null;
    }
    
    const response = await axios.get(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      },
      responseType: 'arraybuffer',
      timeout: INITIAL_TIMEOUT
    });
    
    log('Mídia baixada com sucesso');
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    log(`Erro ao baixar mídia: ${error.message}`);
    return null;
  }
}

/**
 * Marca uma mensagem como lida
 * @param {string} messageId - ID da mensagem
 * @returns {Promise<boolean>} - Sucesso ou falha na operação
 */
export async function markMessageAsRead(messageId) {
  try {
    if (!messageId) {
      log('ERRO: ID da mensagem é obrigatório');
      return false;
    }

    log(`Marcando mensagem ${messageId} como lida`);
    
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    };
    
    const url = `${WHATSAPP_PHONE_ID}/messages`;
    
    const response = await whatsappClient({
      method: 'post',
      url: url,
      data: payload
    });
    
    log(`Mensagem marcada como lida com sucesso. Status: ${response.status}`);
    return true;
  } catch (error) {
    log(`Erro ao marcar mensagem como lida: ${error.message}`);
    return false;
  }
}

/**
 * Verifica o token do webhook do WhatsApp
 * @param {string} mode - Modo de verificação
 * @param {string} token - Token a ser verificado
 * @returns {boolean} - Resultado da verificação
 */
export function verifyWebhook(mode, token) {
  log(`Verificando webhook: mode=${mode}, token=${token}`);
  
  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    log('Webhook verificado com sucesso');
    return true;
  }
  
  log('Falha na verificação do webhook');
  return false;
}

// Exporta as funções
export default {
  sendTextMessage,
  sendTemplateMessage,
  getMediaUrl,
  downloadMedia,
  markMessageAsRead,
  verifyWebhook
};
