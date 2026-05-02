const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const client = twilio(accountSid, authToken);

class TwilioService {
  static async sendMessage(to, body) {
    try {
      const message = await client.messages.create({
        body: body,
        from: whatsappNumber,
        to: `whatsapp:${to}`
      });
      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  static async sendInteractiveMessage(to, body, buttons) {
    try {
      const message = await client.messages.create({
        body: body,
        from: whatsappNumber,
        to: `whatsapp:${to}`,
        contentSid: 'HXb5b62575e6e4ff6129ad7c8efe1f983e', // Template para botones
        contentVariables: JSON.stringify({
          buttons: buttons
        })
      });
      return message;
    } catch (error) {
      console.error('Error sending interactive message:', error);
      throw error;
    }
  }

  static async sendMenu(to, menuOptions) {
    const body = 'Selecciona una opción:\n' + menuOptions.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
    return this.sendMessage(to, body);
  }
}

module.exports = TwilioService;