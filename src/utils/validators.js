/**
 * Utilitário para validação de inputs do usuário
 */

/**
 * Valida um endereço de e-mail
 * @param {string} email - Endereço de e-mail a ser validado
 * @returns {boolean} - Verdadeiro se o e-mail for válido
 */
export function isValidEmail(email) {
  if (!email) return false;
  
  // Expressão regular para validação básica de e-mail
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida um número de telefone no formato WhatsApp
 * @param {string} phoneNumber - Número de telefone a ser validado
 * @returns {boolean} - Verdadeiro se o número for válido
 */
export function isValidPhoneNumber(phoneNumber) {
  if (!phoneNumber) return false;
  
  // Remove caracteres não numéricos
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  
  // Verifica se tem entre 10 e 15 dígitos (padrão internacional)
  return cleanNumber.length >= 10 && cleanNumber.length <= 15;
}

/**
 * Valida uma URL
 * @param {string} url - URL a ser validada
 * @returns {boolean} - Verdadeiro se a URL for válida
 */
export function isValidUrl(url) {
  if (!url) return false;
  
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Valida um username do Instagram
 * @param {string} username - Username a ser validado
 * @returns {boolean} - Verdadeiro se o username for válido
 */
export function isValidInstagramUsername(username) {
  if (!username) return false;
  
  // Remove @ inicial se existir
  const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
  
  // Regras básicas para username do Instagram
  // - Entre 1 e 30 caracteres
  // - Apenas letras, números, pontos e underscores
  const usernameRegex = /^[a-zA-Z0-9._]{1,30}$/;
  return usernameRegex.test(cleanUsername);
}

/**
 * Sanitiza um texto para evitar injeção de código
 * @param {string} text - Texto a ser sanitizado
 * @returns {string} - Texto sanitizado
 */
export function sanitizeText(text) {
  if (!text) return '';
  
  // Remove tags HTML
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/**
 * Normaliza uma URL de perfil do Instagram ou LinkedIn
 * @param {string} input - URL ou username
 * @returns {string} - URL normalizada
 */
export function normalizeProfileUrl(input) {
  if (!input) return '';
  
  // Se já for uma URL válida, retorna como está
  if (isValidUrl(input)) {
    return input;
  }
  
  // Se for um username do Instagram (com ou sem @)
  if (input.startsWith('@') || isValidInstagramUsername(input)) {
    const username = input.startsWith('@') ? input.substring(1) : input;
    return `https://www.instagram.com/${username}/`;
  }
  
  // Se não for reconhecido, retorna o input original
  return input;
}
