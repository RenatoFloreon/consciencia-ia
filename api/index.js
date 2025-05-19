import 'dotenv/config';                // Load environment variables from .env (for local dev)
import express from 'express';
import webhookRoutes from '../src/routes/webhookRoutes.js';
import adminRoutes from '../src/routes/adminRoutes.js';

const app = express();
app.use(express.json());

// Mount routes
app.use('/webhook', webhookRoutes);
app.use('/admin', adminRoutes);

// Optional: a base route for health check or welcome
app.get('/', (req, res) => {
  res.send('Consciencia-IA server is running');
});

// Start server (for local development only; in Vercel serverless, this is not used)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

// Export the app (for Vercel serverless usage)
export default app;
