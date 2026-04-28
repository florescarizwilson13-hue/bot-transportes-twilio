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

function escapeXml(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function valor(obj, campos) {
  for (const c of campos) {
    if (obj && obj[c] !== undefined && obj[c] !== null) return obj[c];
  }
  return '';
}

function menu() {
  return `Bot Transporte activo

1. Ver traslados del día
2. Ver conductores
3. Ver comunas del día

Escribe opción`;
}

async function obtenerTraslados() {
  let consulta = await supabase
    .from('vista_consolidacion_final_operativa')
    .select('*')
    .eq('fecha_reserva', FECHA_OPERACION)
    .limit(20);

  if (consulta.error) {
    consulta = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(20);
  }

  const { data, error } = consulta;

  if (error) return 'Error traslados: ' + error.message;
  if (!data || data.length === 0) return `No hay traslados para ${FECHA_OPERACION}`;

  let r = `Traslados ${FECHA_OPERACION}:\n`;

  data.forEach((t, i) => {
    const hora = valor(t, ['hora_reserva', 'Hora de reserva']);
    const nombre = valor(t, ['nombre_pasajero', 'Nombre']);
    const comuna = valor(t, ['comuna', 'Comuna']);
    const conductor = valor(t, ['conductor_nombre', 'Conductor']);

    r += `${i + 1}. ${hora || 's/hora'} - ${nombre || 's/nombre'} - ${comuna || 's/comuna'} - ${conductor || 'sin conductor'}\n`;
  });

  return r;
}

async function obtenerConductores() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('nombre, telefono_whatsapp, rol, activo')
    .eq('activo', true)
    .eq('rol', 'conductor')
    .order('nombre');

  if (error) return 'Error conductores: ' + error.message;
  if (!data || data.length === 0) return 'No hay conductores activos';

  let r = 'Conductores:\n';

  data.forEach((c, i) => {
    r += `${i + 1}. ${c.nombre || 'sin nombre'} - ${c.telefono_whatsapp || 'sin teléfono'}\n`;
  });

  return r;
}

async function obtenerComunas() {
  let consulta = await supabase
    .from('vista_consolidacion_final_operativa')
    .select('*')
    .eq('fecha_reserva', FECHA_OPERACION)
    .limit(300);

  if (consulta.error) {
    consulta = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('*')
      .limit(300);
  }

  const { data, error } = consulta;

  if (error) return 'Error comunas: ' + error.message;
  if (!data || data.length === 0) return `No hay comunas para ${FECHA_OPERACION}`;

  const conteo = {};

  data.forEach((x) => {
    const comuna = valor(x, ['comuna', 'Comuna']) || 'Sin comuna';
    conteo[comuna] = (conteo[comuna] || 0) + 1;
  });

  let r = `Comunas ${FECHA_OPERACION}:\n`;

  Object.entries(conteo)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([comuna, total], i) => {
      r += `${i + 1}. ${comuna}: ${total}\n`;
    });

  return r;
}

async function procesarMensaje(mensaje) {
  const texto = String(mensaje || '').trim().toLowerCase();

  if (texto === 'hola' || texto === 'menu') {
    return menu();
  }

  if (texto === '1') {
    return await obtenerTraslados();
  }

  if (texto === '2') {
    return await obtenerConductores();
  }

  if (texto === '3') {
    return await obtenerComunas();
  }

  return 'No entiendo. Escribe: menu';
}

app.post('/twilio/webhook', async (req, res) => {
  try {
    const mensaje = req.body.Body;
    const respuesta = await procesarMensaje(mensaje);

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