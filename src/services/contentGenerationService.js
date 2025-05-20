import * as openaiService from './openaiService.js';
import { log } from '../utils/logger.js';

/**
 * Serviço para geração de conteúdo personalizado
 */

/**
 * Gera uma carta de consciência personalizada
 * @param {Object} userData - Dados do usuário para personalização
 * @returns {Promise<string>} - Texto da carta gerada
 */
export async function generateConscienceLetter(userData) {
  try {
    return await openaiService.generateConscienceLetter(userData);
  } catch (error) {
    log('Erro ao gerar carta de consciência:', error);
    throw error;
  }
}

/**
 * Gera uma sugestão de como a IA pode ajudar com o desafio
 * @param {string} name - Nome do usuário
 * @param {string} challenge - Desafio mencionado pelo usuário
 * @returns {Promise<string>} - Texto com sugestões de IA
 */
export async function generateIAHelp(name, challenge) {
  try {
    return await openaiService.generateIAHelp(name, challenge);
  } catch (error) {
    log('Erro ao gerar sugestão de IA:', error);
    
    // Fallback em caso de erro
    return `${name || 'Empreendedor'}, a IA pode ser uma aliada poderosa para superar desafios como "${challenge || 'crescimento nos negócios'}". Considere usar assistentes virtuais para automação, análise de dados para insights de mercado, ou ferramentas de IA generativa para criação de conteúdo. Para mais informações personalizadas, entre em contato com nossa equipe.`;
  }
}

/**
 * Gera uma inspiração personalizada
 * @param {string} name - Nome do usuário
 * @param {string} challenge - Desafio mencionado pelo usuário
 * @returns {Promise<string>} - Texto inspiracional
 */
export async function generateInspiration(name, challenge) {
  try {
    return await openaiService.generateInspiration(name, challenge);
  } catch (error) {
    log('Erro ao gerar inspiração:', error);
    
    // Fallback em caso de erro
    return `✨ *Pílula de Inspiração*

Em mares de incerteza, você navega, ${name || 'empreendedor'},
Com a Alma do Negócio a iluminar,
Desafios enormes, como montanhas se elevam,
Mas você está aqui para conquistar.

No vulcão do desafio, um diamante nasce,
Em seu Ikigai, sua verdadeira luz resplandece,
Em seu espírito, um fogo incansável arde,
Você é a estrela que o universo conhece.`;
  }
}

/**
 * Gera um resumo de perfil com base em dados coletados
 * @param {Object} profileData - Dados do perfil
 * @returns {Promise<string>} - Texto com resumo do perfil
 */
export async function generateProfileSummary(profileData) {
  try {
    if (!profileData) {
      return '';
    }
    
    // Constrói o prompt com base nos dados disponíveis
    let prompt = `Gere um resumo conciso do perfil com base nestes dados: ${JSON.stringify(profileData)}`;
    
    // Faz a chamada para a API da OpenAI
    const response = await openaiService.analyzeImageWithVision(prompt);
    
    return response;
  } catch (error) {
    log('Erro ao gerar resumo de perfil:', error);
    return '';
  }
}
