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

function menu() {
  return `Bot Transporte activo

1. Ver traslados del día
2. Ver conductores
3. Ver comunas del día

Escribe opción`;
}

async function procesarMensaje(mensaje) {
  const texto = String(mensaje || '').trim().toLowerCase();

  if (texto === 'hola' || texto === 'menu') {
    return menu();
  }

  if (texto === '1') {
    const { data, error } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('"Código", "Nombre", "Teléfono", "Comuna", "Conductor", "Hora de reserva"')
      .eq('"Fecha"', FECHA_OPERACION)
      .limit(20);

    if (error) return 'Error traslados: ' + error.message;
    if (!data || data.length === 0) return `No hay traslados para ${FECHA_OPERACION}`;

    let r = `Traslados ${FECHA_OPERACION}:\n`;
    data.forEach((t, i) => {
      r += `${i + 1}. ${t['Hora de reserva'] || 's/hora'} - ${t.Nombre || 's/nombre'} - ${t.Comuna || 's/comuna'} - ${t.Conductor || 'sin conductor'}\n`;
    });
    return r;
  }

  if (texto === '2') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('usuario, correo, rol')
      .ilike('rol', '%conductor%')
      .limit(20);

    if (error) return 'Error conductores: ' + error.message;
    if (!data || data.length === 0) return 'No hay conductores encontrados';

    let r = 'Conductores:\n';
    data.forEach((u, i) => {
      r += `${i + 1}. ${u.usuario || u.correo || 'sin usuario'} (${u.rol || 'sin rol'})\n`;
    });
    return r;
  }

  if (texto === '3') {
    const { data, error } = await supabase
      .from('vista_consolidacion_final_operativa')
      .select('"Comuna"')
      .eq('"Fecha"', FECHA_OPERACION)
      .limit(200);

    if (error) return 'Error comunas: ' + error.message;
    if (!data || data.length === 0) return `No hay comunas para ${FECHA_OPERACION}`;

    const conteo = {};
    data.forEach(x => {
      const comuna = x.Comuna || 'Sin comuna';
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