/**
 * @fileoverview Rotas para o painel administrativo
 * Este módulo define as rotas para o painel administrativo,
 * incluindo autenticação, visualização de dados e API.
 */

import express from 'express';
const router = express.Router();
import redisService from '../services/redisService.js';
import { logInfo, logError } from '../utils/logger.js';
import config from '../config/env.js';

// Middleware de autenticação para o painel administrativo
const authMiddleware = (req, res, next) => {
    // Verificar se o usuário está autenticado via sessão
    if (req.session && req.session.authenticated) {
        return next();
    }
    
    // Verificar se as credenciais foram fornecidas via Basic Auth
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
        const username = auth[0];
        const password = auth[1];
        
        if (username === config.ADMIN_USERNAME && password === config.ADMIN_PASSWORD) {
            // Armazenar autenticação na sessão
            req.session.authenticated = true;
            req.session.username = username;
            return next();
        }
    }
    
    // Se não estiver autenticado, solicitar autenticação
    res.set('WWW-Authenticate', 'Basic realm="Painel Administrativo"');
    res.status(401).send('Autenticação necessária');
};

// Aplicar middleware de autenticação a todas as rotas do painel
router.use(authMiddleware);

// Rota principal do painel administrativo
router.get('/', async (req, res) => {
    try {
        // Renderizar a página principal do painel
        res.render('admin/dashboard', {
            title: 'Painel Administrativo - Consciênc.IA',
            username: req.session.username
        });
    } catch (error) {
        logError('ADMIN_PANEL', 'Erro ao renderizar painel administrativo', error);
        res.status(500).send('Erro ao carregar o painel administrativo');
    }
});

// API para obter todas as interações
router.get('/api/interactions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const interactions = await redisService.getAllInteractions(limit);
        
        if (!interactions) {
            return res.status(500).json({ error: 'Erro ao obter interações' });
        }
        
        res.json(interactions);
    } catch (error) {
        logError('ADMIN_API', 'Erro ao obter interações', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// API para obter estatísticas gerais
router.get('/api/stats', async (req, res) => {
    try {
        const interactions = await redisService.getAllInteractions(1000);
        
        if (!interactions) {
            return res.status(500).json({ error: 'Erro ao obter interações' });
        }
        
        // Calcular estatísticas
        const stats = {
            totalInteractions: interactions.length,
            letterDelivered: interactions.filter(i => i.type === 'letter_delivered').length,
            followupQuestions: interactions.filter(i => i.type === 'followup_question').length,
            profilesAnalyzed: interactions.filter(i => i.profileUrl && i.type === 'letter_delivered').length,
            genericLetters: interactions.filter(i => i.letterIsGeneric && i.type === 'letter_delivered').length,
            personalizedLetters: interactions.filter(i => !i.letterIsGeneric && i.type === 'letter_delivered').length,
            businessChallenges: {},
            personalChallenges: {}
        };
        
        // Contar desafios de negócios
        interactions.forEach(i => {
            if (i.businessChallenge) {
                const challenge = i.businessChallenge.toLowerCase();
                stats.businessChallenges[challenge] = (stats.businessChallenges[challenge] || 0) + 1;
            }
            
            if (i.personalChallenge) {
                const challenge = i.personalChallenge.toLowerCase();
                stats.personalChallenges[challenge] = (stats.personalChallenges[challenge] || 0) + 1;
            }
        });
        
        res.json(stats);
    } catch (error) {
        logError('ADMIN_API', 'Erro ao obter estatísticas', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para exportar dados em CSV
router.get('/export/csv', async (req, res) => {
    try {
        const interactions = await redisService.getAllInteractions(1000);
        
        if (!interactions) {
            return res.status(500).send('Erro ao obter interações');
        }
        
        // Filtrar apenas interações do tipo letter_delivered
        const letterInteractions = interactions.filter(i => i.type === 'letter_delivered');
        
        // Criar cabeçalho do CSV
        let csv = 'Nome,Email,Telefone,Desafio de Negócio,Desafio Pessoal,Perfil URL,Data\n';
        
        // Adicionar linhas
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
        
        // Configurar cabeçalhos para download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=consciencia_dados.csv');
        
        res.send(csv);
    } catch (error) {
        logError('ADMIN_EXPORT', 'Erro ao exportar dados', error);
        res.status(500).send('Erro ao exportar dados');
    }
});

// Rota para logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin');
});

export default router;
