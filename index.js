const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Necesario para Twilio

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

// FECHA DE PRUEBA
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

También puedes escribir comandos directos:
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

También puedes escribir comandos directos:
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

// ====================== TU WEBHOOK ORIGINAL ======================
app.post('/webhook', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.json({ ok: false, respuesta: 'Faltan telefono o mensaje' });
    }

    return res.json({
      ok: true,
      respuesta: `Recibido: ${mensaje}`
    });

  } catch (err) {
    return res.json({ ok: false, respuesta: err.message });
  }
});

// ====================== TWILIO ======================
app.post('/twilio/webhook', async (req, res) => {
  try {
    const telefono = req.body.From?.replace('whatsapp:', '');
    const mensaje = req.body.Body;

    if (!telefono || !mensaje) {
      res.type('text/xml');
      return res.send(`
<Response>
  <Message>Error: mensaje inválido</Message>
</Response>`);
    }

    const puerto = process.env.PORT || 3000;

    const response = await fetch(`http://127.0.0.1:${puerto}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telefono,
        mensaje
      })
    });

    const data = await response.json();
    const respuesta = data?.respuesta || 'Sin respuesta del sistema';

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

// ====================== START ======================
app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT || 3000}`);
});