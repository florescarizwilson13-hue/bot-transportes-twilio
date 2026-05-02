const supabase = require('./supabaseClient');
const { normalizarTelefono, parseCommand, isNumericOption, fechaOperacion, safeString } = require('./utils');
const { menuCoordinador, menuConductor, mapearOpcionANombreComando } = require('./commands');

function buildError(message) {
  return { ok: false, respuesta: message };
}

function buildOk(message) {
  return { ok: true, respuesta: message };
}

async function buscarUsuarioPorTelefono(telefono) {
  const telefonoNormalizado = normalizarTelefono(telefono);

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, activo, telefono_whatsapp')
    .eq('telefono_whatsapp', telefonoNormalizado)
    .eq('activo', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function comunasAsignadasConductor(conductorId, fecha) {
  const { data, error } = await supabase
    .from('asignaciones_coordinador')
    .select('comuna')
    .eq('conductor_id', conductorId)
    .eq('fecha_operacion', fecha)
    .eq('activo', true);

  if (error) {
    throw error;
  }

  return [...new Set((data || []).map((x) => x.comuna).filter(Boolean))];
}

async function buscarServicioPorCodigo(codigo) {
  const { data, error } = await supabase
    .from('servicios_consolidados')
    .select('id, codigo_reserva, nombre_pasajero, comuna, hora_reserva, fecha_reserva, estado')
    .eq('codigo_reserva', codigo)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function formatList(items, prefix) {
  if (!Array.isArray(items) || items.length === 0) {
    return `${prefix} vacía`;
  }
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

async function handleCoordinadorComando(usuario, texto, textoMapeado, fechaHoy) {
  if (texto === 'traslados_hoy') {
    const { data, error } = await supabase
      .from('servicios_consolidados')
      .select('hora_reserva')
      .eq('fecha_reserva', fechaHoy)
      .order('hora_reserva');

    if (error) return buildError('Error viendo traslados: ' + error.message);
    if (!data || data.length === 0) return buildOk('No hay traslados para hoy');

    const conteo = {};
    data.forEach((x) => {
      const h = x.hora_reserva;
      conteo[h] = (conteo[h] || 0) + 1;
    });

    const respuesta = ['Traslados del día:'];
    Object.keys(conteo)
      .sort()
      .forEach((h, i) => respuesta.push(`${i + 1}. ${h} - ${conteo[h]} pasajeros`));

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'conductores') {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, telefono_whatsapp')
      .eq('activo', true)
      .eq('rol', 'conductor')
      .order('nombre');

    if (error) return buildError('Error listando conductores: ' + error.message);
    if (!data || data.length === 0) return buildOk('No hay conductores activos');

    const respuesta = ['Conductores:'];
    data.forEach((c, i) => {
      respuesta.push(`${i + 1}. ${c.nombre} - ${c.telefono_whatsapp || 'sin teléfono'}`);
    });

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'comunas') {
    const { data, error } = await supabase
      .from('asignaciones_coordinador')
      .select('conductor_nombre, comuna')
      .eq('fecha_operacion', fechaHoy)
      .eq('activo', true)
      .order('conductor_nombre')
      .order('comuna');

    if (error) return buildError('Error listando comunas: ' + error.message);
    if (!data || data.length === 0) return buildOk('No hay asignaciones para hoy');

    const respuesta = ['Asignaciones del día:'];
    data.forEach((x, i) => {
      respuesta.push(`${i + 1}. ${x.conductor_nombre} - ${x.comuna}`);
    });

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'ayuda_ver_comuna') {
    return buildOk('Para ver pasajeros por comuna escribe:\nver Viña del Mar');
  }

  if (texto.startsWith('ver ')) {
    const comuna = textoMapeado.slice(4).trim();
    const { data, error } = await supabase
      .from('servicios_consolidados')
      .select('codigo_reserva, nombre_pasajero, comuna, hora_reserva')
      .eq('fecha_reserva', fechaHoy)
      .eq('comuna', comuna)
      .order('hora_reserva')
      .order('nombre_pasajero');

    if (error) return buildError('Error viendo comuna: ' + error.message);
    if (!data || data.length === 0) return buildOk(`No hay pasajeros en ${comuna}`);

    const respuesta = [`Pasajeros en ${comuna}:`];
    data.forEach((x, i) => {
      respuesta.push(`${i + 1}. ${x.codigo_reserva} - ${x.nombre_pasajero} - ${x.hora_reserva}`);
    });

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'ayuda_asignar') {
    return buildOk('Para asignar comuna escribe:\nasignar +56939414443 Quilpué');
  }

  if (texto.startsWith('asignar ')) {
    const partes = textoMapeado.split(' ');
    if (partes.length < 3) return buildError('Usa: asignar TELEFONO COMUNA');

    const telefonoDestino = normalizarTelefono(partes[1]);
    const comuna = textoMapeado.substring(textoMapeado.indexOf(partes[2])).trim();

    const destino = await buscarUsuarioPorTelefono(telefonoDestino);
    if (!destino) return buildOk('No encontré conductor con ese teléfono');

    const { error } = await supabase.from('asignaciones_coordinador').insert([
      {
        fecha_operacion: fechaHoy,
        conductor_id: destino.id,
        conductor_nombre: destino.nombre,
        comuna,
        activo: true,
      },
    ]);

    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
      return buildError('Error asignando comuna: ' + error.message);
    }

    return buildOk(`Asignación creada: ${destino.nombre} → ${comuna}`);
  }

  if (texto === 'ayuda_reasignar') {
    return buildOk('Para reasignar pasajero escribe:\nreasignar ABC123 +56911111111');
  }

  if (texto.startsWith('reasignar ')) {
    const partes = textoMapeado.split(' ');
    if (partes.length < 3) return buildError('Usa: reasignar CODIGO TELEFONO');

    const codigo = partes[1].trim();
    const telefonoDestino = normalizarTelefono(partes[2].trim());

    const destino = await buscarUsuarioPorTelefono(telefonoDestino);
    if (!destino) return buildOk('No encontré conductor destino');

    const servicio = await buscarServicioPorCodigo(codigo);
    if (!servicio) return buildOk(`No encontré código ${codigo}`);

    const { data: reparto, error: errorReparto } = await supabase
      .from('reparto_pasajeros')
      .select('id, conductor_id_actual')
      .eq('servicio_id', servicio.id)
      .maybeSingle();

    if (errorReparto) return buildError('Error buscando reparto: ' + errorReparto.message);

    if (reparto) {
      const origenId = reparto.conductor_id_actual;
      const { error } = await supabase
        .from('reparto_pasajeros')
        .update({
          conductor_id_actual: destino.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reparto.id);

      if (error) return buildError('Error reasignando pasajero: ' + error.message);

      await supabase.from('movimientos_pasajeros').insert([
        {
          servicio_id: servicio.id,
          conductor_origen_id: origenId,
          conductor_destino_id: destino.id,
          tipo_movimiento: 'traspasar',
          detalle_json: {
            codigo_reserva: servicio.codigo_reserva,
            nombre_pasajero: servicio.nombre_pasajero,
            comuna: servicio.comuna,
            origen: 'coordinador',
          },
        },
      ]);

      return buildOk(`Pasajero reasignado a ${destino.nombre}`);
    }

    const { error } = await supabase.from('reparto_pasajeros').insert([
      {
        servicio_id: servicio.id,
        conductor_id_actual: destino.id,
        conductor_id_original: destino.id,
        estado: 'tomado',
      },
    ]);

    if (error) return buildError('Error creando reparto: ' + error.message);

    return buildOk(`Pasajero asignado a ${destino.nombre}`);
  }

  if (texto === 'resumen') {
    const { data, error } = await supabase.from('reparto_pasajeros').select('conductor_id_actual');
    if (error) return buildError('Error generando resumen: ' + error.message);

    const ids = [...new Set((data || []).map((x) => x.conductor_id_actual).filter(Boolean))];
    if (ids.length === 0) return buildOk('No hay pasajeros repartidos');

    const { data: usuariosResumen, error: errorUsuarios } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', ids);

    if (errorUsuarios) return buildError('Error resumen usuarios: ' + errorUsuarios.message);

    const mapa = {};
    (usuariosResumen || []).forEach((u) => {
      mapa[u.id] = u.nombre;
    });

    const conteo = {};
    (data || []).forEach((x) => {
      if (!x.conductor_id_actual) return;
      const nombre = mapa[x.conductor_id_actual] || x.conductor_id_actual;
      conteo[nombre] = (conteo[nombre] || 0) + 1;
    });

    const respuesta = ['Resumen por conductor:'];
    Object.keys(conteo)
      .sort()
      .forEach((k, i) => respuesta.push(`${i + 1}. ${k} - ${conteo[k]} pasajeros`));

    return buildOk(respuesta.join('\n'));
  }

  return buildOk('Comando de coordinador no reconocido. Escribe menu');
}

async function handleConductorComando(usuario, texto, textoMapeado, fechaHoy, latitud, longitud) {
  if (texto === 'comunas') {
    const comunas = await comunasAsignadasConductor(usuario.id, fechaHoy);
    if (comunas.length === 0) return buildOk('No tienes comunas asignadas hoy');
    return buildOk(['Mis comunas:', ...comunas].join('\n'));
  }

  if (texto === 'mispasajeros') {
    const { data, error } = await supabase
      .from('vista_pasajeros_por_conductor')
      .select('*')
      .eq('conductor_id', usuario.id)
      .order('hora_reserva')
      .order('nombre_pasajero');

    if (error) return buildError('Error viendo mis pasajeros: ' + error.message);
    if (!data || data.length === 0) return buildOk('No tienes pasajeros asignados');

    const respuesta = ['Mis pasajeros:'];
    data.forEach((p, i) => {
      respuesta.push(`${i + 1}. ${p.nombre_pasajero} - ${p.comuna} - ${p.hora_reserva}`);
    });

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'mios') {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select('id, estado, servicios_consolidados (codigo_reserva, nombre_pasajero, comuna, hora_reserva)')
      .eq('conductor_id_actual', usuario.id)
      .order('created_at');

    if (error) return buildError('Error viendo mis pasajeros: ' + error.message);
    if (!data || data.length === 0) return buildOk('Aún no tienes pasajeros tomados');

    const respuesta = ['Mis pasajeros:'];
    data.forEach((x, i) => {
      const s = x.servicios_consolidados;
      respuesta.push(`${i + 1}. ${s.codigo_reserva} - ${s.nombre_pasajero} - ${s.comuna} - ${s.hora_reserva} - ${x.estado}`);
    });

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'ayuda_tomar') {
    return buildOk('Para tomar pasajero escribe:\ntomar ABC123');
  }

  if (texto.startsWith('tomar ')) {
    const codigo = textoMapeado.slice(6).trim();
    const servicio = await buscarServicioPorCodigo(codigo);
    if (!servicio) return buildOk(`No encontré código ${codigo}`);

    const comunas = await comunasAsignadasConductor(usuario.id, fechaHoy);
    if (!comunas.includes(servicio.comuna)) {
      return buildOk(`No puedes tomar pasajeros de ${servicio.comuna}`);
    }

    const { data: repartoExistente, error: errorReparto } = await supabase
      .from('reparto_pasajeros')
      .select('id, conductor_id_actual')
      .eq('servicio_id', servicio.id)
      .maybeSingle();

    if (errorReparto) return buildError('Error buscando reparto: ' + errorReparto.message);

    if (repartoExistente && repartoExistente.conductor_id_actual && repartoExistente.conductor_id_actual !== usuario.id) {
      return buildOk('Ese pasajero ya fue tomado por otro conductor');
    }

    if (repartoExistente && repartoExistente.conductor_id_actual === usuario.id) {
      return buildOk('Ese pasajero ya es tuyo');
    }

    if (repartoExistente) {
      const { error } = await supabase
        .from('reparto_pasajeros')
        .update({
          conductor_id_actual: usuario.id,
          conductor_id_original: usuario.id,
          estado: 'tomado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', repartoExistente.id);

      if (error) return buildError('Error tomando pasajero: ' + error.message);
    } else {
      const { error } = await supabase.from('reparto_pasajeros').insert([
        {
          servicio_id: servicio.id,
          conductor_id_actual: usuario.id,
          conductor_id_original: usuario.id,
          estado: 'tomado',
        },
      ]);

      if (error) return buildError('Error creando reparto: ' + error.message);
    }

    await supabase.from('movimientos_pasajeros').insert([
      {
        servicio_id: servicio.id,
        conductor_origen_id: null,
        conductor_destino_id: usuario.id,
        tipo_movimiento: 'tomar',
        detalle_json: {
          codigo_reserva: servicio.codigo_reserva,
          nombre_pasajero: servicio.nombre_pasajero,
          comuna: servicio.comuna,
        },
      },
    ]);

    return buildOk(`Pasajero tomado: ${servicio.nombre_pasajero} - ${servicio.codigo_reserva}`);
  }

  if (texto === 'ayuda_traspasar') {
    return buildOk('Para traspasar pasajero escribe:\ntraspasar ABC123 +56911111111');
  }

  if (texto.startsWith('traspasar ')) {
    const partes = textoMapeado.split(' ');
    if (partes.length < 3) return buildError('Usa: traspasar CODIGO TELEFONO');

    const codigo = partes[1].trim();
    const telefonoDestino = normalizarTelefono(partes[2].trim());

    const destino = await buscarUsuarioPorTelefono(telefonoDestino);
    if (!destino) return buildOk('No encontré conductor destino');

    const servicio = await buscarServicioPorCodigo(codigo);
    if (!servicio) return buildOk(`No encontré código ${codigo}`);

    const { data: reparto, error } = await supabase
      .from('reparto_pasajeros')
      .select('id, conductor_id_actual')
      .eq('servicio_id', servicio.id)
      .maybeSingle();

    if (error) return buildError('Error buscando reparto: ' + error.message);
    if (!reparto || reparto.conductor_id_actual !== usuario.id) {
      return buildOk('Ese pasajero no está en tu lista');
    }

    const { error: errorUpdate } = await supabase
      .from('reparto_pasajeros')
      .update({
        conductor_id_actual: destino.id,
        estado: 'traspasado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reparto.id);

    if (errorUpdate) return buildError('Error traspasando: ' + errorUpdate.message);

    await supabase.from('movimientos_pasajeros').insert([
      {
        servicio_id: servicio.id,
        conductor_origen_id: usuario.id,
        conductor_destino_id: destino.id,
        tipo_movimiento: 'traspasar',
        detalle_json: {
          codigo_reserva: servicio.codigo_reserva,
          nombre_pasajero: servicio.nombre_pasajero,
          comuna: servicio.comuna,
        },
      },
    ]);

    return buildOk(`Pasajero traspasado a ${destino.nombre}`);
  }

  if (texto === 'bloques') {
    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select('servicios_consolidados (hora_reserva)')
      .eq('conductor_id_actual', usuario.id);

    if (error) return buildError('Error viendo bloques: ' + error.message);
    if (!data || data.length === 0) return buildOk('No tienes bloques');

    const conteo = {};
    data.forEach((x) => {
      const h = x.servicios_consolidados?.hora_reserva;
      if (!h) return;
      conteo[h] = (conteo[h] || 0) + 1;
    });

    const respuesta = ['Mis bloques:'];
    Object.keys(conteo)
      .sort()
      .forEach((h, i) => respuesta.push(`${i + 1}. ${h} - ${conteo[h]} pasajeros`));

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'ayuda_mb') {
    return buildOk('Para ver detalle de bloque escribe:\nmb 00:10:00');
  }

  if (texto.startsWith('mb ')) {
    const hora = textoMapeado.slice(3).trim();

    const { data, error } = await supabase
      .from('reparto_pasajeros')
      .select('estado, servicios_consolidados (codigo_reserva, nombre_pasajero, hora_reserva)')
      .eq('conductor_id_actual', usuario.id);

    if (error) return buildError('Error viendo bloque: ' + error.message);

    const filtrados = (data || []).filter((x) => x.servicios_consolidados?.hora_reserva === hora);
    if (filtrados.length === 0) return buildOk('No tienes pasajeros en ese bloque');

    const respuesta = [`Bloque ${hora}:`];
    filtrados.forEach((x, i) => {
      const s = x.servicios_consolidados;
      respuesta.push(`${i + 1}. ${s.codigo_reserva} - ${s.nombre_pasajero} - ${x.estado}`);
    });

    return buildOk(respuesta.join('\n'));
  }

  if (texto === 'ayuda_ib' || texto === 'ayuda_tb') {
    return buildOk('Para iniciar o terminar bloque escribe:\nib 00:10:00 o tb 00:10:00\nDebes enviar ubicación.');
  }

  if (texto.startsWith('ib ') || texto.startsWith('tb ')) {
    const hora = textoMapeado.slice(3).trim();
    if (latitud == null || longitud == null) {
      return buildError('Faltan latitud y longitud');
    }

    const query = supabase.from('reparto_pasajeros').select('servicio_id, servicios_consolidados (hora_reserva)').eq('conductor_id_actual', usuario.id);
    const { data, error } = await query;
    if (error) return buildError('Error buscando bloque: ' + error.message);

    const ids = (data || [])
      .filter((x) => x.servicios_consolidados?.hora_reserva === hora)
      .map((x) => x.servicio_id);

    if (ids.length === 0) return buildOk('No hay servicios en ese bloque');

    const updates = {
      estado: texto.startsWith('ib ') ? 'iniciado' : 'terminado',
      updated_at: new Date().toISOString(),
      inicio_servicio: texto.startsWith('ib ') ? new Date().toISOString() : undefined,
      termino_servicio: texto.startsWith('tb ') ? new Date().toISOString() : undefined,
      inicio_lat: texto.startsWith('ib ') ? latitud : undefined,
      inicio_lng: texto.startsWith('ib ') ? longitud : undefined,
      termino_lat: texto.startsWith('tb ') ? latitud : undefined,
      termino_lng: texto.startsWith('tb ') ? longitud : undefined,
    };

    const { error: errorUpdate } = await supabase.from('servicios_consolidados').update(updates).in('id', ids);
    if (errorUpdate) return buildError(`Error ${texto.startsWith('ib ') ? 'iniciando' : 'terminando'} bloque: ` + errorUpdate.message);

    return buildOk(`Bloque ${hora} ${texto.startsWith('ib ') ? 'iniciado' : 'terminado'}`);
  }

  return buildOk('Comando de conductor no reconocido. Escribe menu');
}

async function handleWebhook(req, res) {
  try {
    const { telefono, mensaje, latitud, longitud } = req.body;

    if (!telefono || !mensaje) {
      return res.json(buildError('Faltan telefono o mensaje'));
    }

    const usuario = await buscarUsuarioPorTelefono(telefono);
    if (!usuario) {
      return res.json(buildOk('Número no autorizado'));
    }

    const textoOriginal = parseCommand(mensaje);
    const textoMapeado = mapearOpcionANombreComando(usuario, textoOriginal);
    const texto = textoMapeado.toLowerCase().trim();
    const fechaHoy = fechaOperacion();

    if (texto === 'menu') {
      if (['coordinador', 'admin', 'admin_general'].includes(String(usuario.rol || '').toLowerCase())) {
        return res.json(buildOk(menuCoordinador(usuario.nombre)));
      }
      if (String(usuario.rol || '').toLowerCase() === 'conductor') {
        return res.json(buildOk(menuConductor(usuario.nombre)));
      }
      return res.json(buildOk('Rol no soportado'));
    }

    if (['coordinador', 'admin', 'admin_general'].includes(String(usuario.rol || '').toLowerCase())) {
      return res.json(await handleCoordinadorComando(usuario, texto, textoMapeado, fechaHoy));
    }

    if (String(usuario.rol || '').toLowerCase() === 'conductor') {
      return res.json(await handleConductorComando(usuario, texto, textoMapeado, fechaHoy, latitud, longitud));
    }

    return res.json(buildOk('Rol no soportado'));
  } catch (err) {
    return res.json(buildError(err.message));
  }
}

module.exports = {
  handleWebhook,
};
