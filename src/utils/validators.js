class Validators {
  static isValidPhoneNumber(phone) {
    // Validar formato de teléfono chileno o internacional
    const phoneRegex = /^\+?[0-9]{8,15}$/;
    return phoneRegex.test(phone);
  }

  static isValidLatLng(lat, lng) {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  }

  static isValidRole(role) {
    return ['conductor', 'coordinador'].includes(role);
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>\"'&]/g, '');
  }
}

module.exports = Validators;