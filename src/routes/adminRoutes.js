import express from 'express';
import basicAuth from 'basic-auth';
import interactionService from '../services/interactionService.js';

const router = express.Router();

// Basic Authentication middleware for admin routes
router.use((req, res, next) => {
  const credentials = basicAuth(req);
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'password';
  if (!credentials || credentials.name !== adminUser || credentials.pass !== adminPass) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
    return res.status(401).send('Access denied');
  }
  next();
});

// GET /admin - Serve the admin dashboard page
router.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/src/views/admin/dashboard.html');
});

// GET /admin/api/interactions - Retrieve all interaction data (JSON)
router.get('/api/interactions', async (req, res) => {
  try {
    const interactions = await interactionService.getAllInteractions();
    return res.json(interactions);
  } catch (err) {
    console.error('Error fetching interactions:', err);
    return res.status(500).send('Failed to retrieve interactions');
  }
});

// GET /admin/api/stats - Retrieve basic stats for dashboard cards
router.get('/api/stats', async (req, res) => {
  try {
    const stats = await interactionService.getStats();
    return res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    return res.status(500).send('Failed to retrieve stats');
  }
});

// GET /admin/export/json - Download all interactions as JSON file
router.get('/export/json', async (req, res) => {
  try {
    const interactions = await interactionService.getAllInteractions();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=interacoes.json');
    return res.status(200).send(JSON.stringify(interactions, null, 2));
  } catch (err) {
    console.error('Error exporting JSON:', err);
    return res.status(500).send('Failed to export JSON');
  }
});

// GET /admin/export/csv - Download all interactions as CSV file
router.get('/export/csv', async (req, res) => {
  try {
    const interactions = await interactionService.getAllInteractions();
    // Define CSV header
    const header = ['Nome', 'Telefone', 'TipoInput', 'Perfil', 'ImagemURL', 'DesafioNegocio', 'DesafioPessoal', 'CartaGerada'].join(';');
    const csvLines = interactions.map(inter => {
      const fields = [
        inter.name || '',
        inter.phoneNumber || '',
        inter.inputType || '',
        inter.profileUrl || '',
        inter.imageId || '',
        inter.businessChallenge || '',
        inter.personalChallenge || '',
        (inter.letterContent ? inter.letterContent.replace(/(\r\n|\n|\r)/g, ' ') : '')
      ];
      return fields.map(f => `"${f.replace(/"/g, '""')}"`).join(';');
    });
    const csvContent = header + '\n' + csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    res.setHeader('Content-Disposition', 'attachment; filename=interacoes.csv');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    return res.status(500).send('Failed to export CSV');
  }
});

// GET /admin/logout - Logout route (forces browser to re-prompt auth)
router.get('/logout', (req, res) => {
  res.set('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
  return res.status(401).send('Logged out');
});

export default router;
