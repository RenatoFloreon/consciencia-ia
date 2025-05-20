import axios from 'axios';
import { log } from '../utils/logger.js';

/**
 * Serviço para extrair informações de perfis de redes sociais
 */

/**
 * Extrai informações de um perfil do Instagram ou LinkedIn
 * @param {string} profileUrl - URL ou username do perfil
 * @returns {Promise<Object>} - Dados extraídos do perfil
 */
export async function scrapeProfile(profileUrl) {
  try {
    if (!profileUrl) {
      return null;
    }
    
    // Normaliza a entrada (URL ou @username)
    let normalizedUrl = profileUrl;
    let platform = 'unknown';
    
    // Verifica se é um @username do Instagram
    if (profileUrl.startsWith('@')) {
      const username = profileUrl.substring(1);
      normalizedUrl = `https://www.instagram.com/${username}/`;
      platform = 'instagram';
    }
    // Verifica se é uma URL do Instagram
    else if (profileUrl.includes('instagram.com' )) {
      platform = 'instagram';
    }
    // Verifica se é uma URL do LinkedIn
    else if (profileUrl.includes('linkedin.com')) {
      platform = 'linkedin';
    }
    
    // Extrai o username da URL
    let username = null;
    try {
      const urlObj = new URL(normalizedUrl);
      const path = urlObj.pathname.replace(/^\/|\/$/g, '');
      
      if (platform === 'instagram') {
        username = path.split('/')[0];
      } else if (platform === 'linkedin') {
        if (path.startsWith('in/')) {
          username = path.substring(3).split('/')[0];
        } else if (path.startsWith('company/')) {
          username = path.substring(8).split('/')[0];
        }
      }
    } catch (error) {
      // Se não for uma URL válida, usa o valor original
      username = profileUrl.replace('@', '');
    }
    
    // Retorna os dados básicos do perfil
    // Em um ambiente real, aqui seria feita uma chamada para um serviço de scraping
    return {
      username,
      platform,
      url: normalizedUrl,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    log('Erro ao extrair informações do perfil:', error);
    return null;
  }
}

/**
 * Analisa um perfil para extrair insights usando OpenAI
 * @param {string} profileUrl - URL ou username do perfil
 * @returns {Promise<string>} - Texto com insights sobre o perfil
 */
export async function analyzeProfileWithAI(profileUrl) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  
  try {
    const profileData = await scrapeProfile(profileUrl );
    
    if (!profileData) {
      return '';
    }
    
    const prompt = `Analise este perfil de ${profileData.platform}:
Username: ${profileData.username}
URL: ${profileData.url}

Extraia insights sobre a personalidade, interesses e características profissionais desta pessoa com base nas informações disponíveis.`;
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    };
    
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    };
    
    const response = await axios.post(OPENAI_API_URL, body, { headers });
    return response.data.choices[0].message.content;
  } catch (error) {
    log('Erro ao analisar perfil com IA:', error);
    return '';
  }
}
