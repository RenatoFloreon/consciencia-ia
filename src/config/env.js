/**
 * @fileoverview Configuração de variáveis de ambiente para a aplicação
 * Este módulo centraliza o carregamento e validação das variáveis de ambiente
 * necessárias para o funcionamento da aplicação.
 */

require('dotenv').config();

// Função para validar variáveis de ambiente obrigatórias
const validateRequiredEnvVars = () => {
  const requiredVars = [
    'WHATSAPP_TOKEN',
    'VERIFY_TOKEN',
    'WHATSAPP_PHONE_ID',
    'OPENAI_API_KEY',
    'REDIS_URL'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(`[ENV_VALIDATION_ERROR] Variáveis de ambiente obrigatórias não definidas: ${missingVars.join(', ')}`);
    console.error('[ENV_VALIDATION_ERROR] Por favor, configure estas variáveis no arquivo .env ou no ambiente de execução.');
    return false;
  }
  
  return true;
};

// Configurações da aplicação
const config = {
  // Configurações básicas
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Configurações do WhatsApp
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID,
  WHATSAPP_MAX_MESSAGE_LENGTH: parseInt(process.env.WHATSAPP_MAX_MESSAGE_LENGTH || '4000'),
  
  // Configurações da OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_ORGANIZATION: process.env.OPENAI_ORGANIZATION,
  ASSISTANT_ID: process.env.ASSISTANT_ID,
  
  // Configurações do Redis
  REDIS_URL: process.env.REDIS_URL,
  REDIS_TLS_REJECT_UNAUTHORIZED: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
  
  // Configurações de timeout
  FETCH_TIMEOUT_MS: parseInt(process.env.FETCH_TIMEOUT_MS || '20000'),
  OPENAI_TIMEOUT_MS: parseInt(process.env.OPENAI_TIMEOUT_MS || '30000'),
  
  // Configurações do Kommo (se aplicável)
  KOMMO_API_KEY: process.env.KOMMO_API_KEY,
  KOMMO_ACCOUNT_ID: process.env.KOMMO_ACCOUNT_ID,
  
  // Configurações de mensagens personalizáveis
  WELCOME_MESSAGE_1: process.env.WELCOME_MESSAGE_1 || "Olá! 👋 Bem-vindo(a) ao Conselheiro da Consciênc.IA do evento MAPA DO LUCRO!\n\nSou um assistente virtual especial criado para gerar sua Carta de Consciência personalizada - uma análise única baseada no seu perfil digital que revelará insights valiosos sobre seu comportamento empreendedor e recomendações práticas para uso de IA em seus negócios.\n\nPara começar, preciso conhecer você melhor.\n\nPor favor, como gostaria de ser chamado(a)?",
  WELCOME_MESSAGE_2: process.env.WELCOME_MESSAGE_2 || "Obrigado, {nome}! 😊\n\nPara que possamos enviar materiais adicionais e manter contato após o evento, por favor, me informe seu e-mail:\n\n(Se preferir não compartilhar seu e-mail agora, pode digitar \"pular\" para continuar)",
  PROFILE_REQUEST_MESSAGE: process.env.PROFILE_REQUEST_MESSAGE || "Perfeito! Agora, para que eu possa gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nPor favor, me envie o link do seu perfil público do Instagram ou Linkedin.\n\nExemplo:\nhttps://www.instagram.com/consciencia/",
  BUSINESS_CHALLENGE_MESSAGE: process.env.BUSINESS_CHALLENGE_MESSAGE || "Obrigado! Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu Negócio no momento?",
  PERSONAL_CHALLENGE_MESSAGE: process.env.PERSONAL_CHALLENGE_MESSAGE || "Entendi! E na sua vida pessoal, qual tem sido o maior desafio? Responda com apenas uma palavra ou frase, ok?",
  PROCESSING_MESSAGE: process.env.PROCESSING_MESSAGE || "Gratidão por compartilhar! Vou analisar seu perfil e gerar sua Carta de Consciência personalizada. Isso pode levar alguns instantes.",
  FINAL_MESSAGE: process.env.FINAL_MESSAGE || "Espero que tenha gostado da sua Carta de Consciência personalizada! 🌟\n\nPara saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o Programa Consciênc.IA de Renato Hilel e Nuno Arcanjo.\n\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o evento MAPA DO LUCRO e não deixe de conversar pessoalmente com os criadores do programa! 💫",
  GENERIC_ERROR_MESSAGE: process.env.GENERIC_ERROR_MESSAGE || "Desculpe, estou enfrentando algumas dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes.",
  
  // Configurações do painel administrativo
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "consciencia",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "consciencia2025",
  
  // Configurações de expiração
  THREAD_EXPIRATION_HOURS: parseInt(process.env.THREAD_EXPIRATION_HOURS || '12'),
  
  // Validação das variáveis de ambiente
  isValid: validateRequiredEnvVars()
};

module.exports = config;
