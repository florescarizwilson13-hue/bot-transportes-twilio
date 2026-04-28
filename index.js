require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: false }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.post('/webhook', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  let mensaje = (req.body.Body || '').trim();
  let telefono = (req.body.From || '').replace('whatsapp:+', '');

  try {
    // 🔍 Buscar usuario
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('*')
      .eq('telefono_whatsapp', telefono)
      .single();

    if (!usuario || !usuario.activo) {
      twiml.message('Número no autorizado');
      return res.send(twiml.toString());
    }

    // =========================
    // 📌 MENÚ
    // =========================
    if (mensaje.toLowerCase() === 'menu') {
      if (usuario.rol === 'coordinador') {
        twiml.message(
`Panel Coordinador

1. Ver traslados del día
2. Ver conductores
3. Ver comunas asignadas
4. Ver pasajeros por comuna
5. Asignar comuna a conductor
6. Reasignar pasajero
7. Resumen por conductor`
        );
      } else {
        twiml.message(
`Panel Conductor

1. Ver mis pasajeros
2. Ver pasajeros disponibles (mi comuna)
3. Tomar pasajero
4. Traspasar pasajero`
        );
      }
      return res.send(twiml.toString());
    }

    // =========================
    // 📌 COORDINADOR
    // =========================
    if (usuario.rol === 'coordinador') {

      if (mensaje === '1') {
        const { data } = await supabase
          .from('vista_consolidacion_final_operativa')
          .select('*')
          .order('Hora de reserva');

        let resumen = {};

        data.forEach(d => {
          let hora = d["Hora de reserva"];
          resumen[hora] = (resumen[hora] || 0) + 1;
        });

        let msg = 'Traslados del día:\n';
        Object.keys(resumen).forEach((h, i) => {
          msg += `${i+1}. ${h} - ${resumen[h]} pasajeros\n`;
        });

        twiml.message(msg);
      }

      if (mensaje === '2') {
        const { data } = await supabase.from('usuarios').select('*');

        let msg = 'Conductores:\n';
        data.forEach((u, i) => {
          msg += `${i+1}. ${u.nombre} - ${u.telefono_whatsapp}\n`;
        });

        twiml.message(msg);
      }

      if (mensaje.startsWith('asignar')) {
        let partes = mensaje.split(' ');
        let tel = partes[1].replace('+','');
        let comuna = partes.slice(2).join(' ');

        await supabase
          .from('usuarios')
          .update({ comuna_asignada: comuna })
          .eq('telefono_whatsapp', tel);

        twiml.message(`Asignación creada: ${tel} → ${comuna}`);
      }
    }

    // =========================
    // 📌 CONDUCTOR
    // =========================
    if (usuario.rol === 'conductor') {

      // 1️⃣ VER MIS PASAJEROS
      if (mensaje === '1') {
        const { data } = await supabase
          .from('reparto_pasajeros')
          .select('*')
          .eq('conductor_id_actual', usuario.id);

        if (!data || data.length === 0) {
          return twiml.message('No tienes pasajeros asignados');
        }

        let msg = 'Tus pasajeros:\n';
        data.forEach((p, i) => {
          msg += `${i+1}. ${p.servicio_id}\n`;
        });

        twiml.message(msg);
      }

      // 2️⃣ VER PASAJEROS POR COMUNA
      if (mensaje === '2') {

        if (!usuario.comuna_asignada) {
          return twiml.message('No tienes comuna asignada');
        }

        const { data } = await supabase
          .from('vista_consolidacion_final_operativa')
          .select('*')
          .ilike('Comuna', `%${usuario.comuna_asignada}%`)
          .order('Hora de reserva');

        if (!data || data.length === 0) {
          return twiml.message('No hay pasajeros disponibles');
        }

        let msg = `Pasajeros en ${usuario.comuna_asignada}:\n`;

        data.slice(0, 15).forEach((p, i) => {
          msg += `${i+1}. ${p.Código} - ${p.Nombre} - ${p["Hora de reserva"]}\n`;
        });

        twiml.message(msg);
      }

      // 3️⃣ TOMAR PASAJERO
      if (mensaje.startsWith('tomar')) {
        let codigo = mensaje.split(' ')[1];

        await supabase.from('reparto_pasajeros').insert({
          servicio_id: codigo,
          conductor_id_actual: usuario.id
        });

        twiml.message(`Pasajero ${codigo} asignado`);
      }

      // 4️⃣ TRASPASAR
      if (mensaje.startsWith('traspasar')) {
        let partes = mensaje.split(' ');
        let codigo = partes[1];
        let tel = partes[2].replace('+','');

        const { data: destino } = await supabase
          .from('usuarios')
          .select('*')
          .eq('telefono_whatsapp', tel)
          .single();

        await supabase
          .from('reparto_pasajeros')
          .update({ conductor_id_actual: destino.id })
          .eq('servicio_id', codigo);

        twiml.message(`Pasajero ${codigo} traspasado`);
      }
    }

  } catch (err) {
    twiml.message('Error sistema');
  }

  res.send(twiml.toString());
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor corriendo');
});