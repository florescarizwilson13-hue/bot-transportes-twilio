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

function menu() {
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
    return menu();
  }

  // ================= 1 =================
  if (texto === '1') {
    const { data, error } = await supabase
      .from('servicios_consolidados')
      .select('hora_reserva')
      .eq('fecha_reserva', fechaHoy);

    if (error) return 'Error traslados: ' + error.message;
    if (!data || data.length === 0) return 'No hay traslados hoy';

    return `Hay ${data.length} traslados hoy`;
  }

  // ================= 2 =================
  if (texto === '2') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, telefono_whatsapp')
      .eq('rol', 'conductor')
      .eq('activo', true);

    if (error) return 'Error conductores: ' + error.message;
    if (!data || data.length === 0) return 'No hay conductores';

    let r = 'Conductores:\n';
    data.forEach((c, i) => {
      r += `${i + 1}. ${c.nombre} - ${c.telefono_whatsapp}\n`;
    });

    return r;
  }

  // ================= 3 =================
  if (texto === '3') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, comuna_asignada')
      .eq('rol', 'conductor')
      .eq('activo', true);

    if (error) return 'Error comunas: ' + error.message;
    if (!data || data.length === 0) return 'No hay comunas';

    let r = 'Comunas por conductor:\n';
    data.forEach((c, i) => {
      r += `${i + 1}. ${c.nombre} - ${c.comuna_asignada || 'sin comuna'}\n`;
    });

    return r;
  }

  // ================= DEFAULT =================
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