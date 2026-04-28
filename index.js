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

function normalizarTelefono(valor) {
  return String(valor || '').replace(/\D/g, '').trim();
}

// 🔥 NORMALIZADOR DE TEXTO (CLAVE PARA COMUNAS)
function normalizarTexto(texto) {
  return String(texto || '')
    .normalize("NFD")                 // separa acentos
    .replace(/[\u0300-\u036f]/g, "") // elimina acentos
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

// ================= MENUS =================

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

// ================= USUARIO =================

async function buscarUsuario(telefono) {
  const tel = normalizarTelefono(telefono);

  const { data } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telefono_whatsapp', tel)
    .eq('activo', true)
    .maybeSingle();

  return data;
}

// ================= COORDINADOR =================

async function procesarCoordinador(usuario, texto) {

  const textoLower = texto.toLowerCase();

  // 1. TRASLADOS
  if (textoLower === '1') {

    const { data } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(200);

    if (!data || data.length === 0) return 'No hay traslados';

    const conteo = {};

    data.forEach(x => {
      const hora = campo(x, ['Hora de reserva']);
      conteo[hora] = (conteo[hora] || 0) + 1;
    });

    let r = 'Traslados del día:\n';
    Object.keys(conteo).sort().forEach((h, i) => {
      r += `${i + 1}. ${h} - ${conteo[h]} pasajeros\n`;
    });

    return r;
  }

  // 2. CONDUCTORES
  if (textoLower === '2') {

    const { data } = await supabase
      .from('usuarios')
      .select('nombre, telefono_whatsapp')
      .eq('rol', 'conductor')
      .eq('activo', true);

    let r = 'Conductores:\n';
    data.forEach((c, i) => {
      r += `${i + 1}. ${c.nombre} - ${c.telefono_whatsapp || 'sin teléfono'}\n`;
    });

    return r;
  }

  // 3. COMUNAS
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

  // 4. PASAJEROS POR COMUNA
  if (textoLower === '4') {
    return 'Escribe:\nver Quilpué';
  }

  // 🔥 AQUI ESTABA EL ERROR → YA ARREGLADO + NORMALIZADO
  if (textoLower.startsWith('ver ')) {

    const comunaInput = texto.substring(4).trim();
    const comunaNormalizada = normalizarTexto(comunaInput);

    const { data } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(500);

    if (!data || data.length === 0) return 'No hay datos';

    // 🔥 FILTRO INTELIGENTE
    const filtrados = data.filter(p => {
      const comunaDB = normalizarTexto(campo(p, ['Comuna']));
      return comunaDB.includes(comunaNormalizada);
    });

    if (filtrados.length === 0) {
      return `No hay pasajeros en ${comunaInput}`;
    }

    let r = `Pasajeros en ${comunaInput}:\n`;

    filtrados.slice(0, 30).forEach((p, i) => {
      const codigo = campo(p, ['Código']);
      const nombre = campo(p, ['Nombre']);
      const comuna = campo(p, ['Comuna']);
      const hora = campo(p, ['Hora de reserva']);

      r += `${i + 1}. ${codigo} - ${nombre} - ${hora}\n`;
    });

    return r;
  }

  return 'Opción no válida';
}

// ================= CONDUCTOR =================

async function procesarConductor(usuario, texto) {

  const textoLower = texto.toLowerCase();

  // 1. MIS PASAJEROS
  if (textoLower === '1') {

    const { data } = await supabase
      .from('reparto_pasajeros')
      .select(`
        servicios_consolidados (
          codigo_reserva,
          nombre_pasajero,
          comuna,
          hora_reserva
        )
      `)
      .eq('conductor_id_actual', usuario.id);

    if (!data || data.length === 0) return 'No tienes pasajeros asignados';

    let r = 'Tus pasajeros:\n';

    data.forEach((x, i) => {
      const s = x.servicios_consolidados;
      r += `${i + 1}. ${s.codigo_reserva} - ${s.nombre_pasajero} - ${s.hora_reserva}\n`;
    });

    return r;
  }

  // 2. PASAJEROS DISPONIBLES
  if (textoLower === '2') {

    if (!usuario.comuna_asignada) {
      return 'No tienes comuna asignada';
    }

    const comunaUser = normalizarTexto(usuario.comuna_asignada);

    const { data } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(500);

    const filtrados = data.filter(p => {
      const comunaDB = normalizarTexto(campo(p, ['Comuna']));
      return comunaDB.includes(comunaUser);
    });

    if (filtrados.length === 0) return 'No hay pasajeros disponibles';

    let r = 'Pasajeros disponibles:\n';

    filtrados.slice(0, 30).forEach((p, i) => {
      r += `${i + 1}. ${campo(p, ['Código'])} - ${campo(p, ['Nombre'])} - ${campo(p, ['Hora de reserva'])}\n`;
    });

    return r;
  }

  return 'Opción no válida';
}

// ================= MAIN =================

async function procesarMensaje(telefono, mensaje) {

  const usuario = await buscarUsuario(telefono);
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
  const telefono = req.body.From?.replace('whatsapp:', '');
  const mensaje = req.body.Body;

  const respuesta = await procesarMensaje(telefono, mensaje);

  return responderXml(res, respuesta);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor activo');
});