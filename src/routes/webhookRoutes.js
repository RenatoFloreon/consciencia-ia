import express from 'express';
import { processMessage } from '../controllers/conversationController.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Rota para verificação do webhook do WhatsApp
router.get('/webhook', (req, res) => {
  try {
    // Verifica o token de verificação
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'floreon2025';
    
    // Parâmetros da requisição
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Verifica se o modo e token são válidos
    if (mode === 'subscribe' && token === verifyToken) {
      log('Webhook verificado com sucesso');
      return res.status(200).send(challenge);
    }
    
    // Token inválido
    log('Falha na verificação do webhook', { mode, token });
    return res.sendStatus(403);
  } catch (error) {
    log('Erro na verificação do webhook', error);
    return res.sendStatus(500);
  }
});

// Rota para receber mensagens do WhatsApp
router.post('/webhook', (req, res) => {
  try {
    // Processa a mensagem recebida
    return processMessage(req, res);
  } catch (error) {
    log('Erro no webhook', error);
    return res.sendStatus(500);
  }
});

export default router;
