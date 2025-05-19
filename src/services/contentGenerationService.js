/**
 * @fileoverview Serviço de integração com a OpenAI para geração de conteúdo personalizado.
 * Gera as Cartas da Consciência, poesias e respostas de acompanhamento usando a API da OpenAI (GPT-4).
 */

const OpenAI = require('openai');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

// Inicialização do cliente OpenAI
let openai;
if (config.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        organization: config.OPENAI_ORGANIZATION
    });
}

/**
 * Gera a Carta da Consciência personalizada com base nos dados do usuário e análise de perfil (se houver).
 * @param {Object} userData - Dados do usuário (nome, email, desafios, etc).
 * @param {Object|null} profileAnalysis - Resultados da análise de perfil (ou null se não houver perfil).
 * @returns {Promise<Object|null>} Objeto contendo a carta gerada (fullLetter, poetry, isGeneric) ou null em caso de erro.
 */
const generateConscienceLetter = async (userData, profileAnalysis) => {
    logInfo('LETTER_GENERATION', `Gerando Carta de Consciência para ${userData.name}`);
    try {
        if (!openai) {
            logError('LETTER_GENERATION', 'OpenAI não inicializada. Não é possível gerar a carta.');
            return null;
        }
        // Verificar dados mínimos necessários
        if (!userData.name) {
            logWarning('LETTER_GENERATION', 'Nome do usuário não fornecido, abortando geração.');
            return null;
        }

        // Preparar desafios com valores padrão se não informados
        const businessChallenge = userData.businessChallenge || "crescimento nos negócios";
        const personalChallenge = userData.personalChallenge || "equilíbrio pessoal";

        // Verificar se há análise de perfil disponível
        const hasProfileAnalysis = profileAnalysis && (profileAnalysis.deepInsights || profileAnalysis.gptAnalysis);

        // Montar o prompt detalhado para o modelo GPT-4
        let letterPrompt = `
            Você é o Conselheiro da Consciênc.IA, um assistente virtual especial criado para o evento MAPA DO LUCRO.
            
            Sua missão é gerar uma Carta de Consciência **profundamente personalizada** para ${userData.name}, baseada na análise do perfil digital e nos desafios compartilhados.
            
            **Instruções para a Carta (tom inspirador, pessoal e impactante):**
            
            A carta deve ser EXTREMAMENTE PERSONALIZADA, visceral e emocionalmente impactante, tocando em pontos tão profundos e específicos que ${userData.name} ficará genuinamente surpreso(a) e até um pouco assustado(a) com a precisão e os insights revelados. Deve parecer quase "sobrenatural" em sua capacidade de revelar verdades ocultas sobre a pessoa.
            
            **DADOS DO USUÁRIO:**
            Nome: ${userData.name}
            Desafio nos Negócios: ${businessChallenge}
            Desafio Pessoal: ${personalChallenge}
            ${hasProfileAnalysis && profileAnalysis.deepInsights ? `INSIGHTS PROFUNDOS DA ANÁLISE:
            ${profileAnalysis.deepInsights}` : ''}
            ${hasProfileAnalysis && profileAnalysis.gptAnalysis ? `ANÁLISE GPT DO PERFIL:
            ${profileAnalysis.gptAnalysis}` : ''}
            ${hasProfileAnalysis && profileAnalysis.scrapedData ? `DADOS EXTRAÍDOS DO PERFIL:
            ${JSON.stringify(profileAnalysis.scrapedData, null, 2)}` : ''}
            
            **ESTRUTURA DA CARTA:**
            1. **Saudação personalizada e emocional** – Estabelecer conexão imediata, usando o nome (Ex.: "💌 Querido(a) [Nome], hoje estou aqui apenas para falar diretamente contigo e com a Alma do seu Negócio 💌").
            2. **✨ Perfil Comportamental (Insight de Consciência) ✨** – Análise profundamente personalizada do perfil digital, destacando padrões comportamentais únicos. Mencionar pelo menos 5 elementos *extremamente específicos* observados (ex.: posts, imagens, linguagem, interesses). Revelar "segredos despercebidos" – coisas que a própria pessoa talvez não perceba, mas que são evidentes na análise. Relacionar com o conceito de Ikigai (onde paixão, missão, vocação e profissão se encontram). Usar metáforas poderosas e linguagem visceral que toque a alma. Incluir pelo menos 3 observações tão específicas que causem surpresa genuína, usando emojis para impacto emocional.
            3. **🚀 Dicas Práticas de Uso de IA nos Negócios 🚀** – Listar 3 ferramentas de IA específicas que podem ajudar com o desafio de negócios mencionado. Para cada ferramenta: nome, breve descrição e (se possível) link. Explicar como cada uma pode resolver *especificamente* o desafio de ${businessChallenge}. Formatar como lista numerada (1️⃣ 2️⃣ 3️⃣).
            4. **💫 Dicas Práticas de Uso de IA na Vida Pessoal 💫** – Listar 3 ferramentas de IA específicas que podem ajudar com o desafio pessoal mencionado. Seguir o mesmo formato (nome, descrição, link) explicando como ajudam com *exatidão* no desafio de ${personalChallenge}. Formatar como lista numerada (1️⃣ 2️⃣ 3️⃣).
            5. **🧭 Recomendações de Ouro 🧭** – Conselhos profundamente personalizados baseados em tudo que foi analisado. Mencionar o Método S.I.M. e o conceito de Ikigai como filosofias complementares para o crescimento do ${userData.name}. Incluir links para https://www.instagram.com/metodosimbrasil/ e https://www.instagram.com/coworkingikigai/. Oferecer insights transformadores que pareçam "ler a mente" do destinatário.
            6. **💫 Pílula de Inspiração (Poesia Individualizada) 💫** – Uma poesia **profundamente emocional e personalizada**, que inclua elementos específicos da vida/perfil de ${userData.name}. Usar metáforas relacionadas aos interesses/paixões identificados. Formato livre, mas deve ter forte impacto emocional e inspirar. Usar emojis para aumentar o impacto.
            7. **Encerramento inspirador** – Fechamento da carta com palavras finais encorajadoras e uma chamada para ação (ex.: convidar para refletir, participar do programa, etc).
            
            **Diretrizes Cruciais:**
            - Usar **ABUNDÂNCIA de emojis** de forma estratégica para criar impacto visual e emocional.
            - A carta deve realmente parecer quase sobrenatural de tão precisa e personalizada.
            - Linguagem visceral, **metáforas poderosas** e insights **profundos** ao longo do texto.
            - Mencionar detalhes **extremamente específicos** do perfil analisado (posts, fotos, interesses etc.).
            - A poesia deve ser única e tocante – **nada genérico**.
            - Manter tom inspirador, com profundidade psicológica.
            - Integrar elementos do Método S.I.M. e Ikigai conforme orientado.
        `;

        // Chamada à API OpenAI para gerar a carta (GPT-4)
        const letterResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { 
                    role: "system", 
                    content: "Você é o Conselheiro da Consciênc.IA, um assistente virtual que gera Cartas de Consciência profundamente personalizadas, emocionais e transformadoras. Sua especialidade é criar conteúdo com precisão quase sobrenatural, tocando pontos profundos da consciência das pessoas e revelando verdades ocultas de forma surpreendente." 
                },
                { 
                    role: "user", 
                    content: letterPrompt 
                }
            ],
            max_tokens: 3000,
            temperature: 0.8,
            presence_penalty: 0.3,
            frequency_penalty: 0.2
        });

        const letterContent = letterResponse.choices[0].message.content;

        // Extrair a poesia da carta para referência separada (se necessário)
        let poetry = "";
        if (letterContent.includes("💫 PÍLULA DE INSPIRAÇÃO")) {
            const parts = letterContent.split("💫 PÍLULA DE INSPIRAÇÃO");
            if (parts[1]) {
                poetry = parts[1].trim();
            }
        }

        // Montar objeto de resultado
        const result = {
            fullLetter: letterContent,
            poetry: poetry,
            isGeneric: !hasProfileAnalysis,
            timestamp: new Date().toISOString()
        };
        logInfo('LETTER_GENERATION', `Carta gerada com sucesso para ${userData.name}`);
        return result;
    } catch (error) {
        logError('LETTER_GENERATION', 'Erro na geração da carta pela OpenAI', error);
        return null;
    }
};

/**
 * Gera uma poesia personalizada (não utilizada no fluxo principal atual).
 * @param {Object} userData 
 * @param {Object|null} profileAnalysis 
 */
const generatePersonalizedPoetry = async (userData, profileAnalysis = null) => {
    logInfo('POETRY_GENERATION', `Gerando poesia personalizada para ${userData.name}`);
    try {
        if (!openai) {
            logError('POETRY_GENERATION', 'OpenAI não inicializada.');
            return null;
        }
        // (Implementação similar à carta, se necessário)
        return null;
    } catch (error) {
        logError('POETRY_GENERATION', 'Erro ao gerar poesia', error);
        return null;
    }
};

/**
 * Gera resposta a uma pergunta de acompanhamento com base na carta e dados do usuário.
 * @param {string} question - Pergunta do usuário após ler a carta.
 * @param {Object} userData - Dados do usuário (incluindo letterData).
 * @param {Object} letterData - Dados da carta gerada (conteúdo completo, etc).
 * @returns {Promise<string|null>} Resposta gerada para a pergunta ou null se falhar.
 */
const answerFollowUpQuestion = async (question, userData, letterData) => {
    logInfo('FOLLOWUP_QUESTION', `Processando pergunta de acompanhamento: "${question}"`);
    try {
        if (!openai) {
            logError('FOLLOWUP_QUESTION', 'OpenAI não inicializada. Não é possível responder à pergunta.');
            return null;
        }

        // Montar contexto com a carta previamente gerada e a pergunta do usuário
        const assistantPersonality = "Você é o Conselheiro da Consciênc.IA, especializado em fornecer respostas profundas baseadas na Carta de Consciência.";
        const userPrompt = `
            CARTA DA CONSCIÊNCIA (contexto):
            ${letterData.fullLetter}
            
            PERGUNTA DO USUÁRIO:
            ${question}
            
            Responda à pergunta do usuário de forma atenciosa, fazendo referências à carta acima quando possível. Seja breve, empático e forneça orientação prática se aplicável.
        `;

        const followUpResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: assistantPersonality },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 1000,
            temperature: 0.7
        });

        const answer = followUpResponse.choices[0].message.content;
        logInfo('FOLLOWUP_QUESTION', 'Resposta de acompanhamento gerada com sucesso');
        return answer;
    } catch (error) {
        logError('FOLLOWUP_QUESTION', 'Erro ao gerar resposta de acompanhamento', error);
        return null;
    }
};

module.exports = {
    generateConscienceLetter,
    generatePersonalizedPoetry,
    answerFollowUpQuestion
};
