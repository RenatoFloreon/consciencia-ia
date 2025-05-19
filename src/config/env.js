/**
 * @fileoverview Configuração de variáveis de ambiente para a aplicação.
 * Centraliza o carregamento e validação das variáveis necessárias.
 */

require('dotenv').config();

// Função para validar variáveis obrigatórias
const validateRequiredEnvVars = () => {
  const requiredVars = [
    'WHATSAPP_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'OPENAI_API_KEY',
    'REDIS_URL'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error(`[ENV_VALIDATION_ERROR] Variáveis obrigatórias não definidas: ${missingVars.join(', ')}`);
    console.error('[ENV_VALIDATION_ERROR] Configure essas variáveis no arquivo .env ou no ambiente de execução.');
    return false;
  }
  return true;
};

// Executar validação
validateRequiredEnvVars();

// Configurações da aplicação
const config = {
  // Básico
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Configurações do WhatsApp
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_MAX_MESSAGE_LENGTH: parseInt(process.env.WHATSAPP_MAX_MESSAGE_LENGTH || '4000'),

  // Configurações da OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_ORGANIZATION: process.env.OPENAI_ORGANIZATION,

  // Outros (admin e sessão)
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,

  // Mensagens personalizadas (podem ser sobrescritas via .env)
  WELCOME_MESSAGE_1: process.env.WELCOME_MESSAGE_1 || "Olá! 👋 Bem-vindo(a) ao Conselheiro da Consciênc.IA do evento MAPA DO LUCRO!\n\nSou um assistente virtual especial criado para gerar sua Carta de Consciência personalizada - uma análise única baseada no seu perfil digital que revelará insights valiosos sobre seu comportamento empreendedor e recomendações práticas para uso de IA em seus negócios.\n\nPara começar, preciso conhecer você melhor.\n\nPor favor, como gostaria de ser chamado(a)?",
  WELCOME_MESSAGE_2: process.env.WELCOME_MESSAGE_2 || "Obrigado, {nome}! 😊\n\nPara que possamos enviar materiais adicionais e manter contato após o evento, por favor, me informe seu e-mail:\n\n(Se preferir não compartilhar seu e-mail agora, pode digitar \"pular\" para continuar)",
  PROFILE_REQUEST_MESSAGE: process.env.PROFILE_REQUEST_MESSAGE || "Perfeito! Agora, para que eu possa gerar sua Carta de Consciência personalizada, preciso analisar seu perfil digital.\n\nPor favor, me envie o link do seu perfil público do Instagram ou LinkedIn.\n\n(Se não quiser compartilhar um perfil, responda \"pular\".)",
  BUSINESS_CHALLENGE_MESSAGE: process.env.BUSINESS_CHALLENGE_MESSAGE || "Obrigado! Agora me conta, em apenas uma frase ou palavra, qual é o maior desafio que você tem enfrentado no seu negócio no momento?",
  PERSONAL_CHALLENGE_MESSAGE: process.env.PERSONAL_CHALLENGE_MESSAGE || "Entendi. E na sua vida pessoal, qual tem sido o maior desafio? Responda com apenas uma palavra ou frase, ok?",
  PROCESSING_MESSAGE: process.env.PROCESSING_MESSAGE || "Gratidão por compartilhar! Vou analisar seu perfil e gerar sua Carta de Consciência personalizada. Isso pode levar alguns instantes... ✨",
  FINAL_MESSAGE: process.env.FINAL_MESSAGE || "Espero que tenha gostado da sua Carta de Consciência personalizada! 🌟\n\nPara saber mais sobre como a IA pode transformar seu negócio e sua vida, conheça o Programa Consciênc.IA de Renato Hilel e Nuno Arcanjo.\nVisite: https://www.floreon.app.br/conscienc-ia\n\nAproveite o evento Mapa do Lucro e não deixe de conversar pessoalmente com os criadores do programa! 💫",
  GENERIC_ERROR_MESSAGE: process.env.GENERIC_ERROR_MESSAGE || "Desculpe, estou enfrentando algumas dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes."
};

module.exports = config;
