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
7. Resumen por conductor

Comandos:
conductores
comunas
ver NOMBRE_COMUNA
asignar NOMBRE | COMUNAS
reasignar PASAJERO | CONDUCTOR
resumen`;
}

function menuConductor(nombre) {
  return `Hola ${nombre}
Panel Conductor

1. Ver mis pasajeros
2. Ver pasajeros disponibles
3. Tomar pasajero
4. Traspasar pasajero`;
}

// ================= BUSCAR USUARIO =================

async function buscarUsuarioPorNombre(nombre) {
  const texto = normalizarTexto(nombre);

  const { data } = await supabase
    .from('usuarios')
    .select('*')
    .eq('rol', 'conductor')
    .eq('activo', true);

  if (!data) return null;

  const encontrados = data.filter(u =>
    normalizarTexto(u.nombre).includes(texto)
  );

  if (encontrados.length === 1) return encontrados[0];

  return encontrados; // puede ser array
}

// ================= COORDINADOR =================

async function procesarCoordinador(usuario, texto) {
  const textoLower = texto.toLowerCase();

  // -------- OPCIÓN 1 --------
  if (textoLower === '1') {
    const { data } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(1000);

    const conteo = {};
    data.forEach(x => {
      const hora = campo(x, ['Hora de reserva']) || 'Sin hora';
      conteo[hora] = (conteo[hora] || 0) + 1;
    });

    let r = 'Traslados del día:\n';
    Object.keys(conteo).sort().forEach((h, i) => {
      r += `${i + 1}. ${h} - ${conteo[h]} pasajeros\n`;
    });

    return r;
  }

  // -------- OPCIÓN 2 --------
  if (textoLower === '2') {
    const { data } = await supabase
      .from('usuarios')
      .select('nombre')
      .eq('rol', 'conductor')
      .eq('activo', true);

    let r = 'Conductores:\n';
    data.forEach((c, i) => {
      r += `${i + 1}. ${c.nombre}\n`;
    });

    return r;
  }

  // -------- OPCIÓN 3 --------
  if (textoLower === '3') {
    const { data } = await supabase
      .from('asignaciones_coordinador')
      .select('*')
      .eq('fecha_operacion', FECHA_OPERACION)
      .eq('activo', true);

    let r = 'Asignaciones del día:\n';
    data.forEach((x, i) => {
      r += `${i + 1}. ${x.conductor_nombre} - ${x.comuna}\n`;
    });

    return r;
  }

  // -------- OPCIÓN 4 (YA PERFECTA) --------
  if (textoLower === '4') {
    return 'Escribe:\nver Quilpué';
  }

  if (textoLower.startsWith('ver ')) {
    const comunaInput = texto.substring(4).trim();
    const comunaNormalizada = normalizarTexto(comunaInput);

    const { data } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(1000);

    const filtrados = data.filter(p =>
      normalizarTexto(campo(p, ['Comuna'])).includes(comunaNormalizada)
    );

    filtrados.sort((a, b) => {
      const ha = campo(a, ['Hora de reserva']) || '';
      const hb = campo(b, ['Hora de reserva']) || '';
      return ha.localeCompare(hb);
    });

    const grupos = {};

    filtrados.forEach(p => {
      const hora = campo(p, ['Hora de reserva']);
      const nombre = campo(p, ['Nombre']);

      if (!grupos[hora]) grupos[hora] = [];
      grupos[hora].push(nombre);
    });

    let r = `Pasajeros en ${comunaInput}:\n`;

    Object.keys(grupos).sort().forEach(hora => {
      r += `\n${hora}\n`;
      grupos[hora].forEach((n, i) => {
        r += `${i + 1}. ${n}\n`;
      });
    });

    return r;
  }

  // -------- OPCIÓN 5 (NUEVA) --------
  if (textoLower.startsWith('asignar ')) {

    if (!texto.includes('|')) {
      return 'Formato:\nasignar NOMBRE | Quilpué, Valparaíso';
    }

    const [nombreTxt, comunasTxt] = texto.replace('asignar', '').split('|');

    const conductor = await buscarUsuarioPorNombre(nombreTxt.trim());

    if (!conductor) return 'Conductor no encontrado';

    if (Array.isArray(conductor)) {
      let r = 'Varios encontrados:\n';
      conductor.forEach(c => r += `- ${c.nombre}\n`);
      return r;
    }

    const comunas = comunasTxt.split(',').map(c => c.trim());

    let r = `Asignado a ${conductor.nombre}:\n`;

    for (const comuna of comunas) {

      await supabase.from('asignaciones_coordinador').insert({
        fecha_operacion: FECHA_OPERACION,
        conductor_id: conductor.id,
        conductor_nombre: conductor.nombre,
        comuna,
        activo: true
      });

      r += `- ${comuna}\n`;
    }

    return r;
  }

  return 'Opción no válida';
}

// ================= CONDUCTOR =================

async function procesarConductor(usuario, texto) {

  if (texto === '1') {
    return 'No tienes pasajeros asignados';
  }

  if (texto === '2') {

    if (!usuario.comuna_asignada) {
      return 'No tienes comuna asignada';
    }

    const comunaUser = normalizarTexto(usuario.comuna_asignada);

    const { data } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(1000);

    const filtrados = data.filter(p =>
      normalizarTexto(campo(p, ['Comuna'])).includes(comunaUser)
    );

    let r = 'Pasajeros disponibles:\n';

    filtrados.slice(0, 30).forEach((p, i) => {
      r += `${i + 1}. ${campo(p, ['Nombre'])}\n`;
    });

    return r;
  }

  return 'Opción no válida';
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
    return await procesarCoordinador(usuario, texto);
  }

  if (esConductor(usuario.rol)) {
    return await procesarConductor(usuario, texto);
  }

  return 'Rol no válido';
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