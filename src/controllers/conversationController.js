import sessionService from '../services/sessionService.js';
import whatsappService from '../services/whatsappService.js';
import * as openaiService from '../services/openaiService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import * as profileScraperService from '../services/profileScraperService.js';
import * as contentGenerationService from '../services/contentGenerationService.js';
import dashboardIntegrationService from '../services/dashboardIntegrationService.js';
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
        "Desculpe, só posso processar mensagens de texto ou imagens. Por favor, envie seu desafio em formato de texto ou uma imagem do seu perfil."
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
          "Algo deu errado, vamos começar novamente? Envie \"Quero receber a minha Carta!\" para reiniciar o processo."
        );
        session.state = CONVERSATION_STATES.INITIAL;
        await sessionService.saveSession(userPhoneNumber, session);
    }
  } catch (error) {
    log('Erro ao processar mensagem de texto:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde ou envie \"Quero receber a minha Carta!\" para reiniciar o processo."
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
        "Desculpe, não estou esperando uma imagem neste momento. Por favor, siga as instruções anteriores ou envie \"Quero receber a minha Carta!\" para reiniciar."
      );
      return;
    }
    
    // Obtém a URL da imagem
    const mediaId = imageData.id;
    const imageUrl = await whatsappService.getMediaUrl(mediaId);
    
    if (!imageUrl) {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Desculpe, não consegui processar sua imagem. Por favor, tente enviar novamente ou envie um link do seu perfil."
      );
      return;
    }
    
    // Classifica o tipo de imagem (screenshot ou foto)
    const imageType = await visionAnalysisService.classifyImageType(imageUrl);
    
    // Analisa a imagem
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Obrigado!"
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
      "Só mais uma coisa: me responda com sinceridade...\n\n🌐 *Se você pudesse escolher apenas UM desafio que, se resolvido, traria os resultados que você mais deseja, qual seria?*\n\n(Responda com apenas uma frase)"
    );
  } catch (error) {
    log('Erro ao processar mensagem de imagem:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar sua imagem. Por favor, tente enviar um link do seu perfil em vez disso ou envie \"Quero receber a minha Carta!\" para reiniciar."
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
      "Olá! 👋 Bem-vindo(a) à *CONSCIÊNC.IA* do evento *Mapa do Lucro: Jornada do Extraordinário*!\n\nSou uma IA criada para gerar sua *Carta personalizada* — uma análise única, emocional e estratégica baseada no seu perfil e no momento que você está vivendo.\n\nPara começar, preciso conhecer você melhor.🙂\n\nComo gostaria de ser chamado(a)?"
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
        "Por favor, informe um nome válido."
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
      `Obrigado, ${name}! 😊\n\nPara uma melhor experiência, gostaria de me contar *qual é o seu Negócio ou trabalho atual e o seu papel nele?*\n\n(Responda em apenas uma frase)`
    );
  } catch (error) {
    log('Erro ao processar nome:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu nome. Por favor, tente novamente ou envie \"Quero receber a minha Carta!\" para reiniciar."
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
      "Perfeito! Agora, para gerar sua *Carta personalizada*, preciso analisar seu perfil digital. Consigo fazer isso com:\n\n1️⃣Uma foto sua *OU* \n2️⃣Um print do seu perfil (Instagram ou LinkedIn) *OU* \n3️⃣Apenas me diga seu @ (ex: @renatohilel.oficial).\n\n📝 Escolha *apenas UMA opção* e me envie agora para começar!"
    );
  } catch (error) {
    log('Erro ao processar negócio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar sua informação. Por favor, tente novamente ou envie \"Quero receber a minha Carta!\" para reiniciar."
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
      "Agora me diga, com sinceridade...\n\n🌐 Se você pudesse escolher apenas *UM DESAFIO ATUAL* que, se resolvido, traria os resultados que você mais deseja, qual seria?\n\n(Responda com apenas uma frase)"
    );
  } catch (error) {
    log('Erro ao processar perfil:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu perfil. Por favor, tente novamente ou envie \"Quero receber a minha Carta!\" para reiniciar."
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
        "Por favor, informe um desafio válido em uma frase."
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
      "⏳ Estou analisando suas informações e preparando sua *Carta da Consciênc.IA*…\nIsso pode levar alguns instantes...\n\n🌟 *Respire fundo enquanto a magia acontece*🪄"
    );
    
    // Gera a carta
    let letterContent = '';
    try {
      // Calcula o tempo de início para métricas
      const startTime = Date.now();
      
      // Gera a carta com base nos dados do usuário
      letterContent = await contentGenerationService.generateConscienceLetter({
        name: session.name,
        business: session.business,
        profileUrl: session.profileUrl,
        profileData: session.profileData,
        profileAnalysis: session.profileAnalysis,
        imageAnalysis: session.imageAnalysis,
        challenge: session.challenge,
        inputType: session.inputType
      });
      
      // Calcula o tempo de processamento
      const processingTime = (Date.now() - startTime) / 1000; // em segundos
      session.processingTime = processingTime;
      
      // Atualiza a sessão com a carta gerada
      session.letterContent = letterContent;
      session.state = CONVERSATION_STATES.LETTER_DELIVERED;
      session.endTimestamp = Date.now();
      session.status = 'completed';
      await sessionService.saveSession(userPhoneNumber, session);
      
      // Salva a interação para o painel administrativo
      await dashboardIntegrationService.saveInteractionFromSession(session);
      
      // Envia a carta para o usuário
      await sendLetter(userPhoneNumber, letterContent);
      
      // Envia mensagem de conclusão
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "💌 *Sua Carta foi entregue!* ✨\n\nEspero que tenha apreciado a experiência! 🌟\n\nPara saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o *PROGRAMA CONSCIÊNC.IA*, criado pelos Mentores @RenatoHilel.oficial e @NunoArcanjo.poeta.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores desta experiência!\n\nUm gande abraço, Renato e Nuno. 💫"
      );
    } catch (error) {
      log('Erro ao gerar carta:', error);
      
      // Atualiza o status da sessão
      session.status = 'error';
      session.endTimestamp = Date.now();
      await sessionService.saveSession(userPhoneNumber, session);
      
      // Salva a interação com erro para o painel administrativo
      await dashboardIntegrationService.saveInteractionFromSession(session);
      
      // Envia mensagem de erro para o usuário
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Encontrei um obstáculo ao criar sua carta. Por favor, tente novamente mais tarde ou envie \"Quero receber a minha Carta!\" para reiniciar o processo."
      );
    }
  } catch (error) {
    log('Erro ao processar desafio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Encontrei um obstáculo ao processar seu desafio. Por favor, tente novamente ou envie \"Quero receber a minha Carta!\" para reiniciar."
    );
  }
}

/**
 * Envia a carta para o usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} letterContent - Conteúdo da carta
 */
async function sendLetter(userPhoneNumber, letterContent) {
  try {
    // Divide a carta em partes menores para evitar problemas de envio
    const parts = letterContent.split('---');
    
    // Envia cada parte da carta
    for (const part of parts) {
      if (part.trim()) {
        await whatsappService.sendTextMessage(userPhoneNumber, part.trim());
      }
    }
    
    // Envia a mensagem final 
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "✏️ Último *Conselho de ouro da Consciênc.IA*:\n\nAproveite para seguir e acompanhar os perfis do \n1️⃣Método S.I.M. (@metodosimbrasil),\n2️⃣Mapa do Lucro (@mapadolucroh4b) e \n3️⃣IKIGAI (@coworkingikigai). \n\n🗝️A chave para o seu próximo nível está na *nossa comunidade fortalecida*!🦾"
    );
  } catch (error) {
    log('Erro ao enviar carta:', error);
    
    // Tenta enviar uma mensagem simplificada em caso de erro
    try {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Desculpe, encontrei um problema ao enviar sua carta completa. Por favor, envie \"Quero receber a minha Carta!\" para tentar novamente."
      );
    } catch (retryError) {
      log('Erro na segunda tentativa de enviar carta:', retryError);
    }
  }
}

/**
 * Processa comandos após a entrega da carta
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} text - Texto do comando
 * @param {Object} session - Dados da sessão do usuário
 */
async function processCommand(userPhoneNumber, text, session) {
  try {
    const normalizedText = normalizeText(text);
    
    // Verifica se é um comando para mostrar o próximo passo
    if (normalizedText.includes("proximo passo") || 
        normalizedText.includes("proximo") || 
        normalizedText.includes("passo")) {
      
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "🌟 *Próximos Passos* 🌟\n\nAgora que você recebeu sua Carta da Consciênc.IA, recomendo:\n\n1. Salve sua carta para referência futura\n2. Converse com Renato Hilel e Nuno Arcanjo sobre como a IA pode transformar seu negócio\n\nPara mais informações, acesse: https://www.floreon.app.br/conscienc-ia"
      );
      return;
    }
    
    // Se não for um comando específico, envia uma mensagem padrão
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Obrigado por usar o Conselheiro Consciênc.IA!"
    );
  } catch (error) {
    log('Erro ao processar comando:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente ou envie \"Quero receber a minha Carta!\" para reiniciar."
    );
  }
}
