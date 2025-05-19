/**
 * @fileoverview Serviço de scraping e análise de perfis de redes sociais.
 * Extrai e analisa dados de perfis públicos do Instagram ou LinkedIn, combinando scraping tradicional e GPT-4 para insights.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');
const visionAnalysisService = require('./visionAnalysisService');

// Inicialização do cliente OpenAI para análises de texto (perfil)
let openai;
if (config.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        organization: config.OPENAI_ORGANIZATION
    });
}

/**
 * Realiza análise híbrida do perfil (scraping + GPT).
 * Tenta extrair dados básicos via web scraping e depois complementa com análise GPT.
 * @param {string} profileUrl - URL do perfil público no Instagram ou LinkedIn.
 * @returns {Promise<Object|null>} Objeto com dados combinados do perfil e insights, ou null se falhar.
 */
const analyzeProfileHybrid = async (profileUrl) => {
    logInfo('HYBRID_PROFILE_ANALYSIS', `Iniciando análise híbrida do perfil: ${profileUrl}`);
    try {
        // Determinar o tipo de perfil (Instagram ou LinkedIn)
        const isInstagram = profileUrl.includes('instagram.com');
        const isLinkedIn = profileUrl.includes('linkedin.com');
        if (!isInstagram && !isLinkedIn) {
            logWarning('HYBRID_PROFILE_ANALYSIS', `URL não é Instagram nem LinkedIn: ${profileUrl}`);
            return null;
        }

        let scrapedData = null;

        // 1. Extrair dados via scraping tradicional
        if (isInstagram) {
            // Extrair username do link do Instagram
            const usernameMatch = profileUrl.match(/instagram\.com\/([^\/\?]+)/);
            const username = usernameMatch ? usernameMatch[1].replace('/', '') : null;
            if (username) {
                scrapedData = await scrapeInstagramProfile(username);
            }
        } else if (isLinkedIn) {
            scrapedData = await scrapeLinkedInProfile(profileUrl);
        }

        // 2. Análise superficial do perfil com GPT (sem scraping)
        const gptAnalysis = await analyzeProfileWithGPT(profileUrl);

        // 3. Combinar resultados de scraping e GPT
        const combinedAnalysis = {
            profileUrl,
            profileType: isInstagram ? 'instagram' : 'linkedin',
            scrapedData,
            gptAnalysis: gptAnalysis ? gptAnalysis.analysisText : null,
            timestamp: new Date().toISOString()
        };

        // 4. Gerar insights profundos com base nos dados coletados (usando GPT-4)
        if (openai && (scrapedData || gptAnalysis)) {
            try {
                const insightsPrompt = `
                Com base nas seguintes informações coletadas de um perfil de ${isInstagram ? 'Instagram' : 'LinkedIn'}, gere insights profundos sobre a pessoa:
                ${scrapedData ? `
                DADOS EXTRAÍDOS:
                Nome: ${scrapedData.fullName || 'Não disponível'}
                ${isInstagram ? `Bio: ${scrapedData.bio || 'Não disponível'}
                Hashtags: ${scrapedData.hashtags.join(', ') || 'Não disponível'}
                Temas de conteúdo: ${scrapedData.contentThemes.join(', ') || 'Não disponível'}
                Análise da imagem de perfil: ${scrapedData.profileImageAnalysis && scrapedData.profileImageAnalysis.description || 'Não disponível'}` 
                : `Headline: ${scrapedData.headline || 'Não disponível'}
                Análise da imagem de perfil: ${scrapedData.profileImageAnalysis && scrapedData.profileImageAnalysis.description || 'Não disponível'}`}` : 'Não foi possível extrair dados estruturados do perfil.'}
                
                ${gptAnalysis ? `ANÁLISE GPT:
                ${gptAnalysis.analysisText}` : 'Não foi possível realizar análise GPT do perfil.'}
                
                Gere insights profundos em português sobre:
                1. Personalidade e características marcantes da pessoa
                2. Possíveis desafios que ela enfrenta na vida profissional e pessoal
                3. Potenciais não explorados ou talentos latentes que se pode inferir
                4. Recomendações personalizadas para crescimento pessoal/profissional
                
                Seja específico e único, evitando generalidades, e foque em detalhes surpreendentes que possam tocar a pessoa.
                `;

                const insightsResponse = await openai.chat.completions.create({
                    model: "gpt-4-turbo",
                    messages: [
                        { role: "system", content: "Você é um especialista em análise comportamental e psicológica, capaz de gerar insights profundos e personalizados a partir de dados de perfis digitais." },
                        { role: "user", content: insightsPrompt }
                    ],
                    max_tokens: 1000
                });
                combinedAnalysis.deepInsights = insightsResponse.choices[0].message.content;
                logInfo('HYBRID_PROFILE_ANALYSIS', 'Insights profundos gerados com sucesso');
            } catch (error) {
                logWarning('HYBRID_PROFILE_ANALYSIS', `Não foi possível gerar insights profundos: ${error.message}`);
            }
        }

        logInfo('HYBRID_PROFILE_ANALYSIS', 'Análise híbrida de perfil concluída');
        return combinedAnalysis;
    } catch (error) {
        logError('HYBRID_PROFILE_ANALYSIS', 'Erro na análise híbrida do perfil', error);
        return null;
    }
};

/**
 * Analisa um perfil do Instagram publicamente disponível.
 * @param {string} username - Nome de usuário do Instagram (sem @).
 * @returns {Promise<Object>} Dados extraídos do perfil.
 */
const scrapeInstagramProfile = async (username) => {
    logInfo('INSTAGRAM_SCRAPE', `Extraindo dados do Instagram para usuário: ${username}`);
    try {
        // Remover arroba se presente
        username = username.replace('@', '');

        // Estrutura de dados para preencher
        const profileData = {
            username: username,
            fullName: '',
            bio: '',
            followersCount: 0,
            postsCount: 0,
            isBusinessAccount: false,
            businessCategory: '',
            recentPosts: [],
            hashtags: [],
            profileImageUrl: '',
            profileImageAnalysis: {},
            websiteUrl: '',
            linkedProfiles: {},
            contentThemes: [],
            locationInfo: '',
            additionalInfo: {}
        };

        // 1. Buscar HTML do Instagram (página pública)
        const response = await axios.get(`https://www.instagram.com/${username}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept-Language': 'en-US'
            },
            timeout: 15000
        });
        const $ = cheerio.load(response.data);

        // Extrair metadados do perfil
        const metaTags = $('meta');
        metaTags.each((i, el) => {
            const property = $(el).attr('property');
            if (property === 'og:title') {
                profileData.fullName = $(el).attr('content').split(' (')[0];
            }
            if (property === 'og:description') {
                const content = $(el).attr('content');
                if (content.includes('Followers') && content.includes('Following')) {
                    profileData.bio = content.split('Followers')[0].trim();
                    // Extrair contagem de seguidores
                    const followersMatch = content.match(/(\d+(?:,\d+)*) Followers/);
                    if (followersMatch) {
                        profileData.followersCount = parseInt(followersMatch[1].replace(/,/g, ''));
                    }
                    // Extrair contagem de posts
                    const postsMatch = content.match(/(\d+(?:,\d+)*) Posts/);
                    if (postsMatch) {
                        profileData.postsCount = parseInt(postsMatch[1].replace(/,/g, ''));
                    }
                }
            }
            // Extrair URL da imagem de perfil (foto de perfil)
            if (property === 'og:image') {
                profileData.profileImageUrl = $(el).attr('content');
            }
        });

        // Verificar tipo de conta
        if ($('a:contains("Contact")').length > 0) {
            profileData.isBusinessAccount = true;
        }
        // Categoria de negócio (se houver)
        const categoryElement = $('div:contains("·")').first();
        if (categoryElement.length > 0) {
            const categoryText = categoryElement.text();
            if (categoryText.includes('·')) {
                profileData.businessCategory = categoryText.split('·')[1].trim();
            }
        }
        // Website na bio (se houver)
        const linkElements = $('a[href^="http"]');
        linkElements.each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('instagram.com')) {
                profileData.websiteUrl = href;
                return false; // pega apenas o primeiro link externo encontrado
            }
        });
        // Hashtags mencionadas na bio
        const bioText = profileData.bio;
        const hashtagRegex = /#(\w+)/g;
        let match;
        while ((match = hashtagRegex.exec(bioText)) !== null) {
            profileData.hashtags.push(match[1]);
        }
        // Localização (se a bio tiver 📍)
        const locationElement = $('span:contains("📍")');
        if (locationElement.length > 0) {
            profileData.locationInfo = locationElement.text().replace('📍', '').trim();
        }

        // 2. Buscar informações adicionais via Google (ex: perfil LinkedIn)
        try {
            const googleResponse = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(profileData.fullName || username)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const $google = cheerio.load(googleResponse.data);
            // Extrair snippets de pesquisa
            const snippets = [];
            $google('.VwiC3b').each((i, el) => {
                const snippet = $google(el).text().trim();
                if (snippet && snippet.length > 20) {
                    snippets.push(snippet);
                }
            });
            if (snippets.length > 0) {
                profileData.additionalInfo.googleSnippets = snippets.slice(0, 3);
            }
            // Verificar se há link para LinkedIn nos resultados
            const linkedinLink = $google('a[href*="linkedin.com/in/"]').first().attr('href');
            if (linkedinLink) {
                profileData.linkedProfiles.linkedin = linkedinLink;
            }
        } catch (error) {
            logWarning('GOOGLE_SEARCH', `Falha ao obter informações adicionais via Google: ${error.message}`);
        }

        // 3. Analisar imagem de perfil usando VisionAnalysisService (GPT-4 Vision)
        if (profileData.profileImageUrl) {
            try {
                const description = await visionAnalysisService.analyzeProfileImage(profileData.profileImageUrl);
                if (description) {
                    profileData.profileImageAnalysis = { description };
                    logInfo('PROFILE_IMAGE_ANALYSIS', `Análise da imagem de perfil concluída para: ${username}`);
                } else {
                    logWarning('PROFILE_IMAGE_ANALYSIS', 'Não foi possível analisar a imagem de perfil.');
                }
            } catch (error) {
                logWarning('PROFILE_IMAGE_ANALYSIS', `Erro ao analisar imagem de perfil: ${error.message}`);
            }
        }

        // (Opcional: extrair posts recentes ou outros detalhes adicionais, se necessário)

        logInfo('INSTAGRAM_SCRAPE', `Dados extraídos do Instagram para ${username}: ${JSON.stringify(profileData)}`);
        return profileData;
    } catch (error) {
        logError('INSTAGRAM_SCRAPE', `Erro ao extrair dados do Instagram para ${username}`, error);
        return null;
    }
};

/**
 * Analisa um perfil público do LinkedIn.
 * (Implementação básica devido a restrições de acesso público no LinkedIn)
 * @param {string} profileUrl - URL do perfil LinkedIn.
 * @returns {Promise<Object>} Dados extraídos (limitados) do perfil.
 */
const scrapeLinkedInProfile = async (profileUrl) => {
    logInfo('LINKEDIN_SCRAPE', `Extraindo dados do LinkedIn: ${profileUrl}`);
    try {
        const profileData = {
            headline: '',
            profileImageAnalysis: {}
        };
        // Tentar obter HTML público do LinkedIn
        const response = await axios.get(profileUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        // Extrair headline (cargo/descritivo principal)
        const headlineElement = $('h2');
        if (headlineElement.length > 0) {
            profileData.headline = headlineElement.first().text().trim();
        }
        // (LinkedIn público fornece poucos dados sem login, esta parte é limitada)
        logInfo('LINKEDIN_SCRAPE', `Dados básicos extraídos do LinkedIn: ${JSON.stringify(profileData)}`);
        return profileData;
    } catch (error) {
        logError('LINKEDIN_SCRAPE', `Erro ao extrair dados do LinkedIn: ${error.message}`, error);
        return null;
    }
};

/**
 * Analisa o perfil usando GPT diretamente a partir da URL (tentativa de interpretação pelo modelo).
 * @param {string} profileUrl - URL do perfil do usuário.
 * @returns {Promise<Object|null>} Texto de análise gerado pelo GPT ou null se falhar.
 */
const analyzeProfileWithGPT = async (profileUrl) => {
    logInfo('GPT_PROFILE_ANALYSIS', `Análise GPT direta do perfil: ${profileUrl}`);
    try {
        if (!openai) {
            logError('GPT_PROFILE_ANALYSIS', 'OpenAI não inicializada.');
            return null;
        }
        const prompt = `Analise o perfil nesta URL e descreva resumidamente a pessoa, suas características e interesses principais: ${profileUrl}`;
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "Você é um assistente que analisa perfis online e resume características da pessoa." },
                { role: "user", content: prompt }
            ],
            max_tokens: 500
        });
        const analysisText = response.choices[0].message.content;
        return { analysisText };
    } catch (error) {
        logWarning('GPT_PROFILE_ANALYSIS', `Falha na análise GPT do perfil: ${error.message}`);
        return null;
    }
};

module.exports = {
    analyzeProfileHybrid
};
