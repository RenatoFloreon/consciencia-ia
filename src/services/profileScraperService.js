/**
 * @fileoverview Serviço de scraping e análise de perfis de redes sociais.
 * Extrai e analisa dados de perfis públicos do Instagram ou LinkedIn, combinando scraping tradicional e GPT-4 para insights.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import config from '../config/env.js';
import { logInfo, logError } from '../utils/logger.js';
import * as visionAnalysisService from './visionAnalysisService.js';

// Inicialização do cliente OpenAI para análises de texto (perfil)
let openai;
if (config.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    organization: config.OPENAI_ORGANIZATION,
  });
}

/**
 * Realiza análise híbrida do perfil (scraping + GPT).
 * Tenta extrair dados básicos via web scraping e depois complementa com análise GPT.
 * @param {string} profileUrl - URL do perfil público no Instagram ou LinkedIn.
 * @returns {Promise<Object|null>} Objeto com dados resumidos e análise.
 */
export async function analyzeProfile(profileUrl) {
  try {
    const response = await axios.get(profileUrl);
    const html = response.data;
    const $ = cheerio.load(html);

    const bio = $('meta[name="description"]').attr('content') || '';
    const image = $('meta[property="og:image"]').attr('content') || '';

    const scrapingSummary = `Bio detectada: ${bio}\nImagem de perfil detectada: ${image}`;

    let gptSummary = '';
    if (openai && bio) {
      const prompt = `Você é um analista comportamental. Com base na seguinte bio extraída de um perfil digital, gere uma interpretação resumida da personalidade do usuário.\n\n"${bio}"`;
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });
      gptSummary = completion.choices?.[0]?.message?.content || '';
    }

    // Análise da imagem com Vision (caso haja)
    let imageAnalysis = '';
    if (image) {
      imageAnalysis = await visionAnalysisService.analyzeImageFromUrl(image);
    }

    return {
      profileUrl,
      bio,
      image,
      scrapingSummary,
      gptSummary,
      imageAnalysis,
    };
  } catch (error) {
    logError('Erro ao analisar perfil:', error);
    return null;
  }
}
