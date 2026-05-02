const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class ServicioConsolidado {
  static async getDisponiblesPorComunas(comunas) {
    const { data, error } = await supabase
      .from('servicios_consolidados')
      .select('*')
      .in('comuna', comunas)
      .is('reparto_pasajeros_id', null); // No asignados aún

    if (error) throw error;
    return data;
  }

  static async getById(id) {
    const { data, error } = await supabase
      .from('servicios_consolidados')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async getAgrupadosPorHora(comunas) {
    const { data, error } = await supabase
      .from('servicios_consolidados')
      .select('*')
      .in('comuna', comunas)
      .is('reparto_pasajeros_id', null)
      .order('hora_reserva');

    if (error) throw error;

    // Agrupar por hora
    const agrupados = {};
    data.forEach(servicio => {
      const hora = servicio.hora_reserva;
      if (!agrupados[hora]) agrupados[hora] = [];
      agrupados[hora].push(servicio);
    });

    return agrupados;
  }
}

module.exports = ServicioConsolidado;