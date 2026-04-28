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

function menu() {
  return `Bot Transporte activo

1. Ver traslados
2. Ver usuarios
3. Test conexión

Escribe opción`;
}

async function procesarMensaje(mensaje) {
  const texto = String(mensaje || '').trim().toLowerCase();

  if (texto === 'hola' || texto === 'menu') {
    return menu();
  }

  // ================= TEST =================
  if (texto === '3') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .limit(3);

    if (error) return 'Error conexión: ' + error.message;

    return `Conexión OK. Filas: ${data.length}`;
  }

  // ================= USUARIOS =================
  if (texto === '2') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('usuario, correo, rol')
      .limit(10);

    if (error) return 'Error usuarios: ' + error.message;
    if (!data || data.length === 0) return 'No hay usuarios';

    let r = 'Usuarios:\n';

    data.forEach((u, i) => {
      r += `${i + 1}. ${u.usuario} (${u.rol})\n`;
    });

    return r;
  }

  // ================= TRASLADOS =================
  if (texto === '1') {
    const { data, error } = await supabase
      .from('servicios_consolidados') // ← AJUSTAREMOS DESPUÉS
      .select('*')
      .limit(5);

    if (error) {
      return 'Error traslados: ' + error.message;
    }

    return `Traslados encontrados: ${data.length}`;
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