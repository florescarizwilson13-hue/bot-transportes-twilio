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
    if (decoded.rol !== 'coordinador') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// GET /api/coordinador/traslados/dia
router.get('/traslados/dia', authenticate, async (req, res) => {
  try {
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'ver_traslados_dia');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo traslados del día', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/coordinador/conductores
router.get('/conductores', authenticate, async (req, res) => {
  try {
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'ver_conductores');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo conductores', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/coordinador/comunas
router.get('/comunas', authenticate, async (req, res) => {
  try {
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'ver_comunas_asignadas');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo comunas asignadas', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/coordinador/pasajeros/comuna
router.get('/pasajeros/comuna', authenticate, async (req, res) => {
  try {
    const { comuna } = req.query;
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'ver_pasajeros_comuna', { comuna });
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo pasajeros por comuna', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/coordinador/conductor/asignar-comunas
router.post('/conductor/asignar-comunas', authenticate, async (req, res) => {
  try {
    const { conductorId, comunas } = req.body;
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'asignar_comuna', { conductorId, comunas });
    res.json(result);
  } catch (error) {
    logger.error('Error asignando comunas', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// POST /api/coordinador/pasajero/reasignar
router.post('/pasajero/reasignar', authenticate, async (req, res) => {
  try {
    const { repartoId, conductorDestinoId } = req.body;
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'reasignar_pasajero', { repartoId, conductorDestinoId });
    res.json(result);
  } catch (error) {
    logger.error('Error reasignando pasajero', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

// GET /api/coordinador/resumen/conductores
router.get('/resumen/conductores', authenticate, async (req, res) => {
  try {
    const result = await BusinessLogic.handleCoordinadorAction(req.user, 'resumen_conductores');
    res.json(result);
  } catch (error) {
    logger.error('Error obteniendo resumen de conductores', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;