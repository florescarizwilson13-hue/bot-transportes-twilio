const Usuario = require('../models/Usuario');
const ServicioConsolidado = require('../models/ServicioConsolidado');
const RepartoPasajero = require('../models/RepartoPasajero');
const AsignacionCoordinador = require('../models/AsignacionCoordinador');
const TwilioService = require('./twilio');
const logger = require('../utils/logger');

class BusinessLogic {
  static async authenticateUser(telefono) {
    const user = await Usuario.findByTelefono(telefono);
    if (!user) {
      throw new Error('Usuario no encontrado o inactivo');
    }
    return user;
  }

  static async getConductorMenu(user) {
    const menu = [
      'Ver mis pasajeros',
      'Ver pasajeros disponibles',
      'Tomar pasajero',
      'Traspasar pasajero',
      'Ver conductores',
      'Iniciar servicio',
      'Terminar servicio'
    ];
    return menu;
  }

  static async getCoordinadorMenu(user) {
    const menu = [
      'Ver traslados del día',
      'Ver conductores',
      'Ver comunas asignadas',
      'Ver pasajeros por comuna',
      'Asignar comuna a conductor',
      'Reasignar pasajero',
      'Resumen por conductor'
    ];
    return menu;
  }

  static async handleConductorAction(user, action, params = {}) {
    switch (action) {
      case 'ver_mis_pasajeros':
        return await this.getMisPasajeros(user.id);
      case 'ver_pasajeros_disponibles':
        return await this.getPasajerosDisponibles(user);
      case 'tomar_pasajero':
        return await this.tomarPasajero(user.id, params.servicioIds);
      case 'traspasar_pasajero':
        return await this.traspasarPasajero(params.repartoId, params.conductorDestinoId, user.id);
      case 'ver_conductores':
        return await this.getConductoresActivos();
      case 'iniciar_servicio':
        return await this.iniciarServicio(params.repartoId, params.lat, params.lng);
      case 'terminar_servicio':
        return await this.terminarServicio(params.repartoId, params.lat, params.lng);
      default:
        throw new Error('Acción no válida');
    }
  }

  static async handleCoordinadorAction(user, action, params = {}) {
    switch (action) {
      case 'ver_traslados_dia':
        return await this.getTrasladosDelDia();
      case 'ver_conductores':
        return await this.getConductoresActivos();
      case 'ver_comunas_asignadas':
        return await this.getComunasAsignadas();
      case 'ver_pasajeros_comuna':
        return await this.getPasajerosPorComuna(params.comuna);
      case 'asignar_comuna':
        return await this.asignarComunas(user.id, params.conductorId, params.comunas);
      case 'reasignar_pasajero':
        return await this.reasignarPasajero(params.repartoId, params.conductorDestinoId);
      case 'resumen_conductores':
        return await this.getResumenConductores();
      default:
        throw new Error('Acción no válida');
    }
  }

  // Métodos auxiliares
  static async getMisPasajeros(conductorId) {
    return await RepartoPasajero.getByConductor(conductorId);
  }

  static async getPasajerosDisponibles(user) {
    const comunas = [user.comuna_asignada]; // Simplificado, usar conductor_comunas si se extiende
    return await ServicioConsolidado.getAgrupadosPorHora(comunas);
  }

  static async tomarPasajero(conductorId, servicioIds) {
    return await RepartoPasajero.tomarPasajeros(conductorId, servicioIds);
  }

  static async traspasarPasajero(repartoId, conductorDestinoId, conductorOrigenId) {
    return await RepartoPasajero.traspasarPasajero(repartoId, conductorDestinoId, conductorOrigenId);
  }

  static async getConductoresActivos() {
    return await Usuario.getConductoresActivos();
  }

  static async iniciarServicio(repartoId, lat, lng) {
    return await RepartoPasajero.iniciarServicio(repartoId, lat, lng);
  }

  static async terminarServicio(repartoId, lat, lng) {
    return await RepartoPasajero.terminarServicio(repartoId, lat, lng);
  }

  static async getTrasladosDelDia() {
    return await RepartoPasajero.getTrasladosDelDia();
  }

  static async getComunasAsignadas() {
    return await AsignacionCoordinador.getComunasAsignadas();
  }

  static async getPasajerosPorComuna(comuna) {
    return await ServicioConsolidado.getDisponiblesPorComunas([comuna]);
  }

  static async asignarComunas(coordinadorId, conductorId, comunas) {
    return await AsignacionCoordinador.asignarComunas(coordinadorId, conductorId, comunas);
  }

  static async reasignarPasajero(repartoId, conductorDestinoId) {
    // Lógica similar a traspasar
    return await RepartoPasajero.traspasarPasajero(repartoId, conductorDestinoId, null);
  }

  static async getResumenConductores() {
    const conductores = await Usuario.getConductoresActivos();
    const resumen = [];
    for (const conductor of conductores) {
      const pasajeros = await RepartoPasajero.getByConductor(conductor.id);
      resumen.push({
        conductor: conductor.nombre,
        cantidad_pasajeros: pasajeros.length
      });
    }
    return resumen;
  }
}

module.exports = BusinessLogic;