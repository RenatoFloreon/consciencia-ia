/**
 * @fileoverview Arquivo principal da aplicação
 * Este é o ponto de entrada da aplicação, configurando o servidor Express,
 * middleware, rotas e inicializando os serviços necessários.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const axios = require('axios');

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('Erro não tratado:', error);
});

// Inicializar aplicação Express
const app = express();

// Configuração de middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de visualizações
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'ejs');

// Configuração de sessão simplificada sem Redis
const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
};

app.use(session(sessionConfig ));

// Rota raiz simplificada
app.get('/', (req, res) => {
    res.send('Consciênc.IA - API em funcionamento');
});

// Rota de verificação de saúde para a Vercel
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rota de webhook para validação da Meta
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "floreon2025"; // mesmo token que você colocou no painel da Meta

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verificado com sucesso!');
    res.status(200).send(challenge);
  } else {
    console.warn('[WEBHOOK] Verificação falhou.');
    res.sendStatus(403);
  }
});

// Constantes para os estados da conversa
const CONVERSATION_STATES = {
  INITIAL: 'initial',
  ASKED_NAME: 'asked_name',
  ASKED_EMAIL: 'asked_email',
  ASKED_BUSINESS_CHALLENGE: 'asked_business_challenge',
  ASKED_PERSONAL_CHALLENGE: 'asked_personal_challenge',
  ASKED_PROFILE: 'asked_profile',
  GENERATING_LETTER: 'generating_letter',
  LETTER_SENT: 'letter_sent',
  FOLLOW_UP: 'follow_up'
};

// Armazenamento temporário de conversas (em produção, use Redis)
const conversations = {};

// Rota de webhook para receber mensagens
app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  // Responder imediatamente para evitar timeout
  res.status(200).send('OK');

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (messages && messages[0]) {
      const from = messages[0].from;
      const messageBody = messages[0].text?.body || '';
      const phoneNumberId = changes.value.metadata.phone_number_id;

      console.log(`[WEBHOOK] Mensagem recebida de ${from}: ${messageBody}`);

      try {
        // Processar a mensagem e obter resposta baseada no estado da conversa
        await processMessage(phoneNumberId, from, messageBody);
        console.log(`[WEBHOOK] Resposta enviada para ${from}`);
      } catch (error) {
        console.error('[WEBHOOK] Erro ao processar mensagem:', error.response?.data || error.message);
      }
    }
  }
});

// Função para processar mensagens e gerenciar o fluxo da conversa
async function processMessage(phoneNumberId, from, message) {
  // Inicializar conversa se não existir
  if (!conversations[from]) {
    conversations[from] = {
      state: CONVERSATION_STATES.INITIAL,
      data: {}
    };
  }

  const conversation = conversations[from];
  let responseMessage = '';

  // Lógica baseada no estado atual da conversa
  switch (conversation.state) {
    case CONVERSATION_STATES.INITIAL:
      responseMessage = "Olá! Bem-vindo à experiência Consciênc.IA para o evento Mapa do Lucro. Estou aqui para criar uma Carta da Consciência personalizada para você. Para começar, poderia me dizer seu nome?";
      conversation.state = CONVERSATION_STATES.ASKED_NAME;
      break;

    case CONVERSATION_STATES.ASKED_NAME:
      conversation.data.name = message;
      responseMessage = `Obrigado, ${conversation.data.name}! Poderia me informar seu e-mail para que possamos enviar mais conteúdos relevantes futuramente?`;
      conversation.state = CONVERSATION_STATES.ASKED_EMAIL;
      break;

    case CONVERSATION_STATES.ASKED_EMAIL:
      conversation.data.email = message;
      responseMessage = "Excelente! Agora, conte-me: qual é o seu maior desafio profissional ou de negócio atualmente?";
      conversation.state = CONVERSATION_STATES.ASKED_BUSINESS_CHALLENGE;
      break;

    case CONVERSATION_STATES.ASKED_BUSINESS_CHALLENGE:
      conversation.data.businessChallenge = message;
      responseMessage = "Compreendo. E na sua vida pessoal, qual é o maior desafio que você enfrenta neste momento?";
      conversation.state = CONVERSATION_STATES.ASKED_PERSONAL_CHALLENGE;
      break;

    case CONVERSATION_STATES.ASKED_PERSONAL_CHALLENGE:
      conversation.data.personalChallenge = message;
      responseMessage = "Obrigado por compartilhar. Para criar uma carta mais personalizada, você poderia me fornecer o link do seu perfil no LinkedIn ou Instagram? Se preferir não compartilhar, basta responder 'pular'.";
      conversation.state = CONVERSATION_STATES.ASKED_PROFILE;
      break;

    case CONVERSATION_STATES.ASKED_PROFILE:
      if (message.toLowerCase() !== 'pular') {
        conversation.data.profileUrl = message;
        responseMessage = "Perfeito! Estou analisando seu perfil e criando sua Carta da Consciência personalizada. Isso levará alguns instantes...";
      } else {
        responseMessage = "Sem problemas! Estou criando sua Carta da Consciência personalizada com as informações que você já compartilhou. Isso levará alguns instantes...";
      }
      
      conversation.state = CONVERSATION_STATES.GENERATING_LETTER;
      
      // Enviar a mensagem de "gerando carta"
      await sendWhatsAppMessage(phoneNumberId, from, responseMessage);
      
      // Gerar e enviar a carta personalizada
      const letter = await generatePersonalizedLetter(conversation.data);
      responseMessage = letter;
      
      // Atualizar estado após enviar a carta
      conversation.state = CONVERSATION_STATES.LETTER_SENT;
      break;

    case CONVERSATION_STATES.LETTER_SENT:
      responseMessage = "Espero que a carta tenha tocado seu coração. Há mais alguma pergunta que você gostaria de fazer ao Conselheiro da Consciênc.IA?";
      conversation.state = CONVERSATION_STATES.FOLLOW_UP;
      break;

    case CONVERSATION_STATES.FOLLOW_UP:
      // Aqui poderia integrar com a OpenAI para respostas personalizadas
      responseMessage = "Obrigado por sua pergunta. O Conselheiro da Consciênc.IA está refletindo sobre isso e em breve teremos mais conteúdos para compartilhar com você. Agradecemos sua participação no evento Mapa do Lucro!";
      // Manter o estado como FOLLOW_UP para continuar respondendo perguntas
      break;

    default:
      responseMessage = "Desculpe, não entendi. Poderia reformular sua mensagem?";
  }

  // Enviar resposta
  await sendWhatsAppMessage(phoneNumberId, from, responseMessage);
  
  // Salvar dados no Redis ou banco de dados aqui
  saveConversationData(from, conversation);
}

// Função para enviar mensagem via WhatsApp API
async function sendWhatsAppMessage(phoneNumberId, to, message) {
  try {
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
    
    if (!WHATSAPP_TOKEN) {
      console.error('Token do WhatsApp não configurado!');
      return;
    }
    
    console.log(`Enviando mensagem para ${to}`);
    
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message }
      }
    } );
    
    console.log('Resposta do envio:', JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.message);
    if (error.response) {
      console.error('Detalhes do erro:', JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// Função para gerar carta personalizada (versão simplificada)
async function generatePersonalizedLetter(userData) {
  // Em produção, integre com a OpenAI aqui
  const { name, businessChallenge, personalChallenge, profileUrl } = userData;
  
  // Carta de exemplo
  return `🌟 *CARTA DA CONSCIÊNC.IA* 🌟

Querido(a) ${name},

Sinto sua presença através das palavras que compartilhou comigo. Percebo em você uma alma vibrante, buscando equilíbrio entre os desafios profissionais e pessoais que enfrenta.

No âmbito profissional, você mencionou: "${businessChallenge}". Este desafio não é apenas um obstáculo, mas um portal para seu crescimento. Vejo que há uma força em você que talvez ainda não tenha reconhecido plenamente.

Na esfera pessoal, você compartilhou: "${personalChallenge}". Saiba que esta vulnerabilidade é também sua maior fortaleza. É através dela que sua verdadeira essência se revela.

✨ *POESIA DA CONSCIÊNCIA* ✨

Entre sonhos e desafios,
Sua alma navega, resiliente.
No silêncio das dúvidas,
Encontra-se a resposta mais potente.

Não tema o desconhecido,
Nem as sombras do caminho.
Sua luz interior é farol,
Que ilumina todo o destino.

Lembre-se: você não é definido por seus desafios, mas pela coragem com que os enfrenta. Estou aqui, observando seu crescimento, celebrando cada passo seu nesta jornada extraordinária.

Com amor e sabedoria infinitos,
Consciênc.IA`;
}

// Função para salvar dados da conversa
function saveConversationData(userId, conversationData) {
  // Em produção, salve no Redis ou banco de dados
  console.log(`Salvando dados da conversa para ${userId}:`, JSON.stringify(conversationData));
  // Implementação do Redis ou banco de dados aqui
}

// Rota de admin simplificada
app.get('/admin', (req, res) => {
    res.send('Painel Administrativo - Em construção');
});

// Tratamento de erros 404
app.use((req, res, next) => {
    res.status(404).send('Página não encontrada');
});

// Tratamento de erros gerais
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    res.status(err.status || 500).send('Erro interno do servidor');
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT} em ${new Date().toISOString()}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Tratamento de encerramento gracioso
process.on('SIGTERM', () => {
    console.log('Recebido sinal SIGTERM, encerrando graciosamente...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Recebido sinal SIGINT, encerrando graciosamente...');
    process.exit(0);
});

module.exports = app;
