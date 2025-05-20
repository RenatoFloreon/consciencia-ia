/**
 * @fileoverview Serviço para análise de imagens de perfil usando GPT-4 Vision.
 * Converte a imagem de perfil em uma mensagem para o modelo GPT-4 Vision para obter descrições e classificações.
 */
import OpenAI from 'openai';
import config from '../config/env.js';
import { logInfo, logError } from '../utils/logger.js';

// Inicializar cliente OpenAI (modelo com visão, se disponível)
let openai;
if (config.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    organization: config.OPENAI_ORGANIZATION
  });
}

/**
 * Analisa uma imagem de perfil (via URL) usando GPT-4 Vision e retorna uma descrição textual concisa.
 * @param {string} imageUrl - URL da imagem de perfil a ser analisada.
 * @returns {Promise<string|null>} Descrição gerada ou null se não for possível analisar.
 */
export async function analyzeProfileImage(imageUrl) {
  logInfo('VISION_ANALYSIS', `Analisando imagem de perfil: ${imageUrl}`);
  try {
    if (!openai) {
      logError('VISION_ANALYSIS', 'OpenAI não inicializada para análise de imagem.');
      return null;
    }
    if (!imageUrl) {
      return null;
    }
    // Montar prompt de análise de imagem de perfil
    const prompt = `
      Analise esta imagem de perfil e descreva de forma concisa:
      1. O que a pessoa ou imagem transmite (ações, ambiente, estilo)
      2. A impressão geral (profissional, casual, artística, etc.)
      3. Qualquer elemento notável (objetos, símbolos, texto visível, marcas)
      
      Responda em poucas frases, em português.`;
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 300
    });
    const description = response.choices[0].message.content;
    logInfo('VISION_ANALYSIS', 'Descrição da imagem gerada com sucesso.');
    return description || null;
  } catch (error) {
    logError('VISION_ANALYSIS', `Erro na análise de imagem: ${error.message}`, error);
    return null;
  }
}

/**
 * Classifica o tipo de imagem enviada (foto de perfil ou captura de tela de perfil) usando GPT-4 Vision.
 * @param {string} imageUrl - URL da imagem a ser classificada.
 * @returns {Promise<string|null>} 'screenshot' se for captura de tela, 'photo' se for foto comum, ou null se indeterminado.
 */
export async function classifyImageType(imageUrl) {
  logInfo('VISION_ANALYSIS', `Classificando tipo da imagem: ${imageUrl}`);
  try {
    if (!openai) {
      return null;
    }
    const prompt = "A imagem fornecida é uma captura de tela de um perfil de rede social (contendo elementos da interface) ou uma fotografia comum? Responda apenas 'screenshot' ou 'photo'.";
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 10
    });
    const answer = response.choices[0].message.content.toLowerCase().trim();
    if (answer.includes('screenshot') || answer.includes('captura')) {
      return 'screenshot';
    }
    if (answer.includes('photo') || answer.includes('foto')) {
      return 'photo';
    }
    return null;
  } catch (error) {
    logError('VISION_ANALYSIS', `Erro na classificação da imagem: ${error.message}`, error);
    return null;
  }
}
