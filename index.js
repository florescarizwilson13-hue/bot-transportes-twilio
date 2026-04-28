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

const FECHA_OPERACION = '2026-04-14';

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

function responderXml(res, mensaje) {
  res.type('text/xml');
  return res.send(`
<Response>
  <Message>${escapeXml(mensaje)}</Message>
</Response>`);
}

function campo(obj, nombres) {
  for (const n of nombres) {
    if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return '';
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

1. Ver mis pasajeros tomados
2. Ver pasajeros disponibles de mis comunas
3. Tomar pasajero
4. Traspasar pasajero
5. Ver bloques

Comandos:
tomar CODIGO
traspasar CODIGO TELEFONO
bloques`;
}

async function buscarUsuarioPorTelefono(telefono) {
  const tel = normalizarTelefono(telefono);

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, telefono_whatsapp, rol, comuna_asignada, activo')
    .eq('telefono_whatsapp', tel)
    .eq('activo', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function obtenerComunasConductor(usuario) {
  const comunas = [];

  if (usuario.comuna_asignada) {
    comunas.push(usuario.comuna_asignada);
  }

  const { data } = await supabase
    .from('asignaciones_coordinador')
    .select('comuna')
    .eq('conductor_id', usuario.id)
    .eq('fecha_operacion', FECHA_OPERACION)
    .eq('activo', true);

  (data || []).forEach(x => {
    if (x.comuna) comunas.push(x.comuna);
  });

  return [...new Set(comunas.map(c => String(c).trim()).filter(Boolean))];
}

async function buscarServicioPorCodigo(codigo) {
  const { data, error } = await supabase
    .from('servicios_consolidados')
    .select('*')
    .eq('codigo_reserva', codigo)
    .maybeSingle();

  if (!error && data) return data;
  return null;
}

async function procesarCoordinador(usuario, textoOriginal) {
  const texto = textoOriginal.trim();
  const textoLower = texto.toLowerCase();

  if (textoLower === '1') {
    const { data, error } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(300);

    if (error) return 'Error traslados: ' + error.message;
    if (!data || data.length === 0) return 'No hay traslados';

    const conteo = {};
    data.forEach(x => {
      const hora = campo(x, ['hora_reserva', 'Hora de reserva']) || 'Sin hora';
      conteo[hora] = (conteo[hora] || 0) + 1;
    });

    let r = 'Traslados del día:\n';
    Object.keys(conteo).sort().forEach((h, i) => {
      r += `${i + 1}. ${h} - ${conteo[h]} pasajeros\n`;
    });

    return r;
  }

  if (textoLower === '2' || textoLower === 'conductores') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, telefono_whatsapp, rol')
      .eq('activo', true)
      .eq('rol', 'conductor')
      .order('nombre');

    if (error) return 'Error conductores: ' + error.message;
    if (!data || data.length === 0) return 'No hay conductores';

    let r = 'Conductores:\n';
    data.forEach((c, i) => {
      r += `${i + 1}. ${c.nombre} - ${c.telefono_whatsapp || 'sin teléfono'}\n`;
    });

    return r;
  }

  if (textoLower === '3' || textoLower === 'comunas') {
    const { data, error } = await supabase
      .from('asignaciones_coordinador')
      .select('conductor_nombre, comuna')
      .eq('fecha_operacion', FECHA_OPERACION)
      .eq('activo', true)
      .order('conductor_nombre');

    if (error) return 'Error comunas: ' + error.message;
    if (!data || data.length === 0) return 'No hay comunas asignadas';

    let r = 'Asignaciones del día:\n';
    data.forEach((x, i) => {
      r += `${i + 1}. ${x.conductor_nombre} - ${x.comuna}\n`;
    });

    return r;
  }

  if (textoLower === '4') {
    return 'Para ver pasajeros por comuna escribe:\nver Quilpué';
  }

  if (textoLower.startsWith('ver ')) {
    const comunaBuscada = texto.slice(4).trim();

    const { data, error } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .ilike('comuna', `%${comunaBuscada}%`)
      .limit(30);

    if (error) return 'Error viendo comuna: ' + error.message;
    if (!data || data.length === 0) return `No hay pasajeros en ${comunaBuscada}`;

    let r = `Pasajeros en ${comunaBuscada}:\n`;
    data.forEach((p, i) => {
      const codigo = campo(p, ['codigo_reserva', 'Código', 'codigo']);
      const nombre = campo(p, ['nombre_pasajero', 'Nombre', 'nombre']);
      const hora = campo(p, ['hora_reserva', 'Hora de reserva']);
      r += `${i + 1}. ${codigo} - ${nombre} - ${hora}\n`;
    });

    return r;
  }

  if (textoLower === '5') {
    return 'Para asignar comuna escribe:\nasignar 56939414443 Quilpué';
  }

  if (textoLower.startsWith('asignar ')) {
    const partes = texto.split(' ');
    if (partes.length < 3) return 'Usa: asignar TELEFONO COMUNA';

    const telefonoDestino = normalizarTelefono(partes[1]);
    const comuna = partes.slice(2).join(' ').trim();

    const destino = await buscarUsuarioPorTelefono(telefonoDestino);
    if (!destino) return 'No encontré conductor con ese teléfono';

    await supabase
      .from('usuarios')
      .update({ comuna_asignada: comuna })
      .eq('id', destino.id);

    const { error } = await supabase
      .from('asignaciones_coordinador')
      .insert([{
        fecha_operacion: FECHA_OPERACION,
        conductor_id: destino.id,
        conductor_nombre: destino.nombre,
        comuna,
        activo: true
      }]);

    if (error && !String(error.message).toLowerCase().includes('duplicate')) {
      return 'Error asignando comuna: ' + error.message;
    }

    return `Asignación creada: ${destino.nombre} → ${comuna}`;
  }

  if (textoLower === '6') {
    return 'Para reasignar pasajero escribe:\nreasignar CODIGO TELEFONO';
  }

  if (textoLower.startsWith('reasignar ')) {
    return 'Reasignar pasajero será el siguiente módulo.';
  }

  if (textoLower === '7' || textoLower === 'resumen') {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select(`
        conductor_id_actual,
        usuarios:conductor_id_actual (
          nombre
        )
      `);

    if (error) return 'Error resumen: ' + error.message;
    if (!data || data.length === 0) return 'No hay pasajeros repartidos';

    const conteo = {};
    data.forEach(x => {
      const nombre = x.usuarios?.nombre || 'Sin conductor';
      conteo[nombre] = (conteo[nombre] || 0) + 1;
    });

    let r = 'Resumen por conductor:\n';
    Object.entries(conteo).forEach(([nombre, total], i) => {
      r += `${i + 1}. ${nombre} - ${total} pasajeros\n`;
    });

    return r;
  }

  return 'Comando coordinador no reconocido. Escribe menu';
}

async function procesarConductor(usuario, textoOriginal) {
  const texto = textoOriginal.trim();
  const textoLower = texto.toLowerCase();

  if (textoLower === '1') {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select(`
        servicio_id,
        estado,
        servicios_consolidados (
          codigo_reserva,
          nombre_pasajero,
          comuna,
          hora_reserva
        )
      `)
      .eq('conductor_id_actual', usuario.id);

    if (error) return 'Error mis pasajeros: ' + error.message;
    if (!data || data.length === 0) return 'No tienes pasajeros tomados todavía';

    let r = 'Mis pasajeros tomados:\n';
    data.forEach((x, i) => {
      const s = x.servicios_consolidados || {};
      r += `${i + 1}. ${s.codigo_reserva || x.servicio_id} - ${s.nombre_pasajero || 'sin nombre'} - ${s.comuna || 'sin comuna'} - ${s.hora_reserva || 's/hora'}\n`;
    });

    return r;
  }

  if (textoLower === '2') {
    const comunas = await obtenerComunasConductor(usuario);

    if (comunas.length === 0) {
      return 'No tienes comunas asignadas. Pide al coordinador que te asigne una comuna.';
    }

    let todos = [];

    for (const comuna of comunas) {
      const { data, error } = await supabase
        .from('vista_consolidacion_final_operativa')
        .select('*')
        .ilike('comuna', `%${comuna}%`)
        .limit(40);

      if (!error && data) todos = todos.concat(data);
    }

    if (todos.length === 0) {
      return `No hay pasajeros disponibles para tus comunas: ${comunas.join(', ')}`;
    }

    todos.sort((a, b) => {
      const ha = campo(a, ['hora_reserva', 'Hora de reserva']) || '';
      const hb = campo(b, ['hora_reserva', 'Hora de reserva']) || '';
      return ha.localeCompare(hb);
    });

    let r = `Pasajeros disponibles (${comunas.join(', ')}):\n`;
    todos.slice(0, 20).forEach((p, i) => {
      const codigo = campo(p, ['codigo_reserva', 'Código', 'codigo']);
      const nombre = campo(p, ['nombre_pasajero', 'Nombre', 'nombre']);
      const comuna = campo(p, ['comuna', 'Comuna']);
      const hora = campo(p, ['hora_reserva', 'Hora de reserva']);
      r += `${i + 1}. ${codigo} - ${nombre} - ${comuna} - ${hora}\n`;
    });

    if (todos.length > 20) r += `\nMostrando 20 de ${todos.length}.`;

    return r;
  }

  if (textoLower === '3') {
    return 'Para tomar pasajero escribe:\ntomar CODIGO\nEjemplo:\ntomar ABC123';
  }

  if (textoLower.startsWith('tomar ')) {
    const codigo = texto.slice(6).trim();
    const servicio = await buscarServicioPorCodigo(codigo);

    if (!servicio) return `No encontré pasajero con código ${codigo}`;

    const servicioId = servicio.id;
    if (!servicioId) return 'No pude identificar el ID del servicio';

    const { data: existente } = await supabase
      .from('reparto_pasajeros')
      .select('id, conductor_id_actual')
      .eq('servicio_id', servicioId)
      .maybeSingle();

    if (existente && existente.conductor_id_actual && existente.conductor_id_actual !== usuario.id) {
      return 'Ese pasajero ya fue tomado por otro conductor';
    }

    if (existente && existente.conductor_id_actual === usuario.id) {
      return 'Ese pasajero ya está en tu lista';
    }

    if (existente) {
      const { error } = await supabase
        .from('reparto_pasajeros')
        .update({
          conductor_id_actual: usuario.id,
          conductor_id_original: usuario.id,
          estado: 'tomado',
          updated_at: new Date().toISOString()
        })
        .eq('id', existente.id);

      if (error) return 'Error tomando pasajero: ' + error.message;
    } else {
      const { error } = await supabase
        .from('reparto_pasajeros')
        .insert([{
          servicio_id: servicioId,
          conductor_id_actual: usuario.id,
          conductor_id_original: usuario.id,
          estado: 'tomado'
        }]);

      if (error) return 'Error tomando pasajero: ' + error.message;
    }

    return `Pasajero tomado: ${servicio.nombre_pasajero || codigo}`;
  }

  if (textoLower === '4') {
    return 'Para traspasar pasajero escribe:\ntraspasar CODIGO TELEFONO\nEjemplo:\ntraspasar ABC123 56990507327';
  }

  if (textoLower.startsWith('traspasar ')) {
    return 'Traspasar pasajero será el siguiente módulo.';
  }

  if (textoLower === '5' || textoLower === 'bloques') {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select(`
        servicios_consolidados (
          hora_reserva
        )
      `)
      .eq('conductor_id_actual', usuario.id);

    if (error) return 'Error bloques: ' + error.message;
    if (!data || data.length === 0) return 'No tienes pasajeros tomados';

    const conteo = {};
    data.forEach(x => {
      const hora = x.servicios_consolidados?.hora_reserva || 'Sin hora';
      conteo[hora] = (conteo[hora] || 0) + 1;
    });

    let r = 'Mis bloques:\n';
    Object.entries(conteo).forEach(([hora, total], i) => {
      r += `${i + 1}. ${hora} - ${total} pasajeros\n`;
    });

    return r;
  }

  return 'Comando conductor no reconocido. Escribe menu';
}

async function procesarMensaje(telefono, mensaje) {
  const usuario = await buscarUsuarioPorTelefono(telefono);
  if (!usuario) return 'Número no autorizado';

  const texto = String(mensaje || '').trim();

  if (texto.toLowerCase() === 'menu' || texto.toLowerCase() === 'hola') {
    if (esCoordinador(usuario.rol)) return menuCoordinador(usuario.nombre);
    if (esConductor(usuario.rol)) return menuConductor(usuario.nombre);
    return 'Rol no soportado';
  }

  if (esCoordinador(usuario.rol)) return await procesarCoordinador(usuario, texto);
  if (esConductor(usuario.rol)) return await procesarConductor(usuario, texto);

  return 'Rol no soportado';
}

app.post('/twilio/webhook', async (req, res) => {
  try {
    const telefono = req.body.From?.replace('whatsapp:', '');
    const mensaje = req.body.Body || '';
    const respuesta = await procesarMensaje(telefono, mensaje);
    return responderXml(res, respuesta);
  } catch (error) {
    console.error(error);
    return responderXml(res, 'Error interno: ' + error.message);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;
    const respuesta = await procesarMensaje(telefono, mensaje);
    return res.json({ ok: true, respuesta });
  } catch (error) {
    return res.json({ ok: false, respuesta: error.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT || 3000}`);
});