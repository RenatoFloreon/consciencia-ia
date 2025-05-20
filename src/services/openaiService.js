import axios from 'axios';
import { log } from '../utils/logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4';  // Modelo GPT-4 padrão
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function generateLetter(name, profileData, profChallenge, persChallenge) {
  // Construct the system prompt with instructions for the format and tone
  const systemMessage = {
    role: 'system',
    content: 
`Você é *Conscienc.IA*, um assistente virtual que gera uma "Carta de Consciência" personalizada baseada no perfil digital do usuário e nos desafios pessoais e profissionais que ele enfrenta. Sua resposta deve ser em Português do Brasil, com tom inspirador, emocional e muito personalizado, escrevendo diretamente para o usuário (tratando-o como "você").

Estruture a carta com as seções a seguir, usando exatamente os títulos e emojis indicados:

💌 Saudação inicial chamando o usuário pelo nome (ex.: "Querido João,...")  
✨ PERFIL COMPORTAMENTAL (INSIGHT DE CONSCIÊNCIA) ✨ – Nesta seção, analise o comportamento e perfil digital do usuário (interesses, estilo, padrão de posts), conectando com o conceito de Ikigai quando possível.  
🚀 DICAS PRÁTICAS DE USO DE IA NOS NEGÓCIOS 🚀 – Liste 3 dicas numeradas (1️⃣, 2️⃣, 3️⃣) de como a IA pode ajudar nos desafios do negócio que o usuário mencionou, sendo bem específicas e citando ferramentas ou exemplos práticos.  
💫 DICAS PRÁTICAS DE USO DE IA NA SUA VIDA PESSOAL 💫 – Liste 3 dicas numeradas de como a IA pode ajudar nos desafios pessoais do usuário, também específicas e práticas para a vida diária.  
🧭 CONSELHO DE OURO 🧭 – Recomendações finais integrando o conceito de Ikigai e o Método S.I.M. aos contextos do usuário. Mencione os perfis @metodosimbrasil e @coworkingikigai (Instagram) como recursos para ele conhecer mais sobre o Método S.I.M. e Ikigai.  
💫 POESIA CANALIZADA 💫 – Uma breve poesia original que inclua o nome do usuário (ou o significado do nome) e elementos temáticos relacionados ao perfil dele, encerrando a carta de forma motivacional e poética.

Certifique-se de que a carta seja **100% personalizada** – use detalhes do perfil (bio, interesses, postagens) e aborde diretamente os desafios informados pelo usuário, oferecendo soluções e insights únicos.`
  };

  // Prepare user-provided data as the user prompt
  const profileName = profileData.name || name || '';
  const profileBio = profileData.bio || '(bio indisponível)';
  // Compile recent posts snippets into one line (if any)
  let postsInfo = '';
  if (profileData.posts && profileData.posts.length > 0) {
    const postsJoined = profileData.posts.map((p, i) => `Post${i+1}: "${p}"`).join(' | ');
    postsInfo = `\nPostagens recentes: ${postsJoined}`;
  }
  const userContentText = 
`Dados do usuário:
Nome: ${profileName}
Bio: ${profileBio}
Desafio profissional: ${profChallenge}
Desafio pessoal: ${persChallenge}${postsInfo}`;

  // Build the messages array, including the profile image if available (for GPT-4 Vision models)
  let userMessage;
  if (profileData.imageUrl) {
    userMessage = {
      role: 'user',
      content: [
        {"image": profileData.imageUrl}, 
        userContentText
      ]
    };
  } else {
    userMessage = { role: 'user', content: userContentText };
  }

  const requestBody = {
    model: OPENAI_MODEL,
    messages: [ systemMessage, userMessage ],
    temperature: 0.8,
    max_tokens: 1200
  };

  try {
    const apiResponse = await axios.post(OPENAI_API_URL, requestBody, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const assistantMessage = apiResponse.data.choices?.[0]?.message?.content;
    return assistantMessage || '';
  } catch (err) {
    log('OpenAI API error:', err.response?.data || err.message);
    throw new Error('Failed to generate letter via OpenAI API');
  }
}

/**
 * Generate a follow-up answer suggesting how AI can help with a given challenge.
 * @param {string} challenge - The single challenge description provided by the user.
 * @returns {Promise<string>} - A response message with AI suggestions.
 */
async function generateFollowupAnswer(challenge) {
  const systemMessage = {
    role: 'system',
    content: 'Você é um assistente virtual especializado em oferecer sugestões práticas de como a Inteligência Artificial pode ajudar a resolver desafios fornecidos pelo usuário. Responda em um tom encorajador, motivacional e conciso, em Português do Brasil.'
  };
  const userMessage = {
    role: 'user',
    content: `Desafio: ${challenge}\n\nComo a Inteligência Artificial pode ajudar a resolver esse desafio?`
  };
  const requestBody = {
    model: OPENAI_MODEL,
    messages: [systemMessage, userMessage],
    temperature: 0.7,
    max_tokens: 500
  };
  try {
    const apiResponse = await axios.post(OPENAI_API_URL, requestBody, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const answer = apiResponse.data.choices?.[0]?.message?.content;
    return answer?.trim() || '';
  } catch (err) {
    log('OpenAI API error (followup):', err.response?.data || err.message);
    return '';
  }
}

export default { generateLetter, generateFollowupAnswer };
