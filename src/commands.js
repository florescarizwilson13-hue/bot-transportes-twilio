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

function mapearOpcionANombreComando(usuario, textoOriginal) {
  const texto = String(textoOriginal || '').trim();

  if (!/^[0-9]+$/.test(texto)) {
    return textoOriginal;
  }

  if (['coordinador', 'admin', 'admin_general'].includes(String(usuario.rol || '').toLowerCase())) {
    switch (texto) {
      case '1': return 'traslados_hoy';
      case '2': return 'conductores';
      case '3': return 'comunas';
      case '4': return 'ayuda_ver_comuna';
      case '5': return 'ayuda_asignar';
      case '6': return 'ayuda_reasignar';
      case '7': return 'resumen';
      default: return textoOriginal;
    }
  }

  if (String(usuario.rol || '').toLowerCase() === 'conductor') {
    switch (texto) {
      case '1': return 'comunas';
      case '2': return 'mispasajeros';
      case '3': return 'mios';
      case '4': return 'ayuda_tomar';
      case '5': return 'ayuda_traspasar';
      case '6': return 'bloques';
      case '7': return 'ayuda_mb';
      case '8': return 'ayuda_ib';
      case '9': return 'ayuda_tb';
      default: return textoOriginal;
    }
  }

  return textoOriginal;
}

module.exports = {
  menuCoordinador,
  menuConductor,
  mapearOpcionANombreComando,
};
