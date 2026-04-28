const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FECHA_OPERACION = '2026-04-14';

// ================= HELPERS =================

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeXml(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

// ================= ROLES =================

function esCoordinador(rol) {
  return ['coordinador', 'admin', 'admin_general'].includes((rol || '').toLowerCase());
}

function esConductor(rol) {
  return (rol || '').toLowerCase() === 'conductor';
}

// ================= MENUS (NO TOCAR) =================

function menuCoordinador(nombre) {
  return `Hola ${nombre}
Panel Coordinador

1. Ver traslados del día
2. Ver conductores
3. Ver comunas asignadas
4. Ver pasajeros por comuna
5. Asignar comuna a conductor
6. Reasignar pasajero
7. Resumen por conductor`;
}

function menuConductor(nombre) {
  return `Hola ${nombre}
Panel Conductor

1. Ver mis pasajeros
2. Ver pasajeros disponibles
3. Tomar pasajero
4. Traspasar pasajero`;
}

// ================= BUSQUEDAS =================

async function buscarConductor(nombre) {
  const texto = normalizarTexto(nombre);

  const { data } = await supabase
    .from('usuarios')
    .select('*')
    .eq('rol', 'conductor')
    .eq('activo', true);

  const encontrados = data.filter(u =>
    normalizarTexto(u.nombre).includes(texto)
  );

  if (encontrados.length === 1) return encontrados[0];
  if (encontrados.length > 1) return encontrados;

  return null;
}

async function buscarPasajero(nombre) {
  const texto = normalizarTexto(nombre);

  const { data } = await supabase
    .from('servicios_consolidados')
    .select('*')
    .limit(1000);

  const encontrados = data.filter(p =>
    normalizarTexto(p.nombre_pasajero).includes(texto)
  );

  if (encontrados.length === 1) return encontrados[0];
  if (encontrados.length > 1) return encontrados;

  return null;
}

// ================= COORDINADOR =================

async function procesarCoordinador(usuario, texto) {
  const t = texto.toLowerCase();

  // -------- OPCION 5 --------
  if (t === '5') {
    return 'Usa:\nasignar NOMBRE | comuna1, comuna2\n\nEjemplo:\nasignar danilo | quilpue, valparaiso';
  }

  if (t.startsWith('asignar ')) {

    if (!texto.includes('|')) {
      return 'Formato incorrecto:\nasignar NOMBRE | COMUNAS';
    }

    const [nombreTxt, comunasTxt] = texto.replace('asignar', '').split('|');

    const conductor = await buscarConductor(nombreTxt.trim());

    if (!conductor) return 'Conductor no encontrado';

    if (Array.isArray(conductor)) {
      return 'Hay varios conductores con ese nombre';
    }

    const comunas = comunasTxt.split(',').map(c => c.trim());

    let r = `Asignado a ${conductor.nombre}:\n`;

    for (const comuna of comunas) {

      // evitar duplicados
      const { data: existe } = await supabase
        .from('asignaciones_coordinador')
        .select('*')
        .eq('fecha_operacion', FECHA_OPERACION)
        .eq('conductor_id', conductor.id)
        .ilike('comuna', comuna)
        .maybeSingle();

      if (!existe) {
        await supabase.from('asignaciones_coordinador').insert({
          fecha_operacion: FECHA_OPERACION,
          conductor_id: conductor.id,
          conductor_nombre: conductor.nombre,
          comuna,
          activo: true
        });
      }

      r += `- ${comuna}\n`;
    }

    return r;
  }

  // -------- OPCION 6 --------
  if (t === '6') {
    return 'Usa:\nreasignar PASAJERO | CONDUCTOR\n\nEjemplo:\nreasignar evelyn ovalle | danilo';
  }

  if (t.startsWith('reasignar ')) {

    if (!texto.includes('|')) {
      return 'Formato incorrecto';
    }

    const [pasajeroTxt, conductorTxt] = texto.replace('reasignar', '').split('|');

    const pasajero = await buscarPasajero(pasajeroTxt.trim());
    const conductor = await buscarConductor(conductorTxt.trim());

    if (!pasajero) return 'Pasajero no encontrado';
    if (!conductor) return 'Conductor no encontrado';

    if (Array.isArray(pasajero)) return 'Hay varios pasajeros con ese nombre';
    if (Array.isArray(conductor)) return 'Hay varios conductores con ese nombre';

    await supabase
      .from('reparto_pasajeros')
      .update({ conductor_id_actual: conductor.id })
      .eq('servicio_id', pasajero.id);

    return `Pasajero ${pasajero.nombre_pasajero} reasignado a ${conductor.nombre}`;
  }

  // -------- OPCION 7 --------
  if (t === '7') {

    const { data } = await supabase
      .from('reparto_pasajeros')
      .select(`
        conductor_id_actual,
        servicios_consolidados (
          hora_reserva
        ),
        usuarios:conductor_id_actual (
          nombre
        )
      `);

    if (!data || data.length === 0) return 'No hay datos';

    const resumen = {};

    data.forEach(x => {
      const nombre = x.usuarios?.nombre || 'Sin conductor';
      const hora = x.servicios_consolidados?.hora_reserva || 'Sin hora';

      if (!resumen[nombre]) resumen[nombre] = {};
      if (!resumen[nombre][hora]) resumen[nombre][hora] = 0;

      resumen[nombre][hora]++;
    });

    let r = 'Resumen por conductor:\n\n';

    Object.keys(resumen).forEach(nombre => {

      r += `${nombre}\n`;

      let total = 0;

      Object.keys(resumen[nombre]).sort().forEach(hora => {
        const cantidad = resumen[nombre][hora];
        total += cantidad;
        r += `${hora} - ${cantidad} pasajeros\n`;
      });

      r += `Total: ${total}\n\n`;
    });

    return r;
  }

  return null;
}

// ================= MAIN =================

async function procesarMensaje(telefono, mensaje) {

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telefono_whatsapp', telefono.replace('whatsapp:+',''))
    .maybeSingle();

  if (!usuario) return 'Número no autorizado';

  const texto = mensaje.trim();

  if (texto.toLowerCase() === 'menu') {
    if (esCoordinador(usuario.rol)) return menuCoordinador(usuario.nombre);
    if (esConductor(usuario.rol)) return menuConductor(usuario.nombre);
  }

  if (esCoordinador(usuario.rol)) {
    const resp = await procesarCoordinador(usuario, texto);
    if (resp) return resp;
  }

  return 'Opción no válida';
}

// ================= WEBHOOK =================

app.post('/twilio/webhook', async (req, res) => {
  const telefono = req.body.From;
  const mensaje = req.body.Body;

  const respuesta = await procesarMensaje(telefono, mensaje);

  return responderXml(res, respuesta);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor activo');
});