import sessionService from '../services/sessionService.js';
import whatsappService from '../services/whatsappService.js';
import * as openaiService from '../services/openaiService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import * as profileScraperService from '../services/profileScraperService.js';
import interactionService from '../services/interactionService.js';
import { log } from '../utils/logger.js';

// Constantes para os estados da conversa
const CONVERSATION_STATES = {
  INITIAL: 'initial',
  WAITING_NAME: 'waiting_name',
  WAITING_EMAIL: 'waiting_email',
  WAITING_PROFILE: 'waiting_profile',
  WAITING_CHALLENGE: 'waiting_challenge',
  GENERATING_LETTER: 'generating_letter',
  LETTER_DELIVERED: 'letter_delivered',
  WAITING_COMMAND: 'waiting_command'
};

// Mensagens padrão do sistema
const SYSTEM_MESSAGES = {
  WELCOME: `Olá! 👋 Bem-vindo(a) ao *Conselheiro da Consciênc.IA* do evento MAPA DO LUCRO!

Sou um assistente virtual especial criado para gerar sua *Carta de Consciência* personalizada – uma análise única baseada no seu perfil digital que revelará insights valiosos sobre seu comportamento empreendedor e recomendações práticas de como usar IA no seu negócio.

Para começar, preciso conhecer você melhor.
Por favor, como gostaria de ser chamado(a)?`,

  ASK_EMAIL: `Obrigado, {name}! 😊

Para enviarmos materiais após o evento, por favor, informe seu e-mail:

(Caso não queira informar agora, digite "pular" para continuar)`,

  ASK_PROFILE: `Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.

Por favor, me envie o link do seu perfil público do Instagram ou LinkedIn.
Exemplo: https://www.instagram.com/seuusuario

(Você também pode enviar apenas seu @usuário, ou até mesmo uma imagem do perfil / print.)`,

  ASK_CHALLENGE: `Obrigado! Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu *Negócio* no momento?`,

  GENERATING_LETTER: `Obrigado por compartilhar! 🙏

Vou analisar seu perfil e gerar sua Carta de Consciência personalizada. Isso pode levar alguns instantes... ⏳`,

  LETTER_DELIVERED: `✨ Sua Carta de Consciência personalizada foi entregue! ✨

Posso ajudar com mais algo? Digite *"IA"* para saber como a IA pode ajudar você hoje, *"inspiração"* para outra inspiração personalizada, ou *"não"* para encerrar.`,

  ERROR_MESSAGE: `Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.`,

  RESTART_MESSAGE: `Algo deu errado, vamos começar novamente? Envie *"Quero receber a minha Carta!"* para reiniciar o processo.`,

  FINAL_MESSAGE: `Gratidão por participar do Programa Consciênc.IA! 🙏

Se quiser saber mais sobre como a IA pode transformar seu negócio, fale com nosso time através do e-mail contato@consciencia.ia

Até breve! ✨`
};

/**
 * Processa mensagens recebidas do webhook do WhatsApp
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 */
export async function processMessage(req, res) {
  try {
    // Responde imediatamente ao webhook para evitar timeout
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    
    // Verifica se é uma mensagem válida
    if (!body.object || !body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value.messages) {
      return;
    }

    const message = body.entry[0].changes[0].value.messages[0];
    const phoneNumber = message.from;
    
    // Registra a mensagem recebida para depuração
    log(`Mensagem recebida de ${phoneNumber}: ${JSON.stringify(message)}`);

    // Processa a mensagem com base no tipo
    if (message.type === 'text') {
      await handleTextMessage(phoneNumber, message.text.body);
    } else if (message.type === 'image') {
      await handleImageMessage(phoneNumber, message.image);
    } else {
      // Tipo de mensagem não suportado
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, só posso processar mensagens de texto ou imagens no momento."
      );
    }
  } catch (error) {
    log('Erro ao processar mensagem:', error);
    res.status(500).send('ERROR');
  }
}

/**
 * Processa mensagens de texto recebidas
 * @param {string} phoneNumber - Número de telefone do remetente
 * @param {string} messageText - Texto da mensagem
 */
async function handleTextMessage(phoneNumber, messageText) {
  try {
    // Obtém ou cria a sessão do usuário
    let session = await sessionService.getSession(phoneNumber);
    
    // Se não houver sessão, cria uma nova
    if (!session) {
      session = {
        phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        data: {}
      };
    }

    // Verifica se é uma mensagem de reinício
    if (messageText.toLowerCase().includes('quero receber') && messageText.toLowerCase().includes('carta')) {
      session = {
        phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        data: {}
      };
      await sessionService.saveSession(phoneNumber, session);
      await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.WELCOME);
      return;
    }

    // Processa a mensagem com base no estado atual da conversa
    switch (session.state) {
      case CONVERSATION_STATES.INITIAL:
        // Inicia a conversa
        session.state = CONVERSATION_STATES.WAITING_NAME;
        await sessionService.saveSession(phoneNumber, session);
        await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.WELCOME);
        break;

      case CONVERSATION_STATES.WAITING_NAME:
        // Salva o nome e solicita o e-mail
        session.data.name = messageText.trim();
        session.state = CONVERSATION_STATES.WAITING_EMAIL;
        await sessionService.saveSession(phoneNumber, session);
        
        const emailMessage = SYSTEM_MESSAGES.ASK_EMAIL.replace('{name}', session.data.name);
        await whatsappService.sendTextMessage(phoneNumber, emailMessage);
        break;

      case CONVERSATION_STATES.WAITING_EMAIL:
        // Salva o e-mail e solicita o perfil
        if (messageText.toLowerCase() !== 'pular') {
          session.data.email = messageText.trim();
        }
        session.state = CONVERSATION_STATES.WAITING_PROFILE;
        await sessionService.saveSession(phoneNumber, session);
        await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.ASK_PROFILE);
        break;

      case CONVERSATION_STATES.WAITING_PROFILE:
        // Processa o perfil (link ou @) e solicita o desafio
        session.data.profileInput = messageText.trim();
        
        // Verifica se é um @username ou link completo
        if (messageText.startsWith('@') || messageText.includes('instagram.com') || messageText.includes('linkedin.com')) {
          session.data.profileUrl = messageText.trim();
          session.data.inputType = 'username';
          
          // Tenta extrair informações do perfil
          try {
            const profileData = await profileScraperService.scrapeProfile(session.data.profileUrl);
            if (profileData) {
              session.data.profileData = profileData;
            }
          } catch (error) {
            log('Erro ao extrair dados do perfil:', error);
            // Continua mesmo se falhar, pois é opcional
          }
        }
        
        session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
        await sessionService.saveSession(phoneNumber, session);
        await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.ASK_CHALLENGE);
        break;

      case CONVERSATION_STATES.WAITING_CHALLENGE:
        // Salva o desafio e inicia a geração da carta
        session.data.challenge = messageText.trim();
        session.state = CONVERSATION_STATES.GENERATING_LETTER;
        session.data.startTimestamp = Date.now();
        await sessionService.saveSession(phoneNumber, session);
        
        // Informa que está gerando a carta
        await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.GENERATING_LETTER);
        
        // Gera a carta em background
        generateAndSendLetter(phoneNumber, session);
        break;

      case CONVERSATION_STATES.LETTER_DELIVERED:
      case CONVERSATION_STATES.WAITING_COMMAND:
        // Processa comandos após a entrega da carta
        session.state = CONVERSATION_STATES.WAITING_COMMAND;
        await sessionService.saveSession(phoneNumber, session);
        
        const command = messageText.toLowerCase();
        
        if (command === 'ia') {
          // Envia informações sobre IA
          const iaMessage = await openaiService.generateIAHelp(session.data.name, session.data.challenge);
          await whatsappService.sendTextMessage(phoneNumber, iaMessage);
        } else if (command === 'inspiração' || command === 'inspiracao') {
          // Envia uma nova inspiração
          const inspiration = await openaiService.generateInspiration(session.data.name, session.data.challenge);
          await whatsappService.sendTextMessage(phoneNumber, inspiration);
        } else if (command === 'não' || command === 'nao') {
          // Encerra a conversa
          await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.FINAL_MESSAGE);
          // Opcional: limpar a sessão após encerramento
          // await sessionService.deleteSession(phoneNumber);
        } else {
          // Comando não reconhecido
          await whatsappService.sendTextMessage(
            phoneNumber,
            "Desculpe, não entendi. Digite *\"IA\"* para saber como a IA pode ajudar você hoje, *\"inspiração\"* para outra inspiração personalizada, ou *\"não\"* para encerrar."
          );
        }
        break;

      default:
        // Estado desconhecido, reinicia a conversa
        session = {
          phoneNumber,
          state: CONVERSATION_STATES.INITIAL,
          data: {}
        };
        await sessionService.saveSession(phoneNumber, session);
        await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.RESTART_MESSAGE);
    }
  } catch (error) {
    log('Erro ao processar mensagem de texto:', error);
    await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.ERROR_MESSAGE);
  }
}

/**
 * Processa mensagens de imagem recebidas
 * @param {string} phoneNumber - Número de telefone do remetente
 * @param {Object} imageData - Dados da imagem
 */
async function handleImageMessage(phoneNumber, imageData) {
  try {
    // Obtém ou cria a sessão do usuário
    let session = await sessionService.getSession(phoneNumber);
    
    // Se não houver sessão, cria uma nova
    if (!session) {
      session = {
        phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        data: {}
      };
      await sessionService.saveSession(phoneNumber, session);
      await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.WELCOME);
      return;
    }

    // Processa a imagem apenas se estiver esperando o perfil
    if (session.state === CONVERSATION_STATES.WAITING_PROFILE) {
      // Obtém a URL da imagem
      const imageId = imageData.id;
      const imageUrl = await whatsappService.getMediaUrl(imageId);
      
      if (!imageUrl) {
        await whatsappService.sendTextMessage(
          phoneNumber,
          "Desculpe, não consegui processar sua imagem. Por favor, tente enviar um link do seu perfil ou @usuário."
        );
        return;
      }

      // Classifica o tipo de imagem (screenshot ou foto)
      const imageType = await visionAnalysisService.classifyImageType(imageUrl);
      
      // Salva os dados da imagem na sessão
      session.data.profileUrl = imageUrl;
      session.data.imageId = imageId;
      session.data.inputType = imageType;
      
      // Analisa a imagem para extrair insights
      try {
        const imageAnalysis = await visionAnalysisService.analyzeImageFromUrl(imageUrl);
        if (imageAnalysis) {
          session.data.imageAnalysis = imageAnalysis;
        }
      } catch (error) {
        log('Erro ao analisar imagem:', error);
        // Continua mesmo se falhar, pois é opcional
      }

      // Avança para o próximo estado
      session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
      await sessionService.saveSession(phoneNumber, session);
      await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.ASK_CHALLENGE);
    } else {
      // Não está no estado correto para receber imagens
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, não estou esperando uma imagem neste momento. Por favor, siga as instruções anteriores."
      );
    }
  } catch (error) {
    log('Erro ao processar mensagem de imagem:', error);
    await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.ERROR_MESSAGE);
  }
}

/**
 * Gera e envia a carta personalizada
 * @param {string} phoneNumber - Número de telefone do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function generateAndSendLetter(phoneNumber, session) {
  try {
    // Extrai os dados necessários da sessão
    const { name, challenge, profileUrl, profileData, imageAnalysis, inputType } = session.data;
    
    // Gera a carta personalizada
    const letterContent = await openaiService.generateConscienceLetter({
      name,
      challenge,
      profileUrl,
      profileData,
      imageAnalysis,
      inputType
    });
    
    // Divide a carta em partes para evitar limite de caracteres do WhatsApp
    const letterParts = splitMessage(letterContent, 4000);
    
    // Envia cada parte da carta
    for (const part of letterParts) {
      await whatsappService.sendTextMessage(phoneNumber, part);
    }
    
    // Atualiza o estado da sessão
    session.state = CONVERSATION_STATES.LETTER_DELIVERED;
    session.data.letterContent = letterContent;
    session.data.endTimestamp = Date.now();
    session.data.processingTime = session.data.endTimestamp - session.data.startTimestamp;
    session.data.status = 'completed';
    await sessionService.saveSession(phoneNumber, session);
    
    // Salva a interação para o painel administrativo
    await interactionService.saveInteraction({
      phoneNumber,
      name: session.data.name,
      email: session.data.email,
      profileUrl: session.data.profileUrl,
      challenge: session.data.challenge,
      inputType: session.data.inputType,
      letterContent: letterContent,
      startTimestamp: session.data.startTimestamp,
      endTimestamp: session.data.endTimestamp,
      processingTime: session.data.processingTime,
      status: 'completed'
    });
    
    // Envia mensagem de conclusão
    await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.LETTER_DELIVERED);
  } catch (error) {
    log('Erro ao gerar e enviar carta:', error);
    
    // Atualiza o estado da sessão para indicar erro
    session.state = CONVERSATION_STATES.INITIAL;
    session.data.status = 'error';
    session.data.error = error.message;
    await sessionService.saveSession(phoneNumber, session);
    
    // Salva a interação com status de erro
    await interactionService.saveInteraction({
      phoneNumber,
      name: session.data.name,
      email: session.data.email,
      profileUrl: session.data.profileUrl,
      challenge: session.data.challenge,
      inputType: session.data.inputType,
      status: 'error',
      error: error.message
    });
    
    // Envia mensagem de erro
    await whatsappService.sendTextMessage(phoneNumber, SYSTEM_MESSAGES.ERROR_MESSAGE);
  }
}

/**
 * Divide uma mensagem longa em partes menores
 * @param {string} message - Mensagem a ser dividida
 * @param {number} maxLength - Tamanho máximo de cada parte
 * @returns {Array<string>} - Array de partes da mensagem
 */
function splitMessage(message, maxLength = 4000) {
  if (!message || message.length <= maxLength) {
    return [message];
  }
  
  const parts = [];
  let currentIndex = 0;
  
  while (currentIndex < message.length) {
    // Encontra um ponto final pr
(Content truncated due to size limit. Use line ranges to read in chunks)
