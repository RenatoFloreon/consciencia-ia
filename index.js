/**
 * @fileoverview Arquivo principal da aplicação
 * Este é o ponto de entrada da aplicação, configurando o servidor Express,
 * middleware, rotas e inicializando os serviços necessários.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const crypto = require('crypto');
const config = require('./src/config/env');
const redisService = require('./src/services/redisService');
const { logInfo, logError } = require('./src/utils/logger');
const webhookRoutes = require('./src/routes/webhookRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

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

// Configuração de sessão sem depender do Redis inicialmente
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

app.use(session(sessionConfig));

// Inicializar Redis de forma resiliente
(async () => {
    try {
        const redisInitialized = await redisService.initRedis();
        if (!redisInitialized) {
            logError('APP_INIT', 'Falha ao inicializar Redis. A aplicação continuará, mas algumas funcionalidades podem não funcionar corretamente.');
        } else {
            logInfo('APP_INIT', 'Redis inicializado com sucesso.');
            
            // Configurar sessão com Redis após inicialização bem-sucedida
            const redisClient = redisService.getRedisClient();
            
            if (redisClient) {
                // Configurar armazenamento de sessão no Redis
                const sessionStore = new RedisStore({ 
                    client: redisClient,
                    prefix: 'session:'
                });
                
                // Atualizar configuração de sessão para usar Redis
                app.use(session({
                    ...sessionConfig,
                    store: sessionStore
                }));
                
                logInfo('APP_INIT', 'Sessão configurada com Redis Store.');
            } else {
                logError('APP_INIT', 'Cliente Redis não disponível para configuração de sessão.');
            }
        }
    } catch (error) {
        logError('APP_INIT', 'Erro ao inicializar Redis', error);
        console.warn('Continuando sem Redis. Algumas funcionalidades podem não funcionar corretamente.');
    }
    
    // Configurar rotas
    app.use('/webhook', webhookRoutes);
    app.use('/admin', adminRoutes);
    
    // Rota raiz
    app.get('/', (req, res) => {
        res.render('index', { 
            title: 'Consciênc.IA - Evento Mapa do Lucro',
            description: 'Experiência com IA para o evento Mapa do Lucro'
        });
    });
    
    // Rota de verificação de saúde para a Vercel
    app.get('/api/health', (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // Tratamento de erros 404
    app.use((req, res, next) => {
        res.status(404).render('error', { 
            title: 'Página não encontrada',
            message: 'A página que você está procurando não existe.',
            error: { status: 404 }
        });
    });
    
    // Tratamento de erros gerais
    app.use((err, req, res, next) => {
        logError('APP_ERROR', 'Erro não tratado', err);
        
        res.status(err.status || 500).render('error', {
            title: 'Erro',
            message: process.env.NODE_ENV === 'production' ? 'Ocorreu um erro interno.' : err.message,
            error: process.env.NODE_ENV === 'production' ? {} : err
        });
    });
    
    // Iniciar servidor
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        logInfo('APP_INIT', `Servidor iniciado na porta ${PORT} em ${new Date().toISOString()}`);
        logInfo('APP_INIT', `Ambiente: ${process.env.NODE_ENV || 'development'}`);
        logInfo('APP_INIT', `Configurações carregadas: ${config.isValid ? 'OK' : 'COM ERROS'}`);
    });
})();

// Tratamento de encerramento gracioso
process.on('SIGTERM', () => {
    logInfo('APP_SHUTDOWN', 'Recebido sinal SIGTERM, encerrando graciosamente...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logInfo('APP_SHUTDOWN', 'Recebido sinal SIGINT, encerrando graciosamente...');
    process.exit(0);
});

module.exports = app;
