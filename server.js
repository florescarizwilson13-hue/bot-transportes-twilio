const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const winston = require('winston');

// Cargar variables de entorno
dotenv.config();

// Importar rutas
const authRoutes = require('./src/routes/auth');
const conductorRoutes = require('./src/routes/conductor');
const coordinadorRoutes = require('./src/routes/coordinador');
const webhookRoutes = require('./src/routes/webhook');

// Configurar logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/conductor', conductorRoutes);
app.use('/api/coordinador', coordinadorRoutes);
app.use('/webhook', webhookRoutes);

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Manejo de errores
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Iniciar servidor
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;