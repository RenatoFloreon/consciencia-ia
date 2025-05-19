/**
 * @fileoverview Rotas para o webhook do WhatsApp.
 * Lida com a verificação do webhook (GET) e com as mensagens recebidas (POST).
 */

const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const whatsappService = require('../services/whatsappService');
const { logInfo, logError } = require('../utils/logger');
const config = require('../config/env');

// Rota GET para verificação do webhook (desafio do token)
router.get('/', (req, res) => {
    const verification = whatsappService.verifyWebhook(req.query);
    if (verification.isValid) {
        logInfo('WEBHOOK', 'Verificação do webhook realizada com sucesso.');
        return res.status(200).send(verification.challenge);
    }
    logError('WEBHOOK', 'Falha na verificação do webhook.');
    return res.sendStatus(403);
});

// Rota POST para receber mensagens do webhook do WhatsApp
router.post('/', async (req, res) => {
    try {
        // Resposta imediata para evitar timeout do webhook
        res.status(200).send('EVENT_RECEIVED');
        const webhookData = req.body;
        logInfo('WEBHOOK', `Dados recebidos no webhook: ${JSON.stringify(webhookData)}`);
        // Processar mensagem recebida
        const messageInfo = whatsappService.processWebhookMessage(webhookData);
        if (!messageInfo) {
            logInfo('WEBHOOK', 'Webhook recebido não continha mensagem de usuário.');
            return;
        }
        // Delegar processamento da mensagem ao controlador de conversa
        await conversationController.processIncomingMessage(messageInfo);
    } catch (error) {
        logError('WEBHOOK', 'Erro ao processar requisição POST do webhook', error);
    }
});

module.exports = router;
