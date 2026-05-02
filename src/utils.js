function normalizarTelefono(valor) {
  return String(valor || '').replace(/^\+/, '').replace(/\D/g, '').trim();
}

function parseCommand(texto) {
  return String(texto || '').trim();
}

function isNumericOption(texto) {
  return /^\d+$/.test(String(texto || '').trim());
}

function fechaOperacion() {
  const envFecha = String(process.env.FECHA_OPERACION || '').trim();
  if (envFecha) {
    return envFecha;
  }
  return new Date().toISOString().slice(0, 10);
}

function safeString(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }
  return String(valor).trim();
}

module.exports = {
  normalizarTelefono,
  parseCommand,
  isNumericOption,
  fechaOperacion,
  safeString,
};
