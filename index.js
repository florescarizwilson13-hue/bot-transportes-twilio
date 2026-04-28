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

// ================= FUNCIONES =================

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

1. Ver mis comunas
2. Ver pasajeros disponibles
3. Ver mis pasajeros
4. Tomar pasajero
5. Traspasar pasajero
6. Ver bloques
7. Ver detalle bloque
8. Iniciar bloque
9. Terminar bloque

Comandos:
comunas
mispasajeros
mios
tomar CODIGO
traspasar CODIGO TELEFONO
bloques`;
}

// ================= WEBHOOK PRINCIPAL =================

app.post('/twilio/webhook', async (req, res) => {
  try {
    let telefono = req.body.From?.replace('whatsapp:', '');
    let mensaje = req.body.Body;

    telefono = normalizarTelefono(telefono);
    mensaje = mensaje.toLowerCase().trim();

    console.log('MENSAJE:', telefono, mensaje);

    let respuesta = '';

    // ===== HOLA =====
    if (mensaje === 'hola') {
      respuesta = `Bot Transportes activo

Escribe:
menu`;
    }

    // ===== MENU =====
    else if (mensaje === 'menu') {
      const nombre = 'Wilson';
      const rol = 'admin'; // luego lo sacamos de Supabase

      if (esCoordinador(rol)) {
        respuesta = menuCoordinador(nombre);
      } else if (esConductor(rol)) {
        respuesta = menuConductor(nombre);
      } else {
        respuesta = 'No tienes rol asignado';
      }
    }

    // ===== DEFAULT =====
    else {
      respuesta = `No entiendo el comando

Escribe:
menu`;
    }

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

// ================= START =================

app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT || 3000}`);
});