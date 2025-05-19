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
const { logInfo, logError } = require('./src/utils/logger');

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
