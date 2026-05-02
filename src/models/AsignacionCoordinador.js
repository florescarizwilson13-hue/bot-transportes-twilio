const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class AsignacionCoordinador {
  static async getByCoordinador(coordinadorId) {
    const { data, error } = await supabase
      .from('asignaciones_coordinador')
      .select(`
        *,
        usuarios (
          nombre,
          telefono_whatsapp
        )
      `)
      .eq('coordinador_id', coordinadorId)
      .eq('activo', true);

    if (error) throw error;
    return data;
  }

  static async asignarComunas(coordinadorId, conductorId, comunas) {
    // Primero, desactivar asignaciones anteriores
    await supabase
      .from('asignaciones_coordinador')
      .update({ activo: false })
      .eq('conductor_id', conductorId);

    // Insertar nuevas asignaciones
    const asignaciones = comunas.map(comuna => ({
      coordinador_id: coordinadorId,
      conductor_id: conductorId,
      comuna: comuna,
      fecha_operacion: new Date(),
      activo: true
    }));

    const { data, error } = await supabase
      .from('asignaciones_coordinador')
      .insert(asignaciones)
      .select();

    if (error) throw error;
    return data;
  }

  static async getComunasAsignadas() {
    const { data, error } = await supabase
      .from('asignaciones_coordinador')
      .select(`
        conductor_id,
        conductor_nombre,
        comuna,
        fecha_operacion
      `)
      .eq('activo', true);

    if (error) throw error;
    return data;
  }
}

module.exports = AsignacionCoordinador;