/**
 * @fileoverview Controlador para gerenciamento do fluxo de conversação
 * Este módulo implementa a lógica de controle do fluxo conversacional,
 * gerenciando estados, transições e processamento de mensagens.
 */

const redisService = require('../services/redisService');
const whatsappService = require('../services/whatsappService');
const profileScraperService = require('../services/profileScraperService');
const contentGenerationService = require('../services/contentGenerationService');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

/**
 * Processa uma mensagem recebida e gerencia o fluxo da conversa
 * @param {Object} messageInfo - Informações da mensagem recebida
 * @returns {Promise<Object>} Resultado do processamento
 */
const processIncomingMessage = async (messageInfo) => {
    try {
        if (!messageInfo || !messageInfo.from || !messageInfo.text) {
            logWarning('CONVERSATION_FLOW', 'Mensagem recebida inválida ou incompleta');
            return { success: false, error: 'Mensagem inválida' };
        }

        const phoneNumber = messageInfo.from;
        const messageText = messageInfo.text.trim();
        
        // Verificar comandos especiais
        if (messageText.toLowerCase() === 'reset' || messageText.toLowerCase() === 'reiniciar') {
            await redisService.resetUserConversation(phoneNumber);
            await whatsappService.sendWhatsappMessage(
                phoneNumber, 
                "Sua conversa foi reiniciada. Vamos começar novamente!\n\n" + config.WELCOME_MESSAGE_1
            );
            return { success: true, action: 'reset' };
        }

        // Obter estado atual da conversa
        let currentState = await redisService.getUserState(phoneNumber);
        let userData = await redisService.getUserData(phoneNumber) || { phoneNumber };
        
        // Se não houver estado (novo usuário), iniciar fluxo
        if (!currentState) {
            currentState = redisService.CONVERSATION_STATES.NEW;
            await redisService.saveUserState(phoneNumber, currentState);
        }

        // Processar mensagem de acordo com o estado atual
        switch (currentState) {
            case redisService.CONVERSATION_STATES.NEW:
                // Enviar mensagem de boas-vindas e solicitar nome
                await whatsappService.sendWhatsappMessage(phoneNumber, config.WELCOME_MESSAGE_1);
                await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.AWAITING_NAME);
                return { success: true, action: 'welcome_sent' };
                
            case redisService.CONVERSATION_STATES.AWAITING_NAME:
                // Processar nome recebido e solicitar e-mail
                userData.name = messageText;
                await redisService.updateUserData(phoneNumber, userData);
                
                // Enviar mensagem personalizada solicitando e-mail
                const emailRequestMessage = config.WELCOME_MESSAGE_2.replace('{nome}', userData.name);
                await whatsappService.sendWhatsappMessage(phoneNumber, emailRequestMessage);
                await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.AWAITING_EMAIL);
                return { success: true, action: 'name_processed' };
                
            case redisService.CONVERSATION_STATES.AWAITING_EMAIL:
                // Processar e-mail recebido e solicitar perfil
                if (messageText.toLowerCase() === 'pular') {
                    userData.email = 'não informado';
                } else {
                    userData.email = messageText;
                }
                await redisService.updateUserData(phoneNumber, userData);
                
                // Solicitar perfil de rede social
                await whatsappService.sendWhatsappMessage(phoneNumber, config.PROFILE_REQUEST_MESSAGE);
                await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.AWAITING_PROFILE);
                return { success: true, action: 'email_processed' };
                
            case redisService.CONVERSATION_STATES.AWAITING_PROFILE:
                // Processar perfil recebido e solicitar desafio de negócio
                userData.profileUrl = messageText;
                await redisService.updateUserData(phoneNumber, userData);
                
                // Solicitar desafio de negócio
                await whatsappService.sendWhatsappMessage(phoneNumber, config.BUSINESS_CHALLENGE_MESSAGE);
                await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.AWAITING_BUSINESS_CHALLENGE);
                return { success: true, action: 'profile_processed' };
                
            case redisService.CONVERSATION_STATES.AWAITING_BUSINESS_CHALLENGE:
                // Processar desafio de negócio e solicitar desafio pessoal
                userData.businessChallenge = messageText;
                await redisService.updateUserData(phoneNumber, userData);
                
                // Solicitar desafio pessoal
                await whatsappService.sendWhatsappMessage(phoneNumber, config.PERSONAL_CHALLENGE_MESSAGE);
                await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.AWAITING_PERSONAL_CHALLENGE);
                return { success: true, action: 'business_challenge_processed' };
                
            case redisService.CONVERSATION_STATES.AWAITING_PERSONAL_CHALLENGE:
                // Processar desafio pessoal e iniciar geração da carta
                userData.personalChallenge = messageText;
                await redisService.updateUserData(phoneNumber, userData);
                
                // Enviar mensagem de processamento
                await whatsappService.sendWhatsappMessage(phoneNumber, config.PROCESSING_MESSAGE);
                await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.PROCESSING_LETTER);
                
                // Iniciar processamento assíncrono da carta
                generateAndSendLetter(phoneNumber, userData);
                
                return { success: true, action: 'personal_challenge_processed' };
                
            case redisService.CONVERSATION_STATES.LETTER_DELIVERED:
                // Processar perguntas de acompanhamento após entrega da carta
                const letterData = userData.letterData;
                
                if (!letterData) {
                    logWarning('CONVERSATION_FLOW', `Dados da carta não encontrados para ${phoneNumber}`);
                    await whatsappService.sendWhatsappMessage(
                        phoneNumber, 
                        "Desculpe, não consegui encontrar sua Carta de Consciência. Você gostaria de gerar uma nova? Responda 'reset' para recomeçar."
                    );
                    return { success: false, error: 'Dados da carta não encontrados' };
                }
                
                // Gerar resposta para a pergunta de acompanhamento
                const answer = await contentGenerationService.answerFollowUpQuestion(
                    messageText,
                    userData,
                    letterData
                );
                
                if (answer) {
                    await whatsappService.sendWhatsappMessage(phoneNumber, answer);
                    
                    // Registrar interação para o painel administrativo
                    await redisService.logInteraction({
                        type: 'followup_question',
                        phoneNumber,
                        name: userData.name,
                        email: userData.email,
                        question: messageText,
                        answer
                    });
                    
                    return { success: true, action: 'followup_answered' };
                } else {
                    await whatsappService.sendWhatsappMessage(
                        phoneNumber, 
                        "Desculpe, não consegui processar sua pergunta. Poderia reformulá-la?"
                    );
                    return { success: false, error: 'Falha ao gerar resposta' };
                }
                
            case redisService.CONVERSATION_STATES.PROCESSING_LETTER:
                // Informar que a carta ainda está sendo processada
                await whatsappService.sendWhatsappMessage(
                    phoneNumber, 
                    "Ainda estou trabalhando na sua Carta de Consciência personalizada. Isso pode levar alguns instantes. Agradeço sua paciência! ✨"
                );
                return { success: true, action: 'processing_notification_sent' };
                
            default:
                // Estado desconhecido, resetar conversa
                logWarning('CONVERSATION_FLOW', `Estado desconhecido para ${phoneNumber}: ${currentState}`);
                await redisService.resetUserConversation(phoneNumber);
                await whatsappService.sendWhatsappMessage(
                    phoneNumber, 
                    "Desculpe, ocorreu um erro no fluxo da conversa. Vamos recomeçar!\n\n" + config.WELCOME_MESSAGE_1
                );
                return { success: false, error: 'Estado desconhecido', action: 'reset' };
        }
    } catch (error) {
        logError('CONVERSATION_FLOW', 'Erro ao processar mensagem recebida', error);
        return { success: false, error: error.message };
    }
};

/**
 * Gera e envia a Carta de Consciência personalizada
 * @param {string} phoneNumber - Número de telefone do usuário
 * @param {Object} userData - Dados do usuário
 * @returns {Promise<void>}
 */
const generateAndSendLetter = async (phoneNumber, userData) => {
    try {
        logInfo('LETTER_GENERATION', `Iniciando geração da carta para ${userData.name} (${phoneNumber})`);
        
        // Analisar perfil (se fornecido)
        let profileAnalysis = null;
        
        if (userData.profileUrl && (userData.profileUrl.includes('instagram.com') || userData.profileUrl.includes('linkedin.com'))) {
            logInfo('LETTER_GENERATION', `Analisando perfil: ${userData.profileUrl}`);
            
            // Usar abordagem híbrida para análise de perfil
            profileAnalysis = await profileScraperService.analyzeProfileHybrid(userData.profileUrl);
            
            if (profileAnalysis) {
                logInfo('LETTER_GENERATION', `Análise de perfil concluída com sucesso`);
                
                // Atualizar dados do usuário com a análise do perfil
                userData.profileAnalysis = profileAnalysis;
                await redisService.updateUserData(phoneNumber, userData);
            } else {
                logWarning('LETTER_GENERATION', `Falha na análise do perfil. Gerando carta genérica.`);
            }
        } else {
            logInfo('LETTER_GENERATION', `Perfil não fornecido ou inválido. Gerando carta genérica.`);
        }
        
        // Gerar a carta personalizada
        const letterData = await contentGenerationService.generateConscienceLetter(userData, profileAnalysis);
        
        if (!letterData) {
            logError('LETTER_GENERATION', `Falha ao gerar carta para ${phoneNumber}`);
            await whatsappService.sendWhatsappMessage(
                phoneNumber, 
                "Desculpe, encontrei um problema ao gerar sua Carta de Consciência. Por favor, tente novamente mais tarde ou digite 'reset' para recomeçar."
            );
            return;
        }
        
        // Atualizar dados do usuário com a carta gerada
        userData.letterData = letterData;
        await redisService.updateUserData(phoneNumber, userData);
        
        // Enviar a carta para o usuário
        await whatsappService.sendWhatsappMessage(phoneNumber, letterData.fullLetter);
        
        // Enviar mensagem final
        await whatsappService.sendWhatsappMessage(phoneNumber, config.FINAL_MESSAGE);
        
        // Atualizar estado da conversa
        await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.LETTER_DELIVERED);
        
        // Registrar interação completa para o painel administrativo
        await redisService.logInteraction({
            type: 'letter_delivered',
            phoneNumber,
            name: userData.name,
            email: userData.email,
            businessChallenge: userData.businessChallenge,
            personalChallenge: userData.personalChallenge,
            profileUrl: userData.profileUrl,
            letterIsGeneric: letterData.isGeneric
        });
        
        logInfo('LETTER_GENERATION', `Carta enviada com sucesso para ${phoneNumber}`);
    } catch (error) {
        logError('LETTER_GENERATION', `Erro ao gerar e enviar carta`, error);
        
        // Notificar usuário sobre o erro
        await whatsappService.sendWhatsappMessage(
            phoneNumber, 
            "Desculpe, encontrei um problema ao gerar sua Carta de Consciência. Por favor, tente novamente mais tarde ou digite 'reset' para recomeçar."
        );
        
        // Resetar estado para permitir nova tentativa
        await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.LETTER_DELIVERED);
    }
};

/**
 * Inicia o fluxo de boas-vindas para um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<boolean>} Indica se a operação foi bem-sucedida
 */
const initiateWelcomeFlow = async (phoneNumber) => {
    try {
        // Resetar conversa para garantir um início limpo
        await redisService.resetUserConversation(phoneNumber);
        
        // Enviar mensagem de boas-vindas
        await whatsappService.sendWhatsappMessage(phoneNumber, config.WELCOME_MESSAGE_1);
        
        // Definir estado inicial
        await redisService.saveUserState(phoneNumber, redisService.CONVERSATION_STATES.AWAITING_NAME);
        
        logInfo('CONVERSATION_FLOW', `Fluxo de boas-vindas iniciado para ${phoneNumber}`);
        return true;
    } catch (error) {
        logError('CONVERSATION_FLOW', `Erro ao iniciar fluxo de boas-vindas para ${phoneNumber}`, error);
        return false;
    }
};

module.exports = {
    processIncomingMessage,
    generateAndSendLetter,
    initiateWelcomeFlow
};
