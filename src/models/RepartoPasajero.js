const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class RepartoPasajero {
  static async getByConductor(conductorId) {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select(`
        *,
        servicios_consolidados (
          nombre_pasajero,
          comuna,
          hora_reserva
        )
      `)
      .eq('conductor_id_actual', conductorId)
      .order('servicios_consolidados.hora_reserva');

    if (error) throw error;
    return data;
  }

  static async tomarPasajeros(conductorId, servicioIds) {
    // Usar transacción para evitar condiciones de carrera
    const { data, error } = await supabase.rpc('tomar_pasajeros_atomic', {
      conductor_id: conductorId,
      servicio_ids: servicioIds
    });

    if (error) throw error;
    return data;
  }

  static async traspasarPasajero(repartoId, conductorDestinoId, conductorOrigenId) {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .update({
        conductor_id_actual: conductorDestinoId,
        conductor_id_original: conductorOrigenId
      })
      .eq('id', repartoId)
      .select();

    if (error) throw error;
    return data;
  }

  static async iniciarServicio(repartoId, lat, lng) {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .update({
        inicio_servicio: new Date(),
        inicio_lat: lat,
        inicio_lng: lng
      })
      .eq('id', repartoId)
      .select();

    if (error) throw error;
    return data;
  }

  static async terminarServicio(repartoId, lat, lng) {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .update({
        termino_servicio: new Date(),
        termino_lat: lat,
        termino_lng: lng
      })
      .eq('id', repartoId)
      .select();

    if (error) throw error;
    return data;
  }

  static async getTrasladosDelDia() {
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select(`
        *,
        servicios_consolidados (
          nombre_pasajero,
          comuna,
          hora_reserva
        )
      `)
      .gte('created_at', hoy)
      .order('servicios_consolidados.hora_reserva');

    if (error) throw error;
    return data;
  }
}

module.exports = RepartoPasajero;