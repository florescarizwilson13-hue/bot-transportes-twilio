#!/bin/bash

# Script de prueba para bot WhatsApp transporte
# Uso: ./test_bot.sh [local|ngrok|celular]

set -e

cd "$(dirname "$0")"

echo "=== PRUEBA BOT WHATSAPP TRANSPORTE ==="
echo ""

if [ "$1" = "local" ]; then
    echo "1. Probando servidor local..."
    npm start &
    SERVER_PID=$!
    sleep 3

    echo "2. Probando endpoint de salud..."
    curl -s http://localhost:3000/health | jq . || curl -s http://localhost:3000/health

    echo ""
    echo "3. Probando webhook con menú..."
    curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"+56990507327","mensaje":"menu"}' | jq . || curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"+56990507327","mensaje":"menu"}'

    echo ""
    echo "4. Probando webhook con comando coordinador..."
    curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"+56990507327","mensaje":"conductores"}' | jq . || curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"+56990507327","mensaje":"conductores"}'

    echo ""
    echo "5. Probando webhook con conductor..."
    curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"56933333333","mensaje":"menu"}' | jq . || curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"56933333333","mensaje":"menu"}'

    echo ""
    echo "6. Probando webhook con comando conductor..."
    curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"56933333333","mensaje":"comunas"}' | jq . || curl -s -X POST http://localhost:3000/webhook \
      -H "Content-Type: application/json" \
      -d '{"telefono":"56933333333","mensaje":"comunas"}'

    kill $SERVER_PID 2>/dev/null || true
    echo ""
    echo "✅ Prueba local completada"

elif [ "$1" = "ngrok" ]; then
    echo "1. Iniciando servidor..."
    npm start &
    SERVER_PID=$!
    sleep 3

    echo "2. Iniciando ngrok..."
    ngrok http 3000 &
    NGROK_PID=$!
    sleep 5

    echo "3. Obteniendo URL de ngrok..."
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
    echo "URL pública: $NGROK_URL"

    echo ""
    echo "4. Probando endpoint de salud vía ngrok..."
    curl -s "$NGROK_URL/health" | jq . || curl -s "$NGROK_URL/health"

    echo ""
    echo "5. Probando webhook vía ngrok..."
    curl -s -X POST "$NGROK_URL/webhook" \
      -H "Content-Type: application/json" \
      -d '{"telefono":"+56990507327","mensaje":"menu"}' | jq . || curl -s -X POST "$NGROK_URL/webhook" \
      -H "Content-Type: application/json" \
      -d '{"telefono":"+56990507327","mensaje":"menu"}'

    echo ""
    echo "📱 URLs para probar desde celular:"
    echo "POST $NGROK_URL/webhook"
    echo ""
    echo "Coordinador:"
    echo 'Body: {"telefono":"+56990507327","mensaje":"menu"}'
    echo 'Body: {"telefono":"+56990507327","mensaje":"conductores"}'
    echo ""
    echo "Conductor (usa uno de estos números):"
    echo 'Body: {"telefono":"56933333333","mensaje":"menu"}'
    echo 'Body: {"telefono":"56939414443","mensaje":"menu"}'
    echo 'Body: {"telefono":"56911111111","mensaje":"menu"}'
    echo ""
    echo "Presiona Enter para detener..."
    read

    kill $NGROK_PID 2>/dev/null || true
    kill $SERVER_PID 2>/dev/null || true
    echo "✅ Prueba ngrok completada"

elif [ "$1" = "celular" ]; then
    echo "Modo celular - solo muestra URLs"
    echo ""
    echo "1. Asegúrate de que el servidor esté corriendo:"
    echo "   npm start"
    echo ""
    echo "2. Inicia ngrok:"
    echo "   ngrok http 3000"
    echo ""
    echo "3. Copia la URL HTTPS que te da ngrok"
    echo ""
    echo "4. Desde tu celular, usa una app como 'HTTP Request' o Postman"
    echo ""
    echo "5. Envía POST a la URL de ngrok + '/webhook'"
    echo ""
    echo "7. Body JSON para coordinador:"
    echo '   {"telefono":"+56990507327","mensaje":"menu"}'
    echo '   {"telefono":"+56990507327","mensaje":"conductores"}'
    echo ""
    echo "8. Body JSON para conductor (elige uno):"
    echo '   {"telefono":"56933333333","mensaje":"menu"}'
    echo '   {"telefono":"56939414443","mensaje":"menu"}'
    echo '   {"telefono":"56911111111","mensaje":"menu"}'

else
    echo "Uso: $0 [local|ngrok|celular]"
    echo ""
    echo "local   - Prueba completa local con curl"
    echo "ngrok   - Prueba con ngrok y espera para celular"
    echo "celular - Solo muestra instrucciones para celular"
    exit 1
fi