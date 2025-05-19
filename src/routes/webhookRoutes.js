/**
 * @fileoverview Rotas para o webhook do WhatsApp
 * Este módulo define as rotas para receber e processar webhooks do WhatsApp.
 */

import express from 'express';
const router = express.Router();
import conversationController from '../controllers/conversationController.js';
import whatsappService from '../services/whatsappService.js';
import { logInfo, logError } from '../utils/logger.js';
import config from '../config/env.js';

// Rota para verificação do webhook (GET)
router.get('/', (req, res) => {
    const verificationResult = whatsappService.verifyWebhook(req.query);
    
    if (verificationResult.isValid) {
        logInfo('WEBHOOK', 'Verificação de webhook bem-sucedida');
        res.status(200).send(verificationResult.challenge);
    } else {
        logError('WEBHOOK', 'Falha na verificação de webhook: token inválido');
        res.sendStatus(403);
    }
});

// Rota para receber mensagens do webhook (POST)
router.post('/', async (req, res) => {
    try {
        // Responder imediatamente para evitar timeout
        res.status(200).send('EVENT_RECEIVED');
        
        // Processar a mensagem de forma assíncrona
        const webhookData = req.body;
        logInfo('WEBHOOK', `Webhook recebido: ${JSON.stringify(webhookData)}`);
        
        // Verificar se é uma mensagem válida
        const messageInfo = whatsappService.processWebhookMessage(webhookData);
        
        if (!messageInfo) {
            logInfo('WEBHOOK', 'Webhook não contém mensagem válida');
            return;
        }
        
        // Processar a mensagem recebida
        const result = await conversationController.processIncomingMessage(messageInfo);
        
        logInfo('WEBHOOK', `Mensagem processada: ${JSON.stringify(result)}`);
    } catch (error) {
        logError('WEBHOOK', 'Erro ao processar webhook', error);
    }
});

export default router;
