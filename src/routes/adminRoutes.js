/**
 * @fileoverview Rotas para o painel administrativo.
 * Inclui autenticação básica e endpoints para dados de interações e estatísticas.
 */

const express = require('express');
const router = express.Router();
const sessionStore = require('../utils/sessionStore');
const { logInfo, logError } = require('../utils/logger');
const config = require('../config/env');

// Middleware de autenticação (Basic Auth ou sessão)
const authMiddleware = (req, res, next) => {
    // Verificar sessão existente
    if (req.session && req.session.authenticated) {
        return next();
    }
    // Verificar credenciais via Basic Auth
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
        const username = auth[0];
        const password = auth[1];
        if (username === config.ADMIN_USERNAME && password === config.ADMIN_PASSWORD) {
            // Autenticar e salvar na sessão
            req.session.authenticated = true;
            req.session.username = username;
            return next();
        }
    }
    // Não autenticado: solicitar autenticação
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).send('Autenticação requerida');
};

// Aplicar authMiddleware em todas as rotas /admin
router.use(authMiddleware);

// Rota principal do painel (dashboard)
router.get('/', (req, res) => {
    try {
        res.render('admin/dashboard', {
            title: 'Painel Administrativo - Consciênc.IA',
            username: req.session.username
        });
    } catch (error) {
        logError('ADMIN_PANEL', 'Erro ao renderizar dashboard', error);
        res.status(500).send('Erro ao carregar o painel administrativo');
    }
});

// API: obter últimas interações registradas
router.get('/api/interactions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const interactions = await sessionStore.getAllInteractions(limit);
        if (interactions === null) {
            return res.status(500).json({ error: 'Erro ao obter interações' });
        }
        return res.json(interactions);
    } catch (error) {
        logError('ADMIN_API', 'Erro ao obter interações', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// API: obter estatísticas gerais das interações
router.get('/api/stats', async (req, res) => {
    try {
        const interactions = await sessionStore.getAllInteractions(1000);
        if (interactions === null) {
            return res.status(500).json({ error: 'Erro ao obter interações' });
        }
        // Calcular estatísticas simples
        const total = interactions.length;
        const delivered = interactions.filter(i => i.type === 'letter_delivered').length;
        const followups = interactions.filter(i => i.type === 'followup_question').length;
        const profilesAnalyzed = interactions.filter(i => i.profileUrl && i.type === 'letter_delivered').length;
        const genericLetters = interactions.filter(i => i.letterIsGeneric && i.type === 'letter_delivered').length;
        const personalizedLetters = interactions.filter(i => !i.letterIsGeneric && i.type === 'letter_delivered').length;
        // Contagens agregadas de desafios
        const businessChallenges = {};
        const personalChallenges = {};
        interactions.forEach(i => {
            if (i.businessChallenge) {
                const key = i.businessChallenge.toLowerCase();
                businessChallenges[key] = (businessChallenges[key] || 0) + 1;
            }
            if (i.personalChallenge) {
                const key = i.personalChallenge.toLowerCase();
                personalChallenges[key] = (personalChallenges[key] || 0) + 1;
            }
        });
        const stats = { total, delivered, followups, profilesAnalyzed, genericLetters, personalizedLetters, businessChallenges, personalChallenges };
        return res.json(stats);
    } catch (error) {
        logError('ADMIN_API', 'Erro ao obter estatísticas', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para exportar dados em CSV (interações tipo carta entregue)
router.get('/export/csv', async (req, res) => {
    try {
        const interactions = await sessionStore.getAllInteractions(1000);
        if (interactions === null) {
            return res.status(500).send('Erro ao obter interações');
        }
        const letterInteractions = interactions.filter(i => i.type === 'letter_delivered');
        // Cabeçalho CSV
        let csv = 'Nome,Email,Telefone,Desafio de Negócio,Desafio Pessoal,Perfil URL,Data\n';
        // Linhas CSV
        letterInteractions.forEach(i => {
            const row = [
                i.name || '',
                i.email || '',
                i.phoneNumber || '',
                i.businessChallenge || '',
                i.personalChallenge || '',
                i.profileUrl || '',
                i.timestampFormatted || ''
            ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
            csv += row + '\n';
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="consciencia_dados.csv"');
        return res.send(csv);
    } catch (error) {
        logError('ADMIN_EXPORT', 'Erro ao exportar dados CSV', error);
        res.status(500).send('Erro ao exportar dados');
    }
});

// Rota de logout do painel
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin');
});

module.exports = router;
