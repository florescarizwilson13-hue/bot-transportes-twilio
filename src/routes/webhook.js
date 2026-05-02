const express = require('express');
const { handleWebhook } = require('../handlers');
const TwilioService = require('../services/twilio');
const logger = require('../utils/logger');

const router = express.Router();

// POST /webhook/whatsapp
router.post('/whatsapp', async (req, res) => {
  try {
    const { From, Body } = req.body;

    // Extraer número de teléfono (remover 'whatsapp:')
    const telefono = From.replace('whatsapp:', '');

    logger.info('Mensaje recibido', { telefono, mensaje: Body });

    // Usar el nuevo handler refactorizado
    const result = await handleWebhook({ telefono, mensaje: Body });

    // Enviar respuesta usando Twilio
    if (result && result.respuesta) {
      await TwilioService.sendMessage(telefono, result.respuesta);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error procesando webhook', { error: error.message });
    res.status(500).send('Error');
  }
});

async function handleConductorMessage(user, message) {
  const menu = await BusinessLogic.getConductorMenu(user);

  // Procesar selección de menú
  const option = parseInt(message.trim());
  if (isNaN(option) || option < 1 || option > menu.length) {
    return 'Opción inválida. ' + menu.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
  }

  const action = getActionFromMenu(menu[option - 1]);

  try {
    const result = await BusinessLogic.handleConductorAction(user, action);
    return formatConductorResponse(action, result);
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

async function handleCoordinadorMessage(user, message) {
  const menu = await BusinessLogic.getCoordinadorMenu(user);

  const option = parseInt(message.trim());
  if (isNaN(option) || option < 1 || option > menu.length) {
    return 'Opción inválida. ' + menu.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
  }

  const action = getActionFromMenu(menu[option - 1]);

  try {
    const result = await BusinessLogic.handleCoordinadorAction(user, action);
    return formatCoordinadorResponse(action, result);
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

function getActionFromMenu(menuItem) {
  const actions = {
    'Ver mis pasajeros': 'ver_mis_pasajeros',
    'Ver pasajeros disponibles': 'ver_pasajeros_disponibles',
    'Tomar pasajero': 'tomar_pasajero',
    'Traspasar pasajero': 'traspasar_pasajero',
    'Ver conductores': 'ver_conductores',
    'Iniciar servicio': 'iniciar_servicio',
    'Terminar servicio': 'terminar_servicio',
    'Ver traslados del día': 'ver_traslados_dia',
    'Ver comunas asignadas': 'ver_comunas_asignadas',
    'Ver pasajeros por comuna': 'ver_pasajeros_comuna',
    'Asignar comuna a conductor': 'asignar_comuna',
    'Reasignar pasajero': 'reasignar_pasajero',
    'Resumen por conductor': 'resumen_conductores'
  };
  return actions[menuItem] || '';
}

function formatConductorResponse(action, result) {
  switch (action) {
    case 'ver_mis_pasajeros':
      return result.length > 0
        ? result.map(p => `${p.servicios_consolidados.nombre_pasajero} - ${p.servicios_consolidados.comuna} - ${p.servicios_consolidados.hora_reserva}`).join('\n')
        : 'No tienes pasajeros asignados';
    case 'ver_pasajeros_disponibles':
      return Object.keys(result).length > 0
        ? Object.entries(result).map(([hora, servicios]) => `${hora}: ${servicios.length} pasajeros`).join('\n')
        : 'No hay pasajeros disponibles';
    case 'ver_conductores':
      return result.map(c => `${c.nombre} - ${c.telefono_whatsapp}`).join('\n');
    default:
      return 'Acción completada';
  }
}

function formatCoordinadorResponse(action, result) {
  switch (action) {
    case 'ver_traslados_dia':
      return result.length > 0
        ? result.map(t => `${t.servicios_consolidados.nombre_pasajero} - ${t.servicios_consolidados.hora_reserva}`).join('\n')
        : 'No hay traslados hoy';
    case 'ver_conductores':
      return result.map(c => `${c.nombre} - ${c.telefono_whatsapp}`).join('\n');
    case 'ver_comunas_asignadas':
      return result.map(a => `${a.conductor_nombre} - ${a.comuna}`).join('\n');
    case 'resumen_conductores':
      return result.map(r => `${r.conductor}: ${r.cantidad_pasajeros} pasajeros`).join('\n');
    default:
      return 'Acción completada';
  }
}

module.exports = router;