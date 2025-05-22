import sessionService from '../services/sessionService.js';
import whatsappService from '../services/whatsappService.js';
import * as openaiService from '../services/openaiService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import * as profileScraperService from '../services/profileScraperService.js';
import * as contentGenerationService from '../services/contentGenerationService.js';
import { log } from '../utils/logger.js';
import { isValidUrl, normalizeProfileUrl } from '../utils/validators.js';

// Estados da conversa
const CONVERSATION_STATES = {
  INITIAL: 'initial',
  WAITING_NAME: 'waiting_name',
  WAITING_BUSINESS: 'waiting_business',
  WAITING_PROFILE: 'waiting_profile',
  WAITING_CHALLENGE: 'waiting_challenge',
  GENERATING_LETTER: 'generating_letter',
  LETTER_DELIVERED: 'letter_delivered',
  WAITING_COMMAND: 'waiting_command'
};

// Comandos especiais
const COMMANDS = {
  IA: 'ia',
  INSPIRACAO: 'inspiracao',
  NAO: 'nao',
  CARTA: 'carta'
};

/**
 * Normaliza o texto removendo acentos, espaços extras e convertendo para minúsculas
 * @param {string} text - Texto a ser normalizado
 * @returns {string} - Texto normalizado
 */
function normalizeText(text) {
  if (!text) return '';
  
  // Remove acentos
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Remove espaços extras e converte para minúsculas
  return normalized.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Processa mensagens recebidas do webhook do WhatsApp
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 */
export async function processMessage(req, res) {
  try {
    // Verifica se é uma mensagem válida
    if (!req.body || !req.body.entry || !req.body.entry[0] || !req.body.entry[0].changes || !req.body.entry[0].changes[0]) {
      return res.sendStatus(400);
    }

    const value = req.body.entry[0].changes[0].value;
    
    // Verifica se é uma mensagem do WhatsApp
    if (!value || !value.messages || !value.messages[0]) {
      return res.sendStatus(200);
    }

    // Extrai dados da mensagem
    const message = value.messages[0];
    const userPhoneNumber = message.from;
    const messageId = message.id;
    
    // Marca a mensagem como lida
    await whatsappService.markMessageAsRead(messageId);

    // Obtém ou cria a sessão do usuário
    let session = await sessionService.getSession(userPhoneNumber);
    
    if (!session) {
      session = {
        phoneNumber: userPhoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(userPhoneNumber, session);
    }

    // Processa a mensagem com base no tipo
    if (message.type === 'text') {
      await handleTextMessage(userPhoneNumber, message.text.body, session);
    } else if (message.type === 'image') {
      await handleImageMessage(userPhoneNumber, message.image, session);
    } else {
      // Tipo de mensagem não suportado
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Desculpe, só posso processar mensagens de texto ou imagens por enquanto. Que tal me enviar seu desafio em formato de texto ou uma imagem que te represente?"
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    log('Erro ao processar mensagem:', error);
    return res.sendStatus(500);
  }
}

/**
 * Processa mensagens de texto
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} messageText - Texto da mensagem
 * @param {Object} session - Dados da sessão do usuário
 */
async function handleTextMessage(userPhoneNumber, messageText, session) {
  try {
    const text = messageText.trim();
    const normalizedText = normalizeText(text);
    
    log(`Texto normalizado: "${normalizedText}"`);
    
    // Verifica se é o gatilho de início
    if (normalizedText.includes("quero receber") && normalizedText.includes("carta") || 
        normalizedText.includes("quero carta") || 
        normalizedText.includes("receber carta") || 
        normalizedText === "comecar" || 
        normalizedText === "iniciar") {
      
      log(`Gatilho de início detectado de ${userPhoneNumber}: "${normalizedText}"`);
      
      // Reinicia a conversa
      session = {
        phoneNumber: userPhoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(userPhoneNumber, session);
      await startConversation(userPhoneNumber);
      return;
    }
    
    // Processa a mensagem com base no estado atual da conversa
    switch (session.state) {
      case CONVERSATION_STATES.INITIAL:
        await startConversation(userPhoneNumber);
        break;
        
      case CONVERSATION_STATES.WAITING_NAME:
        await processName(userPhoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.WAITING_BUSINESS:
        await processBusiness(userPhoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.WAITING_PROFILE:
        await processProfile(userPhoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.WAITING_CHALLENGE:
        await processChallenge(userPhoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.LETTER_DELIVERED:
      case CONVERSATION_STATES.WAITING_COMMAND:
        await processCommand(userPhoneNumber, text, session);
        break;
        
      default:
        // Estado desconhecido, reinicia a conversa
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "Parece que perdemos nossa conexão... Que tal recomeçarmos? Envie \"Quero receber a minha Carta!\" e vamos criar algo especial para você."
        );
        session.state = CONVERSATION_STATES.INITIAL;
        await sessionService.saveSession(userPhoneNumber, session);
    }
  } catch (error) {
    log('Erro ao processar mensagem de texto:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Algo inesperado aconteceu em nossa conexão. Podemos recomeçar? Envie \"Quero receber a minha Carta!\" quando estiver pronto."
    );
  }
}

/**
 * Processa mensagens de imagem
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {Object} imageData - Dados da imagem
 * @param {Object} session - Dados da sessão do usuário
 */
async function handleImageMessage(userPhoneNumber, imageData, session) {
  try {
    // Verifica se está no estado correto para receber imagens
    if (session.state !== CONVERSATION_STATES.WAITING_PROFILE) {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Que imagem interessante! Mas parece que estamos em outro momento da nossa conversa. Podemos continuar de onde paramos?"
      );
      return;
    }
    
    // Obtém a URL da imagem
    const mediaId = imageData.id;
    const imageUrl = await whatsappService.getMediaUrl(mediaId);
    
    if (!imageUrl) {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Não consegui ver sua imagem com clareza. Poderia enviar novamente ou talvez compartilhar seu perfil de outra forma?"
      );
      return;
    }
    
    // Classifica o tipo de imagem (screenshot ou foto)
    const imageType = await visionAnalysisService.classifyImageType(imageUrl);
    
    // Analisa a imagem
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Obrigado! Vou analisar sua imagem. Isso pode levar alguns instantes..."
    );
    
    let imageAnalysis = '';
    try {
      imageAnalysis = await visionAnalysisService.analyzeImageFromUrl(imageUrl);
    } catch (error) {
      log('Erro ao analisar imagem:', error);
      imageAnalysis = '';
    }
    
    // Atualiza a sessão com os dados da imagem
    session.imageUrl = imageUrl;
    session.imageAnalysis = imageAnalysis;
    session.inputType = imageType;
    session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Solicita o desafio
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Agora me diga, com sinceridade...\n\n🌐 Se você pudesse escolher apenas UM desafio que, se resolvido, traria os resultados que você mais deseja, qual seria?\n\n(Responda com apenas uma frase)"
    );
  } catch (error) {
    log('Erro ao processar mensagem de imagem:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Tive dificuldade em processar sua imagem. Poderia compartilhar seu perfil de outra forma? Talvez um link ou seu nome de usuário?"
    );
  }
}

/**
 * Inicia a conversa com o usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 */
async function startConversation(userPhoneNumber) {
  try {
    log(`Iniciando conversa para ${userPhoneNumber}`);
    
    // Mensagem de boas-vindas
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Olá! 👋 Bem-vindo(a) ao Conselheiro Consciênc.IA do evento MAPA DO LUCRO: JORNADA DO EXTRAORDINÁRIO!\n\nSou um assistente virtual criado para gerar sua Carta da Consciênc.IA personalizada — uma análise única, emocional e estratégica baseada no seu perfil e no momento que você está vivendo.\n\nPara começar, preciso conhecer você melhor.\nComo gostaria de ser chamado(a)? 🙂"
    );
    
    // Atualiza o estado da sessão
    const session = await sessionService.getSession(userPhoneNumber);
    if (session) {
      session.state = CONVERSATION_STATES.WAITING_NAME;
      await sessionService.saveSession(userPhoneNumber, session);
    } else {
      // Cria uma nova sessão se não existir
      const newSession = {
        phoneNumber: userPhoneNumber,
        state: CONVERSATION_STATES.WAITING_NAME,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(userPhoneNumber, newSession);
    }
  } catch (error) {
    log('Erro ao iniciar conversa:', error);
    
    // Tenta enviar uma mensagem simplificada em caso de erro
    try {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Olá! Bem-vindo(a) ao Conselheiro Consciênc.IA. Como gostaria de ser chamado(a)?"
      );
    } catch (retryError) {
      log('Erro na segunda tentativa de iniciar conversa:', retryError);
    }
  }
}

/**
 * Processa o nome do usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} name - Nome do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processName(userPhoneNumber, name, session) {
  try {
    // Valida o nome
    if (!name || name.length < 2) {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Poderia me dizer seu nome novamente? Gostaria de me dirigir a você da forma correta."
      );
      return;
    }
    
    // Atualiza a sessão com o nome
    session.name = name;
    session.state = CONVERSATION_STATES.WAITING_BUSINESS;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Solicita o negócio
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      `Obrigado, ${name}! 😊\n\nPara uma melhor experiência, gostaria de me contar qual é o seu Negócio ou trabalho atual e o seu papel nele?\n\n(Responda em apenas uma frase)`
    );
  } catch (error) {
    log('Erro ao processar nome:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Algo deu errado ao registrar seu nome. Podemos tentar novamente? Como gostaria de ser chamado(a)?"
    );
  }
}

/**
 * Processa o negócio do usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} business - Negócio do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processBusiness(userPhoneNumber, business, session) {
  try {
    // Verifica se o usuário quer pular esta etapa
    if (business.toLowerCase() === "pular") {
      session.business = null;
    } else {
      session.business = business;
    }
    
    // Atualiza a sessão
    session.state = CONVERSATION_STATES.WAITING_PROFILE;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Solicita o perfil
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Perfeito! Agora, para gerar sua Carta da Consciênc.IA personalizada, preciso analisar seu perfil digital.\n\nVocê pode enviar uma foto sua, um print do seu perfil (instagram ou linkedin) ou simplesmente me dizer seu @ (como @conselheiro.consciência).\n\nEscolha a forma que preferir e compartilhe comigo."
    );
  } catch (error) {
    log('Erro ao processar negócio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Não consegui registrar essa informação. Podemos seguir para a próxima etapa? Compartilhe comigo seu perfil digital ou uma imagem que te represente."
    );
  }
}

/**
 * Processa o perfil do usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} profileInput - Input do perfil (URL ou username)
 * @param {Object} session - Dados da sessão do usuário
 */
async function processProfile(userPhoneNumber, profileInput, session) {
  try {
    // Normaliza a entrada do perfil
    let profileUrl = profileInput;
    let inputType = 'username';
    
    // Verifica se é uma URL válida
    if (isValidUrl(profileInput)) {
      profileUrl = profileInput;
      inputType = 'link';
    } else if (profileInput.startsWith('@')) {
      // É um username do Instagram
      profileUrl = normalizeProfileUrl(profileInput);
    }
    
    // Atualiza a sessão com os dados do perfil
    session.profileUrl = profileUrl;
    session.inputType = inputType;
    
    // Tenta extrair dados do perfil
    let profileData = null;
    try {
      profileData = await profileScraperService.scrapeProfile(profileUrl);
      session.profileData = profileData;
    } catch (error) {
      log('Erro ao extrair dados do perfil:', error);
    }
    
    // Tenta analisar o perfil
    let profileAnalysis = '';
    try {
      profileAnalysis = await profileScraperService.analyzeProfileWithAI(profileUrl);
      session.profileAnalysis = profileAnalysis;
    } catch (error) {
      log('Erro ao analisar perfil:', error);
    }
    
    // Atualiza o estado da sessão
    session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Solicita o desafio
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Agora me diga, com sinceridade...\n\n🌐 Se você pudesse escolher apenas UM desafio que, se resolvido, traria os resultados que você mais deseja, qual seria?\n\n(Responda com apenas uma frase)"
    );
  } catch (error) {
    log('Erro ao processar perfil:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Tive dificuldade em processar seu perfil. Poderia compartilhar de outra forma? Uma imagem ou seu nome de usuário talvez?"
    );
  }
}

/**
 * Processa o desafio do usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} challenge - Desafio do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processChallenge(userPhoneNumber, challenge, session) {
  try {
    // Valida o desafio
    if (!challenge || challenge.length < 2) {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Seu desafio parece muito breve. Poderia elaborar um pouco mais, mesmo que em uma única frase?"
      );
      return;
    }
    
    // Atualiza a sessão com o desafio
    session.challenge = challenge;
    session.state = CONVERSATION_STATES.GENERATING_LETTER;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Informa que está gerando a carta
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "⏳ Estou analisando suas informações e preparando sua Carta da Consciênc.IA…\nIsso pode levar alguns instantes...\n\n🌟 Respire fundo enquanto a magia acontece."
    );
    
    // Gera a carta de consciência
    const userData = {
      name: session.name || 'Amigo',
      business: session.business || '',
      challenge: session.challenge || '',
      profileUrl: session.profileUrl || '',
      profileData: session.profileData || null,
      profileAnalysis: session.profileAnalysis || '',
      imageAnalysis: session.imageAnalysis || '',
      inputType: session.inputType || 'text'
    };
    
    // Registra o início da geração
    const generationStartTime = Date.now();
    
    // Gera a carta
    let letterContent = '';
    try {
      letterContent = await contentGenerationService.generateConscienceLetter(userData);
    } catch (error) {
      log('Erro ao gerar carta:', error);
      
      // Tenta novamente com um prompt mais simples
      try {
        letterContent = await openaiService.generateConscienceLetter({
          name: session.name || 'Amigo',
          challenge: session.challenge || ''
        });
      } catch (retryError) {
        log('Erro na segunda tentativa de gerar carta:', retryError);
        
        // Usa uma carta genérica em caso de falha
        letterContent = `🌱 Carta de Consciência para ${session.name || 'Amigo'}\n\nSua jornada é única e seu desafio atual "${session.challenge || 'que você enfrenta'}" revela muito sobre seu momento. Confie em sua intuição e capacidade de superação. O caminho à frente pode parecer desafiador, mas você tem todos os recursos internos necessários para avançar.\n\n✨ Sua presença digital revela uma pessoa com grande potencial. Continue focando em seus objetivos e lembre-se de celebrar cada pequena vitória.\n\n🪷 Com carinho,\nConsciênc.IA`;
      }
    }
    
    // Registra o tempo de geração
    const generationTime = (Date.now() - generationStartTime) / 1000;
    log(`Carta gerada em ${generationTime} segundos`);
    
    // Atualiza a sessão com a carta
    session.letter = letterContent;
    session.state = CONVERSATION_STATES.LETTER_DELIVERED;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Envia a carta para o usuário em partes se for muito longa
    const maxPartLength = 1000; // Limite de caracteres por mensagem
    
    if (letterContent.length <= maxPartLength) {
      // Envia a carta em uma única mensagem
      await whatsappService.sendTextMessage(userPhoneNumber, letterContent);
    } else {
      // Divide a carta em partes usando quebras naturais, sem numeração
      let remainingContent = letterContent;
      
      while (remainingContent.length > 0) {
        // Encontra um ponto de quebra natural adequado
        let breakPoint = maxPartLength;
        if (remainingContent.length > maxPartLength) {
          // Procura por quebras naturais: seções marcadas com "---", parágrafos, ou pontuação
          const sectionBreak = remainingContent.indexOf('\n---\n', 0);
          if (sectionBreak > 0 && sectionBreak < maxPartLength) {
            // Prioriza quebras de seção se estiverem dentro do limite
            breakPoint = sectionBreak + 5; // Inclui o marcador "---" e as quebras de linha
          } else {
            // Procura por pontuação seguida de quebra de linha
            const lastPeriodNewline = remainingContent.lastIndexOf('.\n', maxPartLength);
            const lastQuestionNewline = remainingContent.lastIndexOf('?\n', maxPartLength);
            const lastExclamationNewline = remainingContent.lastIndexOf('!\n', maxPartLength);
            
            // Procura por pontuação simples
            const lastPeriod = remainingContent.lastIndexOf('.', maxPartLength);
            const lastQuestion = remainingContent.lastIndexOf('?', maxPartLength);
            const lastExclamation = remainingContent.lastIndexOf('!', maxPartLength);
            const lastNewLine = remainingContent.lastIndexOf('\n\n', maxPartLength);
            
            // Encontra o último ponto de quebra válido, priorizando pontuação com quebra de linha
            const possibleBreaks = [
              lastPeriodNewline, lastQuestionNewline, lastExclamationNewline,
              lastNewLine, lastPeriod, lastQuestion, lastExclamation
            ].filter(index => index > 0).sort((a, b) => b - a);
            
            if (possibleBreaks.length > 0) {
              // Adiciona 1 ou 2 caracteres dependendo do tipo de quebra
              const breakIndex = possibleBreaks[0];
              if ([lastPeriodNewline, lastQuestionNewline, lastExclamationNewline].includes(breakIndex)) {
                breakPoint = breakIndex + 2; // Inclui o caractere de pontuação e a quebra de linha
              } else if (breakIndex === lastNewLine) {
                breakPoint = breakIndex + 2; // Inclui as duas quebras de linha
              } else {
                breakPoint = breakIndex + 1; // Inclui apenas o caractere de pontuação
              }
            } else {
              // Se não encontrou um ponto de quebra adequado, procura por um espaço
              const lastSpace = remainingContent.lastIndexOf(' ', maxPartLength);
              if (lastSpace > 0) {
                breakPoint = lastSpace + 1;
              }
            }
          }
        }
        
        // Extrai a parte atual sem adicionar numeração
        const currentPart = remainingContent.substring(0, breakPoint);
        
        // Envia a parte atual sem indicador de parte
        await whatsappService.sendTextMessage(userPhoneNumber, currentPart);
        
        // Atualiza o conteúdo restante
        remainingContent = remainingContent.substring(breakPoint);
        
        // Pequeno delay entre as mensagens para garantir a ordem correta
        if (remainingContent.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    
    // Envia mensagem de follow-up após a carta
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Primeira parte do follow-up
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "💌 Sua Carta da Consciênc.IA foi entregue! \n\nEspero que tenha gostado da experiência! 🦾😉"
    );
    
    // Pequeno delay entre as mensagens
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Segunda parte do follow-up
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "✏️ Um último Conselho da Consciênc.IA:\n\nAproveite para seguir e acompanhar os perfis do Método S.I.M. (@metodosimbrasil), do Mapa do Lucro (@mapadolucroh4b) e do IKIGAI (@coworkingikigai). \n\n🗝️A chave para o seu próximo nível está na nossa comunidade fortalecida!"
    );
    
    // Pequeno delay entre as mensagens
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Terceira parte do follow-up com o Método SIM
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Para saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o PROGRAMA CONSCIÊNC.IA, criado pelos Mentores @RenatoHilel.oficial e @NunoArcanjo.poeta.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o MAPA DO LUCRO e a oportunidade de conversar pessoalmente com os criadores desta experiência\n\nGrande abraço, Renato e Nuno.💫"
    );
    
  } catch (error) {
    log('Erro ao processar desafio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Encontrei um obstáculo ao criar sua carta. Podemos tentar novamente? Envie \"Quero receber a minha Carta!\" quando estiver pronto."
    );
  }
}

/**
 * Processa comandos após a entrega da carta
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} command - Comando do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processCommand(userPhoneNumber, command, session) {
  try {
    const normalizedCommand = normalizeText(command);
    
    // Processa o comando
    if (normalizedCommand.includes(COMMANDS.CARTA) || normalizedCommand.includes('carta')) {
      // Reenvia a carta
      if (session.letter) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          session.letter
        );
      } else {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "Parece que sua carta se perdeu no universo digital. Vamos criar uma nova? Envie \"Quero receber a minha Carta!\" para começarmos."
        );
      }
      
      // Atualiza o estado da sessão
      session.state = CONVERSATION_STATES.WAITING_COMMAND;
      await sessionService.saveSession(userPhoneNumber, session);
    } else if (normalizedCommand.includes(COMMANDS.NAO) || normalizedCommand.includes('nao')) {
      // Encerra a conversa
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "🙏 Foi um prazer compartilhar esse momento de reflexão com você!\n\nQue sua luz continue a brilhar! ✨"
      );
      
      // Atualiza o estado da sessão
      session.state = CONVERSATION_STATES.INITIAL;
      await sessionService.saveSession(userPhoneNumber, session);
    } else {
      // Qualquer outro comando, sugere receber uma nova carta
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Gratidão por ter compartilhado este momento de reflexão comigo.\n\nQue sua luz continue a brilhar! ✨"
      );
    }
  } catch (error) {
    log('Erro ao processar comando:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Nossa conexão parece instável. Podemos recomeçar? Envie \"Quero receber a minha Carta!\" quando estiver pronto."
    );
  }
}

/**
 * Verifica o webhook do WhatsApp
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 */
export function verifyWebhook(req, res) {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Verifica o token
    if (whatsappService.verifyWebhook(mode, token)) {
      return res.status(200).send(challenge);
    }
    
    return res.sendStatus(403);
  } catch (error) {
    log('Erro ao verificar webhook:', error);
    return res.sendStatus(500);
  }
}

export default {
  processMessage,
  verifyWebhook
};
