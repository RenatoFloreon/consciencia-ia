import sessionService from '../services/sessionService.js';
import scrapingService from '../services/scrapingService.js';
import openaiService from '../services/openaiService.js';
import whatsappService from '../services/whatsappService.js';
import { log } from '../utils/logger.js';

/**
 * Handles an incoming message from a user, using a finite state conversational flow.
 * @param {string} from - The user's WhatsApp ID (phone number).
 * @param {string} messageText - The text content of the user's message.
 * @returns {Promise<string[]>} - An array of response message texts to send back.
 */
async function handleIncomingMessage(from, messageText) {
  // Retrieve or initialize session state for this user
  let session = await sessionService.getSession(from);
  if (!session) {
    session = {};  // create a new session object
  }
  let state = session.state || null;
  const userMsg = messageText.trim();

  // If no active state, check if user is initiating the conversation with the trigger phrase
  if (!state) {
    // The conversation starts when the user says they want to generate the Carta de Consciência
    const normalized = userMsg.toLowerCase();
    if (normalized.includes('carta') && normalized.includes('consci')) {
      // User triggered the Carta generation flow
      session.state = 'WAITING_NAME';
      await sessionService.saveSession(from, session);
      // First message: greeting and ask for name
      const greeting = "Olá! 👋 Bem-vindo(a) ao *Conselheiro da Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual especial criado para gerar sua **Carta de Consciência** personalizada – uma análise única baseada no seu perfil digital, revelando insights valiosos sobre seu comportamento empreendedor e recomendações práticas de como usar IA no seu negócio.\n\nPara começar, preciso conhecer você melhor.\nPor favor, como gostaria de ser chamado(a)?";
      return [ greeting ];
    } else {
      // No session and no trigger phrase – ignore or prompt user to start correctly
      const prompt = "Olá! Para gerar sua *Carta de Consciência* personalizada, envie a mensagem: *\"Olá! Quero gerar minha Carta de Consciência personalizada.\"*";
      return [ prompt ];
    }
  }

  // We have an active session state; proceed with conversation flow
  const responses = [];
  try {
    switch (state) {
      case 'WAITING_NAME': {
        // Save the provided name (nickname or preferred name)
        const name = userMsg;
        session.name = name;
        session.state = 'WAITING_EMAIL';
        await sessionService.saveSession(from, session);
        // Respond thanking for name and ask for email (with option to skip)
        const askEmail = `Obrigado, *${name}*! 😊\n\nPara enviarmos materiais e manter contato após o evento, por favor me informe seu e-mail:\n_(Se não quiser fornecer, responda "pular")_`;
        responses.push(askEmail);
        break;
      }
      case 'WAITING_EMAIL': {
        let email = userMsg;
        if (email.toLowerCase() === 'pular') {
          email = null;
        }
        session.email = email;
        session.state = 'WAITING_PROFILE';
        await sessionService.saveSession(from, session);
        // Ask for Instagram or LinkedIn profile link
        const askProfile = "Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nPor favor, me envie o link do seu perfil público do *Instagram* ou *LinkedIn*.\nExemplo: https://www.instagram.com/seuusuario";
        responses.push(askProfile);
        break;
      }
      case 'WAITING_PROFILE': {
        let profileLink = userMsg;
        if (!profileLink.startsWith('http')) {
          profileLink = 'https://' + profileLink;
        }
        session.profileLink = profileLink;
        session.state = 'WAITING_PROF_CHALLENGE';
        await sessionService.saveSession(from, session);
        // Ask for the user's biggest professional challenge
        const askProfChallenge = "Obrigado! 🤗\n\nAgora me conte, em uma *palavra ou frase*, qual é o maior desafio que você tem enfrentado no seu **negócio** atualmente?";
        responses.push(askProfChallenge);
        break;
      }
      case 'WAITING_PROF_CHALLENGE': {
        session.profChallenge = userMsg;
        session.state = 'WAITING_PERS_CHALLENGE';
        await sessionService.saveSession(from, session);
        // Ask for the user's biggest personal challenge
        const askPersChallenge = "Entendi! E na sua **vida pessoal**, qual tem sido o maior desafio? (Responda também com uma palavra ou frase.)";
        responses.push(askPersChallenge);
        break;
      }
      case 'WAITING_PERS_CHALLENGE': {
        // User provided personal challenge, now we have all inputs to generate the letter
        session.persChallenge = userMsg;
        session.state = 'GENERATING_LETTER';
        await sessionService.saveSession(from, session);
        // Acknowledge and inform the user we're generating the letter (this might take a moment)
        const processingMsg = "Gratidão por compartilhar! 🙏\nVou analisar seu perfil e gerar sua Carta de Consciência personalizada. Isso pode levar alguns instantes... ⏳";
        responses.push(processingMsg);

        // Gather profile data (scrape Instagram/LinkedIn)
        const profileData = await scrapingService.scrapeProfile(session.profileLink);
        // Generate the personalized letter using OpenAI (GPT-4 with Vision)
        const letterContent = await openaiService.generateLetter(session.name, profileData, session.profChallenge, session.persChallenge);
        // Split the letter into chunks if it exceeds WhatsApp message length limits
        const letterParts = whatsappService.splitMessage(letterContent, 1600);
        for (const part of letterParts) {
          responses.push(part);
        }

        // After sending the Carta, ask if the user wants more info about AI in business or personal life
        session.state = 'WAITING_MORE_INFO';
        await sessionService.saveSession(from, session);
        const followUp = "✨ *Sua Carta de Consciência personalizada foi entregue!* ✨\n\nEspero que tenha gostado do que leu. 😊 Gostaria de saber mais sobre como a *Inteligência Artificial* pode ajudar no seu *negócio* ou na sua *vida pessoal*? Responda **\"negócios\"** ou **\"vida pessoal\"**, ou digite *\"não\"* caso não deseje continuar.";
        responses.push(followUp);
        break;
      }
      case 'WAITING_MORE_INFO': {
        const choice = userMsg.toLowerCase();
        if (choice.includes('negócio') || choice.includes('negocio')) {
          // User is interested in AI for business
          responses.push("🚀 *IA nos Negócios:* A Inteligência Artificial pode revolucionar seus negócios! Ela pode automatizar atendimentos, analisar dados de vendas para identificar oportunidades e até criar conteúdo de marketing sob medida. Para se aprofundar, conheça o **Programa Consciênc.IA** desenvolvido por Renato Hilel e Nuno Arcanjo, focado em estratégias de IA aplicadas ao crescimento empresarial. Acesse: https://www.floreon.app.br/conscienc-ia 🌐");
        } else if (choice.includes('vida')) {
          // User is interested in AI for personal life
          responses.push("💡 *IA na Vida Pessoal:* A Inteligência Artificial também pode melhorar sua vida pessoal! Pode ajudá-lo(a) a organizar sua rotina, aprender novas habilidades com tutores virtuais e até oferecer suporte para o seu bem-estar emocional. O **Programa Consciênc.IA** (dos especialistas Renato Hilel e Nuno Arcanjo) aborda como integrar a IA na sua vida e carreira. Saiba mais em: https://www.floreon.app.br/conscienc-ia 🌟");
        } else {
          // User is not interested or gave an unrecognized response
          responses.push("Sem problemas! 😊 Foi um prazer ajudar você com sua Carta de Consciência. Aproveite o evento *MAPA DO LUCRO* e, se tiver interesse, não deixe de conversar pessoalmente com os criadores do programa Consciênc.IA. Sucesso! 💫");
        }
        // End of conversation – clear session data
        await sessionService.deleteSession(from);
        break;
      }
      default:
        // If somehow an unknown state, reset the session
        await sessionService.deleteSession(from);
        responses.push("Algo deu errado, vamos começar novamente? Envie *\"Olá! Quero minha Carta de Consciência\"* para reiniciar o processo.");
        break;
    }
  } catch (error) {
    log('Error in conversation flow:', error);
    responses.push("Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.");
    // Optionally reset session on error
    await sessionService.deleteSession(from);
  }
  return responses;
}

export default { handleIncomingMessage };
