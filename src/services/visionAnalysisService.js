/**
 * @fileoverview Serviço opcional para análise de imagens de perfil usando GPT-4 Vision.
 * Converte a imagem de perfil em uma mensagem para o modelo GPT-4 com visão para obter descrições.
 */

const OpenAI = require('openai');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

// Inicializar cliente OpenAI (modelo com visão, se disponível)
let openai;
if (config.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        organization: config.OPENAI_ORGANIZATION
    });
}

/**
 * Analisa uma imagem de perfil (via URL) usando GPT-4 Vision e retorna uma descrição textual.
 * @param {string} imageUrl - URL da imagem de perfil a ser analisada.
 * @returns {Promise<string|null>} Descrição gerada ou null se não for possível analisar.
 */
const analyzeProfileImage = async (imageUrl) => {
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
                Analise esta imagem de perfil do Instagram e descreva:
                1. O que a pessoa está fazendo na foto
                2. O ambiente ou cenário (interior, exterior, natureza, urbano, etc.)
                3. O estilo visual e as cores predominantes
                4. A impressão geral transmitida (profissional, casual, artística, etc.)
                5. Quaisquer elementos notáveis (objetos, símbolos, texto presentes)
                
                Forneça uma análise concisa em português.
                `;
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
        logInfo('VISION_ANALYSIS', 'Descrição da imagem gerada com sucesso');
        return description || null;
    } catch (error) {
        logError('VISION_ANALYSIS', `Erro na análise de imagem: ${error.message}`, error);
        return null;
    }
};

module.exports = { analyzeProfileImage };
