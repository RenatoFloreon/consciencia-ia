import axios from 'axios';
import { log } from '../utils/logger.js';

/**
 * Serviço para extrair informações de perfis de redes sociais
 */

/**
 * Normaliza uma URL ou username do Instagram/LinkedIn
 * @param {string} input - URL ou username (@username)
 * @returns {Object} - Objeto com URL normalizada e tipo de rede social
 */
function normalizeProfileInput(input) {
  if (!input) return { url: null, type: null };
  
  input = input.trim();
  
  // Verifica se é um @username do Instagram
  if (input.startsWith('@')) {
    const username = input.substring(1);
    return {
      url: `https://www.instagram.com/${username}/`,
      type: 'instagram'
    };
  }
  
  // Verifica se é uma URL do Instagram
  if (input.includes('instagram.com')) {
    // Garante que a URL termina com /
    const url = input.endsWith('/') ? input : `${input}/`;
    return {
      url,
      type: 'instagram'
    };
  }
  
  // Verifica se é uma URL do LinkedIn
  if (input.includes('linkedin.com')) {
    // Garante que a URL termina com /
    const url = input.endsWith('/') ? input : `${input}/`;
    return {
      url,
      type: 'linkedin'
    };
  }
  
  // Se não for reconhecido, retorna o input original
  return {
    url: input,
    type: 'unknown'
  };
}

/**
 * Extrai o username de uma URL de perfil
 * @param {string} url - URL do perfil
 * @returns {string} - Username extraído
 */
function extractUsername(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    
    // Para Instagram
    if (urlObj.hostname.includes('instagram.com')) {
      // Remove a barra inicial e final
      const path = urlObj.pathname.replace(/^\/|\/$/g, '');
      // O username é o primeiro segmento do caminho
      return path.split('/')[0];
    }
    
    // Para LinkedIn
    if (urlObj.hostname.includes('linkedin.com')) {
      // Remove a barra inicial e final
      const path = urlObj.pathname.replace(/^\/|\/$/g, '');
      // O username está após "in/" ou "company/"
      if (path.startsWith('in/')) {
        return path.substring(3).split('/')[0];
      }
      if (path.startsWith('company/')) {
        return path.substring(8).split('/')[0];
      }
    }
    
    return null;
  } catch (error) {
    // Se não for uma URL válida, retorna null
    return null;
  }
}

/**
 * Extrai informações de um perfil do Instagram ou LinkedIn
 * @param {string} profileUrl - URL ou username do perfil
 * @returns {Promise<Object>} - Dados extraídos do perfil
 */
export async function scrapeProfile(profileUrl) {
  try {
    const { url, type } = normalizeProfileInput(profileUrl);
    
    if (!url) {
      throw new Error('URL de perfil inválida');
    }
    
    const username = extractUsername(url);
    
    // Simula a extração de dados do perfil
    // Em um ambiente de produção, isso seria substituído por um scraper real
    // ou uma chamada para uma API de scraping
    
    // Dados simulados para demonstração
    const profileData = {
      username,
      platform: type,
      url,
      lastUpdated: new Date().toISOString()
    };
    
    // Tenta enriquecer os dados com informações adicionais
    try {
      // Aqui seria feita uma chamada para um serviço de enriquecimento de dados
      // Por exemplo, uma API que fornece mais informações sobre o perfil
      
      // Simulação de dados enriquecidos
      if (type === 'instagram') {
        profileData.followerCount = 'N/A (simulado)';
        profileData.postCount = 'N/A (simulado)';
        profileData.bio = 'N/A (simulado)';
      } else if (type === 'linkedin') {
        profileData.position = 'N/A (simulado)';
        profileData.company = 'N/A (simulado)';
        profileData.education = 'N/A (simulado)';
      }
    } catch (enrichError) {
      log('Erro ao enriquecer dados do perfil:', enrichError);
      // Continua mesmo se o enriquecimento falhar
    }
    
    return profileData;
  } catch (error) {
    log('Erro ao extrair informações do perfil:', error);
    return null;
  }
}

/**
 * Analisa um perfil para extrair insights
 * @param {string} profileUrl - URL ou username do perfil
 * @returns {Promise<string>} - Texto com insights sobre o perfil
 */
export async function analyzeProfile(profileUrl) {
  try {
    const profileData = await scrapeProfile(profileUrl);
    
    if (!profileData) {
      return '';
    }
    
    // Em um ambiente real, aqui seria feita uma chamada para a API da OpenAI
    // para analisar os dados do perfil e gerar insights
    
    // Simulação de análise para demonstração
    return `Análise baseada no perfil ${profileData.username} da plataforma ${profileData.platform}.`;
  } catch (error) {
    log('Erro ao analisar perfil:', error);
    return '';
  }
}
