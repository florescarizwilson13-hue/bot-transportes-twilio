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

function escapeXml(valor) {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fechaOperacion() {
  return '2026-04-14';
}

function menuCoordinador() {
  return `Hola Wilson
Panel Coordinador

1. Ver traslados del día
2. Ver conductores
3. Ver comunas asignadas
4. Ver pasajeros por comuna
5. Asignar comuna a conductor
6. Reasignar pasajero
7. Resumen por conductor

Escribe el número de opción`;
}

async function procesarMensaje(mensaje) {
  const texto = String(mensaje || '').trim().toLowerCase();
  const fechaHoy = fechaOperacion();

  if (texto === 'hola' || texto === 'menu') {
    return menuCoordinador();
  }

  if (texto === '1') {
  const { data, error } = await supabase
    .from('usuarios')
    .select('nombre, rol')
    .limit(5);

  if (error) return 'Error: ' + error.message;
  if (!data || data.length === 0) return 'No hay datos en usuarios';

  let respuesta = 'Prueba Supabase OK:\n';
  data.forEach((x, i) => {
    respuesta += `${i + 1}. ${x.nombre} - ${x.rol}\n`;
  });

  return respuesta;
}

  if (texto === '2') {
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

  if (texto === '3') {
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

  if (texto === '7') {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select('conductor_id_actual');

    if (error) return 'Error generando resumen: ' + error.message;
    if (!data || data.length === 0) return 'No hay pasajeros repartidos';

    const conteo = {};
    data.forEach(x => {
      const id = x.conductor_id_actual || 'Sin conductor';
      conteo[id] = (conteo[id] || 0) + 1;
    });

    let respuesta = 'Resumen por conductor:\n';
    Object.keys(conteo).forEach((k, i) => {
      respuesta += `${i + 1}. ${k} - ${conteo[k]} pasajeros\n`;
    });

    return respuesta;
  }

  return 'No entiendo el comando. Escribe: menu';
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