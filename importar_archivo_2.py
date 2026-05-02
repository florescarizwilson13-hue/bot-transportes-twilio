import argparse
import json
import math
import os
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

ARCHIVO_DEFAULT = 'archivo_2.xlsx'
COLUMNAS_ESPERADAS = ['Conductor', 'Cod Movil', 'Capacidad', 'Comuna1', 'Comuna2']


def limpiar(valor):
    if valor is None:
        return None
    try:
        if pd.isna(valor):
            return None
    except Exception:
        pass
    return str(valor).strip()


def limpiar_entero(valor):
    if valor is None:
        return None
    try:
        if pd.isna(valor):
            return None
    except Exception:
        pass
    try:
        return int(float(valor))
    except Exception:
        return None


def convertir_json_seguro(valor):
    if valor is None:
        return None
    try:
        if pd.isna(valor):
            return None
    except Exception:
        pass

    if isinstance(valor, (pd.Timestamp,)):
        return valor.isoformat()

    if isinstance(valor, (int, float, str, bool)):
        if isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor)):
            return None
        return valor

    return str(valor)


def leer_archivo(path):
    df = pd.read_excel(path)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def batch_post(tabla, payload, batch_size=300):
    url = f'{SUPABASE_URL}/rest/v1/{tabla}'
    for inicio in range(0, len(payload), batch_size):
        lote = payload[inicio: inicio + batch_size]
        response = requests.post(url, headers=HEADERS, data=json.dumps(lote, ensure_ascii=False))
        if response.status_code >= 300:
            raise Exception(f'Error Supabase {response.status_code}: {response.text}')


def main():
    parser = argparse.ArgumentParser(description='Importa archivo_2.xlsx a Supabase.')
    parser.add_argument('--archivo', default=ARCHIVO_DEFAULT, help='Archivo Excel de entrada')
    parser.add_argument('--dry-run', action='store_true', help='No inserta datos, solo valida.')
    args = parser.parse_args()

    if not os.path.exists(args.archivo):
        raise Exception(f'No existe {args.archivo}')

    df = leer_archivo(args.archivo)
    print('Columnas detectadas:')
    print(df.columns.tolist())

    faltantes = [c for c in COLUMNAS_ESPERADAS if c not in df.columns]
    if faltantes:
        raise Exception(f'Faltan columnas en archivo_2: {faltantes}')

    filas = []
    for _, row in df.iterrows():
        raw = {col: convertir_json_seguro(row[col]) for col in df.columns}
        filas.append({
            'conductor': limpiar(row.get('Conductor')),
            'cod_movil': limpiar(row.get('Cod Movil')),
            'capacidad': limpiar_entero(row.get('Capacidad')),
            'comuna1': limpiar(row.get('Comuna1')),
            'comuna2': limpiar(row.get('Comuna2')),
            'raw_json': raw,
        })

    filas = [f for f in filas if f['conductor'] or f['cod_movil'] or f['comuna1'] or f['comuna2']]
    if not filas:
        raise Exception('No hay filas útiles para cargar en archivo_2')

    if args.dry_run:
        print(f'Modo dry-run: {len(filas)} filas válidas encontradas. No se realizó inserción.')
        return

    batch_post('staging_archivo_2', filas)
    print(f'Archivo 2 cargado correctamente. Filas insertadas: {len(filas)}')


if __name__ == '__main__':
    main()
