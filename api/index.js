import express from 'express';
import webhookRoutes from './src/routes/webhookRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import { log } from './src/utils/logger.js';

const app = express();

// Middleware
app.use(express.json());

// Log de todas as requisições
app.use((req, res, next) => {
  log(`${req.method} ${req.url}`);
  next();
});

// Rotas
app.use('/', webhookRoutes);
app.use('/admin', adminRoutes);

// Rota de verificação de saúde
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  log('Erro na aplicação:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
