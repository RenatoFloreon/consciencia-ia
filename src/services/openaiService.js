import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Helper to call OpenAI ChatCompletion API
async function callChatCompletion(messages, model = "gpt-4", temperature = 0.7) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`
  };
  const body = {
    model,
    messages,
    temperature,
    max_tokens: 2000
  };
  const response = await axios.post(OPENAI_API_URL, body, { headers });
  const assistantMessage = response.data.choices[0].message.content;
  return assistantMessage;
}

// Generate the full personalized letter
export async function generateLetter({ userName, mainChallenge, profileInfo }) {
  // Construct the prompt for the assistant
  // Profile info may be null or a string containing some analysis or bio/headline.
  let profileSection = "";
  if (profileInfo && profileInfo.trim().length > 0) {
    profileSection = `Informações do perfil digital do usuário: ${profileInfo.trim()}\n`;
  }
  const prompt = 
    `Você é um assistente virtual capaz de gerar uma "Carta de Consciência" personalizada para o usuário, ` +
    `baseada em informações de perfil digital e no desafio principal informado. ` +
    `A carta deve ser escrita em português, em um tom encorajador, profundo e pessoal, usando segunda pessoa (você) e emojis estrategicamente. ` +
    `Estruture a carta nos seguintes tópicos, usando separadores e emojis conforme indicado:\n\n` +
    `💌 *Introdução Simbólica:* Uma saudação inicial ao usuário (chamando pelo nome ${userName}) incluindo uma metáfora ou simbolismo, mencionando "a Alma do seu Negócio".\n` +
    `✨ *Perfil Comportamental (Insight de Consciência):* Análise do perfil digital e comportamental do usuário, destacando interesses, padrões ou características marcantes. Conecte com conceitos como Ikigai se possível.\n` +
    `🧭 *Conselho de Ouro:* Dica de ouro ou recomendação valiosa para o usuário superar seu principal desafio, inspirada em princípios (como Ikigai ou equilíbrio de vida). Utilize metáforas ou analogias significativas.\n` +
    `🚀 *Sugestão de Ferramenta de IA:* Uma sugestão de uma ferramenta prática de Inteligência Artificial que possa ajudar diretamente com o desafio principal do usuário, com breve descrição de como pode ajudar.\n` +
    `💫 *Pílula de Inspiração (Poesia Personalizada):* Um pequeno poema ou verso inspirado na jornada do usuário, personalizado com elementos que ressoem com ele.\n` +
    `🎉 *Conclusão Motivacional:* Encerramento positivo, mencionando o nome do usuário novamente e encorajando-o a continuar evoluindo em sua jornada.\n\n` +
    `${profileSection}` +
    `Desafio principal do usuário: "${mainChallenge}".\n\n` +
    `Agora, escreva a Carta de Consciência personalizada seguindo as instruções acima. ` +
    `Não mencione nenhum programa externo ou links na carta. Apenas produza o conteúdo da carta com rica personalização e emoção.`;
  const messages = [
    { role: "user", content: prompt }
  ];
  const completion = await callChatCompletion(messages, "gpt-4", 0.8);
  return completion;
}

// Generate a short personalized inspiration (poem or quote) for option 2
export async function generateInspiration({ userName, mainChallenge }) {
  const prompt = 
    `Você é um assistente criativo. Com base no desafio principal do usuário ("${mainChallenge}") e no contexto da Carta de Consciência já fornecida, ` +
    `crie apenas uma *curta inspiração personalizada* para o ${userName}. ` +
    `Pode ser em formato de poesia breve ou frase motivacional, com um tom positivo e motivador, usando até 4 linhas. ` +
    `Inclua um ou dois emojis que combinem com a mensagem.`;
  const messages = [
    { role: "user", content: prompt }
  ];
  const completion = await callChatCompletion(messages, "gpt-4", 0.9);
  return completion;
}
