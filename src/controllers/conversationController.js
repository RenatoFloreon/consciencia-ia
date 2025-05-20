import sessionService from '../services/sessionService.js';
import scrapingService from '../services/scrapingService.js';
import * as openaiService from '../services/openaiService.js';
import whatsappService from '../services/whatsappService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import interactionService from '../services/interactionService.js';
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
    session = {};
  }
  let state = session.state || null;
  const userMsg = messageText.trim();
  const normalized = userMsg.toLowerCase();
  if (normalized === 'quero recomeçar') {
    await sessionService.deleteSession(from);
    return ["Ok, vamos recomeçar! Envie *\"Quero receber a minha Carta!\"* para iniciar um novo atendimento."];
  }

  // If no active state, check if user is initiating the conversation with the trigger phrase
  if (!state) {
    if (normalized.includes('quero receber') && normalized.includes('minha carta')) {
      // User triggered the Carta generation flow
      session.state = 'WAITING_NAME';
      session.startTimestamp = Date.now();
      await sessionService.saveSession(from, session);
      // First message: greeting and ask for name
      const greeting = "Olá! 👋 Bem-vindo(a) ao *Conselheiro da Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual especial criado para gerar sua **Carta de Consciência** personalizada – uma análise única baseada no seu perfil digital que revelará insights valiosos sobre seu comportamento empreendedor e recomendações práticas de como usar IA no seu negócio.\n\nPara começar, preciso conhecer você melhor.\nPor favor, como gostaria de ser chamado(a)?";
      return [ greeting ];
    } else {
      // No session and no trigger phrase – ignore or prompt user to start with trigger
      return [];
    }
  }

  const responses = [];
  try {
    switch (state) {
      case 'WAITING_NAME': {
        // Save the provided name
        const name = userMsg;
        session.name = name;
        session.state = 'WAITING_EMAIL';
        await sessionService.saveSession(from, session);
        const askEmail = "Obrigado, " + name + "! 😊\n\nPara enviarmos materiais após o evento, por favor, informe seu e-mail:\n\n(Caso não queira informar agora, digite \"pular\" para continuar)";
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
        const askProfile = "Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nPor favor, me envie o link do seu perfil público do Instagram ou LinkedIn.\nExemplo: https://www.instagram.com/seuusuario\n\n*(Você também pode enviar apenas seu @usuário, ou até mesmo uma imagem do perfil / print.)*";
        responses.push(askProfile);
        break;
      }
      case 'WAITING_PROFILE': {
        let profileInput = userMsg;
        // Determine input type and format profile input
        if (profileInput.startsWith('<imagemUrl:')) {
          const imageUrl = profileInput.slice(profileInput.indexOf(':') + 1, -1);
          session.profileImageUrl = imageUrl;
          // Classify image type (screenshot vs photo)
          let imgType = null;
          try {
            imgType = await visionAnalysisService.classifyImageType(imageUrl);
          } catch (err) {
            imgType = null;
          }
          session.inputType = (imgType === 'screenshot' ? 'print' : 'image');
          session.state = 'WAITING_PROF_CHALLENGE';
          await sessionService.saveSession(from, session);
          responses.push("Obrigado pela imagem do perfil!");
          const askBusiness = "Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu *Negócio* no momento?";
          responses.push(askBusiness);
          break;
        }
        if (!profileInput.startsWith('http')) {
          if (profileInput.startsWith('@')) {
            profileInput = 'https://www.instagram.com/' + profileInput.slice(1);
            session.inputType = 'username';
          } else if (profileInput.includes('instagram.com') || profileInput.includes('linkedin.com')) {
            profileInput = 'https://' + profileInput;
            session.inputType = 'link';
          } else {
            profileInput = 'https://' + profileInput;
            session.inputType = 'link';
          }
        } else {
          session.inputType = 'link';
        }
        session.profileLink = profileInput;
        session.state = 'WAITING_PROF_CHALLENGE';
        await sessionService.saveSession(from, session);
        const askBusiness = "Obrigado! Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu *Negócio* no momento?";
        responses.push(askBusiness);
        break;
      }
      case 'WAITING_PROF_CHALLENGE': {
        // User provided professional challenge, now ask for personal challenge
        session.profChallenge = userMsg;
        session.state = 'WAITING_PERS_CHALLENGE';
        await sessionService.saveSession(from, session);
        const askPersonal = "Entendi! E na sua vida pessoal, qual tem sido o maior desafio? (Responda com uma única palavra ou frase)";
        responses.push(askPersonal);
        break;
      }
      case 'WAITING_PERS_CHALLENGE': {
        // User provided personal challenge, now we have all inputs to generate the letter
        session.persChallenge = userMsg;
        session.state = 'GENERATING_LETTER';
        await sessionService.saveSession(from, session);
        // Acknowledge receipt and inform user we are generating the letter
        const processingMsg = "Gratidão por compartilhar! 🙏\nVou analisar seu perfil e gerar sua Carta de Consciência personalizada. Isso pode levar alguns instantes... ⏳";
        responses.push(processingMsg);
        // Gather profile data via scraping or vision analysis
        let profileData = null;
        if (session.profileLink) {
          profileData = await scrapingService.scrapeProfile(session.profileLink);
        }
        if (!session.profileLink && session.profileImageUrl) {
          // Analyze image input if provided
          try {
            const imageAnalysis = await visionAnalysisService.analyzeProfileImage(session.profileImageUrl);
            profileData = { name: '', bio: imageAnalysis || '', imageUrl: session.profileImageUrl, posts: [] };
          } catch (err) {
            profileData = { name: '', bio: '', imageUrl: session.profileImageUrl, posts: [] };
          }
        }
        // If profile is protected or scrape failed, warn the user
        if (!profileData || ((profileData.bio === '' || !profileData.bio) && (!profileData.posts || profileData.posts.length === 0))) {
          responses.push("Seu perfil parece estar protegido ou não pôde ser analisado completamente. Vou prosseguir com as informações disponíveis.");
        }
        // Generate the personalized letter using OpenAI
        const letterContent = await openaiService.generateLetter(session.name, profileData || {}, session.profChallenge, session.persChallenge);
        if (!letterContent) {
          responses.push("Desculpe, não consegui gerar sua Carta de Consciência no momento. Por favor, tente novamente mais tarde.");
          await sessionService.deleteSession(from);
          break;
        }
        // If letter is too long, send first part and ask user if they want the rest
        if (letterContent.length > 3000) {
          const part1 = letterContent.substring(0, 3000);
          const part2 = letterContent.substring(3000);
          const part1Segments = whatsappService.splitMessage(part1, 1600);
          for (const seg of part1Segments) {
            responses.push(seg);
          }
          responses.push("A carta ficou um pouco longa. Deseja receber o restante dela? Responda *\"sim\"* para ver o restante ou *\"não\"* para finalizar.");
          session.pendingLetter = part2;
          session.state = 'WAITING_LETTER_CONFIRM';
          await sessionService.saveSession(from, session);
          // Log the delivered part of the letter as an interaction (full letter content stored)
          const interactionData = {
            type: 'letter_delivered',
            name: session.name || '',
            phoneNumber: from,
            email: session.email || '',
            profileUrl: session.profileLink || '',
            imageId: session.profileImageUrl || '',
            inputType: session.inputType || '',
            businessChallenge: session.profChallenge || '',
            personalChallenge: session.persChallenge || '',
            letterContent: letterContent,
            startTimestamp: session.startTimestamp || Date.now(),
            timestamp: Date.now(),
            letterIsGeneric: !profileData || ((profileData.name === '' || !profileData.name) && (profileData.bio === '' || !profileData.bio) && (!profileData.posts || profileData.posts.length === 0))
          };
          await interactionService.saveInteraction(interactionData);
          break;
        }
        // Split the letter into chunks if it is lengthy (WhatsApp limit ~1600 chars)
        const letterParts = whatsappService.splitMessage(letterContent, 1600);
        for (const part of letterParts) {
          responses.push(part);
        }
        // After sending the Carta, ask if the user wants more assistance or another inspiration
        session.state = 'WAITING_MORE_INFO';
        await sessionService.saveSession(from, session);
        const followUp = "✨ *Sua Carta de Consciência personalizada foi entregue!* ✨\n\nPosso ajudar com mais algo? Digite **\"IA\"** para saber como a IA pode ajudar você hoje, **\"inspiração\"** para outra inspiração personalizada, ou **\"não\"** para encerrar.";
        responses.push(followUp);
        // Log the interaction data
        const interactionData = {
          type: 'letter_delivered',
          name: session.name || '',
          phoneNumber: from,
          email: session.email || '',
          profileUrl: session.profileLink || '',
          imageId: session.profileImageUrl || '',
          inputType: session.inputType || '',
          businessChallenge: session.profChallenge || '',
          personalChallenge: session.persChallenge || '',
          letterContent: letterContent,
          startTimestamp: session.startTimestamp || Date.now(),
          timestamp: Date.now(),
          letterIsGeneric: !profileData || ((profileData.name === '' || !profileData.name) && (profileData.bio === '' || !profileData.bio) && (!profileData.posts || profileData.posts.length))
        };
        await interactionService.saveInteraction(interactionData);
        break;
      }
      case 'WAITING_LETTER_CONFIRM': {
        const choice = userMsg.toLowerCase();
        if (choice.includes('sim')) {
          // User wants the remaining letter content
          if (session.pendingLetter) {
            const remainingSegments = whatsappService.splitMessage(session.pendingLetter, 1600);
            for (const seg of remainingSegments) {
              responses.push(seg);
            }
          }
          // After delivering the rest, proceed to follow-up suggestions
          session.state = 'WAITING_MORE_INFO';
          await sessionService.saveSession(from, session);
          const followUp = "✨ *Carta completa entregue!* ✨\n\nPosso ajudar com mais algo? Digite **\"IA\"** para saber como a IA pode ajudar você hoje, **\"inspiração\"** para outra inspiração personalizada, ou **\"não\"** para encerrar.";
          responses.push(followUp);
        } else {
          // User does not want the rest of the letter
          responses.push("Entendido, não enviarei o restante da carta.");
          session.state = 'WAITING_MORE_INFO';
          await sessionService.saveSession(from, session);
          const followUp = "Posso ajudar com mais algo? Digite **\"IA\"** para saber como a IA pode ajudar hoje, **\"inspiração\"** para outra inspiração personalizada, ou **\"não\"** para encerrar.";
          responses.push(followUp);
        }
        break;
      }
      case 'WAITING_MORE_INFO': {
        const choice = userMsg.toLowerCase();
        if (choice.includes('ia') || choice.includes('ajuda') || choice.includes('sim')) {
          // User is interested in how AI can help (single question flow)
          session.state = 'WAITING_ONE_CHALLENGE';
          await sessionService.saveSession(from, session);
          const singleQuestion = "🤖 Se você pudesse resolver apenas *UM* desafio neste momento, qual seria esse desafio que, ao ser superado, traria os resultados que você mais deseja?";
          responses.push(singleQuestion);
        } else if (choice.includes('inspira')) {
          // User wants another inspiration (restart process)
          responses.push("Claro! Vamos começar outra inspiração personalizada. Envie *\"Quero receber a minha Carta!\"* para iniciarmos um novo processo.");
          await sessionService.deleteSession(from);
        } else {
          // User not interested or said no
          responses.push("Sem problemas! 😊 Foi um prazer ajudar você com sua Carta de Consciência. Sucesso! 💫");
          await sessionService.deleteSession(from);
        }
        break;
      }
      case 'WAITING_ONE_CHALLENGE': {
        const userChallenge = userMsg;
        // Generate AI assistance answer for the single challenge
        const answer = await openaiService.generateFollowupAnswer(userChallenge);
        if (answer) {
          responses.push(answer);
        } else {
          responses.push("Desculpe, não consegui elaborar uma resposta no momento.");
        }
        responses.push("Espero que essas ideias ajudem você! Se precisar de algo mais, é só me chamar. 🤖");
        // Log the follow-up question interaction
        const interactionData = {
          type: 'followup_question',
          name: session.name || '',
          phoneNumber: from,
          question: userChallenge,
          answer: answer || '',
          timestamp: Date.now()
        };
        await interactionService.saveInteraction(interactionData);
        // End conversation
        await sessionService.deleteSession(from);
        break;
      }
      default:
        // If somehow an unknown state, reset the session
        await sessionService.deleteSession(from);
        responses.push("Algo deu errado, vamos começar novamente? Envie *\"Quero receber a minha Carta!\"* para reiniciar o processo.");
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
