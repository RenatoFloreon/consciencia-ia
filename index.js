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
// Importar fetch para Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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
    console.log('Recebida solicitação GET para webhook');
    
    // Token de verificação definido por você na configuração do WhatsApp
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'floreon2025';
    
    // Parâmetros da solicitação
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('Mode:', mode);
    console.log('Token:', token);
    console.log('Challenge:', challenge);
    
    // Verificar se o token e o modo são válidos
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        // Responder com o desafio para validar o webhook
        console.log('Webhook validado com sucesso!');
        res.status(200).send(challenge);
    } else {
        // Responder com erro se a validação falhar
        console.error('Falha na validação do webhook');
        res.sendStatus(403);
    }
});

// Rota de webhook para receber mensagens
app.post('/webhook', async (req, res) => {
    console.log('Recebida solicitação POST para webhook');
    
    try {
        // Responder imediatamente para evitar timeout
        res.status(200).send('OK');
        
        const body = req.body;
        console.log('Body completo:', JSON.stringify(body));
        
        // Verificar se é uma mensagem válida do WhatsApp
        if (body.object && 
            body.entry && 
            body.entry[0].changes && 
            body.entry[0].changes[0] && 
            body.entry[0].changes[0].value.messages && 
            body.entry[0].changes[0].value.messages[0]) {
            
            const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
            const from = body.entry[0].changes[0].value.messages[0].from;
            const msgBody = body.entry[0].changes[0].value.messages[0].text?.body;
            
            console.log('Número de telefone ID:', phoneNumberId);
            console.log('De:', from);
            console.log('Mensagem:', msgBody);
            
            // Enviar resposta de boas-vindas
            await enviarMensagemWhatsApp(phoneNumberId, from, "Olá! Bem-vindo à experiência Consciênc.IA para o evento Mapa do Lucro. Estou aqui para criar uma Carta da Consciência personalizada para você. Para começar, poderia me dizer seu nome?");
            
        } else {
            console.log('Recebido webhook inválido ou não é uma mensagem');
            console.log('Conteúdo do body:', JSON.stringify(body));
        }
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
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
        console.log(`Token: ${WHATSAPP_TOKEN.substring(0, 5)}...`);
        
        const response = await fetch(
            `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: to,
                    text: { body: message }
                } )
            }
        );
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Erro na API do WhatsApp: ${response.status} ${response.statusText}`);
            console.error(`Detalhes: ${errorText}`);
            return;
        }
        
        const data = await response.json();
        console.log('Resposta da API do WhatsApp:', JSON.stringify(data));
        return data;
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
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
