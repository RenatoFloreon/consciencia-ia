import sessionService from '../services/sessionService.js';
import whatsappService from '../services/whatsappService.js';
import * as openaiService from '../services/openaiService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import * as scrapingService from '../services/scrapingService.js';
import * as contentGenerationService from '../services/contentGenerationService.js';
import interactionService from '../services/interactionService.js';
import { log } from '../utils/logger.js';
import { isValidUrl, normalizeProfileUrl } from '../utils/validators.js';

// Estados da conversa
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
      await processTextMessage(userPhoneNumber, message.text.body, session);
    } else if (message.type === 'image') {
      await processImageMessage(userPhoneNumber, message.image, session);
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
async function processTextMessage(userPhoneNumber, messageText, session) {
  try {
    const text = messageText.trim();
    
    // Comandos especiais disponíveis em qualquer estado
    if (text.toLowerCase() === "quero receber a minha carta!") {
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
        
      case CONVERSATION_STATES.WAITING_EMAIL:
        await processEmail(userPhoneNumber, text, session);
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
      "Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde."
    );
  }
}

/**
 * Processa mensagens de imagem
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {Object} imageData - Dados da imagem
 * @param {Object} session - Dados da sessão do usuário
 */
async function processImageMessage(userPhoneNumber, imageData, session) {
  try {
    // Verifica se está no estado correto para receber imagens
    if (session.state !== CONVERSATION_STATES.WAITING_PROFILE) {
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Desculpe, não estou esperando uma imagem neste momento. Por favor, siga as instruções anteriores."
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
      `Obrigado! Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu ${session.name ? 'Negócio' : 'negócio'} no momento?`
    );
  } catch (error) {
    log('Erro ao processar mensagem de imagem:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar sua imagem. Por favor, tente enviar um link do seu perfil em vez disso."
    );
  }
}

/**
 * Inicia a conversa com o usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 */
async function startConversation(userPhoneNumber) {
  try {
    // Mensagem de boas-vindas
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Olá! 👋 Bem-vindo(a) ao Conselheiro da Consciênc.IA do evento MAPA DO LUCRO!\n\nSou um assistente virtual especial criado para gerar sua \"Carta de Consciência\" personalizada – uma análise única baseada no seu perfil digital que revelará insights valiosos sobre seu comportamento empreendedor e recomendações práticas de como usar IA no seu negócio.\n\nPara começar, preciso conhecer você melhor.\nPor favor, como gostaria de ser chamado(a)?"
    );
    
    // Atualiza o estado da sessão
    const session = await sessionService.getSession(userPhoneNumber);
    session.state = CONVERSATION_STATES.WAITING_NAME;
    await sessionService.saveSession(userPhoneNumber, session);
  } catch (error) {
    log('Erro ao iniciar conversa:', error);
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
    session.state = CONVERSATION_STATES.WAITING_EMAIL;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Solicita o e-mail
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      `Obrigado, ${name}! 😊\n\nPara enviarmos materiais após o evento, por favor, informe seu e-mail:\n\n(Caso não queira informar agora, digite "pular" para continuar)`
    );
  } catch (error) {
    log('Erro ao processar nome:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu nome. Por favor, tente novamente."
    );
  }
}

/**
 * Processa o e-mail do usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} email - E-mail do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processEmail(userPhoneNumber, email, session) {
  try {
    // Verifica se o usuário quer pular esta etapa
    if (email.toLowerCase() === "pular") {
      session.email = null;
    } else {
      // Valida o e-mail (validação básica)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await whatsappService.sendTextMessage(
          userPhoneNumber,
          "Por favor, informe um e-mail válido ou digite \"pular\" para continuar."
        );
        return;
      }
      
      session.email = email;
    }
    
    // Atualiza a sessão
    session.state = CONVERSATION_STATES.WAITING_PROFILE;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Solicita o perfil
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nPor favor, me envie o link do seu perfil público do Instagram ou LinkedIn.\nExemplo: https://www.instagram.com/seuusuario\n\n(Você também pode enviar apenas seu @usuário, ou até mesmo uma imagem do perfil / print. )"
    );
  } catch (error) {
    log('Erro ao processar e-mail:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu e-mail. Por favor, tente novamente."
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
      profileData = await scrapingService.scrapeProfile(profileUrl);
      session.profileData = profileData;
    } catch (error) {
      log('Erro ao extrair dados do perfil:', error);
    }
    
    // Tenta analisar o perfil
    let profileAnalysis = '';
    try {
      profileAnalysis = await scrapingService.analyzeProfileWithAI(profileUrl);
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
      `Obrigado! Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu ${session.name ? 'Negócio' : 'negócio'} no momento?`
    );
  } catch (error) {
    log('Erro ao processar perfil:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu perfil. Por favor, tente novamente."
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
      "Gratidão por compartilhar! 🙏\n\nVou analisar seu perfil e gerar sua Carta de Consciência personalizada. Isso pode levar alguns instantes... ⌛"
    );
    
    // Gera a carta de consciência
    const userData = {
      name: session.name,
      challenge: session.challenge,
      profileUrl: session.profileUrl,
      profileData: session.profileData,
      profileAnalysis: session.profileAnalysis,
      imageAnalysis: session.imageAnalysis,
      inputType: session.inputType
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
          name: session.name,
          challenge: session.challenge
        });
      } catch (retryError) {
        log('Erro na segunda tentativa de gerar carta:', retryError);
        
        // Usa uma carta genérica em caso de falha
        letterContent = `❤️ *Introdução Simbólica:*\n\nOlá, ${session.name},\n\nImagine por um momento, a Alma do seu Negócio como um farol brilhante na noite, iluminando o caminho para aqueles que navegam nos mares tempestuosos da incerteza. Você é o guardião desse farol, a luz que traz orientação e esperança.\n\n✨ *Perfil Comportamental (Insight de Consciência):*\n\nAnalisando seu perfil digital, é evidente a paixão que arde em você. Seus interesses variados demonstram a abrangência de sua curiosidade e seus padrões de pensamento inovadores. No conceito de Ikigai, temos uma intersecção de quatro elementos fundamentais: O que você ama, o que o mundo precisa, o que você pode ser pago para fazer e o que você é bom.\n\n💎 *Conselho de Ouro:*\n\nSeu desafio, "${session.challenge}", é como um vulcão adormecido. Pode parecer assustador, mas lembre-se, é a pressão que forma os diamantes. Não tenha medo do desafio. Abraçá-lo é o que o levará ao próximo nível. No contexto do Ikigai, procure aquilo que faz seu espírito vibrar, isso que se conecta com o seu ser mais profundo. Encontre seu equilíbrio entre o que você ama, o que é bom, o que o mundo precisa e pelo qual você pode ser pago. Acredite no seu potencial.\n\n🚀 *Sugestão de Ferramenta de IA:*\n\nUma ferramenta prática de Inteligência Artificial que pode ajudar diretamente com seu desafio é o Assistente Virtual Personalizado. Ele pode fornecer uma análise detalhada do mundo ao seu redor, fornecendo insights e permitindo tomar decisões mais informadas e focadas. Além disso, pode ajudá-lo a gerenciar seu tempo e tarefas, permitindo que você se concentre no que é mais importante.\n\n✨ *Pílula de Inspiração (Poesia Personalizada):*\n\nEm mares de incerteza, você navega,\nCom a Alma do Negócio a iluminar,\nDesafios enormes, como montanhas se elevam,\nMas você, ${session.name}, está aqui para conquistar.\n\nNo vulcão do desafio, um diamante nasce,\nEm seu Ikigai, sua verdadeira luz resplandece,\nEm seu espírito, um fogo incansável arde,\nVocê é a estrela que o universo conhece.\n\n🌟 *Conclusão Motivacional:*\n\n${session.name}, mantenha a cabeça erguida e o coração aberto. Continue a brilhar a luz da Alma do seu Negócio, desbravando o desconhecido e enfrentando os desafios. Seu Ikigai está ao alcance. Acredite em você e verá que o impossível é apenas uma opinião.`;
      }
    }
    
    // Calcula o tempo de processamento
    const processingTime = Date.now() - generationStartTime;
    
    // Atualiza a sessão com a carta gerada
    session.letterContent = letterContent;
    session.processingTime = processingTime;
    session.endTimestamp = Date.now();
    session.state = CONVERSATION_STATES.LETTER_DELIVERED;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Salva a interação para o painel administrativo
    await interactionService.saveInteraction({
      phoneNumber: userPhoneNumber,
      name: session.name,
      email: session.email,
      profileUrl: session.profileUrl,
      challenge: session.challenge,
      inputType: session.inputType,
      letterContent: letterContent,
      startTimestamp: session.startTimestamp,
      endTimestamp: session.endTimestamp,
      processingTime: processingTime,
      status: 'completed'
    });
    
    // Envia a carta para o usuário
    await sendLetterInChunks(userPhoneNumber, letterContent);
    
    // Envia mensagem final com opções
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "✨ Sua Carta de Consciência personalizada foi entregue! ✨\n\nPosso ajudar com mais algo? Digite:\n\n*\"IA\"* para saber como a IA pode ajudar você hoje.\n*\"inspiração\"* para outra inspiração personalizada.\n*\"não\"* para encerrar."
    );
    
    // Atualiza o estado da sessão
    session.state = CONVERSATION_STATES.WAITING_COMMAND;
    await sessionService.saveSession(userPhoneNumber, session);
  } catch (error) {
    log('Erro ao processar desafio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao gerar sua carta. Por favor, tente novamente mais tarde."
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
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand === "ia") {
      // Gera sugestões de IA
      const iaHelp = await contentGenerationService.generateIAHelp(session.name, session.challenge);
      
      await whatsappService.sendTextMessage(userPhoneNumber, iaHelp);
      
      // Pergunta se deseja mais algo
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Posso ajudar com mais algo? Digite:\n\n*\"inspiração\"* para uma inspiração personalizada.\n*\"não\"* para encerrar."
      );
    } else if (lowerCommand === "inspiração") {
      // Gera inspiração personalizada
      const inspiration = await contentGenerationService.generateInspiration(session.name, session.challenge);
      
      await whatsappService.sendTextMessage(userPhoneNumber, inspiration);
      
      // Pergunta se deseja mais algo
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Posso ajudar com mais algo? Digite:\n\n*\"IA\"* para saber como a IA pode ajudar você hoje.\n*\"não\"* para encerrar."
      );
    } else if (lowerCommand === "não") {
      // Encerra a conversa
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        `Obrigado por utilizar o Conselheiro da Consciênc.IA, ${session.name}! Foi um prazer ajudar.\n\nSe quiser receber outra Carta de Consciência no futuro, basta enviar \"Quero receber a minha Carta!\".\n\nAté a próxima! 👋`
      );
      
      // Adiciona mensagem sobre o Programa Consciênc.IA
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "🌟 *Programa Consciênc.IA* 🌟\n\nGostou da sua experiência? O Programa Consciênc.IA oferece uma jornada completa de transformação para empreendedores que desejam integrar IA em seus negócios de forma estratégica e consciente.\n\nPara saber mais, acesse: https://consciencia.ia"
       );
    } else {
      // Comando não reconhecido
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "Desculpe, não reconheço esse comando. Por favor, digite:\n\n*\"IA\"* para saber como a IA pode ajudar você hoje.\n*\"inspiração\"* para outra inspiração personalizada.\n*\"não\"* para encerrar."
      );
    }
  } catch (error) {
    log('Erro ao processar comando:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente."
    );
  }
}

/**
 * Envia a carta em partes para evitar limitações de tamanho do WhatsApp
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} letterContent - Conteúdo da carta
 */
async function sendLetterInChunks(userPhoneNumber, letterContent) {
  try {
    // Divide a carta em seções baseadas em cabeçalhos
    const sections = letterContent.split(/(?=\*[^*]+\*)/g);
    
    // Envia cada seção separadamente
    for (const section of sections) {
      if (section.trim()) {
        await whatsappService.sendTextMessage(userPhoneNumber, section.trim());
        
        // Pequeno delay para evitar problemas de ordem
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    log('Erro ao enviar carta em partes:', error);
    
    // Tenta enviar a carta completa em caso de erro
    await whatsappService.sendTextMessage(userPhoneNumber, letterContent);
  }
}
