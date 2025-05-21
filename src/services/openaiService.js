import axios from 'axios';
import { log } from '../utils/logger.js';

// Configuração da API da OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o'; // Modelo mais recente e capaz

/**
 * Gera uma carta de consciência personalizada
 * @param {Object} userData - Dados do usuário para personalização
 * @returns {Promise<string>} - Texto da carta gerada
 */
export async function generateConscienceLetter(userData ) {
  try {
    const { name, challenge, profileUrl, profileData, imageAnalysis, inputType } = userData;
    
    // Constrói o prompt com base nos dados disponíveis
    let prompt = `Gere uma Carta de Consciência personalizada para ${name || 'o usuário'}.`;
    
    if (challenge) {
      prompt += ` O maior desafio atual no negócio é: "${challenge}".`;
    }
    
    if (profileUrl) {
      prompt += ` O perfil digital é: ${profileUrl}.`;
    }
    
    if (profileData) {
      prompt += ` Dados extraídos do perfil: ${JSON.stringify(profileData)}.`;
    }
    
    if (imageAnalysis) {
      prompt += ` Análise da imagem: ${imageAnalysis}.`;
    }
    
    if (inputType) {
      prompt += ` Tipo de input fornecido: ${inputType}.`;
    }
    
    // Sistema de instruções detalhado para a carta
    const systemPrompt = `Você é o Conselheiro da Consciênc.IA, um assistente especializado em gerar Cartas de Consciência personalizadas para empreendedores. 
    
Sua tarefa é criar uma carta profunda e inspiradora que analise o perfil do usuário e ofereça insights valiosos sobre seu comportamento empreendedor.

A carta deve seguir este formato:
🌱 Saudação personalizada com uma metáfora sobre a Alma do Negócio como um farol.
🗣️ Perfil Comportamental: Análise dos padrões de pensamento e comportamento do usuário com base no conceito de Ikigai.
🧭 Conselho de Ouro: Orientação específica relacionada ao desafio mencionado pelo usuário.
💡 Sugestão de Ferramenta de IA: Recomendação prática de como usar IA para superar o desafio.
🪷 Inspiração poética: Poesia personalizada que motiva o usuário a enfrentar seus desafios.
🦾 Conclusão Motivacional: Mensagem final de encorajamento.

Importante:
- Use o nome do usuário em toda a carta
- Mencione especificamente o desafio que ele compartilhou
- Seja profundo, inspirador e motivacional
- Evite clichês e generalizações
- Limite a carta a aproximadamente 1000 palavras
- Use emojis ocasionalmente para tornar a comunicação mais calorosa`;

    // Faz a chamada para a API da OpenAI
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    // Extrai e retorna o conteúdo gerado
    return response.data.choices[0].message.content;
  } catch (error) {
    log('Erro ao gerar carta de consciência:', error);
    
    // Tenta novamente com backoff exponencial se for um erro de rate limit
    if (error.response && (error.response.status === 429 || error.response.status === 500)) {
      const delay = Math.floor(Math.random() * 5000) + 3000; // 3-8 segundos
      log(`Tentando novamente em ${delay}ms...`);
      
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            const retryResponse = await generateConscienceLetter(userData);
            resolve(retryResponse);
          } catch (retryError) {
            reject(retryError);
          }
        }, delay);
      });
    }
    
    throw error;
  }
}

/**
 * Gera uma sugestão de como a IA pode ajudar com o desafio
 * @param {string} name - Nome do usuário
 * @param {string} challenge - Desafio mencionado pelo usuário
 * @returns {Promise<string>} - Texto com sugestões de IA
 */
export async function generateIAHelp(name, challenge) {
  try {
    const prompt = `Gere uma sugestão prática e detalhada de como a Inteligência Artificial pode ajudar ${name || 'o usuário'} a superar o desafio: "${challenge || 'crescimento nos negócios'}". Inclua exemplos específicos de ferramentas de IA e como implementá-las.`;
    
    const systemPrompt = `Você é um especialista em aplicações práticas de IA para negócios. 
    
Sua resposta deve:
1. Ser concisa e direta (máximo 300 palavras)
2. Sugerir ferramentas específicas de IA
3. Explicar como implementar cada ferramenta
4. Mencionar benefícios tangíveis
5. Usar linguagem acessível para não-técnicos
6. Incluir um exemplo de caso de sucesso relevante`;

    // Faz a chamada para a API da OpenAI
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    // Extrai e retorna o conteúdo gerado
    return response.data.choices[0].message.content;
  } catch (error) {
    log('Erro ao gerar sugestão de IA:', error);
    
    // Fallback em caso de erro
    return `${name || 'Empreendedor'}, a IA pode ser uma aliada poderosa para superar desafios como "${challenge || 'crescimento nos negócios'}". Considere usar assistentes virtuais para automação, análise de dados para insights de mercado, ou ferramentas de IA generativa para criação de conteúdo. Para mais informações personalizadas, entre em contato com nossa equipe.`;
  }
}

/**
 * Gera uma inspiração personalizada
 * @param {string} name - Nome do usuário
 * @param {string} challenge - Desafio mencionado pelo usuário
 * @returns {Promise<string>} - Texto inspiracional
 */
export async function generateInspiration(name, challenge) {
  try {
    const prompt = `Crie uma pílula de inspiração poética personalizada para ${name || 'o empreendedor'}, que está enfrentando o desafio: "${challenge || 'crescimento nos negócios'}". A mensagem deve ser motivacional e relacionada ao conceito de Ikigai e Alma do Negócio.`;
    
    const systemPrompt = `Você é um poeta inspiracional especializado em mensagens motivacionais para empreendedores.
    
Sua resposta deve:
1. Ser uma poesia curta e impactante (máximo 150 palavras)
2. Usar metáforas relacionadas ao desafio específico
3. Mencionar o nome do usuário
4. Incorporar o conceito de Ikigai (intersecção entre o que você ama, o que o mundo precisa, o que você pode ser pago para fazer e o que você é bom)
5. Ter um tom esperançoso e energizante
6. Terminar com uma frase de efeito memorável`;

    // Faz a chamada para a API da OpenAI
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    // Extrai e retorna o conteúdo gerado
    return response.data.choices[0].message.content;
  } catch (error) {
    log('Erro ao gerar inspiração:', error);
    
    // Fallback em caso de erro
    return `✨ *Pílula de Inspiração*

Em mares de incerteza, você navega, ${name || 'empreendedor'},
Com a Alma do Negócio a iluminar,
Desafios enormes, como montanhas se elevam,
Mas você está aqui para conquistar.

No vulcão do desafio, um diamante nasce,
Em seu Ikigai, sua verdadeira luz resplandece,
Em seu espírito, um fogo incansável arde,
Você é a estrela que o universo conhece.`;
  }
}

/**
 * Analisa uma imagem usando a API de visão da OpenAI
 * @param {string} imageUrl - URL da imagem em formato base64 ou URL
 * @returns {Promise<string>} - Texto da análise
 */
export async function analyzeImageWithVision(imageUrl) {
  try {
    if (!imageUrl) {
      throw new Error('URL da imagem é obrigatória');
    }
    
    const prompt = "Analise esta imagem e extraia insights sobre a personalidade, interesses e características da pessoa ou perfil mostrado. Seja detalhado mas conciso.";
    
    // Faz a chamada para a API da OpenAI
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 800
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    // Extrai e retorna o conteúdo gerado
    return response.data.choices[0].message.content;
  } catch (error) {
    log('Erro ao analisar imagem com visão:', error);
    throw error;
  }
}
