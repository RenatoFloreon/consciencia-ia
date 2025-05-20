import sessionService from '../services/sessionService.js';
import whatsappService from '../services/whatsappService.js';
import * as openaiService from '../services/openaiService.js';
import * as profileScraperService from '../services/profileScraperService.js';
import * as visionAnalysisService from '../services/visionAnalysisService.js';
import * as contentGenerationService from '../services/contentGenerationService.js';
import { log } from '../utils/logger.js';

// Função principal para processar mensagens recebidas
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
  }
}

// Processa mensagens de texto
async function handleTextMessage(phoneNumber, text) {
  try {
    log(`Processando mensagem de texto de ${phoneNumber}: "${text}"`);
    
    // Obtém ou cria a sessão do usuário
    const session = await sessionService.getSession(phoneNumber);
    log(`Estado da sessão: ${session.state}`);
    
    // Comandos especiais
    const lowerText = text.toLowerCase().trim();
    
    // Verifica se é um comando especial
    if (lowerText === 'ia') {
      await handleIACommand(phoneNumber, session);
      return;
    } else if (lowerText === 'inspiração' || lowerText === 'inspiracao') {
      await handleInspirationCommand(phoneNumber, session);
      return;
    } else if (lowerText === 'não' || lowerText === 'nao') {
      await handleNoCommand(phoneNumber, session);
      return;
    } else if (lowerText.includes('consciênc.ia') || lowerText.includes('consciencia') || 
               lowerText.includes('nuno') || lowerText.includes('renato') || 
               lowerText.includes('hilel') || lowerText.includes('arcanjo') || 
               lowerText.includes('programa')) {
      await handleProgramInfo(phoneNumber);
      return;
    }
    
    // Processa a mensagem com base no estado da sessão
    switch (session.state) {
      case 'INITIAL':
        if (lowerText.includes('carta') || lowerText.includes('receber') || lowerText.includes('quero')) {
          await startConversation(phoneNumber, session);
        } else {
          await sendWelcomeMessage(phoneNumber);
        }
        break;
        
      case 'WAITING_NAME':
        await handleNameInput(phoneNumber, text, session);
        break;
        
      case 'WAITING_BUSINESS':
        if (lowerText === 'pular') {
          await askForProfileChoice(phoneNumber, session);
        } else {
          session.businessInfo = text;
          await sessionService.saveSession(phoneNumber, session);
          await askForProfileChoice(phoneNumber, session);
        }
        break;
        
      case 'WAITING_PROFILE_CHOICE':
        await handleProfileChoice(phoneNumber, text, session);
        break;
        
      case 'WAITING_PROFILE_URL':
        await handleProfileUrl(phoneNumber, text, session);
        break;
        
      case 'WAITING_CHALLENGE':
        await handleChallengeInput(phoneNumber, text, session);
        break;
        
      case 'LETTER_DELIVERED':
        await sendHelpMessage(phoneNumber);
        break;
        
      default:
        await sendWelcomeMessage(phoneNumber);
        break;
    }
  } catch (error) {
    log('Erro ao processar mensagem de texto:', error);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente."
    );
  }
}

// Processa mensagens de imagem
async function handleImageMessage(phoneNumber, image) {
  try {
    log(`Processando imagem de ${phoneNumber}`);
    
    const session = await sessionService.getSession(phoneNumber);
    
    if (session.state === 'WAITING_PROFILE_IMAGE') {
      // Analisa a imagem do perfil
      const imageUrl = image.id;
      
      await whatsappService.sendTextMessage(
        phoneNumber,
        "🔍 Estou analisando sua imagem... Isso pode levar alguns instantes."
      );
      
      // Obtém a URL da imagem
      const mediaUrl = await whatsappService.getMediaUrl(imageUrl);
      
      if (!mediaUrl) {
        await whatsappService.sendTextMessage(
          phoneNumber,
          "Desculpe, não consegui acessar sua imagem. Por favor, tente enviar novamente ou digite 'pular' para continuar sem análise de imagem."
        );
        return;
      }
      
      // Analisa a imagem com o serviço de visão
      const imageAnalysis = await visionAnalysisService.analyzeImageFromUrl(mediaUrl);
      
      session.profileImageAnalysis = imageAnalysis;
      session.state = 'WAITING_CHALLENGE';
      await sessionService.saveSession(phoneNumber, session);
      
      // Pergunta sobre o desafio
      await askForChallenge(phoneNumber);
    } else {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Obrigado pela imagem! No momento, só posso processar imagens quando solicitado durante a criação da sua Carta de Consciência."
      );
    }
  } catch (error) {
    log('Erro ao processar imagem:', error);
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Desculpe, ocorreu um erro ao processar sua imagem. Por favor, tente novamente ou digite 'pular' para continuar sem análise de imagem."
    );
  }
}

// Inicia a conversa para gerar a Carta de Consciência
async function startConversation(phoneNumber, session) {
  try {
    session.state = 'WAITING_NAME';
    await sessionService.saveSession(phoneNumber, session);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Olá! 👋 Bem-vindo(a) ao *Conselheiro Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual criado para gerar sua *Carta da Consciênc.IA* personalizada — uma análise única, emocional e estratégica baseada no seu perfil e no momento que você está vivendo.\n\nPara começar, preciso conhecer você melhor.\nComo gostaria de ser chamado(a)? 😊"
    );
  } catch (error) {
    log('Erro ao iniciar conversa:', error);
    throw error;
  }
}

// Envia mensagem de boas-vindas
async function sendWelcomeMessage(phoneNumber) {
  try {
    const session = await sessionService.getSession(phoneNumber);
    session.state = 'INITIAL';
    await sessionService.saveSession(phoneNumber, session);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Olá! 👋 Bem-vindo(a) ao *Conselheiro Consciênc.IA* do evento MAPA DO LUCRO!\n\nSou um assistente virtual criado para gerar sua *Carta da Consciênc.IA* personalizada.\n\nDigite *\"Quero receber a minha Carta!\"* para começarmos."
    );
  } catch (error) {
    log('Erro ao enviar mensagem de boas-vindas:', error);
    throw error;
  }
}

// Processa a entrada do nome
async function handleNameInput(phoneNumber, name, session) {
  try {
    session.userName = name;
    session.state = 'WAITING_BUSINESS';
    await sessionService.saveSession(phoneNumber, session);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      `Obrigado, ${name}! 😊\n\nPara uma melhor experiência, gostaria de me contar qual é o Nicho do seu Negócio ou trabalho atual e o seu papel nele?\n\n(Caso não queira informar agora, digite *"pular"* para continuar.)`
    );
  } catch (error) {
    log('Erro ao processar nome:', error);
    throw error;
  }
}

// Pergunta sobre a escolha do perfil
async function askForProfileChoice(phoneNumber, session) {
  try {
    session.state = 'WAITING_PROFILE_CHOICE';
    await sessionService.saveSession(phoneNumber, session);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Perfeito! Agora, para gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nVocê escolhe como prefere se apresentar:\n\n1️⃣ Envie um *\"print do seu perfil social\"* (Instagram ou LinkedIn) para uma leitura mais profunda.\n2️⃣ Envie *\"sua foto de perfil\"* (uma imagem que te represente hoje).\n3️⃣ Ou apenas me diga seu @ (ex: @renatohilel.oficial) para uma leitura objetiva.\n\n📝 Envie agora da forma que preferir!"
    );
  } catch (error) {
    log('Erro ao perguntar sobre perfil:', error);
    throw error;
  }
}

// Processa a escolha do perfil
async function handleProfileChoice(phoneNumber, text, session) {
  try {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('@')) {
      // Usuário enviou um nome de usuário
      const username = text.trim();
      session.profileUrl = username;
      session.state = 'WAITING_CHALLENGE';
      await sessionService.saveSession(phoneNumber, session);
      
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Agora me diga, com sinceridade..."
      );
      
      // Pergunta sobre o desafio
      await askForChallenge(phoneNumber);
    } else if (lowerText.includes('http') || lowerText.includes('www') || lowerText.includes('.com')) {
      // Usuário enviou uma URL
      await handleProfileUrl(phoneNumber, text, session);
    } else {
      // Instrui o usuário a enviar uma imagem
      session.state = 'WAITING_PROFILE_IMAGE';
      await sessionService.saveSession(phoneNumber, session);
      
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Por favor, envie uma imagem do seu perfil ou digite seu @ (ex: @renatohilel.oficial)."
      );
    }
  } catch (error) {
    log('Erro ao processar escolha de perfil:', error);
    throw error;
  }
}

// Processa a URL do perfil
async function handleProfileUrl(phoneNumber, url, session) {
  try {
    session.profileUrl = url;
    session.state = 'WAITING_CHALLENGE';
    await sessionService.saveSession(phoneNumber, session);
    
    // Tenta fazer scraping do perfil
    try {
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
    await askForChallenge(phoneNumber);
  } catch (error) {
    log('Erro ao processar URL do perfil:', error);
    throw error;
  }
}

// Pergunta sobre o desafio
async function askForChallenge(phoneNumber) {
  try {
    await whatsappService.sendTextMessage(
      phoneNumber,
      "🌐 *Se você pudesse resolver apenas UM desafio neste momento*,\nque, ao ser superado, traria os resultados que você tanto busca?\n\n(Responda com apenas uma frase)"
    );
  } catch (error) {
    log('Erro ao perguntar sobre desafio:', error);
    throw error;
  }
}

// Processa a entrada do desafio
async function handleChallengeInput(phoneNumber, challenge, session) {
  try {
    session.challenge = challenge;
    session.state = 'GENERATING_LETTER';
    await sessionService.saveSession(phoneNumber, session);
    
    // Envia mensagem de processamento
    await whatsappService.sendTextMessage(
      phoneNumber,
      "⏳ Estou analisando suas informações e preparando sua Carta da Consciênc.IA...\nIsso pode levar alguns instantes...\n\n✨ Sinta-se confortável. A magia está acontecendo."
    );
    
    // Gera a carta
    const letterContent = await generateConscienceLetter(session);
    
    // Divide a carta em seções para evitar cortes
    const sections = splitLetterIntoSections(letterContent);
    
    // Envia cada seção da carta
    for (const section of sections) {
      await whatsappService.sendTextMessage(phoneNumber, section);
    }
    
    // Atualiza o estado da sessão
    session.letterContent = letterContent;
    session.state = 'LETTER_DELIVERED';
    await sessionService.saveSession(phoneNumber, session);
    
    // Envia mensagem de conclusão
    await whatsappService.sendTextMessage(
      phoneNumber,
      "✨ Sua Carta da Consciênc.IA foi entregue! ✨\n\nEspero que tenha gostado da sua Carta! ⭐\n\nPara saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o Programa Consciênc.IA, de Renato Hilel e Nuno Arcanjo.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa! 🌟"
    );
    
    // Envia mensagem sobre o Método S.I.M. e Ikigai
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Antes de irmos, uma última sugestão:\n\nExplore o *Método S.I.M.* (@metodosimbrasil) e o conceito de *Ikigai* (@coworkingikigai).\n\nO Método S.I.M. te ajuda a equilibrar *Saúde, Intuição e Mente*,\nenquanto o Ikigai revela seu propósito autêntico e magnético no mundo dos negócios.\n\n🌐 Se ainda não baixou o *App Oficial do MAPA DO LUCRO*, recomendo que peça agora mesmo o link para a equipe do evento."
    );
    
    // Envia mensagem de ajuda
    await sendHelpMessage(phoneNumber);
  } catch (error) {
    log('Erro ao processar desafio:', error);
    
    // Envia mensagem de erro
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Desculpe, ocorreu um erro ao gerar sua Carta de Consciência. Por favor, tente novamente mais tarde."
    );
    
    throw error;
  }
}

// Gera a Carta de Consciência
async function generateConscienceLetter(session) {
  try {
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
    const letterContent = await contentGenerationService.generateConscienceLetter(userData);
    
    return letterContent;
  } catch (error) {
    log('Erro ao gerar carta:', error);
    throw error;
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
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Se precisar de mais alguma coisa, estou à disposição! 😊\n\nVocê pode:\n\n- Digitar *IA* para receber dicas de como a IA pode ajudar no seu desafio\n- Digitar *Inspiração* para receber uma pílula de inspiração personalizada\n- Perguntar sobre o *Programa Consciênc.IA* ou sobre os mentores *Renato Hilel* e *Nuno Arcanjo*"
    );
  } catch (error) {
    log('Erro ao enviar mensagem de ajuda:', error);
    throw error;
  }
}

// Processa o comando IA
async function handleIACommand(phoneNumber, session) {
  try {
    if (!session.challenge) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Para que eu possa te ajudar com sugestões de IA, preciso saber qual é o seu desafio atual. Por favor, compartilhe comigo qual é o seu maior desafio no momento."
      );
      
      session.state = 'WAITING_CHALLENGE';
      await sessionService.saveSession(phoneNumber, session);
      return;
    }
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Estou gerando sugestões de como a IA pode te ajudar com seu desafio... Um momento."
    );
    
    const iaHelp = await contentGenerationService.generateIAHelp(session.userName, session.challenge);
    
    await whatsappService.sendTextMessage(phoneNumber, iaHelp);
    
    // Envia mensagem de ajuda
    await sendHelpMessage(phoneNumber);
  } catch (error) {
    log('Erro ao processar comando IA:', error);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Desculpe, ocorreu um erro ao gerar sugestões de IA. Por favor, tente novamente mais tarde."
    );
  }
}

// Processa o comando Inspiração
async function handleInspirationCommand(phoneNumber, session) {
  try {
    if (!session.challenge) {
      await whatsappService.sendTextMessage(
        phoneNumber,
        "Para que eu possa te enviar uma inspiração personalizada, preciso saber qual é o seu desafio atual. Por favor, compartilhe comigo qual é o seu maior desafio no momento."
      );
      
      session.state = 'WAITING_CHALLENGE';
      await sessionService.saveSession(phoneNumber, session);
      return;
    }
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Estou canalizando uma inspiração especial para você... Um momento."
    );
    
    const inspiration = await contentGenerationService.generateInspiration(session.userName, session.challenge);
    
    await whatsappService.sendTextMessage(phoneNumber, inspiration);
    
    // Envia mensagem de ajuda
    await sendHelpMessage(phoneNumber);
  } catch (error) {
    log('Erro ao processar comando Inspiração:', error);
    
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Desculpe, ocorreu um erro ao gerar sua inspiração. Por favor, tente novamente mais tarde."
    );
  }
}

// Processa o comando Não
async function handleNoCommand(phoneNumber, session) {
  try {
    await whatsappService.sendTextMessage(
      phoneNumber,
      "Tudo bem! Estou aqui para ajudar quando precisar.\n\nSe quiser receber sua Carta da Consciênc.IA personalizada, é só me avisar digitando *\"Quero receber a minha Carta!\"*"
    );
    
    session.state = 'INITIAL';
    await sessionService.saveSession(phoneNumber, session);
  } catch (error) {
    log('Erro ao processar comando Não:', error);
    throw error;
  }
}

// Envia informações sobre o programa
async function handleProgramInfo(phoneNumber) {
  try {
    await whatsappService.sendTextMessage(
      phoneNumber,
      "🌟 O *Programa Consciênc.IA* foi criado por Renato Hilel e Nuno Arcanjo para ajudar você a escalar seu negócio, sua mentoria ou sua marca pessoal com autenticidade e IA estratégica.\n\nVocê pode se inscrever na lista de espera com benefícios exclusivos pelo site:\n🔗 https://www.floreon.app.br/conscienc-ia\n\nSe quiser conversar com um mentor humano agora, aproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa @renatohilel.oficial e @nunoarcanjo.poeta! 💫"
    );
  } catch (error) {
    log('Erro ao enviar informações sobre o programa:', error);
    throw error;
  }
}
