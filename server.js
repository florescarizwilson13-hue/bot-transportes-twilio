require('dotenv').config();

const express = require('express');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_PHONE = process.env.ADMIN_PHONE || 'whatsapp:+56990507327';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const QUICK_REPLY_CONTENT_SID = process.env.QUICK_REPLY_CONTENT_SID;

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let adminSession = null;
let currentEvent = null;

function normalize(text) {
  return (text || '').trim();
}

function lower(text) {
  return normalize(text).toLowerCase();
}

function isAdmin(phone) {
  return normalize(phone) === normalize(ADMIN_PHONE);
}

function getSteps(type) {
  if (type === 'ENTRENAMIENTO') {
    return [
      { key: 'title', prompt: 'Título del entrenamiento' },
      { key: 'date', prompt: 'Fecha' },
      { key: 'place', prompt: 'Lugar' },
      { key: 'call_time', prompt: 'Hora de llegada' },
      { key: 'start_time', prompt: 'Hora de inicio' },
      { key: 'staff', prompt: 'Cuerpo técnico' },
    ];
  }

  return [
    { key: 'title', prompt: 'Título del partido' },
    { key: 'date', prompt: 'Fecha' },
    { key: 'rival', prompt: 'Rival' },
    { key: 'place', prompt: 'Cancha' },
    { key: 'call_time', prompt: 'Hora en cancha' },
    { key: 'start_time', prompt: 'Hora de inicio' },
    { key: 'staff', prompt: 'Cuerpo técnico' },
  ];
}

function splitStaff(staffText) {
  return normalize(staffText)
    .split('/')
    .map(x => x.trim())
    .filter(Boolean);
}

function formatBulletList(names) {
  if (!names.length) return '• Ninguno';
  return names.map(name => `• ${name}`).join('\n');
}

function formatNumberedList(names) {
  if (!names.length) return '• Ninguno';
  return names.map((name, i) => `${i + 1}. ${name}`).join('\n');
}

function buildEventMessage(event, playerRows, responseRows) {
  const responseMap = new Map();
  for (const r of responseRows) {
    responseMap.set(r.player_id, r.response);
  }

  const attends = [];
  const noAttends = [];
  const pending = [];

  for (const p of playerRows) {
    const status = responseMap.get(p.id) || 'PENDIENTE';
    if (status === 'ASISTE') attends.push(p.name);
    else if (status === 'NO_ASISTE') noAttends.push(p.name);
    else pending.push(p.name);
  }

  const divider = '━━━━━━━━━━━━━━━━━';


  if (event.type === 'ENTRENAMIENTO') {
    const staffList = splitStaff(event.staff);
    const staffLines = staffList.length ? staffList.map(x => `• ${x}`).join('\n') : '• Ninguno';

    return [
      '⚽🏃 *ENTRENAMIENTO*',
      `📌 *${event.title || 'Sin título'}*`,
      '',
      divider,
      `📅 *Fecha:* ${event.event_date || '-'}`,
      `📍 *Lugar:* ${event.place || '-'}`,
      `⏰ *Llegada:* ${event.call_time || '-'}`,
      `🕖 *Inicio:* ${event.start_time || '-'}`,
      divider,
      '🎽 *CUERPO TÉCNICO*',
      staffLines,
      divider,
      '🟢 *ASISTEN*',
      formatBulletList(attends),
      '',
      '🔴 *NO ASISTEN*',
      formatBulletList(noAttends),
      '',
      '🟡 *PENDIENTES*',
      formatNumberedList(pending),
      '',
      divider,
      'Selecciona una opción:',
    ].join('\n');
  }

  const staffList = splitStaff(event.staff);
  const staffLines = staffList.length ? staffList.map(x => `• ${x}`).join('\n') : '• Ninguno';

  return [
    '🏆⚽ *PARTIDO*',
    `📌 *${event.title || 'Sin título'}*`,
    '',
    divider,
    `📅 *Fecha:* ${event.event_date || '-'}`,
    `⚽ *Rival:* ${event.rival || '-'}`,
    `📍 *Cancha:* ${event.place || '-'}`,
    `⏰ *En cancha:* ${event.call_time || '-'}`,
    `🕖 *Inicio:* ${event.start_time || '-'}`,
    divider,
    '🎽 *CUERPO TÉCNICO*',
    staffLines,
    divider,
    '🟢 *ASISTEN*',
    formatBulletList(attends),
    '',
    '🔴 *NO ASISTEN*',
    formatBulletList(noAttends),
    '',
    '🟡 *PENDIENTES*',
    formatNumberedList(pending),
    '',
    divider,
    'Selecciona una opción:',
  ].join('\n');
}

async function loadActiveEvent() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'ACTIVO')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function closeActiveEvents() {
  const { error } = await supabase
    .from('events')
    .update({ status: 'CERRADO' })
    .eq('status', 'ACTIVO');

  if (error) throw error;
}

async function createEvent(eventData) {
  const { data, error } = await supabase
    .from('events')
    .insert(eventData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getActivePlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, phone, is_active')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function seedResponses(eventId) {
  const players = await getActivePlayers();
  if (!players.length) return;

  const rows = players.map(player => ({
    event_id: eventId,
    player_id: player.id,
    response: 'PENDIENTE',
  }));

  const { error } = await supabase
    .from('responses')
    .upsert(rows, { onConflict: 'event_id,player_id' });

  if (error) throw error;
}

async function getPlayerByPhone(phone) {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, phone')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertResponse(eventId, playerId, response) {
  const { error } = await supabase
    .from('responses')
    .upsert(
      {
        event_id: eventId,
        player_id: playerId,
        response,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,player_id' }
    );

  if (error) throw error;
}

async function getResponsesByEvent(eventId) {
  const { data, error } = await supabase
    .from('responses')
    .select('player_id, response')
    .eq('event_id', eventId)
    .order('player_id', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function sendQuickReplyButtons(to, summary) {
  if (!TWILIO_WHATSAPP_NUMBER) {
    throw new Error('Falta TWILIO_WHATSAPP_NUMBER en variables');
  }

  if (!QUICK_REPLY_CONTENT_SID) {
    throw new Error('Falta QUICK_REPLY_CONTENT_SID en variables');
  }

  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_NUMBER,
    to,
    contentSid: QUICK_REPLY_CONTENT_SID,
    contentVariables: JSON.stringify({
      1: summary
    }),
  });
}

app.get('/', (req, res) => {
  res.send('Servidor activo');
});

app.post('/whatsapp', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const from = normalize(req.body.From);
    const body = normalize(req.body.Body);
    const buttonPayload = normalize(req.body.ButtonPayload);
    const buttonText = normalize(req.body.ButtonText);

    const command = buttonPayload || buttonText || body;
    const commandLower = lower(command);

    console.log('FROM:', from);
    console.log('BODY:', body);
    console.log('BUTTON_TEXT:', buttonText);
    console.log('BUTTON_PAYLOAD:', buttonPayload);
    console.log('COMMAND:', command);

    if (commandLower === 'cancelar') {
      adminSession = null;
      twiml.message('Proceso cancelado.');
      return res.type('text/xml').send(twiml.toString());
    }

    if (isAdmin(from) && commandLower === 'crear partido') {
      adminSession = {
        phone: from,
        type: 'PARTIDO',
        stepIndex: 0,
        data: {},
      };
      twiml.message('Vamos paso a paso.\n\nTítulo del partido');
      return res.type('text/xml').send(twiml.toString());
    }

    if (isAdmin(from) && commandLower === 'crear entrenamiento') {
      adminSession = {
        phone: from,
        type: 'ENTRENAMIENTO',
        stepIndex: 0,
        data: {},
      };
      twiml.message('Vamos paso a paso.\n\nTítulo del entrenamiento');
      return res.type('text/xml').send(twiml.toString());
    }

    if (isAdmin(from) && adminSession && adminSession.phone === from) {
      const steps = getSteps(adminSession.type);
      const currentStep = steps[adminSession.stepIndex];

      if (!currentStep) {
        adminSession = null;
        twiml.message('No hay proceso activo.');
        return res.type('text/xml').send(twiml.toString());
      }

      adminSession.data[currentStep.key] = body;
      adminSession.stepIndex += 1;

      const nextStep = steps[adminSession.stepIndex];

      if (nextStep) {
        twiml.message(nextStep.prompt);
        return res.type('text/xml').send(twiml.toString());
      }

      await closeActiveEvents();

      const event = await createEvent({
        type: adminSession.type,
        title: adminSession.data.title || '',
        event_date: adminSession.data.date || '',
        rival: adminSession.data.rival || null,
        place: adminSession.data.place || '',
        call_time: adminSession.data.call_time || '',
        start_time: adminSession.data.start_time || '',
        staff: adminSession.data.staff || '',
        status: 'ACTIVO',
        created_by_phone: from,
      });

      await seedResponses(event.id);

      currentEvent = event;
      adminSession = null;

      const activePlayers = await getActivePlayers();
      const responses = await getResponsesByEvent(event.id);
      const summary = buildEventMessage(event, activePlayers, responses);

      await sendQuickReplyButtons(from, summary);

      twiml.message('Partido creado y enviado con botones.');
      return res.type('text/xml').send(twiml.toString());
    }

    currentEvent = await loadActiveEvent();

    if (!currentEvent) {
      twiml.message('No hay evento activo.');
      return res.type('text/xml').send(twiml.toString());
    }

    const player = await getPlayerByPhone(from);

    if (!player) {
      twiml.message('Tu número no está registrado como jugador.');
      return res.type('text/xml').send(twiml.toString());
    }

    if (commandLower === 'asisto' || commandLower === 'no_asisto' || commandLower === 'no asisto') {
      await upsertResponse(
        currentEvent.id,
        player.id,
        commandLower === 'asisto' ? 'ASISTE' : 'NO_ASISTE'
      );

      const activePlayers = await getActivePlayers();
      const responses = await getResponsesByEvent(currentEvent.id);
      const summary = buildEventMessage(currentEvent, activePlayers, responses);

      await sendQuickReplyButtons(from, summary);

      twiml.message('Respuesta registrada.');
      return res.type('text/xml').send(twiml.toString());
    }

    if (commandLower === 'estado') {
      const activePlayers = await getActivePlayers();
      const responses = await getResponsesByEvent(currentEvent.id);
      const summary = buildEventMessage(currentEvent, activePlayers, responses);

      await sendQuickReplyButtons(from, summary);

      twiml.message('Te envié el estado.');
      return res.type('text/xml').send(twiml.toString());
    }

    {
      const activePlayers = await getActivePlayers();
      const responses = await getResponsesByEvent(currentEvent.id);
      const summary = buildEventMessage(currentEvent, activePlayers, responses);

      await sendQuickReplyButtons(from, summary);

      twiml.message('Te envié las opciones.');
      return res.type('text/xml').send(twiml.toString());
    }
  } catch (error) {
    console.error('ERROR WHATSAPP:', error);
    const twimlError = new twilio.twiml.MessagingResponse();
    twimlError.message('Ocurrió un error.');
    return res.type('text/xml').send(twimlError.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});