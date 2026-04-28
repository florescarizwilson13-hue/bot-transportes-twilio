const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizarTelefono(valor) {
  return String(valor || '').replace(/\D/g, '').trim();
}

function escapeXml(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fechaOperacion() {
  return '2026-04-14';
}

function esCoordinador(rol) {
  return ['coordinador', 'admin', 'admin_general'].includes(String(rol || '').toLowerCase());
}

function esConductor(rol) {
  return String(rol || '').toLowerCase() === 'conductor';
}

function menuCoordinador(nombre) {
  return `Hola ${nombre}
Panel Coordinador

1. Ver traslados del día
2. Ver conductores
3. Ver comunas asignadas
4. Ver pasajeros por comuna
5. Asignar comuna a conductor
6. Reasignar pasajero
7. Resumen por conductor

Comandos:
conductores
comunas
ver NOMBRE_COMUNA
asignar TELEFONO COMUNA
reasignar CODIGO TELEFONO
resumen`;
}

function menuConductor(nombre) {
  return `Hola ${nombre}
Panel Conductor

1. Ver mis comunas
2. Ver pasajeros disponibles
3. Ver mis pasajeros
4. Tomar pasajero
5. Traspasar pasajero
6. Ver bloques
7. Ver detalle bloque
8. Iniciar bloque
9. Terminar bloque

Comandos:
comunas
mispasajeros
mios
tomar CODIGO
traspasar CODIGO TELEFONO
bloques
mb HH:MM:SS
ib HH:MM:SS
tb HH:MM:SS`;
}

async function buscarUsuarioPorTelefono(telefono) {
  const telefonoNormalizado = normalizarTelefono(telefono);

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, activo, telefono_whatsapp')
    .eq('telefono_whatsapp', telefonoNormalizado)
    .eq('activo', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function comunasAsignadasConductor(conductorId, fecha) {
  const { data, error } = await supabase
    .from('asignaciones_coordinador')
    .select('comuna')
    .eq('conductor_id', conductorId)
    .eq('fecha_operacion', fecha)
    .eq('activo', true);

  if (error) throw error;

  return [...new Set((data || []).map(x => x.comuna).filter(Boolean))];
}

async function buscarServicioPorCodigo(codigo) {
  const { data, error } = await supabase
    .from('servicios_consolidados')
    .select(`
      id,
      codigo_reserva,
      nombre_pasajero,
      comuna,
      hora_reserva,
      fecha_reserva,
      estado
    `)
    .eq('codigo_reserva', codigo)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function mapearOpcionANombreComando(usuario, textoOriginal) {
  const texto = String(textoOriginal || '').trim();

  if (!/^\d+$/.test(texto)) return textoOriginal;

  if (esCoordinador(usuario.rol)) {
    switch (texto) {
      case '1': return 'traslados_hoy';
      case '2': return 'conductores';
      case '3': return 'comunas';
      case '4': return 'ayuda_ver_comuna';
      case '5': return 'ayuda_asignar';
      case '6': return 'ayuda_reasignar';
      case '7': return 'resumen';
      default: return textoOriginal;
    }
  }

  if (esConductor(usuario.rol)) {
    switch (texto) {
      case '1': return 'comunas';
      case '2': return 'mispasajeros';
      case '3': return 'mios';
      case '4': return 'ayuda_tomar';
      case '5': return 'ayuda_traspasar';
      case '6': return 'bloques';
      case '7': return 'ayuda_mb';
      case '8': return 'ayuda_ib';
      case '9': return 'ayuda_tb';
      default: return textoOriginal;
    }
  }

  return textoOriginal;
}

async function buscarCapacidadConductor(usuario, fecha) {
  const { data: asignaciones } = await supabase
    .from('asignaciones_coordinador')
    .select('*')
    .eq('conductor_id', usuario.id)
    .eq('fecha_operacion', fecha)
    .eq('activo', true);

  const primeraAsignacion = (asignaciones || [])[0] || {};
  let capacidad = Number(primeraAsignacion.capacidad || 0);
  let codMovil = primeraAsignacion.cod_movil || primeraAsignacion.movil || '';

  if (!capacidad || !codMovil) {
    const { data: archivo2 } = await supabase
      .from('vista_archivo_2_limpio')
      .select('*');

    const encontrado = (archivo2 || []).find(x =>
      String(x.conductor || x.nombre || '').trim().toUpperCase() ===
      String(usuario.nombre || '').trim().toUpperCase()
    );

    if (encontrado) {
      capacidad = Number(encontrado.capacidad || encontrado.Capacidad || capacidad || 0);
      codMovil = encontrado.cod_movil || encontrado['Cod Movil'] || encontrado.movil || codMovil || '';
    }
  }

  return {
    capacidad,
    codMovil
  };
}

async function contarPasajerosBloque(conductorId, hora) {
  const { data, error } = await supabase
    .from('reparto_pasajeros')
    .select(`
      id,
      servicios_consolidados (
        hora_reserva
      )
    `)
    .eq('conductor_id_actual', conductorId);

  if (error) throw error;

  return (data || []).filter(x =>
    x.servicios_consolidados?.hora_reserva === hora
  ).length;
}

async function procesarMensaje({ telefono, mensaje, latitud = null, longitud = null }) {
  if (!telefono || !mensaje) {
    return 'Faltan teléfono o mensaje';
  }

  const telefonoNormalizado = normalizarTelefono(telefono);
  const fechaHoy = fechaOperacion();

  const usuario = await buscarUsuarioPorTelefono(telefonoNormalizado);

  if (!usuario) {
    return 'Número no autorizado';
  }

  const textoOriginal = String(mensaje).trim();
  const textoMapeado = mapearOpcionANombreComando(usuario, textoOriginal);
  const texto = String(textoMapeado).trim().toLowerCase();

  if (texto === 'hola' || texto === 'menu') {
    if (esCoordinador(usuario.rol)) return menuCoordinador(usuario.nombre);
    if (esConductor(usuario.rol)) return menuConductor(usuario.nombre);
    return 'Rol no soportado';
  }

  if (esCoordinador(usuario.rol)) {
    if (texto === 'traslados_hoy') {
      const { data, error } = await supabase
        .from('servicios_consolidados')
        .select('hora_reserva')
        .eq('fecha_reserva', fechaHoy)
        .order('hora_reserva');

      if (error) return 'Error viendo traslados: ' + error.message;
      if (!data || data.length === 0) return 'No hay traslados para hoy';

      const conteo = {};
      data.forEach(x => {
        const h = x.hora_reserva || 'Sin hora';
        conteo[h] = (conteo[h] || 0) + 1;
      });

      let respuesta = 'Traslados del día:\n';
      Object.keys(conteo).sort().forEach((h, i) => {
        respuesta += `${i + 1}. ${h} - ${conteo[h]} pasajeros\n`;
      });

      return respuesta;
    }

    if (texto === 'conductores') {
      const { data, error } = await supabase
        .from('usuarios')
        .select('nombre, telefono_whatsapp, rol')
        .eq('activo', true)
        .eq('rol', 'conductor')
        .order('nombre');

      if (error) return 'Error listando conductores: ' + error.message;
      if (!data || data.length === 0) return 'No hay conductores activos';

      let respuesta = 'Conductores:\n';
      data.forEach((c, i) => {
        respuesta += `${i + 1}. ${c.nombre} - ${c.telefono_whatsapp || 'sin teléfono'}\n`;
      });

      return respuesta;
    }

    if (texto === 'comunas') {
      const { data, error } = await supabase
        .from('asignaciones_coordinador')
        .select('conductor_nombre, comuna')
        .eq('fecha_operacion', fechaHoy)
        .eq('activo', true)
        .order('conductor_nombre')
        .order('comuna');

      if (error) return 'Error listando comunas: ' + error.message;
      if (!data || data.length === 0) return 'No hay asignaciones para hoy';

      let respuesta = 'Asignaciones del día:\n';
      data.forEach((x, i) => {
        respuesta += `${i + 1}. ${x.conductor_nombre} - ${x.comuna}\n`;
      });

      return respuesta;
    }

    if (texto === 'ayuda_ver_comuna') {
      return 'Para ver pasajeros por comuna escribe:\nver Viña del Mar';
    }

    if (texto.startsWith('ver ')) {
      const comuna = textoMapeado.slice(4).trim();

      const { data, error } = await supabase
        .from('servicios_consolidados')
        .select('codigo_reserva, nombre_pasajero, comuna, hora_reserva')
        .eq('fecha_reserva', fechaHoy)
        .eq('comuna', comuna)
        .order('hora_reserva')
        .order('nombre_pasajero');

      if (error) return 'Error viendo comuna: ' + error.message;
      if (!data || data.length === 0) return `No hay pasajeros en ${comuna}`;

      let respuesta = `Pasajeros en ${comuna}:\n`;
      data.forEach((x, i) => {
        respuesta += `${i + 1}. ${x.codigo_reserva} - ${x.nombre_pasajero} - ${x.hora_reserva}\n`;
      });

      return respuesta;
    }

    if (texto === 'ayuda_asignar') {
      return 'Para asignar comuna escribe:\nasignar +56939414443 Quilpué';
    }

    if (texto.startsWith('asignar ')) {
      const partes = textoMapeado.split(' ');
      if (partes.length < 3) return 'Usa: asignar TELEFONO COMUNA';

      const telefonoDestino = normalizarTelefono(partes[1]);
      const comuna = textoMapeado.substring(textoMapeado.indexOf(partes[2])).trim();

      const destino = await buscarUsuarioPorTelefono(telefonoDestino);
      if (!destino) return 'No encontré conductor con ese teléfono';

      const { error } = await supabase
        .from('asignaciones_coordinador')
        .insert([{
          fecha_operacion: fechaHoy,
          conductor_id: destino.id,
          conductor_nombre: destino.nombre,
          comuna,
          activo: true
        }]);

      if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
        return 'Error asignando comuna: ' + error.message;
      }

      return `Asignación creada: ${destino.nombre} → ${comuna}`;
    }

    if (texto === 'ayuda_reasignar') {
      return 'Para reasignar pasajero escribe:\nreasignar ABC123 +56911111111';
    }

    if (texto.startsWith('reasignar ')) {
      const partes = textoMapeado.split(' ');
      if (partes.length < 3) return 'Usa: reasignar CODIGO TELEFONO';

      const codigo = partes[1].trim();
      const telefonoDestino = normalizarTelefono(partes[2].trim());

      const destino = await buscarUsuarioPorTelefono(telefonoDestino);
      if (!destino) return 'No encontré conductor destino';

      const servicio = await buscarServicioPorCodigo(codigo);
      if (!servicio) return `No encontré código ${codigo}`;

      const { data: reparto, error: errorReparto } = await supabase
        .from('reparto_pasajeros')
        .select('id, conductor_id_actual')
        .eq('servicio_id', servicio.id)
        .maybeSingle();

      if (errorReparto) return 'Error buscando reparto: ' + errorReparto.message;

      if (reparto) {
        const { error } = await supabase
          .from('reparto_pasajeros')
          .update({
            conductor_id_actual: destino.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', reparto.id);

        if (error) return 'Error reasignando pasajero: ' + error.message;

        await supabase.from('movimientos_pasajeros').insert([{
          servicio_id: servicio.id,
          conductor_origen_id: reparto.conductor_id_actual,
          conductor_destino_id: destino.id,
          tipo_movimiento: 'traspasar',
          detalle_json: {
            codigo_reserva: servicio.codigo_reserva,
            nombre_pasajero: servicio.nombre_pasajero,
            comuna: servicio.comuna,
            origen: 'coordinador'
          }
        }]);

        return `Pasajero reasignado a ${destino.nombre}`;
      }

      const { error } = await supabase
        .from('reparto_pasajeros')
        .insert([{
          servicio_id: servicio.id,
          conductor_id_actual: destino.id,
          conductor_id_original: destino.id,
          estado: 'tomado'
        }]);

      if (error) return 'Error creando reparto: ' + error.message;

      return `Pasajero asignado a ${destino.nombre}`;
    }

    if (texto === 'resumen') {
      const { data, error } = await supabase
        .from('reparto_pasajeros')
        .select('conductor_id_actual');

      if (error) return 'Error generando resumen: ' + error.message;

      const ids = [...new Set((data || []).map(x => x.conductor_id_actual).filter(Boolean))];

      if (ids.length === 0) return 'No hay pasajeros repartidos';

      const { data: usuariosResumen, error: errorUsuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', ids);

      if (errorUsuarios) return 'Error resumen usuarios: ' + errorUsuarios.message;

      const mapa = {};
      (usuariosResumen || []).forEach(u => { mapa[u.id] = u.nombre; });

      const conteo = {};
      (data || []).forEach(x => {
        const nombre = mapa[x.conductor_id_actual] || x.conductor_id_actual;
        conteo[nombre] = (conteo[nombre] || 0) + 1;
      });

      let respuesta = 'Resumen por conductor:\n';
      Object.keys(conteo).sort().forEach((k, i) => {
        respuesta += `${i + 1}. ${k} - ${conteo[k]} pasajeros\n`;
      });

      return respuesta;
    }

    return 'Comando de coordinador no reconocido. Escribe menu';
  }

  if (esConductor(usuario.rol)) {
    if (texto === 'comunas') {
      const comunas = await comunasAsignadasConductor(usuario.id, fechaHoy);

      if (comunas.length === 0) return 'No tienes comunas asignadas hoy';

      let respuesta = 'Mis comunas:\n';
      comunas.forEach((c, i) => {
        respuesta += `${i + 1}. ${c}\n`;
      });

      return respuesta;
    }

    if (texto === 'mispasajeros') {
      const { data, error } = await supabase
        .from('vista_pasajeros_por_conductor')
        .select('*')
        .eq('conductor_id', usuario.id)
        .order('hora_reserva')
        .order('nombre_pasajero');

      if (error) return 'Error viendo mis pasajeros: ' + error.message;
      if (!data || data.length === 0) return 'No tienes pasajeros asignados';

      let respuesta = 'Mis pasajeros:\n';
      data.forEach((p, i) => {
        respuesta += `${i + 1}. ${p.nombre_pasajero} - ${p.comuna} - ${p.hora_reserva}\n`;
      });

      return respuesta;
    }

    if (texto === 'mios') {
      const { data, error } = await supabase
        .from('reparto_pasajeros')
        .select(`
          id,
          estado,
          servicios_consolidados (
            codigo_reserva,
            nombre_pasajero,
            comuna,
            hora_reserva
          )
        `)
        .eq('conductor_id_actual', usuario.id)
        .order('created_at');

      if (error) return 'Error viendo mis pasajeros: ' + error.message;
      if (!data || data.length === 0) return 'Aún no tienes pasajeros tomados';

      let respuesta = 'Mis pasajeros:\n';
      data.forEach((x, i) => {
        const s = x.servicios_consolidados;
        respuesta += `${i + 1}. ${s.codigo_reserva} - ${s.nombre_pasajero} - ${s.comuna} - ${s.hora_reserva} - ${x.estado}\n`;
      });

      return respuesta;
    }

    if (texto === 'ayuda_tomar') {
      return 'Para tomar pasajero escribe:\ntomar ABC123';
    }

    if (texto.startsWith('tomar ')) {
      const codigo = textoMapeado.slice(6).trim();
      const servicio = await buscarServicioPorCodigo(codigo);

      if (!servicio) return `No encontré código ${codigo}`;

      const comunas = await comunasAsignadasConductor(usuario.id, fechaHoy);
      if (!comunas.includes(servicio.comuna)) {
        return `No puedes tomar pasajeros de ${servicio.comuna}`;
      }

      const { data: repartoExistente, error: errorReparto } = await supabase
        .from('reparto_pasajeros')
        .select('id, conductor_id_actual')
        .eq('servicio_id', servicio.id)
        .maybeSingle();

      if (errorReparto) return 'Error buscando reparto: ' + errorReparto.message;

      if (repartoExistente && repartoExistente.conductor_id_actual && repartoExistente.conductor_id_actual !== usuario.id) {
        return 'Ese pasajero ya fue tomado por otro conductor';
      }

      if (repartoExistente && repartoExistente.conductor_id_actual === usuario.id) {
        return 'Ese pasajero ya es tuyo';
      }

      if (repartoExistente) {
        const { error } = await supabase
          .from('reparto_pasajeros')
          .update({
            conductor_id_actual: usuario.id,
            conductor_id_original: usuario.id,
            estado: 'tomado',
            updated_at: new Date().toISOString()
          })
          .eq('id', repartoExistente.id);

        if (error) return 'Error tomando pasajero: ' + error.message;
      } else {
        const { error } = await supabase
          .from('reparto_pasajeros')
          .insert([{
            servicio_id: servicio.id,
            conductor_id_actual: usuario.id,
            conductor_id_original: usuario.id,
            estado: 'tomado'
          }]);

        if (error) return 'Error creando reparto: ' + error.message;
      }

      await supabase.from('movimientos_pasajeros').insert([{
        servicio_id: servicio.id,
        conductor_origen_id: null,
        conductor_destino_id: usuario.id,
        tipo_movimiento: 'tomar',
        detalle_json: {
          codigo_reserva: servicio.codigo_reserva,
          nombre_pasajero: servicio.nombre_pasajero,
          comuna: servicio.comuna
        }
      }]);

      return `Pasajero tomado: ${servicio.nombre_pasajero} - ${servicio.codigo_reserva}`;
    }

    if (texto === 'ayuda_traspasar') {
      return 'Para traspasar pasajero escribe:\ntraspasar ABC123 +56911111111';
    }

    if (texto.startsWith('traspasar ')) {
      const partes = textoMapeado.split(' ');
      if (partes.length < 3) return 'Usa: traspasar CODIGO TELEFONO';

      const codigo = partes[1].trim();
      const telefonoDestino = normalizarTelefono(partes[2].trim());

      const destino = await buscarUsuarioPorTelefono(telefonoDestino);
      if (!destino) return 'No encontré conductor destino';

      const servicio = await buscarServicioPorCodigo(codigo);
      if (!servicio) return `No encontré código ${codigo}`;

      const { data: reparto, error } = await supabase
        .from('reparto_pasajeros')
        .select('id, conductor_id_actual')
        .eq('servicio_id', servicio.id)
        .maybeSingle();

      if (error) return 'Error buscando reparto: ' + error.message;

      if (!reparto || reparto.conductor_id_actual !== usuario.id) {
        return 'Ese pasajero no está en tu lista';
      }

      const { error: errorUpdate } = await supabase
        .from('reparto_pasajeros')
        .update({
          conductor_id_actual: destino.id,
          estado: 'traspasado',
          updated_at: new Date().toISOString()
        })
        .eq('id', reparto.id);

      if (errorUpdate) return 'Error traspasando: ' + errorUpdate.message;

      await supabase.from('movimientos_pasajeros').insert([{
        servicio_id: servicio.id,
        conductor_origen_id: usuario.id,
        conductor_destino_id: destino.id,
        tipo_movimiento: 'traspasar',
        detalle_json: {
          codigo_reserva: servicio.codigo_reserva,
          nombre_pasajero: servicio.nombre_pasajero,
          comuna: servicio.comuna
        }
      }]);

      return `Pasajero traspasado a ${destino.nombre}`;
    }

    if (texto === 'bloques') {
      const { data, error } = await supabase
        .from('reparto_pasajeros')
        .select(`
          servicios_consolidados (
            hora_reserva
          )
        `)
        .eq('conductor_id_actual', usuario.id);

      if (error) return 'Error viendo bloques: ' + error.message;
      if (!data || data.length === 0) return 'No tienes bloques';

      const conteo = {};
      data.forEach(x => {
        const h = x.servicios_consolidados?.hora_reserva;
        if (!h) return;
        conteo[h] = (conteo[h] || 0) + 1;
      });

      let respuesta = 'Mis bloques:\n';
      Object.keys(conteo).sort().forEach((h, i) => {
        respuesta += `${i + 1}. ${h} - ${conteo[h]} pasajeros\n`;
      });

      return respuesta;
    }

    if (texto === 'ayuda_mb') {
      return 'Para ver detalle de bloque escribe:\nmb 00:10:00';
    }

    if (texto.startsWith('mb ')) {
      const hora = textoMapeado.slice(3).trim();

      const { data, error } = await supabase
        .from('reparto_pasajeros')
        .select(`
          estado,
          servicios_consolidados (
            codigo_reserva,
            nombre_pasajero,
            hora_reserva
          )
        `)
        .eq('conductor_id_actual', usuario.id);

      if (error) return 'Error viendo bloque: ' + error.message;

      const filtrados = (data || []).filter(x => x.servicios_consolidados?.hora_reserva === hora);

      if (filtrados.length === 0) return 'No tienes pasajeros en ese bloque';

      let respuesta = `Bloque ${hora}:\n`;
      filtrados.forEach((x, i) => {
        const s = x.servicios_consolidados;
        respuesta += `${i + 1}. ${s.codigo_reserva} - ${s.nombre_pasajero} - ${x.estado}\n`;
      });

      return respuesta;
    }

    if (texto === 'ayuda_ib') {
      return 'Para iniciar bloque escribe:\nib 00:10:00\nDebes enviar ubicación.';
    }

    if (texto.startsWith('ib ')) {
      const hora = textoMapeado.slice(3).trim();

      if (latitud == null || longitud == null) {
        return 'Faltan latitud y longitud. Envía tu ubicación y luego intenta iniciar el bloque.';
      }

      const { capacidad, codMovil } = await buscarCapacidadConductor(usuario, fechaHoy);
      const totalBloque = await contarPasajerosBloque(usuario.id, hora);

      if (capacidad && totalBloque > capacidad) {
        return `No puedes iniciar bloque ${hora}.
Móvil: ${codMovil || 'sin móvil'}
Capacidad: ${capacidad}
Asignados: ${totalBloque}
Debes traspasar ${totalBloque - capacidad} pasajero(s).`;
      }

      const { data, error } = await supabase
        .from('reparto_pasajeros')
        .select(`
          servicio_id,
          servicios_consolidados (
            hora_reserva
          )
        `)
        .eq('conductor_id_actual', usuario.id);

      if (error) return 'Error buscando bloque: ' + error.message;

      const ids = (data || [])
        .filter(x => x.servicios_consolidados?.hora_reserva === hora)
        .map(x => x.servicio_id);

      if (ids.length === 0) return 'No hay servicios en ese bloque';

      const { error: errorUpdate } = await supabase
        .from('servicios_consolidados')
        .update({
          estado: 'iniciado',
          inicio_servicio: new Date().toISOString(),
          inicio_lat: latitud,
          inicio_lng: longitud
        })
        .in('id', ids);

      if (errorUpdate) return 'Error iniciando bloque: ' + errorUpdate.message;

      return `Bloque ${hora} iniciado.
Pasajeros: ${totalBloque}${capacidad ? '/' + capacidad : ''}
Móvil: ${codMovil || 'sin móvil'}`;
    }

    if (texto === 'ayuda_tb') {
      return 'Para terminar bloque escribe:\ntb 00:10:00\nDebes enviar ubicación.';
    }

    if (texto.startsWith('tb ')) {
      const hora = textoMapeado.slice(3).trim();

      if (latitud == null || longitud == null) {
        return 'Faltan latitud y longitud. Envía tu ubicación y luego intenta terminar el bloque.';
      }

      const { data, error } = await supabase
        .from('reparto_pasajeros')
        .select(`
          servicio_id,
          servicios_consolidados (
            hora_reserva
          )
        `)
        .eq('conductor_id_actual', usuario.id);

      if (error) return 'Error buscando bloque: ' + error.message;

      const ids = (data || [])
        .filter(x => x.servicios_consolidados?.hora_reserva === hora)
        .map(x => x.servicio_id);

      if (ids.length === 0) return 'No hay servicios en ese bloque';

      const { error: errorUpdate } = await supabase
        .from('servicios_consolidados')
        .update({
          estado: 'terminado',
          termino_servicio: new Date().toISOString(),
          termino_lat: latitud,
          termino_lng: longitud
        })
        .in('id', ids);

      if (errorUpdate) return 'Error terminando bloque: ' + errorUpdate.message;

      return `Bloque ${hora} terminado`;
    }

    return 'Comando de conductor no reconocido. Escribe menu';
  }

  return 'Rol no soportado';
}

app.post('/webhook', async (req, res) => {
  try {
    const { telefono, mensaje, latitud, longitud } = req.body;

    const respuesta = await procesarMensaje({
      telefono,
      mensaje,
      latitud,
      longitud
    });

    return res.json({ ok: true, respuesta });

  } catch (err) {
    return res.json({ ok: false, respuesta: err.message });
  }
});

app.post('/twilio/webhook', async (req, res) => {
  try {
    const telefono = req.body.From?.replace('whatsapp:', '');
    const mensaje = req.body.Body;

    const latitud = req.body.Latitude || null;
    const longitud = req.body.Longitude || null;

    const respuesta = await procesarMensaje({
      telefono,
      mensaje,
      latitud,
      longitud
    });

    res.type('text/xml');
    return res.send(`
<Response>
  <Message>${escapeXml(respuesta)}</Message>
</Response>`);

  } catch (error) {
    console.error(error);

    res.type('text/xml');
    return res.send(`
<Response>
  <Message>Error interno</Message>
</Response>`);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT || 3000}`);
});