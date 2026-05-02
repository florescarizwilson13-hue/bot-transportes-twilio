require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./src/handlers');

const app = express();
app.use(express.json());

app.post('/webhook', handleWebhook);

app.get('/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

module.exports = app;
