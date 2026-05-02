# Bot WhatsApp Transporte

Este repositorio contiene el bot de WhatsApp y los scripts de importación/exportación de datos para Supabase.

## Quickstart

1. Instala dependencias:

```bash
cd '/Users/wilsonflores/Claude code/bot_whatsapp_transporte'
npm install
```

2. Crea tu archivo de variables de entorno:

```bash
cp .env.example .env
```

3. Llena `.env` con tus credenciales de Supabase y la conexión PostgreSQL.

## Ejecutar el servidor

```bash
npm start
```

El servidor arranca en `http://localhost:3000` (o el puerto definido en `PORT`).

## Endpoint de prueba

```bash
curl http://localhost:3000/health
```

## Scripts Python

### Exportar reservas

```bash
python3 exportar_reservas.py --fecha 2026-04-14 --output reservas_2026-04-14.xlsx
```

### Importar archivo 1

```bash
python3 importar_archivo_1.py --archivo archivo_1.xlsx
```

### Importar archivo 2

```bash
python3 importar_archivo_2.py --archivo archivo_2.xlsx
```

### Usar modo dry-run

```bash
python3 importar_archivo_1.py --dry-run
python3 importar_archivo_2.py --dry-run
```

## Limpiar datos de Supabase

### Eliminación directa con filtro
Para eliminar filas con filtros seguros:

```bash
python3 limpiar_supabase.py --table staging_archivo_1 --where fecha_reserva=2026-04-14
```

### Eliminar todas las filas de una tabla
```bash
python3 limpiar_supabase.py --table staging_archivo_1 --all --force
```

### Modo operacional (solo datos activos/operativos)
Este modo borra datos de staging y elimina registros históricos de operaciones anteriores, manteniendo solo los servicios desde una fecha de corte en adelante.

```bash
python3 limpiar_supabase.py --mode operational --date 2026-05-02 --dry-run
```

Si el resultado es correcto, ejecuta sin `--dry-run`:

```bash
python3 limpiar_supabase.py --mode operational --date 2026-05-02
```

## Recomendaciones

- No subas `.env` al repositorio.
- Usa `--dry-run` antes de insertar datos.
- Para desplegar en producción, mantén los scripts separados de la lógica del bot.
