import express from 'express';
import interactionService from '../services/interactionService.js';
import { adminAuth } from '../middleware/authMiddleware.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Middleware de autenticação
router.use(adminAuth);

// 🔍 Dashboard principal
router.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'src/views/admin/dashboard.html'));
});

// 📊 API: Lista de interações
router.get('/api/interactions', async (req, res) => {
  try {
    const interactions = await interactionService.getAllInteractions();
    return res.json(interactions);
  } catch (err) {
    console.error('Erro ao buscar interações:', err);
    return res.status(500).send('Erro ao buscar interações');
  }
});

// 📈 API: Estatísticas resumidas
router.get('/api/stats', async (req, res) => {
  try {
    const stats = await interactionService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error('Erro ao buscar estatísticas:', err);
    return res.status(500).send('Erro ao buscar estatísticas');
  }
});

// 📦 Exportar como JSON
router.get('/export/json', async (req, res) => {
  try {
    const interactions = await interactionService.getAllInteractions();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=interacoes.json');
    return res.status(200).send(JSON.stringify(interactions, null, 2));
  } catch (err) {
    console.error('Erro ao exportar JSON:', err);
    return res.status(500).send('Erro ao exportar JSON');
  }
});

// 📦 Exportar como CSV
router.get('/export/csv', async (req, res) => {
  try {
    const interactions = await interactionService.getAllInteractions();
    const header = ['Nome', 'Telefone', 'TipoInput', 'Perfil', 'ImagemURL', 'Desafio', 'CartaGerada'].join(';');
    const csvLines = interactions.map(inter => {
      const fields = [
        inter.name || '',
        inter.phoneNumber || '',
        inter.inputType || '',
        inter.profileUrl || '',
        inter.imageId || '',
        inter.mainChallenge || '',
        (inter.letterContent ? inter.letterContent.replace(/(\r\n|\n|\r)/g, ' ') : '')
      ];
      return fields.map(f => `"${f.replace(/"/g, '""')}"`).join(';');
    });
    const csvContent = header + '\n' + csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    res.setHeader('Content-Disposition', 'attachment; filename=interacoes.csv');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Erro ao exportar CSV:', err);
    return res.status(500).send('Erro ao exportar CSV');
  }
});

// 🔐 Logout (reautenticação)
router.get('/logout', (req, res) => {
  res.set('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
  return res.status(401).send('Sessão encerrada');
});

export default router;
