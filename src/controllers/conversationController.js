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
    if (text.toLowerCase().includes("quero receber") && text.toLowerCase().includes("carta")) {
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
      "Agora me diga, com sinceridade...\n\n🌐 *Se você pudesse resolver apenas UM desafio neste momento*,\nqual seria esse desafio que, ao ser superado, traria os resultados que você mais deseja?\n\n(Responda com apenas uma frase)"
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
      "Olá! 👋 Bem-vindo(a) ao *Conselheiro Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual criado para gerar sua *Carta da Consciênc.IA* personalizada — uma análise única, emocional e estratégica baseada no seu perfil e no momento que você está vivendo.\n\nPara começar, preciso conhecer você melhor.\nComo gostaria de ser chamado(a)? 🙂"
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
      "Desculpe, ocorreu um erro ao processar seu nome. Por favor, tente novamente."
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
      "Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nVocê escolhe como prefere se apresentar:\n\n1️⃣ Envie um **print do seu perfil social** (Instagram ou LinkedIn) para uma leitura mais profunda.\n2️⃣ Envie **sua foto de perfil** (uma imagem que te represente hoje).\n3️⃣ Ou apenas me diga seu @ (ex: @renatohilel.oficial) para uma leitura objetiva.\n\n📝 Envie agora da forma que preferir!"
    );
  } catch (error) {
    log('Erro ao processar negócio:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao processar sua informação. Por favor, tente novamente."
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
      "Agora me diga, com sinceridade...\n\n🌐 *Se você pudesse resolver apenas UM desafio neste momento*,\nqual seria esse desafio que, ao ser superado, traria os resultados que você mais deseja?\n\n(Responda com apenas uma frase)"
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
      "⏳ Estou analisando suas informações e preparando sua Carta da Consciênc.IA…\nIsso pode levar alguns instantes...\n\n🌟 Sinta-se confortável. A magia está acontecendo."
    );
    
    // Gera a carta de consciência
    const userData = {
      name: session.name,
      business: session.business,
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
        letterContent = `*Carta de Consciência para ${session.name}*\n\n1. *Introdução Simbólica:*\n\nCaro ${session.name},\n\nNa vasta imensidão do oceano empreendedor, o seu negócio é como um farol de luz intensa, irradiando potencial e guiando aqueles à sua volta. Assim como um farol que se eleva sobre as águas turbulentas, a alma do seu negócio ilumina o caminho para novas possibilidades e conquistas.\n\n2. *Perfil Comportamental:*\n\nAo navegar pelas ondas do seu perfil, é evidente que você é alguém que busca incessantemente seu ikigai, o ponto de interseção entre o que você ama, no que é bom, o que o mundo precisa e pelo que pode ser pago. Sua habilidade de comunicar-se com clareza e empatia é notável, mostrando que você entende a importância de criar laços genuínos com seu público.\n\nNo entanto, a busca por escalar as vendas, seu desafio atual, requer um equilíbrio entre sua paixão e a necessidade de estruturar processos que garantam crescimento sustentável.\n\n3. *Conselho de Ouro:*\n\n${session.name}, para escalar suas vendas, é fundamental não apenas ampliar sua base de clientes, mas também consolidar a fidelidade daqueles que já confiam em sua marca. Considere aprofundar-se na personalização de experiências, criando ofertas que ressoem pessoalmente com seus seguidores. Utilize feedbacks para refinar suas estratégias e não hesite em testar novos canais de venda que possam complementar suas práticas atuais. Lembre-se, a escalabilidade é tanto sobre alavancar seus pontos fortes quanto sobre otimizar suas operações internas.\n\n4. *Sugestão de Ferramenta de IA:*\n\nPara enfrentar o desafio de escalar as vendas, recomendo que explore a utilização de Inteligência Artificial para análise de dados de clientes. Ferramentas de IA, como chatbots inteligentes e plataformas de CRM com capacidades de machine learning, podem ajudar a segmentar seu público, identificar padrões de compra e prever comportamentos futuros. Isso não apenas aprimorará suas estratégias de marketing, mas também fortalecerá o relacionamento com seus clientes, oferecendo-lhes exatamente o que precisam, quando precisam.\n\n5. *Pílula de Inspiração:*\n\nNo palco da vida, o empreendedor é o ator,\nCom coragem, avança, sem temor,\nEscalar montanhas, cruzar o mar,\nCada desafio, uma chance de brilhar.\n\n${session.name}, com visão e coração em sintonia,\nSeu farol ilumina o caminho, dia após dia,\nQue a jornada seja de crescimento e florescer,\nE que suas conquistas sejam sempre de se enaltecer. ✨\n\n6. *Conclusão Motivacional:*\n\n${session.name}, lembre-se de que a escalada é um processo contínuo de aprendizagem e adaptação. Permita-se ser guiado pela paixão que o impulsiona e pela visão que o orienta. A jornada de escalar vendas é uma dança entre estratégia e inovação, e você possui o talento e a determinação necessários para liderar com sucesso. Continue iluminando o caminho com sua luz única e nunca perca de vista o horizonte de possibilidades que se estende diante de você.\n\nCom determinação e entusiasmo, siga em frente! 🚀\n\nCom os melhores votos de sucesso,\n\nConselheiro da Consciênc.IA`;
      }
    }
    
    // Envia a carta para o usuário
    await sendConscienceLetter(userPhoneNumber, letterContent);
    
    // Atualiza o estado da sessão
    session.letterContent = letterContent;
    session.letterGeneratedAt = Date.now();
    session.state = CONVERSATION_STATES.LETTER_DELIVERED;
    await sessionService.saveSession(userPhoneNumber, session);
    
    // Envia mensagem de confirmação e opções
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "✨ *Sua Carta da Consciênc.IA foi entregue!* ✨\n\nEspero que tenha gostado da sua Carta! 🌟\n\nPara saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o Programa Consciênc.IA, de Renato Hilel e Nuno Arcanjo.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa! 💫"
    );
    
    // Envia opções de continuidade
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Posso ajudar com mais algo? Digite:\n\n*\"IA\"* para saber como a IA pode ajudar você hoje.\n*\"inspiração\"* para outra inspiração personalizada.\n*\"não\"* para encerrar."
    );
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
 * Envia a carta de consciência para o usuário
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {string} letterContent - Conteúdo da carta
 */
async function sendConscienceLetter(userPhoneNumber, letterContent) {
  try {
    // Envia a carta para o usuário
    await whatsappService.sendTextMessage(userPhoneNumber, letterContent);
  } catch (error) {
    log('Erro ao enviar carta:', error);
    
    // Tenta enviar em partes menores em caso de erro
    try {
      const parts = letterContent.split('\n\n');
      for (const part of parts) {
        if (part.trim()) {
          await whatsappService.sendTextMessage(userPhoneNumber, part);
          // Pequeno atraso para evitar problemas de ordem
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (retryError) {
      log('Erro ao enviar carta em partes:', retryError);
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
    const command = text.toLowerCase().trim();
    
    // Verifica se é uma solicitação de informações sobre o programa
    if (command.includes('programa') || command.includes('conscienc.ia') || 
        command.includes('mentor') || command.includes('renato') || 
        command.includes('nuno') || command.includes('arcanjo')) {
      
      await whatsappService.sendTextMessage(
        userPhoneNumber,
        "🌟 O *Programa Consciênc.IA* foi criado por Renato Hilel e Nuno Arcanjo para ajudar você a escalar seu negócio, sua mentoria ou sua marca pessoal com autenticidade e IA estratégica.\n\nVocê pode se inscrever na lista de espera com benefícios exclusivos pelo site:\n\n🔗 https://www.floreon.app.br/conscienc-ia\n\nSe quiser conversar com um mentor humano agora, aproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa @renatohilel.oficial e @nunoarcanjo.poeta! 💫"
      );
      
      return;
    }
    
    // Processa comandos específicos
    switch (command) {
      case COMMANDS.IA:
      case 'ia':
        await processIACommand(userPhoneNumber, session);
        break;
        
      case COMMANDS.INSPIRACAO:
      case 'inspiração':
      case 'inspiracao':
        await processInspirationCommand(userPhoneNumber, session);
        break;
        
      case COMMANDS.NAO:
      case 'não':
      case 'nao':
        await processEndCommand(userPhoneNumber, session);
        break;
        
      case COMMANDS.CARTA:
      case 'carta':
        // Verifica se já passou tempo suficiente para gerar outra carta
        const now = Date.now();
        const lastGeneration = session.letterGeneratedAt || 0;
        const hoursSinceLastGeneration = (now - lastGeneration) / (1000 * 60 * 60);
        
        if (hoursSinceLastGeneration < 24) {
          await whatsappService.sendTextMessage(
            userPhoneNumber,
            "Você já recebeu sua Carta da Consciênc.IA personalizada hoje! Só é possível gerar uma carta a cada 24 horas.\n\nSe quiser mais insights personalizados, conheça o Programa Consciênc.IA:\n\n🔗 https://www.floreon.app.br/conscienc-ia"
          );
        } else {
          // Reinicia o processo para gerar uma nova carta
          session.state = CONVERSATION_STATES.INITIAL;
          await sessionService.saveSession(userPhoneNumber, session);
          await startConversation(userPhoneNumber);
        }
        break;
        
      default:
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
 * Processa o comando IA
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processIACommand(userPhoneNumber, session) {
  try {
    // Gera dicas de IA personalizadas
    let aiTips = '';
    try {
      aiTips = await openaiService.generateAITips({
        name: session.name,
        business: session.business,
        challenge: session.challenge
      });
    } catch (error) {
      log('Erro ao gerar dicas de IA:', error);
      
      // Usa dicas genéricas em caso de falha
      aiTips = `Olá ${session.name || 'empreendedor(a)'},\n\nAqui estão algumas formas como a IA pode ajudar você hoje:\n\n1. *Automação de Marketing*: Use IA para criar e programar conteúdo para redes sociais, segmentando seu público de forma mais eficiente.\n\n2. *Análise de Dados*: Implemente ferramentas de IA para analisar o comportamento dos clientes e identificar padrões que podem aumentar suas vendas.\n\n3. *Atendimento ao Cliente*: Chatbots inteligentes podem responder perguntas frequentes 24/7, liberando seu tempo para tarefas estratégicas.\n\n4. *Personalização*: Utilize IA para criar experiências personalizadas para seus clientes, aumentando a fidelização.\n\n5. *Otimização de Processos*: Identifique gargalos em seus processos internos com análise preditiva.\n\nPara implementar estas estratégias, recomendo começar com uma ferramenta simples como o ChatGPT para criar conteúdo, e gradualmente explorar soluções mais específicas para seu negócio.\n\nEspero que estas dicas ajudem a impulsionar seu crescimento!`;
    }
    
    // Envia as dicas para o usuário
    await whatsappService.sendTextMessage(userPhoneNumber, aiTips);
    
    // Envia opções novamente
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Posso ajudar com mais algo? Digite:\n\n*\"IA\"* para saber como a IA pode ajudar você hoje.\n*\"inspiração\"* para outra inspiração personalizada.\n*\"não\"* para encerrar."
    );
  } catch (error) {
    log('Erro ao processar comando IA:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao gerar dicas de IA. Por favor, tente novamente mais tarde."
    );
  }
}

/**
 * Processa o comando inspiração
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processInspirationCommand(userPhoneNumber, session) {
  try {
    // Gera inspiração personalizada
    let inspiration = '';
    try {
      inspiration = await openaiService.generateInspiration({
        name: session.name,
        business: session.business,
        challenge: session.challenge
      });
    } catch (error) {
      log('Erro ao gerar inspiração:', error);
      
      // Usa inspiração genérica em caso de falha
      inspiration = `✨ *Inspiração para ${session.name || 'você'}* ✨\n\nNo oceano dos negócios, as ondas não param,\nMas é na persistência que os vencedores se destacam.\nCada desafio superado é um passo à frente,\nCada aprendizado, uma joia reluzente.\n\nSua jornada é única, seu caminho é seu,\nNão compare sua página 10 com o capítulo 20 de alguém.\nO sucesso não é destino, mas jornada constante,\nE você já provou ser resiliente e brilhante.\n\nHoje, permita-se sonhar mais alto,\nDê um passo além, faça um novo salto.\nSua determinação é sua maior aliada,\nE seu potencial, uma força ainda não totalmente explorada.\n\nLembre-se: grandes árvores crescem em silêncio,\nE os maiores sucessos muitas vezes vêm após momentos de silêncio.\nConfie em seu processo, honre sua caminhada,\nPois sua história de sucesso já está sendo forjada. 🌟`;
    }
    
    // Envia a inspiração para o usuário
    await whatsappService.sendTextMessage(userPhoneNumber, inspiration);
    
    // Envia opções novamente
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Posso ajudar com mais algo? Digite:\n\n*\"IA\"* para saber como a IA pode ajudar você hoje.\n*\"inspiração\"* para outra inspiração personalizada.\n*\"não\"* para encerrar."
    );
  } catch (error) {
    log('Erro ao processar comando inspiração:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao gerar inspiração. Por favor, tente novamente mais tarde."
    );
  }
}

/**
 * Processa o comando de encerramento
 * @param {string} userPhoneNumber - Número de telefone do usuário
 * @param {Object} session - Dados da sessão do usuário
 */
async function processEndCommand(userPhoneNumber, session) {
  try {
    // Envia mensagem de despedida
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      `Obrigado por usar o Conselheiro da Consciênc.IA, ${session.name || 'amigo(a)'}! 🙏\n\nFoi um prazer ajudar você hoje. Lembre-se de que você pode voltar a qualquer momento enviando "Quero receber minha Carta!"\n\nAproveite o evento MAPA DO LUCRO e não deixe de conhecer o Programa Consciênc.IA:\n\n🔗 https://www.floreon.app.br/conscienc-ia\n\nDesejo muito sucesso em sua jornada! ✨`
    );
    
    // Não altera o estado da sessão para permitir que o usuário continue a conversa se desejar
  } catch (error) {
    log('Erro ao processar comando de encerramento:', error);
    
    // Envia mensagem de erro para o usuário
    await whatsappService.sendTextMessage(
      userPhoneNumber,
      "Desculpe, ocorreu um erro ao encerrar nossa conversa. Você pode simplesmente parar de responder ou enviar \"Quero receber minha Carta!\" para reiniciar quando desejar."
    );
  }
}
