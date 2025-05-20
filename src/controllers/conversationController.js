import sessionService from '../services/sessionService.js';
import whatsappService from '../services/whatsappService.js';
import * as openaiService from '../services/openaiService.js';
import * as profileScraperService from '../services/profileScraperService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import * as contentGenerationService from '../services/contentGenerationService.js';
import { log } from '../utils/logger.js';

// Estados da conversa
const CONVERSATION_STATES = {
  INITIAL: 'initial',
  WAITING_NAME: 'waiting_name',
  WAITING_BUSINESS: 'waiting_business',
  WAITING_PROFILE: 'waiting_profile',
  WAITING_CHALLENGE: 'waiting_challenge',
  GENERATING_LETTER: 'generating_letter',
  LETTER_DELIVERED: 'letter_delivered'
};

/**
 * Função para normalizar texto para comparações
 * Remove acentos, espaços extras e converte para minúsculas
 */
function normalizeText(text) {
  if (!text) return '';
  
  // Remove acentos
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Remove espaços extras, converte para minúsculas
  return normalized.toLowerCase().trim();
}

/**
 * Processa mensagens recebidas do webhook do WhatsApp
 * @param {Object} req - Objeto de requisição Express
 * @param {Object} res - Objeto de resposta Express
 */
export async function processMessage(req, res) {
  try {
    // Responde imediatamente para evitar timeout do WhatsApp
    res.status(200).send('EVENT_RECEIVED');
    
    const body = req.body;
    
    // Verifica se é uma mensagem válida
    if (!body.object || !body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value.messages) {
      log('Mensagem inválida recebida:', JSON.stringify(body));
      return;
    }

    const message = body.entry[0].changes[0].value.messages[0];
    const phoneNumber = message.from;
    
    // Registra a mensagem recebida para depuração
    log(`Mensagem recebida de ${phoneNumber}: ${JSON.stringify(message)}`);

    // Obtém ou cria a sessão do usuário
    let session = await sessionService.getSession(phoneNumber);
    
    // Garante que a sessão existe e tem um estado válido
    if (!session) {
      log(`Criando nova sessão para ${phoneNumber}`);
      session = {
        phoneNumber: phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(phoneNumber, session);
    }
    
    // Se a sessão não tiver um estado definido, inicializa com INITIAL
    if (!session.state) {
      log(`Inicializando estado da sessão para ${phoneNumber}`);
      session.state = CONVERSATION_STATES.INITIAL;
      await sessionService.saveSession(phoneNumber, session);
    }

    log(`Estado atual da sessão: ${session.state}`);

    // Processa a mensagem com base no tipo
    if (message.type === 'text') {
      await handleTextMessage(phoneNumber, message.text.body, session);
    } else if (message.type === 'image') {
      await handleImageMessage(phoneNumber, message.image, session);
    } else {
      // Tipo de mensagem não suportado
      log(`Enviando mensagem de tipo não suportado para ${phoneNumber}`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, só posso processar mensagens de texto ou imagens no momento."
      );
    }
  } catch (error) {
    log('Erro ao processar mensagem:', error);
  }
}

// Processa mensagens de texto
async function handleTextMessage(phoneNumber, text, session) {
  try {
    log(`Processando mensagem de texto de ${phoneNumber}: "${text}"`);
    
    // Garante que a sessão existe e tem um estado válido
    if (!session) {
      log(`Criando nova sessão em handleTextMessage para ${phoneNumber}`);
      session = {
        phoneNumber: phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(phoneNumber, session);
    }
    
    // Se a sessão não tiver um estado definido, inicializa com INITIAL
    if (!session.state) {
      log(`Inicializando estado da sessão em handleTextMessage para ${phoneNumber}`);
      session.state = CONVERSATION_STATES.INITIAL;
      await sessionService.saveSession(phoneNumber, session);
    }
    
    log(`Estado da sessão em handleTextMessage: ${session.state}`);
    
    // Normaliza o texto para comparações mais robustas
    const normalizedText = normalizeText(text);
    log(`Texto normalizado: "${normalizedText}"`);
    
    // Comandos especiais
    if (normalizedText === 'ia') {
      log(`Comando IA detectado de ${phoneNumber}`);
      await handleIACommand(phoneNumber, session);
      return;
    } else if (normalizedText === 'inspiracao' || normalizedText === 'inspiração') {
      log(`Comando Inspiração detectado de ${phoneNumber}`);
      await handleInspirationCommand(phoneNumber, session);
      return;
    } else if (normalizedText === 'nao' || normalizedText === 'não') {
      log(`Comando Não detectado de ${phoneNumber}`);
      await handleNoCommand(phoneNumber, session);
      return;
    } else if (normalizedText.includes('consciencia') || normalizedText.includes('nuno') || 
               normalizedText.includes('renato') || normalizedText.includes('hilel') || 
               normalizedText.includes('arcanjo') || normalizedText.includes('programa')) {
      log(`Comando de informação do programa detectado de ${phoneNumber}`);
      await handleProgramInfo(phoneNumber);
      return;
    }
    
    // Processa a mensagem com base no estado da sessão
    switch (session.state) {
      case CONVERSATION_STATES.INITIAL:
        // Verifica se é o gatilho para iniciar a conversa de forma mais robusta
        if (normalizedText.includes('carta') || 
            normalizedText.includes('receber') || 
            normalizedText.includes('quero') ||
            normalizedText.includes('comecar') ||
            normalizedText.includes('iniciar') ||
            normalizedText.match(/quero.*carta/) ||
            normalizedText.match(/receber.*carta/)) {
          log(`Gatilho de início detectado de ${phoneNumber}: "${normalizedText}"`);
          await startConversation(phoneNumber, session);
        } else {
          log(`Enviando mensagem de boas-vindas para ${phoneNumber}`);
          await sendWelcomeMessage(phoneNumber, session);
        }
        break;
        
      case CONVERSATION_STATES.WAITING_NAME:
        log(`Processando nome de ${phoneNumber}: "${text}"`);
        await handleNameInput(phoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.WAITING_BUSINESS:
        if (normalizedText === 'pular') {
          log(`Comando pular detectado de ${phoneNumber}`);
          await askForProfileChoice(phoneNumber, session);
        } else {
          log(`Processando informação de negócio de ${phoneNumber}: "${text}"`);
          session.businessInfo = text;
          await sessionService.saveSession(phoneNumber, session);
          await askForProfileChoice(phoneNumber, session);
        }
        break;
        
      case CONVERSATION_STATES.WAITING_PROFILE:
        log(`Processando escolha de perfil de ${phoneNumber}: "${text}"`);
        await handleProfileChoice(phoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.WAITING_CHALLENGE:
        log(`Processando desafio de ${phoneNumber}: "${text}"`);
        await handleChallengeInput(phoneNumber, text, session);
        break;
        
      case CONVERSATION_STATES.LETTER_DELIVERED:
        log(`Enviando mensagem de ajuda para ${phoneNumber} (carta já entregue)`);
        await sendHelpMessage(phoneNumber);
        break;
        
      default:
        // Estado desconhecido, reinicia a conversa
        log(`Estado desconhecido para ${phoneNumber}, reiniciando conversa`);
        session.state = CONVERSATION_STATES.INITIAL;
        await sessionService.saveSession(phoneNumber, session);
        await sendWelcomeMessage(phoneNumber, session);
        break;
    }
  } catch (error) {
    log('Erro ao processar mensagem de texto:', error);
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Processa mensagens de imagem
async function handleImageMessage(phoneNumber, image, session) {
  try {
    log(`Processando imagem de ${phoneNumber}`);
    
    // Garante que a sessão existe e tem um estado válido
    if (!session) {
      log(`Criando nova sessão em handleImageMessage para ${phoneNumber}`);
      session = {
        phoneNumber: phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(phoneNumber, session);
    }
    
    // Se a sessão não tiver um estado definido, inicializa com INITIAL
    if (!session.state) {
      log(`Inicializando estado da sessão em handleImageMessage para ${phoneNumber}`);
      session.state = CONVERSATION_STATES.INITIAL;
      await sessionService.saveSession(phoneNumber, session);
    }
    
    if (session.state === CONVERSATION_STATES.WAITING_PROFILE) {
      // Analisa a imagem do perfil
      const imageUrl = image.id;
      
      log(`Enviando mensagem de análise de imagem para ${phoneNumber}`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        "🔍 Estou analisando sua imagem... Isso pode levar alguns instantes."
      );
      
      // Obtém a URL da imagem
      log(`Obtendo URL da mídia ${imageUrl}`);
      const mediaUrl = await whatsappService.getMediaUrl(imageUrl);
      
      if (!mediaUrl) {
        log(`Não foi possível obter URL da mídia para ${phoneNumber}`);
        await whatsappService.sendTextMessage(
          phoneNumber,
          "Desculpe, não consegui acessar sua imagem. Por favor, tente enviar novamente ou digite 'pular' para continuar sem análise de imagem."
        );
        return;
      }
      
      // Analisa a imagem com o serviço de visão
      log(`Analisando imagem de ${phoneNumber}`);
      const imageAnalysis = await visionAnalysisService.analyzeImageFromUrl(mediaUrl);
      
      session.profileImageAnalysis = imageAnalysis;
      session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
      await sessionService.saveSession(phoneNumber, session);
      
      // Pergunta sobre o desafio
      log(`Perguntando sobre desafio para ${phoneNumber}`);
      await askForChallenge(phoneNumber);
    } else {
      log(`Enviando mensagem de imagem não solicitada para ${phoneNumber}`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Obrigado pela imagem! No momento, só posso processar imagens quando solicitado durante a criação da sua Carta de Consciência."
      );
    }
  } catch (error) {
    log('Erro ao processar imagem:', error);
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro ao processar sua imagem. Por favor, tente novamente ou digite 'pular' para continuar sem análise de imagem."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Inicia a conversa para gerar a Carta de Consciência
async function startConversation(phoneNumber, session) {
  try {
    log(`Iniciando conversa para ${phoneNumber}`);
    session.state = CONVERSATION_STATES.WAITING_NAME;
    await sessionService.saveSession(phoneNumber, session);
    
    log(`Enviando mensagem de boas-vindas para ${phoneNumber}`);
    const result = await whatsappService.sendTextMessage(
      phoneNumber,
      "Olá! 👋 Bem-vindo(a) ao *Conselheiro Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual criado para gerar sua *Carta da Consciênc.IA* personalizada — uma análise única, emocional e estratégica baseada no seu perfil e no momento que você está vivendo.\n\nPara começar, preciso conhecer você melhor.\nComo gostaria de ser chamado(a)? 😊"
    );
    
    log(`Resultado do envio de mensagem: ${result ? 'Sucesso' : 'Falha'}`);
  } catch (error) {
    log('Erro ao iniciar conversa:', error);
    // Tenta novamente com uma mensagem mais simples
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Olá! Como gostaria de ser chamado(a)?"
      );
    } catch (retryError) {
      log('Erro na segunda tentativa:', retryError);
    }
  }
}

// Envia mensagem de boas-vindas
async function sendWelcomeMessage(phoneNumber, session) {
  try {
    log(`Enviando mensagem de boas-vindas para ${phoneNumber}`);
    session.state = CONVERSATION_STATES.INITIAL;
    await sessionService.saveSession(phoneNumber, session);
    
    const result = await whatsappService.sendTextMessage(
      phoneNumber,
      "Olá! 👋 Bem-vindo(a) ao *Conselheiro Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual criado para gerar sua *Carta da Consciênc.IA* personalizada.\n\nDigite *\"Quero receber a minha Carta!\"* para começarmos."
    );
    
    log(`Resultado do envio de mensagem: ${result ? 'Sucesso' : 'Falha'}`);
  } catch (error) {
    log('Erro ao enviar mensagem de boas-vindas:', error);
    // Tenta novamente com uma mensagem mais simples
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Olá! Digite \"Quero receber a minha Carta!\" para começarmos."
      );
    } catch (retryError) {
      log('Erro na segunda tentativa:', retryError);
    }
  }
}

// Processa a entrada do nome
async function handleNameInput(phoneNumber, name, session) {
  try {
    log(`Processando nome para ${phoneNumber}: "${name}"`);
    session.userName = name;
    session.state = CONVERSATION_STATES.WAITING_BUSINESS;
    await sessionService.saveSession(phoneNumber, session);
    
    const result = await whatsappService.sendTextMessage(
      phoneNumber,
      `Obrigado, ${name}! 😊\n\nPara uma melhor experiência, gostaria de me contar qual é o Nicho do seu Negócio ou trabalho atual e o seu papel nele?\n\n(Caso não queira informar agora, digite *"pular"* para continuar.)`
    );
    
    log(`Resultado do envio de mensagem: ${result ? 'Sucesso' : 'Falha'}`);
  } catch (error) {
    log('Erro ao processar nome:', error);
    // Tenta novamente com uma mensagem mais simples
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        `Obrigado, ${name}! Qual é o seu negócio? (Digite "pular" para continuar)`
      );
    } catch (retryError) {
      log('Erro na segunda tentativa:', retryError);
    }
  }
}

// Pergunta sobre a escolha do perfil
async function askForProfileChoice(phoneNumber, session) {
  try {
    log(`Perguntando sobre perfil para ${phoneNumber}`);
    session.state = CONVERSATION_STATES.WAITING_PROFILE;
    await sessionService.saveSession(phoneNumber, session);
    
    const result = await whatsappService.sendTextMessage(
      phoneNumber,
      "Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nVocê escolhe como prefere se apresentar:\n\n1️⃣ Envie um *\"print do seu perfil social\"* (Instagram ou LinkedIn) para uma leitura mais profunda.\n2️⃣ Envie *\"sua foto de perfil\"* (uma imagem que te represente hoje).\n3️⃣ Ou apenas me diga seu @ (ex: @renatohilel.oficial) para uma leitura objetiva.\n\n📝 Envie agora da forma que preferir!"
    );
    
    log(`Resultado do envio de mensagem: ${result ? 'Sucesso' : 'Falha'}`);
  } catch (error) {
    log('Erro ao perguntar sobre perfil:', error);
    // Tenta novamente com uma mensagem mais simples
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Envie uma foto do seu perfil ou seu @ (ex: @renatohilel.oficial)"
      );
    } catch (retryError) {
      log('Erro na segunda tentativa:', retryError);
    }
  }
}

// Processa a escolha do perfil
async function handleProfileChoice(phoneNumber, text, session) {
  try {
    log(`Processando escolha de perfil para ${phoneNumber}: "${text}"`);
    const normalizedText = normalizeText(text);
    
    if (normalizedText.includes('@')) {
      // Usuário enviou um nome de usuário
      const username = text.trim();
      session.profileUrl = username;
      session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
      await sessionService.saveSession(phoneNumber, session);
      
      log(`Enviando mensagem de transição para ${phoneNumber}`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Agora me diga, com sinceridade..."
      );
      
      // Pergunta sobre o desafio
      log(`Perguntando sobre desafio para ${phoneNumber}`);
      await askForChallenge(phoneNumber);
    } else if (normalizedText.includes('http') || normalizedText.includes('www') || normalizedText.includes('.com')) {
      // Usuário enviou uma URL
      log(`URL detectada de ${phoneNumber}: "${text}"`);
      await handleProfileUrl(phoneNumber, text, session);
    } else {
      // Instrui o usuário a enviar uma imagem
      log(`Instruindo ${phoneNumber} a enviar imagem ou @`);
      session.state = CONVERSATION_STATES.WAITING_PROFILE;
      await sessionService.saveSession(phoneNumber, session);
      
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Por favor, envie uma imagem do seu perfil ou digite seu @ (ex: @renatohilel.oficial)."
      );
    }
  } catch (error) {
    log('Erro ao processar escolha de perfil:', error);
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro. Por favor, envie uma imagem do seu perfil ou digite seu @ (ex: @renatohilel.oficial)."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Processa a URL do perfil
async function handleProfileUrl(phoneNumber, url, session) {
  try {
    log(`Processando URL do perfil para ${phoneNumber}: "${url}"`);
    session.profileUrl = url;
    session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
    await sessionService.saveSession(phoneNumber, session);
    
    // Tenta fazer scraping do perfil
    try {
      log(`Tentando fazer scraping do perfil para ${phoneNumber}`);
      const profileData = await profileScraperService.scrapeProfile(url);
      if (profileData) {
        session.profileData = profileData;
        await sessionService.saveSession(phoneNumber, session);
      }
    } catch (scrapingError) {
      log('Erro ao fazer scraping do perfil:', scrapingError);
      // Continua mesmo com erro no scraping
    }
    
    // Pergunta sobre o desafio
    log(`Perguntando sobre desafio para ${phoneNumber}`);
    await askForChallenge(phoneNumber);
  } catch (error) {
    log('Erro ao processar URL do perfil:', error);
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro ao processar o URL. Vamos continuar com o próximo passo."
      );
      await askForChallenge(phoneNumber);
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Pergunta sobre o desafio
async function askForChallenge(phoneNumber) {
  try {
    log(`Perguntando sobre desafio para ${phoneNumber}`);
    const result = await whatsappService.sendTextMessage(
      phoneNumber,
      "🌐 *Se você pudesse resolver apenas UM desafio neste momento*,\nque, ao ser superado, traria os resultados que você tanto busca?\n\n(Responda com apenas uma frase)"
    );
    
    log(`Resultado do envio de mensagem: ${result ? 'Sucesso' : 'Falha'}`);
  } catch (error) {
    log('Erro ao perguntar sobre desafio:', error);
    // Tenta novamente com uma mensagem mais simples
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Qual é o seu maior desafio atual? (Responda com uma frase)"
      );
    } catch (retryError) {
      log('Erro na segunda tentativa:', retryError);
    }
  }
}

// Processa a entrada do desafio
async function handleChallengeInput(phoneNumber, challenge, session) {
  try {
    log(`Processando desafio para ${phoneNumber}: "${challenge}"`);
    session.challenge = challenge;
    session.state = CONVERSATION_STATES.GENERATING_LETTER;
    await sessionService.saveSession(phoneNumber, session);
    
    // Envia mensagem de processamento
    log(`Enviando mensagem de processamento para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "⏳ Estou analisando suas informações e preparando sua Carta da Consciênc.IA...\nIsso pode levar alguns instantes...\n\n✨ Sinta-se confortável. A magia está acontecendo."
    );
    
    // Gera a carta
    log(`Gerando carta para ${phoneNumber}`);
    const letterContent = await generateConscienceLetter(session);
    
    // Divide a carta em seções para evitar cortes
    log(`Dividindo carta em seções para ${phoneNumber}`);
    const sections = splitLetterIntoSections(letterContent);
    
    // Envia cada seção da carta
    log(`Enviando ${sections.length} seções da carta para ${phoneNumber}`);
    for (const section of sections) {
      await whatsappService.sendTextMessage(phoneNumber, section);
      // Pequena pausa entre as seções para garantir ordem
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Atualiza o estado da sessão
    log(`Atualizando estado da sessão para ${phoneNumber}`);
    session.letterContent = letterContent;
    session.state = CONVERSATION_STATES.LETTER_DELIVERED;
    await sessionService.saveSession(phoneNumber, session);
    
    // Envia mensagem de conclusão
    log(`Enviando mensagem de conclusão para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "✨ Sua Carta da Consciênc.IA foi entregue! ✨\n\nEspero que tenha gostado da sua Carta! ⭐\n\nPara saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o Programa Consciênc.IA, de Renato Hilel e Nuno Arcanjo.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa! 🌟"
    );
    
    // Envia mensagem sobre o Método S.I.M. e Ikigai
    log(`Enviando mensagem sobre Método S.I.M. para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Antes de irmos, uma última sugestão:\n\nExplore o *Método S.I.M.* (@metodosimbrasil) e o conceito de *Ikigai* (@coworkingikigai).\n\nO Método S.I.M. te ajuda a equilibrar *Saúde, Intuição e Mente*,\nenquanto o Ikigai revela seu propósito autêntico e magnético no mundo dos negócios.\n\n🌐 Se ainda não baixou o *App Oficial do MAPA DO LUCRO*, recomendo que peça agora mesmo o link para a equipe do evento."
    );
    
    // Envia mensagem de ajuda
    log(`Enviando mensagem de ajuda para ${phoneNumber}`);
    await sendHelpMessage(phoneNumber);
  } catch (error) {
    log('Erro ao processar desafio:', error);
    
    // Envia mensagem de erro
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro ao gerar sua Carta de Consciência. Por favor, tente novamente mais tarde."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Gera a Carta de Consciência
async function generateConscienceLetter(session) {
  try {
    log(`Gerando carta para usuário: ${session.userName || 'Anônimo'}`);
    // Prepara os dados para a geração da carta
    const userData = {
      name: session.userName || 'Amigo',
      businessInfo: session.businessInfo || 'empreendimento',
      profileUrl: session.profileUrl || '',
      profileData: session.profileData || {},
      profileImageAnalysis: session.profileImageAnalysis || {},
      challenge: session.challenge || 'crescer profissionalmente'
    };
    
    // Gera a carta usando o serviço de geração de conteúdo
    log('Chamando serviço de geração de conteúdo');
    const letterContent = await contentGenerationService.generateConscienceLetter(userData);
    log(`Carta gerada com ${letterContent.length} caracteres`);
    
    return letterContent;
  } catch (error) {
    log('Erro ao gerar carta:', error);
    // Retorna uma carta de fallback em caso de erro
    return `📬 Querido ${session.userName || 'Amigo'},

Você chegou até aqui buscando algo... mais. E acredite: essa busca não é à toa. Ela nasce de uma semente de lucidez que quer florescer dentro de você.

🪞 Seu maior desafio hoje é:
"${session.challenge || 'crescer profissionalmente'}"
Isso revela mais do que um obstáculo — revela um chamado interior por evolução.

✨ Sinto em você um espírito determinado e resiliente.

Você está em um ponto de virada. Ou você repete os padrões antigos… ou rompe com eles.

🧭 Conselho de Ouro:
Confie no processo. Os obstáculos são oportunidades disfarçadas. Mantenha o foco no seu objetivo final.

🤖 Recomendação de IA para o agora:
- Use ferramentas de IA para automatizar tarefas repetitivas e focar no que realmente importa.

🪷 Pílula de Inspiração:
No silêncio da noite, quando as dúvidas surgem,
Lembre-se que cada passo, mesmo pequeno,
É uma vitória contra o medo que te consome.
Você é maior que seus desafios.

Com carinho,  
Conscienc.IA`;
  }
}

// Divide a carta em seções para evitar cortes
function splitLetterIntoSections(letter) {
  // Divide a carta em seções com base nos títulos
  const sections = [];
  
  // Adiciona o título da carta
  sections.push(letter.split('*1. Introdução Simbólica:*')[0].trim());
  
  // Adiciona as seções numeradas
  const parts = letter.match(/\*\d+\.\s[^*]+\*[\s\S]*?(?=\*\d+\.|$)/g) || [];
  
  for (const part of parts) {
    sections.push(part.trim());
  }
  
  // Garante que a assinatura esteja na última seção
  const lastSection = sections[sections.length - 1];
  if (!lastSection.includes('Conselheiro Consciênc.IA')) {
    // Se a assinatura não estiver na última seção, ajusta as seções
    const signatureIndex = letter.lastIndexOf('Conselheiro Consciênc.IA');
    if (signatureIndex !== -1) {
      const signature = letter.substring(signatureIndex - 100);
      sections[sections.length - 1] = lastSection.replace(signature, '').trim();
      sections.push(signature.trim());
    }
  }
  
  return sections;
}

// Envia mensagem de ajuda
async function sendHelpMessage(phoneNumber) {
  try {
    log(`Enviando mensagem de ajuda para ${phoneNumber}`);
    const result = await whatsappService.sendTextMessage(
      phoneNumber,
      "Se precisar de mais alguma coisa, estou à disposição! 😊\n\nVocê pode:\n\n- Digitar *IA* para receber dicas de como a IA pode ajudar no seu desafio\n- Digitar *Inspiração* para receber uma pílula de inspiração personalizada\n- Perguntar sobre o *Programa Consciênc.IA* ou sobre os mentores *Renato Hilel* e *Nuno Arcanjo*"
    );
    
    log(`Resultado do envio de mensagem: ${result ? 'Sucesso' : 'Falha'}`);
  } catch (error) {
    log('Erro ao enviar mensagem de ajuda:', error);
    // Tenta novamente com uma mensagem mais simples
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Digite IA para dicas, Inspiração para uma mensagem inspiradora, ou pergunte sobre o Programa Consciênc.IA."
      );
    } catch (retryError) {
      log('Erro na segunda tentativa:', retryError);
    }
  }
}

// Processa o comando IA
async function handleIACommand(phoneNumber, session) {
  try {
    log(`Processando comando IA para ${phoneNumber}`);
    // Garante que a sessão existe e tem um estado válido
    if (!session) {
      session = {
        phoneNumber: phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(phoneNumber, session);
    }
    
    if (!session.challenge) {
      log(`Desafio não encontrado para ${phoneNumber}, solicitando`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Para que eu possa te ajudar com sugestões de IA, preciso saber qual é o seu desafio atual. Por favor, compartilhe comigo qual é o seu maior desafio no momento."
      );
      
      session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
      await sessionService.saveSession(phoneNumber, session);
      return;
    }
    
    log(`Enviando mensagem de processamento para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Estou gerando sugestões de como a IA pode te ajudar com seu desafio... Um momento."
    );
    
    log(`Gerando ajuda de IA para ${phoneNumber}`);
    const iaHelp = await contentGenerationService.generateIAHelp(session.userName, session.challenge);
    
    log(`Enviando ajuda de IA para ${phoneNumber}`);
    await whatsappService.sendTextMessage(phoneNumber, iaHelp);
    
    // Envia mensagem de ajuda
    log(`Enviando mensagem de ajuda para ${phoneNumber}`);
    await sendHelpMessage(phoneNumber);
  } catch (error) {
    log('Erro ao processar comando IA:', error);
    
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro ao gerar sugestões de IA. Por favor, tente novamente mais tarde."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Processa o comando Inspiração
async function handleInspirationCommand(phoneNumber, session) {
  try {
    log(`Processando comando Inspiração para ${phoneNumber}`);
    // Garante que a sessão existe e tem um estado válido
    if (!session) {
      session = {
        phoneNumber: phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
      await sessionService.saveSession(phoneNumber, session);
    }
    
    if (!session.challenge) {
      log(`Desafio não encontrado para ${phoneNumber}, solicitando`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Para que eu possa te enviar uma inspiração personalizada, preciso saber qual é o seu desafio atual. Por favor, compartilhe comigo qual é o seu maior desafio no momento."
      );
      
      session.state = CONVERSATION_STATES.WAITING_CHALLENGE;
      await sessionService.saveSession(phoneNumber, session);
      return;
    }
    
    log(`Enviando mensagem de processamento para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Estou canalizando uma inspiração especial para você... Um momento."
    );
    
    log(`Gerando inspiração para ${phoneNumber}`);
    const inspiration = await contentGenerationService.generateInspiration(session.userName, session.challenge);
    
    log(`Enviando inspiração para ${phoneNumber}`);
    await whatsappService.sendTextMessage(phoneNumber, inspiration);
    
    // Envia mensagem de ajuda
    log(`Enviando mensagem de ajuda para ${phoneNumber}`);
    await sendHelpMessage(phoneNumber);
  } catch (error) {
    log('Erro ao processar comando Inspiração:', error);
    
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Desculpe, ocorreu um erro ao gerar sua inspiração. Por favor, tente novamente mais tarde."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem de erro:', sendError);
    }
  }
}

// Processa o comando Não
async function handleNoCommand(phoneNumber, session) {
  try {
    log(`Processando comando Não para ${phoneNumber}`);
    // Garante que a sessão existe e tem um estado válido
    if (!session) {
      session = {
        phoneNumber: phoneNumber,
        state: CONVERSATION_STATES.INITIAL,
        startTimestamp: Date.now()
      };
    }
    
    log(`Enviando mensagem de confirmação para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Tudo bem! Estou aqui para ajudar quando precisar.\n\nSe quiser receber sua Carta da Consciênc.IA personalizada, é só me avisar digitando *\"Quero receber a minha Carta!\"*"
    );
    
    session.state = CONVERSATION_STATES.INITIAL;
    await sessionService.saveSession(phoneNumber, session);
  } catch (error) {
    log('Erro ao processar comando Não:', error);
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Tudo bem! Digite \"Quero receber a minha Carta!\" quando desejar começar."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem:', sendError);
    }
  }
}

// Envia informações sobre o programa
async function handleProgramInfo(phoneNumber) {
  try {
    log(`Enviando informações sobre o programa para ${phoneNumber}`);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "🌟 O *Programa Consciênc.IA* foi criado por Renato Hilel e Nuno Arcanjo para ajudar você a escalar seu negócio, sua mentoria ou sua marca pessoal com autenticidade e IA estratégica.\n\nVocê pode se inscrever na lista de espera com benefícios exclusivos pelo site:\n🔗 https://www.floreon.app.br/conscienc-ia\n\nSe quiser conversar com um mentor humano agora, aproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa @renatohilel.oficial e @nunoarcanjo.poeta! 💫"
    );
  } catch (error) {
    log('Erro ao enviar informações sobre o programa:', error);
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Visite https://www.floreon.app.br/conscienc-ia para conhecer o Programa Consciênc.IA de Renato Hilel e Nuno Arcanjo."
      );
    } catch (sendError) {
      log('Erro ao enviar mensagem:', sendError);
    }
  }
}
