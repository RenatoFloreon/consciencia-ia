import express from 'express';
import { processMessage } from '../controllers/conversationController.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Rota para verificação do webhook do WhatsApp
router.get('/webhook', (req, res) => {
  try {
    log('GET /webhook - Solicitação de verificação recebida');
    
    // Verifica o token de verificação
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'floreon2025';
    
    // Parâmetros da requisição
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    log('Parâmetros de verificação:', { mode, token, challenge: !!challenge });
    
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

// Na rota POST /webhook
router.post('/webhook', (req, res) => {
  try {
    log('POST /webhook - Mensagem recebida');
    log('Corpo da requisição:', JSON.stringify(req.body));
    
    // Responde imediatamente para evitar timeout
    res.status(200).send('OK');
    
    // Processa a mensagem recebida de forma assíncrona
    processMessage(req, req.body)  // Modificado para passar o corpo da requisição diretamente
      .then(() => {
        log('Mensagem processada com sucesso');
      })
      .catch(err => {
        log('Erro ao processar mensagem:', err);
      });
  } catch (error) {
    log('Erro no webhook:', error);
  }
});

export default router;
