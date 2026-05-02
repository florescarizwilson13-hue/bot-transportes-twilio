const express = require('express');
const jwt = require('jsonwebtoken');
const BusinessLogic = require('../services/businessLogic');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware de autenticación
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.rol !== 'conductor') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// GET /api/conductor/pasajeros/mios
router.get('/pasajeros/mios', authenticate, async (req, res) => {
  try {
    const result = await BusinessLogic.handleConductorAction(req.user, 'ver_mis_pasajeros');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo pasajeros míos', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/conductor/pasajeros/disponibles
router.get('/pasajeros/disponibles', authenticate, async (req, res) => {
  try {
    const user = await BusinessLogic.authenticateUser(''); // Obtener user completo
    const result = await BusinessLogic.handleConductorAction(user, 'ver_pasajeros_disponibles');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo pasajeros disponibles', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/conductor/pasajeros/tomar
router.post('/pasajeros/tomar', authenticate, async (req, res) => {
  try {
    const { servicioIds } = req.body;
    const result = await BusinessLogic.handleConductorAction(req.user, 'tomar_pasajero', { servicioIds });
    res.json(result);
  } catch (error) {
    logger.error('Error tomando pasajeros', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/conductor/pasajero/traspasar
router.post('/pasajero/traspasar', authenticate, async (req, res) => {
  try {
    const { repartoId, conductorDestinoId } = req.body;
    const result = await BusinessLogic.handleConductorAction(req.user, 'traspasar_pasajero', { repartoId, conductorDestinoId });
    res.json(result);
  } catch (error) {
    logger.error('Error traspasando pasajero', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/conductor/activos
router.get('/activos', authenticate, async (req, res) => {
  try {
    const result = await BusinessLogic.handleConductorAction(req.user, 'ver_conductores');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo conductores activos', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/conductor/servicio/iniciar
router.post('/servicio/iniciar', authenticate, async (req, res) => {
  try {
    const { repartoId, lat, lng } = req.body;
    const result = await BusinessLogic.handleConductorAction(req.user, 'iniciar_servicio', { repartoId, lat, lng });
    res.json(result);
  } catch (error) {
    logger.error('Error iniciando servicio', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/conductor/servicio/terminar
router.post('/servicio/terminar', authenticate, async (req, res) => {
  try {
    const { repartoId, lat, lng } = req.body;
    const result = await BusinessLogic.handleConductorAction(req.user, 'terminar_servicio', { repartoId, lat, lng });
    res.json(result);
  } catch (error) {
    logger.error('Error terminando servicio', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;