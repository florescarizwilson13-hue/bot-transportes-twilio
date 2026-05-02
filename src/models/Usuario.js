const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class Usuario {
  static async findByTelefono(telefono) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('telefono_whatsapp', telefono)
      .eq('activo', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async getConductoresActivos() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('rol', 'conductor')
      .eq('activo', true);

    if (error) throw error;
    return data;
  }

  static async getCoordinadoresActivos() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('rol', 'coordinador')
      .eq('activo', true);

    if (error) throw error;
    return data;
  }
}

module.exports = Usuario;