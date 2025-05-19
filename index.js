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
app.post('/webhook', (req, res) => {
    console.log('Recebida solicitação POST para webhook');
    console.log('Body:', JSON.stringify(req.body));
    
    // Responder imediatamente para evitar timeout
    res.status(200).send('OK');
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
