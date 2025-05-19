/**
 * @fileoverview Serviço de scraping avançado para perfis de redes sociais
 * Este módulo fornece funções para extrair e analisar dados de perfis públicos
 * do Instagram e LinkedIn, utilizando técnicas avançadas de scraping e análise
 * com OpenAI.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');
const OpenAI = require('openai');

// Inicialização da OpenAI
let openai;
if (config.OPENAI_API_KEY) {
    openai = new OpenAI({ 
        apiKey: config.OPENAI_API_KEY,
        organization: config.OPENAI_ORGANIZATION
    });
    logInfo('OPENAI_INIT', 'Instância OpenAI criada com sucesso.');
} else {
    logError('OPENAI_INIT', 'OPENAI_API_KEY não está definida. A funcionalidade da OpenAI será desativada.');
}

/**
 * Extrai e analisa dados de um perfil público do Instagram
 * @param {string} username - Nome de usuário do Instagram (sem @)
 * @returns {Promise<Object|null>} Dados extraídos do perfil ou null se falhar
 */
const scrapeInstagramProfile = async (username) => {
    logInfo('INSTAGRAM_SCRAPE', `Tentando extrair dados do perfil: ${username}`);
    
    try {
        // Remover @ se existir
        username = username.replace('@', '');
        
        // Objeto para armazenar todos os dados coletados
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
            profileImageAnalysis: {},
            websiteUrl: '',
            linkedProfiles: {},
            contentThemes: [],
            locationInfo: '',
            additionalInfo: {}
        };

        // 1. Extrair dados do Instagram
        const response = await axios.get(`https://www.instagram.com/${username}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
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
            // Extrair URL da imagem de perfil
            if (property === 'og:image') {
                profileData.profileImageUrl = $(el).attr('content');
            }
        });

        // Verificar se é uma conta comercial
        if ($('a:contains("Contact")').length > 0) {
            profileData.isBusinessAccount = true;
        }

        // Extrair categoria de negócio
        const categoryElement = $('div:contains("·")').first();
        if (categoryElement.length > 0) {
            const categoryText = categoryElement.text();
            if (categoryText.includes('·')) {
                profileData.businessCategory = categoryText.split('·')[1].trim();
            }
        }

        // Extrair website/link na bio
        const linkElements = $('a[href^="http"]');
        linkElements.each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('instagram.com')) {
                profileData.websiteUrl = href;
                return false; // break the loop after finding the first external link
            }
        });

        // Extrair hashtags da bio
        const bioText = profileData.bio;
        const hashtagRegex = /#(\w+)/g;
        let match;
        while ((match = hashtagRegex.exec(bioText)) !== null) {
            profileData.hashtags.push(match[1]);
        }

        // Tentar extrair localização
        const locationElement = $('span:contains("📍")');
        if (locationElement.length > 0) {
            profileData.locationInfo = locationElement.text().replace('📍', '').trim();
        }

        // 2. Buscar informações adicionais no Google
        try {
            const googleResponse = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(profileData.fullName || username)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                }
            });
            
            const $google = cheerio.load(googleResponse.data);
            
            // Extrair snippets de informação do Google
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
            
            // Tentar encontrar perfil do LinkedIn
            const linkedinLink = $google('a[href*="linkedin.com/in/"]').first().attr('href');
            if (linkedinLink) {
                profileData.linkedProfiles.linkedin = linkedinLink;
            }
            
        } catch (error) {
            logWarning('GOOGLE_SEARCH', `Não foi possível obter informações adicionais do Google: ${error.message}`);
        }

        // 3. Analisar a imagem de perfil usando a OpenAI (se disponível)
        if (profileData.profileImageUrl && openai) {
            try {
                const imageAnalysisPrompt = `
                Analise esta imagem de perfil do Instagram e descreva:
                1. O que a pessoa está fazendo na foto
                2. Ambiente/cenário (interior, exterior, natureza, urbano, etc.)
                3. Estilo visual e cores predominantes
                4. Impressão geral transmitida (profissional, casual, artística, etc.)
                5. Elementos notáveis (objetos, símbolos, texto)
                
                Forneça uma análise concisa em português.
                `;
                
                const imageAnalysis = await openai.chat.completions.create({
                    model: "gpt-4-vision-preview",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: imageAnalysisPrompt },
                                { type: "image_url", image_url: { url: profileData.profileImageUrl } }
                            ]
                        }
                    ],
                    max_tokens: 300
                });
                
                profileData.profileImageAnalysis = {
                    description: imageAnalysis.choices[0].message.content
                };
                
                logInfo('PROFILE_IMAGE_ANALYSIS', `Análise da imagem de perfil concluída para: ${username}`);
            } catch (error) {
                logWarning('PROFILE_IMAGE_ANALYSIS', `Não foi possível analisar a imagem de perfil: ${error.message}`);
            }
        }

        // 4. Identificar temas de conteúdo com base nos dados coletados
        try {
            if (openai && (profileData.bio || profileData.hashtags.length > 0)) {
                const contentAnalysisPrompt = `
                Com base nas seguintes informações de um perfil do Instagram, identifique os principais temas de conteúdo e interesses:
                
                Nome: ${profileData.fullName}
                Bio: ${profileData.bio}
                Hashtags: ${profileData.hashtags.join(', ')}
                Categoria: ${profileData.businessCategory}
                
                Liste apenas 3-5 temas principais em português, separados por vírgula.
                `;
                
                const contentAnalysis = await openai.chat.completions.create({
                    model: "gpt-4-turbo",
                    messages: [
                        { role: "user", content: contentAnalysisPrompt }
                    ],
                    max_tokens: 100
                });
                
                const themes = contentAnalysis.choices[0].message.content.split(',').map(theme => theme.trim());
                profileData.contentThemes = themes;
                
                logInfo('CONTENT_THEMES_ANALYSIS', `Temas de conteúdo identificados para ${username}: ${themes.join(', ')}`);
            }
        } catch (error) {
            logWarning('CONTENT_THEMES_ANALYSIS', `Não foi possível identificar temas de conteúdo: ${error.message}`);
        }

        logInfo('INSTAGRAM_SCRAPE', `Dados extraídos com sucesso para o perfil: ${username}`);
        return profileData;
    } catch (error) {
        logError('INSTAGRAM_SCRAPE', `Erro ao extrair dados do perfil ${username}`, error);
        return null;
    }
};

/**
 * Extrai e analisa dados de um perfil público do LinkedIn
 * @param {string} profileUrl - URL do perfil do LinkedIn
 * @returns {Promise<Object|null>} Dados extraídos do perfil ou null se falhar
 */
const scrapeLinkedInProfile = async (profileUrl) => {
    logInfo('LINKEDIN_SCRAPE', `Tentando extrair dados do perfil: ${profileUrl}`);
    
    try {
        // Verificar se a URL é válida
        if (!profileUrl.includes('linkedin.com/in/')) {
            logWarning('LINKEDIN_SCRAPE', `URL inválida para perfil do LinkedIn: ${profileUrl}`);
            return null;
        }
        
        // Objeto para armazenar todos os dados coletados
        const profileData = {
            profileUrl: profileUrl,
            fullName: '',
            headline: '',
            location: '',
            about: '',
            experience: [],
            education: [],
            skills: [],
            profileImageUrl: '',
            profileImageAnalysis: {},
            additionalInfo: {}
        };

        // Tentar extrair dados do LinkedIn (limitado devido às restrições)
        const response = await axios.get(profileUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        
        // Extrair metadados do perfil
        const metaTags = $('meta');
        metaTags.each((i, el) => {
            const property = $(el).attr('property') || $(el).attr('name');
            
            if (property === 'og:title') {
                profileData.fullName = $(el).attr('content').split(' | ')[0];
            }
            if (property === 'og:description') {
                profileData.headline = $(el).attr('content');
            }
            if (property === 'og:image') {
                profileData.profileImageUrl = $(el).attr('content');
            }
        });

        // 2. Buscar informações adicionais no Google
        try {
            const googleResponse = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(profileData.fullName + ' ' + profileData.headline)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                }
            });
            
            const $google = cheerio.load(googleResponse.data);
            
            // Extrair snippets de informação do Google
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
        } catch (error) {
            logWarning('GOOGLE_SEARCH', `Não foi possível obter informações adicionais do Google: ${error.message}`);
        }

        // 3. Analisar a imagem de perfil usando a OpenAI (se disponível)
        if (profileData.profileImageUrl && openai) {
            try {
                const imageAnalysisPrompt = `
                Analise esta imagem de perfil do LinkedIn e descreva:
                1. O que a pessoa está fazendo na foto
                2. Ambiente/cenário (interior, exterior, escritório, etc.)
                3. Estilo visual e cores predominantes
                4. Impressão profissional transmitida
                5. Elementos notáveis (objetos, símbolos, texto)
                
                Forneça uma análise concisa em português.
                `;
                
                const imageAnalysis = await openai.chat.completions.create({
                    model: "gpt-4-vision-preview",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: imageAnalysisPrompt },
                                { type: "image_url", image_url: { url: profileData.profileImageUrl } }
                            ]
                        }
                    ],
                    max_tokens: 300
                });
                
                profileData.profileImageAnalysis = {
                    description: imageAnalysis.choices[0].message.content
                };
                
                logInfo('PROFILE_IMAGE_ANALYSIS', `Análise da imagem de perfil concluída para LinkedIn`);
            } catch (error) {
                logWarning('PROFILE_IMAGE_ANALYSIS', `Não foi possível analisar a imagem de perfil: ${error.message}`);
            }
        }

        // 4. Usar OpenAI para extrair mais informações do headline
        try {
            if (openai && profileData.headline) {
                const headlineAnalysisPrompt = `
                Com base no headline do LinkedIn a seguir, identifique:
                1. Área de atuação profissional
                2. Nível de senioridade
                3. Possíveis habilidades ou especialidades
                4. Setor da indústria
                
                Headline: "${profileData.headline}"
                
                Responda em português, de forma concisa.
                `;
                
                const headlineAnalysis = await openai.chat.completions.create({
                    model: "gpt-4-turbo",
                    messages: [
                        { role: "user", content: headlineAnalysisPrompt }
                    ],
                    max_tokens: 200
                });
                
                profileData.additionalInfo.headlineAnalysis = headlineAnalysis.choices[0].message.content;
                
                logInfo('HEADLINE_ANALYSIS', `Análise do headline concluída para LinkedIn`);
            }
        } catch (error) {
            logWarning('HEADLINE_ANALYSIS', `Não foi possível analisar o headline: ${error.message}`);
        }

        logInfo('LINKEDIN_SCRAPE', `Dados extraídos com sucesso para o perfil do LinkedIn`);
        return profileData;
    } catch (error) {
        logError('LINKEDIN_SCRAPE', `Erro ao extrair dados do perfil do LinkedIn`, error);
        return null;
    }
};

/**
 * Analisa um perfil de rede social usando a API da OpenAI
 * @param {string} profileUrl - URL do perfil (Instagram ou LinkedIn)
 * @returns {Promise<Object|null>} Análise do perfil ou null se falhar
 */
const analyzeProfileWithGPT = async (profileUrl) => {
    logInfo('GPT_PROFILE_ANALYSIS', `Iniciando análise do perfil com GPT: ${profileUrl}`);
    
    try {
        if (!openai) {
            logError('GPT_PROFILE_ANALYSIS', 'OpenAI não está inicializada. Não é possível analisar o perfil.');
            return null;
        }
        
        // Determinar o tipo de perfil
        const isInstagram = profileUrl.includes('instagram.com');
        const isLinkedIn = profileUrl.includes('linkedin.com');
        
        if (!isInstagram && !isLinkedIn) {
            logWarning('GPT_PROFILE_ANALYSIS', `URL não reconhecida como Instagram ou LinkedIn: ${profileUrl}`);
            return null;
        }
        
        // Prompt para análise do perfil
        const analysisPrompt = `
        Você é um especialista em análise de perfis digitais e comportamento humano. Preciso que você analise o seguinte perfil de ${isInstagram ? 'Instagram' : 'LinkedIn'}: ${profileUrl}
        
        Por favor, visite o link e faça uma análise profunda e detalhada do perfil, incluindo:
        
        1. Informações básicas (nome, bio, área de atuação)
        2. Análise da imagem de perfil (o que transmite, estilo, ambiente)
        3. Temas principais de conteúdo e interesses
        4. Traços de personalidade perceptíveis
        5. Estilo de comunicação e expressão
        6. Possíveis desafios e oportunidades profissionais
        7. Qualquer insight único ou diferencial que você perceba
        
        Forneça uma análise detalhada em português, que será usada para criar uma "Carta de Consciência" personalizada para esta pessoa.
        `;
        
        // Realizar a análise com o GPT
        const analysis = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "Você é um especialista em análise de perfis digitais e comportamento humano, com acesso à internet para visitar e analisar perfis de redes sociais." },
                { role: "user", content: analysisPrompt }
            ],
            max_tokens: 1000
        });
        
        const analysisResult = {
            profileUrl: profileUrl,
            profileType: isInstagram ? 'instagram' : 'linkedin',
            analysisText: analysis.choices[0].message.content,
            timestamp: new Date().toISOString()
        };
        
        logInfo('GPT_PROFILE_ANALYSIS', `Análise do perfil concluída com sucesso`);
        return analysisResult;
    } catch (error) {
        logError('GPT_PROFILE_ANALYSIS', `Erro ao analisar perfil com GPT`, error);
        return null;
    }
};

/**
 * Analisa um perfil de rede social usando uma abordagem híbrida (scraping + GPT)
 * @param {string} profileUrl - URL do perfil (Instagram ou LinkedIn)
 * @returns {Promise<Object|null>} Análise completa do perfil ou null se falhar
 */
const analyzeProfileHybrid = async (profileUrl) => {
    logInfo('HYBRID_PROFILE_ANALYSIS', `Iniciando análise híbrida do perfil: ${profileUrl}`);
    
    try {
        // Determinar o tipo de perfil
        const isInstagram = profileUrl.includes('instagram.com');
        const isLinkedIn = profileUrl.includes('linkedin.com');
        
        if (!isInstagram && !isLinkedIn) {
            logWarning('HYBRID_PROFILE_ANALYSIS', `URL não reconhecida como Instagram ou LinkedIn: ${profileUrl}`);
            return null;
        }
        
        let scrapedData = null;
        
        // 1. Extrair dados via scraping
        if (isInstagram) {
            // Extrair username da URL
            const usernameMatch = profileUrl.match(/instagram\.com\/([^\/\?]+)/);
            const username = usernameMatch ? usernameMatch[1] : null;
            
            if (username) {
                scrapedData = await scrapeInstagramProfile(username);
            }
        } else if (isLinkedIn) {
            scrapedData = await scrapeLinkedInProfile(profileUrl);
        }
        
        // 2. Complementar com análise do GPT
        const gptAnalysis = await analyzeProfileWithGPT(profileUrl);
        
        // 3. Combinar os resultados
        const combinedAnalysis = {
            profileUrl,
            profileType: isInstagram ? 'instagram' : 'linkedin',
            scrapedData,
            gptAnalysis: gptAnalysis ? gptAnalysis.analysisText : null,
            timestamp: new Date().toISOString()
        };
        
        // 4. Gerar insights finais com GPT
        if (openai && (scrapedData || gptAnalysis)) {
            try {
                const insightsPrompt = `
                Com base nas seguintes informações coletadas de um perfil de ${isInstagram ? 'Instagram' : 'LinkedIn'}, gere insights profundos sobre a pessoa:
                
                ${scrapedData ? `DADOS EXTRAÍDOS:
                Nome: ${scrapedData.fullName || 'Não disponível'}
                ${isInstagram ? `Bio: ${scrapedData.bio || 'Não disponível'}
                Hashtags: ${scrapedData.hashtags.join(', ') || 'Não disponível'}
                Temas de conteúdo: ${scrapedData.contentThemes.join(', ') || 'Não disponível'}
                Análise da imagem de perfil: ${scrapedData.profileImageAnalysis.description || 'Não disponível'}` 
                : 
                `Headline: ${scrapedData.headline || 'Não disponível'}
                Análise da imagem de perfil: ${scrapedData.profileImageAnalysis.description || 'Não disponível'}`}` 
                : 'Não foi possível extrair dados estruturados do perfil.'}
                
                ${gptAnalysis ? `ANÁLISE GPT:
                ${gptAnalysis.analysisText}` : 'Não foi possível realizar análise GPT do perfil.'}
                
                Gere insights profundos em português sobre:
                1. Personalidade e características marcantes
                2. Possíveis desafios enfrentados na vida pessoal e profissional
                3. Potenciais não explorados ou talentos latentes
                4. Recomendações personalizadas para crescimento
                
                Seja profundo, específico e personalizado. Evite generalizações. Foque em aspectos únicos que possam surpreender a pessoa.
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
                logInfo('HYBRID_PROFILE_ANALYSIS', `Insights profundos gerados com sucesso`);
            } catch (error) {
                logWarning('HYBRID_PROFILE_ANALYSIS', `Não foi possível gerar insights profundos: ${error.message}`);
            }
        }
        
        logInfo('HYBRID_PROFILE_ANALYSIS', `Análise híbrida do perfil concluída com sucesso`);
        return combinedAnalysis;
    } catch (error) {
        logError('HYBRID_PROFILE_ANALYSIS', `Erro na análise híbrida do perfil`, error);
        return null;
    }
};

module.exports = {
    scrapeInstagramProfile,
    scrapeLinkedInProfile,
    analyzeProfileWithGPT,
    analyzeProfileHybrid
};
