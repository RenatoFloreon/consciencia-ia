import axios from 'axios';
import { log } from '../utils/logger.js';

/**
 * Serviço para análise de imagens usando GPT-4o Vision
 */

/**
 * Analisa uma imagem de perfil para extrair insights
 * @param {string} imageUrl - URL da imagem a ser analisada
 * @returns {Promise<string>} - Texto da análise
 */
export async function analyzeProfileImage(imageUrl) {
  try {
    return await openaiService.analyzeImageWithVision(imageUrl);
  } catch (err) {
    log('Erro na análise de imagem de perfil:', err);
    return '';
  }
}

/**
 * Classifica o tipo de imagem (screenshot ou foto)
 * @param {string} imageUrl - URL da imagem a ser classificada
 * @returns {Promise<string>} - Tipo da imagem ('screenshot' ou 'image')
 */
export async function classifyImageType(imageUrl) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    };
    
    const messages = [
      {
        role: "user",
        content: [
          { 
            type: "text", 
            text: "Esta imagem é um screenshot/print de tela ou uma foto/imagem normal? Responda apenas com 'screenshot' ou 'image'." 
          },
          { 
            type: "image_url", 
            image_url: { url: imageUrl } 
          }
        ]
      }
    ];
    
    const body = {
      model: "gpt-4o",
      messages,
      temperature: 0.1,
      max_tokens: 50
    };
    
    const response = await axios.post(OPENAI_API_URL, body, { headers } );
    const result = response.data.choices[0].message.content.toLowerCase();
    
    if (result.includes('screenshot') || result.includes('print')) {
      return 'screenshot';
    } else {
      return 'image';
    }
  } catch (err) {
    log('Erro na classificação do tipo de imagem:', err);
    return 'image'; // Padrão para caso de erro
  }
}

/**
 * Analisa uma imagem a partir de uma URL
 * @param {string} imageUrl - URL da imagem a ser analisada
 * @returns {Promise<string>} - Texto da análise
 */
export async function analyzeImageFromUrl(imageUrl) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    };
    
    const messages = [
      {
        role: "user",
        content: [
          { 
            type: "text", 
            text: "Analise esta imagem e extraia insights sobre a personalidade, interesses e características da pessoa ou perfil mostrado. Seja detalhado mas conciso." 
          },
          { 
            type: "image_url", 
            image_url: { url: imageUrl } 
          }
        ]
      }
    ];
    
    const body = {
      model: "gpt-4o",
      messages,
      temperature: 0.5,
      max_tokens: 500
    };
    
    const response = await axios.post(OPENAI_API_URL, body, { headers } );
    return response.data.choices[0].message.content;
  } catch (err) {
    log('Erro na análise de imagem a partir de URL:', err);
    return '';
  }
}

// Importação circular resolvida colocando no final do arquivo
import * as openaiService from './openaiService.js';
