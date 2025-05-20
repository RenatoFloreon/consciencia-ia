import axios from 'axios';
import { log } from '../utils/logger.js';

// Configurações
const WHATSAPP_API_VERSION = 'v18.0'; // Atualizado para a versão mais recente
const MAX_RETRIES = 3;
const INITIAL_TIMEOUT = 30000; // 30 segundos
const RETRY_DELAY = 2000; // 2 segundos

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
 * Envia uma mensagem de texto para um número de telefone via WhatsApp
 * Implementa retry com backoff exponencial
 * @param {string} to - Número de telefone de destino
 * @param {string} text - Texto da mensagem
 * @returns {boolean} - Sucesso ou falha no envio
 */
export async function sendTextMessage(to, text) {
  log(`Enviando mensagem para ${to}: ${text.substring(0, 50)}...`);
  
  // Verifica se as variáveis essenciais estão definidas
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    log('ERRO: Variáveis de ambiente WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID não definidas');
    return false;
  }
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      body: text
    }
  };
  
  // Implementa retry com backoff exponencial
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Tentativa ${attempt} de enviar mensagem para ${to}`);
      
      // Aumenta o timeout a cada tentativa
      const timeout = INITIAL_TIMEOUT * attempt;
      
      const response = await whatsappClient({
        method: 'post',
        url: `${WHATSAPP_PHONE_ID}/messages`,
        data: payload,
        timeout: timeout
      });
      
      log(`Mensagem enviada com sucesso para ${to}. Status: ${response.status}`);
      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Erro desconhecido';
      const errorCode = error.response?.data?.error?.code || 'N/A';
      const statusCode = error.response?.status || 'N/A';
      
      log(`Erro na tentativa ${attempt} ao enviar mensagem: ${errorMessage} (Código: ${errorCode}, Status: ${statusCode})`);
      
      // Se for a última tentativa, retorna falha
      if (attempt === MAX_RETRIES) {
        log(`Erro detalhado ao enviar mensagem: ${error}`);
        log('Resultado do envio de mensagem: Falha');
        return false;
      }
      
      // Calcula o delay com backoff exponencial
      const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
      log(`Aguardando ${delay}ms antes da próxima tentativa...`);
      await sleep(delay);
    }
  }
  
  return false;
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

// Exporta as funções
export default {
  sendTextMessage,
  verifyWebhook,
  getMediaUrl,
  downloadMedia
};
