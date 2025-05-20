import express from 'express';
import { log } from '../src/utils/logger.js';

const app = express();

// Middleware
app.use(express.json());

// Log de todas as requisições
app.use((req, res, next) => {
  log(`${req.method} ${req.url}`);
  next();
});

// Importação dinâmica para evitar problemas de caminho
const setupRoutes = async () => {
  try {
    // Importa as rotas
    const webhookRoutesModule = await import('../src/routes/webhookRoutes.js');
    const adminRoutesModule = await import('../src/routes/adminRoutes.js');
    
    const webhookRoutes = webhookRoutesModule.default;
    const adminRoutes = adminRoutesModule.default;
    
    // Configura as rotas
    app.use('/', webhookRoutes);
    app.use('/admin', adminRoutes);
    
    // Rota de verificação de saúde
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    log('Rotas configuradas com sucesso');
  } catch (error) {
    log('Erro ao configurar rotas:', error);
  }
};

// Configura as rotas
setupRoutes();

// Tratamento de erros
app.use((err, req, res, next) => {
  log('Erro na aplicação:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
