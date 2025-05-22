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
    return `${name || 'Alma empreendedora'}, a IA não é apenas tecnologia, é uma extensão da sua intuição para superar "${challenge || 'os desafios do seu caminho'}". 

Imagine ter um oráculo digital que antecipa tendências antes que se tornem visíveis, um assistente que automatiza o mundano para que você habite o extraordinário, e um amplificador que transforma seu sussurro em um chamado que ressoa pelo universo digital.

As ferramentas existem. A magia está em como você as usa para manifestar sua visão única no mundo.`;
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
    return `🪷 Pílula de Inspiração

Nos mares do sonho, veleje sem temor,
Cada solução é um farol que guia com amor.
Na dança das ondas, encontre a harmonia,
E com cada venda, celebre a sinfonia.

${name || 'Alma vibrante'}, teu espírito é forte, tua visão é clara,
Escalar é arte, e a tua luz nunca para.
Com coragem e propósito, o mundo vais iluminar,
E com cada passo, mais longe vais chegar.`;
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
    let prompt = `Decodifique a essência arquetípica deste perfil e revele insights tão profundos que até pareçam segredos: ${JSON.stringify(profileData)}`;
    
    // Faz a chamada para a API da OpenAI
    const response = await openaiService.analyzeImageWithVision(prompt);
    
    return response;
  } catch (error) {
    log('Erro ao gerar resumo de perfil:', error);
    return '';
  }
}
