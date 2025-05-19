require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

const app = express();

// Middleware de parsing do body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de visualizações (EJS)
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'ejs');

// Configuração de sessão (em memória, 24h, usando SECRET do .env)
const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000  // 24 horas
    }
};
app.use(session(sessionConfig));

// Rotas do Webhook e Admin
const webhookRoutes = require('./src/routes/webhookRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
app.use('/webhook', webhookRoutes);
app.use('/admin', adminRoutes);

// Rotas auxiliares
app.get('/', (req, res) => {
    res.send('Consciênc.IA - API em funcionamento');
});
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
    console.log(`Servidor iniciado na porta ${PORT} - ${new Date().toISOString()}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
