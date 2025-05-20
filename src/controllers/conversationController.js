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
      "Agora me diga, com sinceridade...\n\n🌐 *Se você pudesse escolher apenas UM desafio que, se resolvido, traria os resultados que você mais deseja, qual seria?*\n\n(Responda com apenas uma frase)"
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
      "Olá! 👋 Bem-vindo(a) ao *Conselheiro Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual criado para gerar sua *Carta da Consciênc.IA* personalizada — uma análise única, emocional e estratégica baseada no seu perfil e no momento que você está vivendo.\n\nPara começar, preciso conhecer você melhor.\nComo gostaria de ser chamado(a)? 🙂"
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
      `Obrigado, ${name}! 😊\n\nPara uma melhor experiência, gostaria de me contar qual é o Nicho do seu Negócio ou trabalho atual e o seu papel nele?\n\n*(Caso não queira informar agora, digite "pular" para continuar.)*`
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
      "Perfeito! Agora, para gerar sua Carta da Consciênc.IA personalizada, preciso analisar seu perfil digital.\n\nVocê escolhe como prefere se apresentar:\n\n1️⃣ Envie um **print do seu perfil social** (Instagram ou LinkedIn) para uma leitura mais profunda.\n2️⃣ Envie **sua foto de perfil** (uma imagem que te represente hoje).\n3️⃣ Ou apenas me diga seu @ (ex: @renatohilel.oficial) para uma leitura objetiva.\n\n📝 Envie agora da forma que preferir!"
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
      "Agora me diga, com sinceridade...\n\n🌐 *Se você pudesse escolher apenas UM desafio que, se resolvido, traria os resultados que você mais deseja, qual seria?*\n\n(Responda com apenas uma frase)"
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
        "Por favor, informe um desafio válido, mesmo que seja em apenas uma palavra."
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
        letterContent = `🌱 *Carta de Consciência para ${session.name || 'Amigo'}*\n\nSua jornada é única e seu desafio atual "${session.challenge || 'que você enfrenta'}" revela muito sobre seu momento. Confie em sua intuição e capacidade de superação. O caminho à frente pode parecer desafiador, mas você tem todos os recursos internos necessários para avançar.\n\n✨ Sua presença digital revela uma pessoa com grande potencial. Continue focando em seus objetivos e lembre-se de celebrar cada pequena vitória.\n\n🪷 Com carinho,\nConsciênc.IA`;
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
      "✨ *Sua Carta da Consciênc.IA foi entregue!* ✨\n\nEspero que tenha gostado da sua Carta! 🌟"
    );
    
    // Pequeno delay entre as mensagens
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Segunda parte do follow-up
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Para saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o Programa Consciênc.IA, de Renato Hilel e Nuno Arcanjo.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa! 💫"
    );
    
    // Pequeno delay entre as mensagens
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Terceira parte do follow-up com o Método SIM
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "🌸 Antes de irmos, uma última sugestão:\n\nExplore o *Método S.I.M.* (@metodosimbrasil) e o conceito de *Ikigai* (@coworkingikigai).\n\nO Método S.I.M. te ajuda a equilibrar *Saúde, Intuição e Mente*,\nenquanto o Ikigai revela seu propósito autêntico e magnético no mundo dos negócios.\n\n🌐 Se ainda não baixou o *App Oficial do MAPA DO LUCRO*, recomendo que peça agora mesmo o link para a equipe do evento."
    );
    
  } catch (error) {
    log('Erro ao processar desafio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao gerar sua carta. Por favor, tente novamente mais tarde ou envie \"Quero receber a minha Carta!\" para reiniciar o processo."
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
          "Desculpe, não consegui encontrar sua carta. Por favor, envie \"Quero receber a minha Carta!\" para gerar uma nova."
        );
      }
      
      // Atualiza o estado da sessão
      session.state = CONVERSATION_STATES.WAITING_COMMAND;
      await sessionService.saveSession(userPhoneNumber, session);
    } else if (normalizedCommand.includes(COMMANDS.NAO) || normalizedCommand.includes('nao')) {
      // Encerra a conversa
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "🙏 Obrigado por usar o Conselheiro Consciênc.IA!\n\nFoi um prazer ajudar você nessa jornada de autoconhecimento e crescimento.\n\nSe quiser receber uma nova carta no futuro, basta enviar \"Quero receber a minha Carta!\".\n\nDesejo muito sucesso em sua jornada! ✨"
      );
      
      // Atualiza o estado da sessão
      session.state = CONVERSATION_STATES.INITIAL;
      await sessionService.saveSession(userPhoneNumber, session);
    } else {
      // Qualquer outro comando, sugere receber uma nova carta
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Se quiser receber uma nova carta, basta enviar \"Quero receber a minha Carta!\".\n\nDesejo muito sucesso em sua jornada! ✨"
      );
    }
  } catch (error) {
    log('Erro ao processar comando:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente ou envie \"Quero receber a minha Carta!\" para reiniciar o processo."
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
