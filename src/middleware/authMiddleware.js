// src/middleware/authMiddleware.js
import dotenv from 'dotenv';
dotenv.config();

export function adminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).send('Autenticação obrigatória');
  }

  const base64Credentials = auth.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;

  if (username === validUser && password === validPass) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
  return res.status(401).send('Credenciais inválidas');
}
