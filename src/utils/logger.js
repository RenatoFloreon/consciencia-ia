/**
 * @fileoverview Utilitários para logging seguro e formatado
 * Este módulo fornece funções para logging seguro de erros e informações,
 * garantindo que informações sensíveis não sejam expostas.
 */

/**
 * Função para logar erros de forma segura, evitando exposição de dados sensíveis
 * @param {Error} error - O objeto de erro a ser logado
 * @param {Object} additionalInfo - Informações adicionais para contextualizar o erro
 * @returns {string} Representação JSON do erro formatada para logging
 */
const safeLogError = (error, additionalInfo = {}) => {
    const errorDetails = {
        message: error.message,
        name: error.name,
        stack: error.stack ? error.stack.split("\n").slice(0, 5).join("\n") : "No stack trace",
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port,
        config: error.config ? { 
            url: error.config.url, 
            method: error.config.method, 
            headers: error.config.headers, 
            timeout: error.config.timeout 
        } : undefined,
        response: error.response ? { 
            status: error.response.status, 
            statusText: error.response.statusText, 
            data: error.response.data 
        } : undefined,
        ...additionalInfo
    };
    
    // Remove propriedades undefined
    Object.keys(errorDetails).forEach(key => errorDetails[key] === undefined && delete errorDetails[key]);
    
    return JSON.stringify(errorDetails, null, 2);
};

/**
 * Função para formatar mensagens de log com timestamp e contexto
 * @param {string} context - O contexto do log (ex: "REDIS", "WHATSAPP", "OPENAI")
 * @param {string} message - A mensagem a ser logada
 * @param {string} level - O nível do log (ex: "INFO", "ERROR", "WARN")
 * @returns {string} Mensagem formatada para logging
 */
const formatLogMessage = (context, message, level = "INFO") => {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${context}] [${level}] ${message}`;
};

/**
 * Função para logar informações com contexto
 * @param {string} context - O contexto do log
 * @param {string} message - A mensagem a ser logada
 */
const logInfo = (context, message) => {
    console.log(formatLogMessage(context, message, "INFO"));
};

/**
 * Função para logar avisos com contexto
 * @param {string} context - O contexto do log
 * @param {string} message - A mensagem a ser logada
 */
const logWarning = (context, message) => {
    console.warn(formatLogMessage(context, message, "WARN"));
};

/**
 * Função para logar erros com contexto
 * @param {string} context - O contexto do log
 * @param {string} message - A mensagem a ser logada
 * @param {Error} error - O objeto de erro, se aplicável
 */
const logError = (context, message, error = null) => {
    if (error) {
        console.error(formatLogMessage(context, `${message}: ${safeLogError(error)}`, "ERROR"));
    } else {
        console.error(formatLogMessage(context, message, "ERROR"));
    }
};

export { safeLogError, formatLogMessage, logInfo, logWarning, logError };
