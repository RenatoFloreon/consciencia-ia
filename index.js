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

// Rota de webhook para receber mensagens
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (messages && messages[0]) {
      const from = messages[0].from;
      const messageBody = messages[0].text?.body;

      console.log(`[WEBHOOK] Mensagem recebida de ${from}: ${messageBody}`);

      try {
        await axios.post(
          'https://graph.facebook.com/v17.0/624440487421938/messages',
          {
            messaging_product: 'whatsapp',
            to: from,
            text: { body: `Você disse: ${messageBody}` }
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`[WEBHOOK] Resposta enviada para ${from}`);
      } catch (error) {
        console.error('[WEBHOOK] Erro ao responder:', error.response?.data || error.message);
      }
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Função para enviar mensagem via WhatsApp API
async function enviarMensagemWhatsApp(phoneNumberId, to, message) {
    try {
        const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
        
        if (!WHATSAPP_TOKEN) {
            console.error('WHATSAPP_TOKEN não configurado!');
            return;
        }
        
        console.log(`Enviando mensagem para ${to} usando phoneNumberId ${phoneNumberId}`);
        console.log(`Mensagem: ${message}`);
        
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            },
            data: {
                messaging_product: "whatsapp",
                to: to,
                text: { body: message }
            }
        } );
        
        console.log('Resposta da API do WhatsApp:', JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error.message);
        if (error.response) {
            console.error('Detalhes do erro:', JSON.stringify(error.response.data));
        }
        throw error;
    }
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
