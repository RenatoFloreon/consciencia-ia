/**
 * @fileoverview Serviço de integração com a OpenAI para geração de conteúdo personalizado
 * Este módulo fornece funções para gerar cartas personalizadas, poesias e análises
 * utilizando a API da OpenAI com foco em máxima personalização e impacto emocional.
 */

import OpenAI from 'openai';
import config from '../config/env.js';
import { logInfo, logError, logWarning } from '../utils/logger.js';

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
 * Gera uma carta de consciência personalizada com base nos dados do usuário e análise de perfil
 * @param {Object} userData - Dados do usuário (nome, email, desafios, etc.)
 * @param {Object} profileAnalysis - Análise do perfil do usuário
 * @returns {Promise<Object|null>} Carta gerada ou null se falhar
 */
const generateConscienceLetter = async (userData, profileAnalysis) => {
    logInfo('LETTER_GENERATION', `Iniciando geração da Carta de Consciência para ${userData.name}`);
    
    try {
        if (!openai) {
            logError('LETTER_GENERATION', 'OpenAI não está inicializada. Não é possível gerar a carta.');
            return null;
        }
        
        // Verificar dados mínimos necessários
        if (!userData.name) {
            logWarning('LETTER_GENERATION', 'Nome do usuário não fornecido. Usando dados genéricos.');
            userData.name = "amigo(a)";
        }
        
        // Preparar dados para o prompt
        const businessChallenge = userData.businessChallenge || "crescimento nos negócios";
        const personalChallenge = userData.personalChallenge || "equilíbrio pessoal";
        
        // Determinar se temos análise de perfil ou usaremos carta genérica
        const hasProfileAnalysis = profileAnalysis && 
            (profileAnalysis.deepInsights || 
             (profileAnalysis.gptAnalysis) || 
             (profileAnalysis.scrapedData && Object.keys(profileAnalysis.scrapedData).length > 0));
        
        // Construir o prompt para a carta
        let letterPrompt;
        
        if (hasProfileAnalysis) {
            // Prompt para carta personalizada com análise de perfil - VERSÃO APRIMORADA
            letterPrompt = `
            Você é o Conselheiro da Consciênc.IA, um assistente virtual especial criado para o evento MAPA DO LUCRO.
            
            Sua missão é gerar uma Carta de Consciência PROFUNDAMENTE PERSONALIZADA para ${userData.name}, baseada na análise do perfil digital e nos desafios compartilhados.
            
            Esta carta deve ser EXTREMAMENTE PERSONALIZADA, VISCERAL e EMOCIONALMENTE IMPACTANTE, tocando em pontos tão profundos e específicos que o destinatário ficará genuinamente surpreso e até mesmo assustado com sua precisão e insights. A carta deve parecer quase "sobrenatural" em sua capacidade de revelar verdades ocultas sobre a pessoa.
            
            DADOS DO USUÁRIO:
            Nome: ${userData.name}
            Desafio nos negócios: ${businessChallenge}
            Desafio pessoal: ${personalChallenge}
            
            ${profileAnalysis.deepInsights ? `INSIGHTS PROFUNDOS DA ANÁLISE:
            ${profileAnalysis.deepInsights}` : ''}
            
            ${profileAnalysis.gptAnalysis ? `ANÁLISE GPT DO PERFIL:
            ${profileAnalysis.gptAnalysis}` : ''}
            
            ${profileAnalysis.scrapedData ? `DADOS EXTRAÍDOS DO PERFIL:
            ${JSON.stringify(profileAnalysis.scrapedData, null, 2)}` : ''}
            
            ESTRUTURA DA CARTA:
            
            1. Saudação personalizada e emocional (usando o nome e criando conexão imediata)
            Exemplo: "💌 Querido [Nome], hoje estou aqui apenas para falar diretamente contigo e com a Alma do seu Negócio 💌"
            
            2. ✨ PERFIL COMPORTAMENTAL (INSIGHT DE CONSCIÊNCIA) ✨
            - Análise PROFUNDAMENTE PERSONALIZADA do perfil digital, destacando padrões comportamentais únicos
            - Mencionar pelo menos 5 elementos EXTREMAMENTE ESPECÍFICOS observados (posts, imagens, linguagem, interesses)
            - Revelar "segredos despercebidos" que a pessoa não percebe sobre si mesma, mas que são evidentes na análise
            - Relacionar com o conceito de Ikigai (onde paixão, missão, vocação e profissão se encontram)
            - Usar metáforas poderosas e linguagem visceral que "toque a alma"
            - Incluir pelo menos 3 observações tão específicas e precisas que causem genuína surpresa
            - Usar muitos emojis estrategicamente para criar impacto visual e emocional
            
            3. 🚀 DICAS PRÁTICAS DE USO DE IA NOS NEGÓCIOS 🚀
            - 3 ferramentas de IA ESPECÍFICAS para o desafio de negócios mencionado
            - Cada ferramenta deve ter nome, descrição breve e link
            - Explicar como cada ferramenta resolve ESPECIFICAMENTE o desafio mencionado
            - Usar formato numerado com emojis: 1️⃣ 2️⃣ 3️⃣
            
            4. 💫 DICAS PRÁTICAS DE USO DE IA NA VIDA PESSOAL 💫
            - 3 ferramentas de IA ESPECÍFICAS para o desafio pessoal mencionado
            - Cada ferramenta deve ter nome, descrição breve e link
            - Explicar como cada ferramenta resolve ESPECIFICAMENTE o desafio mencionado
            - Usar formato numerado com emojis: 1️⃣ 2️⃣ 3️⃣
            
            5. 🧭 RECOMENDAÇÕES DE OURO 🧭
            - Conselhos PROFUNDAMENTE PERSONALIZADOS baseados na análise
            - Mencionar o Método S.I.M. e o IKIGAI como filosofias complementares
            - Incluir links para https://www.instagram.com/metodosimbrasil/ e https://www.instagram.com/coworkingikigai/
            - Oferecer insights transformadores que pareçam "ler a mente" do destinatário
            
            6. 💫 PÍLULA DE INSPIRAÇÃO (POESIA INDIVIDUALIZADA) 💫
            - Poesia PROFUNDAMENTE EMOCIONAL e PERSONALIZADA
            - Deve incluir elementos ESPECÍFICOS da vida/perfil da pessoa
            - Usar metáforas relacionadas aos interesses/paixões identificados
            - Formato livre, mas deve ter forte impacto emocional
            - Usar emojis estrategicamente para aumentar o impacto visual
            - A poesia deve tocar a alma, emocionar e inspirar
            
            7. Encerramento inspirador e chamada para ação
            
            DIRETRIZES CRUCIAIS:
            - Use ABUNDÂNCIA de emojis estrategicamente distribuídos para criar impacto visual
            - A carta deve parecer quase "sobrenatural" em sua precisão e personalização
            - Use linguagem visceral, metáforas poderosas e insights profundos
            - Mencione detalhes EXTREMAMENTE ESPECÍFICOS do perfil analisado (posts, fotos, interesses)
            - A poesia deve ser verdadeiramente tocante e única, não genérica
            - Mantenha o tom inspirador, mas com profundidade psicológica
            - Inclua elementos do Método S.I.M. e filosofia IKIGAI
            - Crie uma experiência tão personalizada que a pessoa fique genuinamente impressionada
            
            Formate a carta com espaçamento adequado, emojis abundantes e estrutura visual atraente.
            `;
        } else {
            // Prompt para carta genérica (quando não há análise de perfil) - VERSÃO APRIMORADA
            letterPrompt = `
            Você é o Conselheiro da Consciênc.IA, um assistente virtual especial criado para o evento MAPA DO LUCRO.
            
            Sua missão é gerar uma Carta de Consciência para ${userData.name}, baseada apenas nos desafios compartilhados, já que não foi possível analisar o perfil digital.
            
            Mesmo sem a análise do perfil, esta carta deve ser EMOCIONALMENTE IMPACTANTE e INSPIRADORA, tocando pontos universais da experiência humana e empreendedora.
            
            DADOS DO USUÁRIO:
            Nome: ${userData.name}
            Desafio nos negócios: ${businessChallenge}
            Desafio pessoal: ${personalChallenge}
            
            ESTRUTURA DA CARTA:
            
            1. Saudação personalizada e emocional (usando o nome)
            Exemplo: "💌 Querido [Nome], hoje estou aqui apenas para falar diretamente contigo e com a Alma do seu Negócio 💌"
            
            2. ✨ NOTA INICIAL E PERFIL COMPORTAMENTAL ✨
            - Explicar brevemente que esta é uma carta baseada apenas nos desafios compartilhados
            - Oferecer insights universais sobre empreendedorismo consciente
            - Relacionar com o conceito de Ikigai (onde paixão, missão, vocação e profissão se encontram)
            - Usar metáforas poderosas e linguagem emocional
            - Usar muitos emojis estrategicamente para criar impacto visual e emocional
            
            3. 🚀 DICAS PRÁTICAS DE USO DE IA NOS NEGÓCIOS 🚀
            - 3 ferramentas de IA ESPECÍFICAS para o desafio de negócios mencionado
            - Cada ferramenta deve ter nome, descrição breve e link
            - Explicar como cada ferramenta resolve ESPECIFICAMENTE o desafio mencionado
            - Usar formato numerado com emojis: 1️⃣ 2️⃣ 3️⃣
            
            4. 💫 DICAS PRÁTICAS DE USO DE IA NA VIDA PESSOAL 💫
            - 3 ferramentas de IA ESPECÍFICAS para o desafio pessoal mencionado
            - Cada ferramenta deve ter nome, descrição breve e link
            - Explicar como cada ferramenta resolve ESPECIFICAMENTE o desafio mencionado
            - Usar formato numerado com emojis: 1️⃣ 2️⃣ 3️⃣
            
            5. 🧭 RECOMENDAÇÕES DE OURO 🧭
            - Conselhos inspiradores baseados nos desafios mencionados
            - Mencionar o Método S.I.M. e o IKIGAI como filosofias complementares
            - Incluir links para https://www.instagram.com/metodosimbrasil/ e https://www.instagram.com/coworkingikigai/
            
            6. 💫 PÍLULA DE INSPIRAÇÃO (POESIA INDIVIDUALIZADA) 💫
            - Poesia EMOCIONALMENTE IMPACTANTE relacionada aos desafios mencionados
            - Incluir o nome da pessoa de forma criativa
            - Usar metáforas universais de crescimento e superação
            - Formato livre, mas deve ter forte impacto emocional
            - Usar emojis estrategicamente para aumentar o impacto visual
            - A poesia deve tocar a alma, emocionar e inspirar
            
            7. Encerramento inspirador e chamada para ação
            
            DIRETRIZES CRUCIAIS:
            - Use ABUNDÂNCIA de emojis estrategicamente distribuídos para criar impacto visual
            - Use linguagem visceral, metáforas poderosas e insights inspiradores
            - A poesia deve ser verdadeiramente tocante e única, não genérica
            - Mantenha o tom inspirador e motivacional
            - Inclua elementos do Método S.I.M. e filosofia IKIGAI
            
            Formate a carta com espaçamento adequado, emojis abundantes e estrutura visual atraente.
            `;
        }
        
        // Gerar a carta com a OpenAI - USANDO MODELO MAIS AVANÇADO E PARÂMETROS OTIMIZADOS
        const letterResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo", // Usando o modelo mais avançado disponível
            messages: [
                { role: "user", content: letterPrompt }
            ],
            max_tokens: 2000, // tokens suficientes para a carta completa
            temperature: 0.7, // criatividade moderada
            presence_penalty: 0.2, // leve penalidade para evitar repetição
            frequency_penalty: 0.1 // penalidade baixa para evitar repetições exatas
        });
        
        const fullLetter = letterResponse.choices[0].message.content;
        
        // Determinar se a carta foi genérica ou personalizada
        const isGeneric = !hasProfileAnalysis;
        
        logInfo('LETTER_GENERATION', `Carta de Consciência gerada para ${userData.name} (genérica: ${isGeneric})`);
        return { fullLetter, isGeneric };
    } catch (error) {
        logError('LETTER_GENERATION', 'Erro ao gerar Carta de Consciência', error);
        return null;
    }
};

/**
 * Gera uma poesia personalizada adicional (se necessário)
 * @param {Object} userData - Dados do usuário (nome, desafios, etc.)
 * @returns {Promise<string|null>} Poesia gerada ou null se falhar
 */
const generatePersonalizedPoetry = async (userData) => {
    logInfo('POETRY_GENERATION', `Gerando poesia personalizada para ${userData.name}`);
    
    try {
        if (!openai) {
            logError('POETRY_GENERATION', 'OpenAI não está inicializada. Não é possível gerar poesia.');
            return null;
        }
        
        const prompt = `
        Crie uma breve poesia tocante e personalizada para ${userData.name}, 
        que esteja enfrentando desafios no âmbito profissional (${userData.businessChallenge}) 
        e pessoal (${userData.personalChallenge}). 
        Use um tom encorajador e inspirador, e mencione elementos que se apliquem a um empreendedor consciente.
        `;
        
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: "user", content: prompt }
            ],
            max_tokens: 150
        });
        
        const poetry = response.choices[0].message.content;
        logInfo('POETRY_GENERATION', `Poesia gerada com sucesso para ${userData.name}`);
        return poetry;
    } catch (error) {
        logError('POETRY_GENERATION', 'Erro ao gerar poesia personalizada', error);
        return null;
    }
};

/**
 * Responde a uma pergunta de acompanhamento após a entrega da carta
 * @param {string} question - Pergunta feita pelo usuário
 * @param {Object} userData - Dados do usuário (inclusive a carta gerada)
 * @param {Object} letterData - Dados da carta de Consciência gerada (inclui carta completa, etc.)
 * @returns {Promise<string|null>} Resposta gerada para a pergunta ou null se falhar
 */
const answerFollowUpQuestion = async (question, userData, letterData) => {
    logInfo('FOLLOWUP_QUESTION', `Respondendo pergunta de acompanhamento para ${userData.name}: "${question}"`);
    
    try {
        if (!openai) {
            logError('FOLLOWUP_QUESTION', 'OpenAI não está inicializada. Não é possível responder a pergunta.');
            return null;
        }
        
        // Construir prompt de continuação com base na carta e pergunta
        const answerPrompt = `
        CONTEXTO:
        Você (Conselheiro da Consciênc.IA) gerou previamente uma Carta de Consciência para ${userData.name}. 
        Agora, ${userData.name} fez a seguinte pergunta de acompanhamento após ler a carta:
        
        CARTA ORIGINAL:
        "${letterData.fullLetter}"
        
        PERGUNTA DO USUÁRIO:
        "${question}"
        
        Responda à pergunta de forma PROFUNDAMENTE ÚTIL, EMPÁTICA e PERSONALIZADA, mantendo o mesmo tom emocional e estilo da Carta de Consciência original.
        
        DIRETRIZES PARA A RESPOSTA:
        - Mantenha o mesmo tom emocional, visceral e personalizado da carta
        - Use emojis abundantes e estrategicamente posicionados para manter a consistência visual
        - Seja específico, útil e transformador, fornecendo informações práticas quando apropriado
        - Mantenha a resposta concisa mas impactante (máximo de 3-4 parágrafos)
        - Se a pergunta for sobre o Programa Consciênc.IA, direcione para https://www.floreon.app.br/conscienc-ia
        - Se a pergunta for sobre o evento MAPA DO LUCRO, mencione que é um evento de transformação para empreendedores
        - Se a pergunta for sobre ferramentas de IA, forneça recomendações específicas com links
        - Inclua pelo menos um insight profundo ou reflexão que pareça "ler a mente" do usuário
        - Termine com uma frase inspiradora e motivadora
        
        Responda de forma que pareça uma continuação natural da experiência da Carta de Consciência, mantendo o mesmo nível de profundidade emocional e personalização.
        `;
        
        // Gerar a resposta com a OpenAI - USANDO MODELO MAIS AVANÇADO E PARÂMETROS OTIMIZADOS
        const answerResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo", // Usando o modelo mais avançado disponível
            messages: [
                { 
                    role: "system", 
                    content: "Você é o Conselheiro da Consciênc.IA, um assistente virtual especial que gera conteúdo profundamente personalizado, emocional e transformador. Você está continuando uma conversa após ter entregue uma Carta de Consciência personalizada. Sua capacidade de oferecer insights profundos e respostas emocionalmente impactantes é sobrenatural." 
                },
                { role: "user", content: answerPrompt }
            ],
            max_tokens: 1200, // Aumentado para permitir respostas mais detalhadas
            temperature: 0.8, // Aumentado para mais personalização e emoção
            presence_penalty: 0.3, // Adicionado para incentivar originalidade
            frequency_penalty: 0.2 // Adicionado para evitar repetições
        });
        
        const answer = answerResponse.choices[0].message.content;
        
        logInfo('FOLLOWUP_QUESTION', `Resposta gerada com sucesso para a pergunta de acompanhamento`);
        return answer;
    } catch (error) {
        logError('FOLLOWUP_QUESTION', `Erro ao responder pergunta de acompanhamento`, error);
        return null;
    }
};

export default {
    generateConscienceLetter,
    generatePersonalizedPoetry,
    answerFollowUpQuestion
};
