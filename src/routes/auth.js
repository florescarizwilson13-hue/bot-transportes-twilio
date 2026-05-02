const express = require('express');
const jwt = require('jsonwebtoken');
const BusinessLogic = require('../services/businessLogic');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { telefono } = req.body;

    if (!telefono) {
      return res.status(400).json({ error: 'Teléfono requerido' });
    }

    const user = await BusinessLogic.authenticateUser(telefono);

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info('Usuario autenticado', { userId: user.id, rol: user.rol });

    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  } catch (error) {
    logger.error('Error en login', { error: error.message });
    res.status(401).json({ error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await BusinessLogic.authenticateUser(decoded.telefono || ''); // Ajustar según necesidad

    res.json({
      user: {
        id: user.id,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  } catch (error) {
    logger.error('Error obteniendo perfil', { error: error.message });
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;