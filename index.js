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
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ====================== WEBHOOK PRINCIPAL ======================
app.post('/webhook', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.json({ ok: false, respuesta: 'Faltan datos' });
    }

    const texto = mensaje.trim().toLowerCase();

    // ===== MENU =====
    if (texto === 'hola' || texto === 'menu') {
      return res.json({
        ok: true,
        respuesta: `Hola Wilson
Panel Coordinador

1. Ver traslados del día
2. Ver conductores
3. Ver comunas asignadas
4. Ver pasajeros por comuna
5. Asignar comuna a conductor
6. Reasignar pasajero
7. Resumen por conductor

Escribe el número de opción`
      });
    }

    // ===== OPCIONES =====
    if (texto === '1') {
      return res.json({
        ok: true,
        respuesta: 'Mostrando traslados del día...'
      });
    }

    if (texto === '2') {
      return res.json({
        ok: true,
        respuesta: 'Lista de conductores...'
      });
    }

    if (texto === '3') {
      return res.json({
        ok: true,
        respuesta: 'Comunas asignadas...'
      });
    }

    if (texto === '4') {
      return res.json({
        ok: true,
        respuesta: 'Pasajeros por comuna...'
      });
    }

    if (texto === '5') {
      return res.json({
        ok: true,
        respuesta: 'Asignar comuna a conductor...'
      });
    }

    if (texto === '6') {
      return res.json({
        ok: true,
        respuesta: 'Reasignar pasajero...'
      });
    }

    if (texto === '7') {
      return res.json({
        ok: true,
        respuesta: 'Resumen por conductor...'
      });
    }

    // ===== DEFAULT =====
    return res.json({
      ok: true,
      respuesta: 'No entiendo el comando. Escribe: menu'
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
      body: JSON.stringify({ telefono, mensaje })
    });

    const data = await response.json();
    const respuesta = data?.respuesta || 'Sin respuesta';

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