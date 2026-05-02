import argparse
import json
import os
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise Exception('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')

HEADERS = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

COLUMNAS_ESPERADAS = [
    'Código',
    'Nombre',
    'RUT',
    'Email',
    'Teléfono',
    'Dirección',
    'Unidad',
    'Comuna',
    'Sentido',
    'Fecha de reserva',
    'Hora de reserva',
]


def limpiar_nan(valor):
    if pd.isna(valor):
        return None
    return valor


def normalizar_fecha(valor):
    if pd.isna(valor):
        return None
    dt = pd.to_datetime(valor, errors='coerce')
    if pd.isna(dt):
        return None
    return dt.strftime('%Y-%m-%d')


def normalizar_hora(valor):
    if pd.isna(valor):
        return None
    dt = pd.to_datetime(str(valor), errors='coerce')
    if pd.isna(dt):
        return None
    return dt.strftime('%H:%M:%S')


def post_supabase(tabla, payload):
    url = f'{SUPABASE_URL}/rest/v1/{tabla}'
    response = requests.post(url, headers=HEADERS, data=json.dumps(payload, ensure_ascii=False))
    if response.status_code >= 300:
        raise Exception(f'Error POST {tabla}: {response.status_code} - {response.text}')
    return response.json()


def batch_post(tabla, payload, batch_size=300):
    for inicio in range(0, len(payload), batch_size):
        lote = payload[inicio: inicio + batch_size]
        post_supabase(tabla, lote)


def leer_excel(path_excel):
    xls = pd.ExcelFile(path_excel)
    hoja = xls.sheet_names[0]
    df = pd.read_excel(path_excel, sheet_name=hoja)

    faltantes = [c for c in COLUMNAS_ESPERADAS if c not in df.columns]
    if faltantes:
        raise Exception(f'Faltan columnas esperadas: {faltantes}')

    return df, hoja


def crear_carga(nombre_archivo, fecha_operacion):
    payload = [{
        'nombre_archivo': nombre_archivo,
        'tipo_archivo': 'archivo_1',
        'fecha_operacion': fecha_operacion,
        'origen': 'manual',
        'estado': 'cargado',
        'observacion': 'Carga inicial archivo 1',
    }]
    result = post_supabase('cargas_archivos', payload)
    return result[0]['id']


def insertar_staging(df, carga_id):
    filas = []
    for idx, row in df.iterrows():
        raw = {col: None if pd.isna(row[col]) else str(row[col]) for col in df.columns}
        filas.append({
            'carga_id': carga_id,
            'fila_numero': int(idx + 2),
            'codigo': limpiar_nan(row.get('Código')),
            'nombre': limpiar_nan(row.get('Nombre')),
            'rut': limpiar_nan(row.get('RUT')),
            'email': limpiar_nan(row.get('Email')),
            'telefono': limpiar_nan(row.get('Teléfono')),
            'direccion': limpiar_nan(row.get('Dirección')),
            'unidad': limpiar_nan(row.get('Unidad')),
            'comuna': limpiar_nan(row.get('Comuna')),
            'sentido': limpiar_nan(row.get('Sentido')),
            'fecha_reserva': normalizar_fecha(row.get('Fecha de reserva')),
            'hora_reserva': normalizar_hora(row.get('Hora de reserva')),
            'raw_json': raw,
        })
    if filas:
        batch_post('staging_archivo_1', filas)


def insertar_consolidado(df, carga_id):
    filas = []
    for _, row in df.iterrows():
        filas.append({
            'carga_id': carga_id,
            'codigo_reserva': limpiar_nan(row.get('Código')),
            'nombre_pasajero': limpiar_nan(row.get('Nombre')),
            'rut': limpiar_nan(row.get('RUT')),
            'email': limpiar_nan(row.get('Email')),
            'telefono': limpiar_nan(row.get('Teléfono')),
            'direccion': limpiar_nan(row.get('Dirección')),
            'unidad': limpiar_nan(row.get('Unidad')),
            'comuna': limpiar_nan(row.get('Comuna')),
            'sentido': limpiar_nan(row.get('Sentido')),
            'fecha_reserva': normalizar_fecha(row.get('Fecha de reserva')),
            'hora_reserva': normalizar_hora(row.get('Hora de reserva')),
            'conductor_nombre': None,
            'conductor_id': None,
            'cod_movil': None,
            'capacidad': None,
            'tipo_transporte': None,
            'estado': 'pendiente',
            'detalle_json': {'origen': 'archivo_1'},
        })
    if filas:
        batch_post('servicios_consolidados', filas)


def main():
    parser = argparse.ArgumentParser(description='Importa archivo_1.xlsx a Supabase de forma segura.')
    parser.add_argument('--archivo', default='archivo_1.xlsx', help='Archivo Excel de entrada')
    parser.add_argument('--dry-run', action='store_true', help='No inserta en Supabase, solo valida')
    args = parser.parse_args()

    if not os.path.exists(args.archivo):
        raise Exception(f'No existe el archivo {args.archivo} en la carpeta actual')

    df, hoja = leer_excel(args.archivo)
    fechas_validas = df['Fecha de reserva'].dropna()
    if fechas_validas.empty:
        raise Exception('No se encontró Fecha de reserva válida en el archivo')

    fecha_operacion = normalizar_fecha(fechas_validas.iloc[0])
    print(f'Hoja leída: {hoja}')
    print(f'Filas encontradas: {len(df)}')
    print(f'Fecha operación detectada: {fecha_operacion}')

    if args.dry_run:
        print('Modo dry-run activado. No se insertarán datos en Supabase.')
        return

    carga_id = crear_carga(args.archivo, fecha_operacion)
    print(f'Carga creada: {carga_id}')

    insertar_staging(df, carga_id)
    print('Staging archivo 1 cargado correctamente')

    insertar_consolidado(df, carga_id)
    print('Servicios consolidados cargados correctamente')

    print('Proceso terminado OK')


if __name__ == '__main__':
    main()
