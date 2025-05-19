/**
 * @fileoverview Controlador para gerenciamento do fluxo de conversação.
 * Implementa a lógica do fluxo conversacional, gerenciando estados, transições e processamento de mensagens.
 */

const sessionStore = require('../utils/sessionStore');
const whatsappService = require('../services/whatsappService');
const profileScraperService = require('../services/profileScraperService');
const contentGenerationService = require('../services/contentGenerationService');
const config = require('../config/env');
const { logInfo, logError, logWarning } = require('../utils/logger');

// Definição dos estados da FSM (Finite State Machine) do fluxo conversacional
const STATE = {
    INIT: 'INIT',
    ASKED_NAME: 'ASKED_NAME',
    ASKED_EMAIL: 'ASKED_EMAIL',
    ASKED_PROFILE_LINK: 'ASKED_PROFILE_LINK',
    ASKED_BUSINESS_CHALLENGE: 'ASKED_BUSINESS_CHALLENGE',
    ASKED_PERSONAL_CHALLENGE: 'ASKED_PERSONAL_CHALLENGE',
    PROCESSING_LETTER: 'PROCESSING_LETTER',
    LETTER_SENT: 'LETTER_SENT',
    FOLLOW_UP: 'FOLLOW_UP'
};

/**
 * Processa uma mensagem recebida e gerencia o fluxo da conversa conforme o estado atual.
 * @param {Object} messageInfo - Informações da mensagem recebida (contendo `from` e `text`).
 * @returns {Promise<Object>} Resultado do processamento (sucesso/erro e ação executada).
 */
const processIncomingMessage = async (messageInfo) => {
    try {
        // Validação básica da mensagem recebida
        if (!messageInfo || !messageInfo.from || !messageInfo.text) {
            logWarning('CONVERSATION_FLOW', 'Mensagem inválida ou incompleta recebida no webhook');
            return { success: false, error: 'Mensagem inválida' };
        }

        const phoneNumber = messageInfo.from;
        const messageText = messageInfo.text.trim();

        // Comandos especiais: permitir resetar conversa a qualquer momento
        if (messageText.toLowerCase() === 'reset' || messageText.toLowerCase() === 'reiniciar') {
            await sessionStore.resetUserConversation(phoneNumber);
            await whatsappService.sendWhatsappMessage(
                phoneNumber,
                "🔄 Sua conversa foi reiniciada. Vamos começar novamente!\n\n" + config.WELCOME_MESSAGE_1
            );
            return { success: true, action: 'reset' };
        }

        // Obter estado atual do usuário (se novo, inicializa)
        let currentState = await sessionStore.getUserState(phoneNumber);
        let userData = await sessionStore.getUserData(phoneNumber) || { phoneNumber };

        if (!currentState) {
            // Usuário novo: iniciar fluxo
            currentState = STATE.INIT;
            await sessionStore.saveUserState(phoneNumber, currentState);
        }

        // Lidar com a mensagem de acordo com o estado atual da conversa
        switch (currentState) {
            case STATE.INIT:
                // Estado inicial: enviar boas-vindas e perguntar nome
                await whatsappService.sendWhatsappMessage(phoneNumber, config.WELCOME_MESSAGE_1);
                await sessionStore.saveUserState(phoneNumber, STATE.ASKED_NAME);
                return { success: true, action: 'welcome_sent' };

            case STATE.ASKED_NAME:
                // Usuário respondeu com o nome
                userData.name = messageText;
                await sessionStore.updateUserData(phoneNumber, userData);
                // Perguntar e-mail (mensagem personalizada com o nome)
                const emailRequest = config.WELCOME_MESSAGE_2.replace('{nome}', userData.name);
                await whatsappService.sendWhatsappMessage(phoneNumber, emailRequest);
                await sessionStore.saveUserState(phoneNumber, STATE.ASKED_EMAIL);
                return { success: true, action: 'name_received' };

            case STATE.ASKED_EMAIL:
                // Usuário forneceu o e-mail (ou optou por pular)
                if (messageText.toLowerCase() === 'pular') {
                    userData.email = 'não informado';
                } else {
                    userData.email = messageText;
                }
                await sessionStore.updateUserData(phoneNumber, userData);
                // Solicitar link de perfil (Instagram/LinkedIn) para análise
                await whatsappService.sendWhatsappMessage(phoneNumber, config.PROFILE_REQUEST_MESSAGE);
                await sessionStore.saveUserState(phoneNumber, STATE.ASKED_PROFILE_LINK);
                return { success: true, action: 'email_received' };

            case STATE.ASKED_PROFILE_LINK:
                // Usuário forneceu o link do perfil (ou "pular")
                if (messageText.toLowerCase() === 'pular') {
                    userData.profileUrl = null;
                } else {
                    userData.profileUrl = messageText;
                }
                await sessionStore.updateUserData(phoneNumber, userData);
                // Perguntar desafio de negócio atual
                await whatsappService.sendWhatsappMessage(phoneNumber, config.BUSINESS_CHALLENGE_MESSAGE);
                await sessionStore.saveUserState(phoneNumber, STATE.ASKED_BUSINESS_CHALLENGE);
                return { success: true, action: 'profile_received' };

            case STATE.ASKED_BUSINESS_CHALLENGE:
                // Usuário respondeu com desafio de negócio
                userData.businessChallenge = messageText;
                await sessionStore.updateUserData(phoneNumber, userData);
                // Perguntar desafio pessoal atual
                await whatsappService.sendWhatsappMessage(phoneNumber, config.PERSONAL_CHALLENGE_MESSAGE);
                await sessionStore.saveUserState(phoneNumber, STATE.ASKED_PERSONAL_CHALLENGE);
                return { success: true, action: 'business_challenge_received' };

            case STATE.ASKED_PERSONAL_CHALLENGE:
                // Usuário respondeu com desafio pessoal; iniciar geração da carta
                userData.personalChallenge = messageText;
                await sessionStore.updateUserData(phoneNumber, userData);
                // Enviar mensagem de processamento (informar usuário que carta está em preparação)
                await whatsappService.sendWhatsappMessage(phoneNumber, config.PROCESSING_MESSAGE);
                await sessionStore.saveUserState(phoneNumber, STATE.PROCESSING_LETTER);
                // Geração e envio da carta ocorrem de forma assíncrona (não bloquear webhook)
                generateAndSendLetter(phoneNumber, userData);
                return { success: true, action: 'personal_challenge_received' };

            case STATE.PROCESSING_LETTER:
                // Se o usuário envia mensagens enquanto a carta está sendo gerada
                await whatsappService.sendWhatsappMessage(
                    phoneNumber,
                    "⚙️ Ainda estou trabalhando na sua Carta de Consciência personalizada. Só mais alguns instantes... Agradeço sua paciência! ✨"
                );
                return { success: true, action: 'processing_ack' };

            case STATE.FOLLOW_UP:
                // Carta já entregue, responder perguntas de acompanhamento
                const letterData = userData.letterData;
                if (!letterData) {
                    logWarning('CONVERSATION_FLOW', `Carta não encontrada nos dados do usuário ${phoneNumber}`);
                    await whatsappService.sendWhatsappMessage(
                        phoneNumber,
                        "Desculpe, não localizei sua Carta de Consciência. Por favor, digite 'reset' para começar novamente."
                    );
                    return { success: false, error: 'letter_data_missing' };
                }
                // Utilizar serviço de IA para responder a pergunta do usuário com base na carta e perfil
                const question = messageText;
                const answer = await contentGenerationService.answerFollowUpQuestion(question, userData, letterData);
                if (answer) {
                    await whatsappService.sendWhatsappMessage(phoneNumber, answer);
                    // Registrar pergunta e resposta no log de interações (para painel admin)
                    await sessionStore.logInteraction({
                        type: 'followup_question',
                        phoneNumber,
                        name: userData.name,
                        email: userData.email,
                        question,
                        answer
                    });
                    return { success: true, action: 'followup_answered' };
                } else {
                    await whatsappService.sendWhatsappMessage(
                        phoneNumber,
                        "Desculpe, não consegui processar sua pergunta agora. Poderia reformular ou tentar mais tarde?"
                    );
                    return { success: false, error: 'followup_failed' };
                }

            default:
                // Qualquer estado desconhecido: resetar conversa
                logWarning('CONVERSATION_FLOW', `Estado desconhecido para ${phoneNumber}: ${currentState}`);
                await sessionStore.resetUserConversation(phoneNumber);
                await whatsappService.sendWhatsappMessage(
                    phoneNumber,
                    "Desculpe, ocorreu um erro no fluxo da conversa. Vamos recomeçar.\n\n" + config.WELCOME_MESSAGE_1
                );
                return { success: false, error: 'unknown_state_reset' };
        }
    } catch (error) {
        logError('CONVERSATION_FLOW', 'Erro ao processar mensagem', error);
        return { success: false, error: error.message };
    }
};

/**
 * Função auxiliar que gera e envia a Carta da Consciência personalizada.
 * Realiza análise de perfil (se fornecido), gera o conteúdo via OpenAI e envia a carta e mensagem final ao usuário.
 * @param {string} phoneNumber - Número do usuário (WhatsApp).
 * @param {Object} userData - Dados coletados do usuário (nome, desafios, perfil, etc).
 */
const generateAndSendLetter = async (phoneNumber, userData) => {
    try {
        logInfo('LETTER_GENERATION', `Iniciando geração da carta para ${userData.name} (${phoneNumber})`);

        // 1. Analisar perfil do usuário (se um link de perfil foi fornecido e reconhecido)
        let profileAnalysis = null;
        if (userData.profileUrl && (userData.profileUrl.includes('instagram.com') || userData.profileUrl.includes('linkedin.com'))) {
            logInfo('LETTER_GENERATION', `Analisando perfil do usuário: ${userData.profileUrl}`);
            profileAnalysis = await profileScraperService.analyzeProfileHybrid(userData.profileUrl);
            if (profileAnalysis) {
                logInfo('LETTER_GENERATION', 'Análise de perfil concluída com sucesso');
                userData.profileAnalysis = profileAnalysis;
                await sessionStore.updateUserData(phoneNumber, userData);
            } else {
                logWarning('LETTER_GENERATION', 'Falha na análise do perfil. Gerando carta sem dados de perfil.');
            }
        } else {
            logInfo('LETTER_GENERATION', 'Nenhum perfil fornecido ou URL não reconhecida. Gerando carta genérica.');
        }

        // 2. Gerar a carta personalizada usando o serviço de geração de conteúdo (GPT-4)
        const letterData = await contentGenerationService.generateConscienceLetter(userData, profileAnalysis);
        if (!letterData) {
            logError('LETTER_GENERATION', `Falha ao gerar a carta para ${phoneNumber}`);
            await whatsappService.sendWhatsappMessage(
                phoneNumber,
                "⚠️ Desculpe, ocorreu um erro ao gerar sua Carta de Consciência. Por favor, tente novamente mais tarde ou digite 'reset' para recomeçar."
            );
            return;
        }

        // 3. Guardar a carta gerada nos dados do usuário
        userData.letterData = letterData;
        await sessionStore.updateUserData(phoneNumber, userData);

        // 4. Enviar a carta completa via WhatsApp (pode ser longa, será dividida se necessário pelo whatsappService)
        await whatsappService.sendWhatsappMessage(phoneNumber, letterData.fullLetter);
        // 5. Enviar mensagem final de fechamento e pergunta de acompanhamento
        await whatsappService.sendWhatsappMessage(phoneNumber, config.FINAL_MESSAGE);
        // 6. Atualizar estado da conversa para aguardando perguntas de acompanhamento
        await sessionStore.saveUserState(phoneNumber, STATE.FOLLOW_UP);

        // 7. Registrar interação completa (carta entregue) para fins de análise/admin
        await sessionStore.logInteraction({
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
        logError('LETTER_GENERATION', `Erro ao gerar/enviar carta para ${phoneNumber}`, error);
        // Em caso de erro inesperado durante geração, resetar estado para permitir novo fluxo
        await sessionStore.saveUserState(phoneNumber, STATE.INIT);
        await whatsappService.sendWhatsappMessage(
            phoneNumber,
            "⚠️ Desculpe, houve um problema durante a geração da sua carta. Vamos tentar novamente. Por favor, digite 'reset' para recomeçar."
        );
    }
};

/**
 * (Opcional) Inicia o fluxo de boas-vindas manualmente para um usuário.
 * Poderia ser utilizado para disparar a conversa pró-ativamente.
 */
const initiateWelcomeFlow = async (phoneNumber) => {
    try {
        await sessionStore.resetUserConversation(phoneNumber);
        await whatsappService.sendWhatsappMessage(phoneNumber, config.WELCOME_MESSAGE_1);
        await sessionStore.saveUserState(phoneNumber, STATE.ASKED_NAME);
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
