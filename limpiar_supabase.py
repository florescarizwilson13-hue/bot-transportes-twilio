import os
import json
import argparse
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

VALID_TABLES = [
    "cargas_archivos",
    "staging_archivo_1",
    "staging_archivo_2",
    "servicios_consolidados",
    "reparto_pasajeros",
    "movimientos_pasajeros",
    "asignaciones_coordinador",
    "usuarios",
]


def build_params(filters):
    params = {}
    for field, value in filters.items():
        if isinstance(value, str) and '.' in value:
            params[field] = value
        else:
            params[field] = f"eq.{value}"
    return params


def validate_table(table):
    if table not in VALID_TABLES:
        raise ValueError(f"Tabla no permitida: {table}")


def get_count(table, filters=None):
    validate_table(table)
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = build_params(filters or {})
    params['select'] = 'id'
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code >= 300:
        raise Exception(f"Error consultando {table}: {response.status_code} - {response.text}")
    data = response.json()
    return len(data) if isinstance(data, list) else 0


def delete_rows(table, filters):
    validate_table(table)
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = build_params(filters or {})
    response = requests.delete(url, headers=HEADERS, params=params)
    if response.status_code >= 300:
        raise Exception(f"Error eliminando de {table}: {response.status_code} - {response.text}")
    return response.json()


def delete_all(table):
    validate_table(table)
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    response = requests.delete(url, headers=HEADERS)
    if response.status_code >= 300:
        raise Exception(f"Error eliminando de {table}: {response.status_code} - {response.text}")
    return response.json()


def parse_filters(filter_args):
    filters = {}
    for filt in filter_args or []:
        if '=' not in filt:
            raise ValueError(f"Filtro inválido: {filt}. Usa campo=valor")
        key, value = filt.split('=', 1)
        filters[key.strip()] = value.strip()
    return filters


def query_service_ids_to_keep(cutoff_date):
    url = f"{SUPABASE_URL}/rest/v1/servicios_consolidados"
    params = {
        'select': 'id',
        'fecha_reserva': f'gte.{cutoff_date}',
    }
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code >= 300:
        raise Exception(f"Error consultando servicios_consolidados: {response.status_code} - {response.text}")
    data = response.json()
    return [item['id'] for item in data if item.get('id')]


def delete_not_in_service_ids(table, service_ids, dry_run=False):
    validate_table(table)
    if not service_ids:
        count = get_count(table)
        print(f"{table}: se eliminarán todas las filas porque no hay servicios activos.")
        if dry_run:
            return count
        delete_all(table)
        return count

    filter_value = f'not.in.({",".join(service_ids)})'
    count = get_count(table, {'servicio_id': filter_value})
    if dry_run:
        return count
    delete_rows(table, {'servicio_id': filter_value})
    return count


def cleanup_operational(cutoff_date, dry_run=False):
    print('Modo operacional activado.')
    print(f'Conservando datos desde {cutoff_date} en adelante y eliminando datos históricos.')

    print('\n1. Limpiar staging y cargas temporales...')
    for table in ['staging_archivo_1', 'staging_archivo_2']:
        count = get_count(table)
        print(f'{table}: {count} filas encontradas')
        if not dry_run:
            delete_all(table)

    cargas_count = get_count('cargas_archivos', {'fecha_operacion': f'lt.{cutoff_date}'})
    print(f'cargas_archivos antiguas (<{cutoff_date}): {cargas_count}')
    if not dry_run and cargas_count > 0:
        delete_rows('cargas_archivos', {'fecha_operacion': f'lt.{cutoff_date}'})

    asignaciones_count = get_count('asignaciones_coordinador', {'fecha_operacion': f'lt.{cutoff_date}'})
    print(f'asignaciones_coordinador antiguas (<{cutoff_date}): {asignaciones_count}')
    if not dry_run and asignaciones_count > 0:
        delete_rows('asignaciones_coordinador', {'fecha_operacion': f'lt.{cutoff_date}'})

    servicios_old_count = get_count('servicios_consolidados', {'fecha_reserva': f'lt.{cutoff_date}'})
    print(f'servicios_consolidados antiguos (<{cutoff_date}): {servicios_old_count}')
    if not dry_run and servicios_old_count > 0:
        delete_rows('servicios_consolidados', {'fecha_reserva': f'lt.{cutoff_date}'})

    active_service_ids = query_service_ids_to_keep(cutoff_date)
    print(f'Servicios activos desde {cutoff_date}: {len(active_service_ids)}')

    reparto_old_count = delete_not_in_service_ids('reparto_pasajeros', active_service_ids, dry_run=dry_run)
    print(f'reparto_pasajeros a eliminar: {reparto_old_count}')

    movimientos_old_count = delete_not_in_service_ids('movimientos_pasajeros', active_service_ids, dry_run=dry_run)
    print(f'movimientos_pasajeros a eliminar: {movimientos_old_count}')

    if dry_run:
        print('\nDry-run completado. No se realizaron cambios.')
    else:
        print('\nLimpieza operacional completada.')


def main():
    parser = argparse.ArgumentParser(description='Eliminar filas de tablas de Supabase de forma segura.')
    parser.add_argument('--table', help='Tabla a limpiar (solo para modos directos).')
    parser.add_argument('--where', action='append', help='Filtro de eliminación campo=valor. Repite para múltiples filtros.')
    parser.add_argument('--all', action='store_true', help='Eliminar todas las filas de la tabla (requiere --force).')
    parser.add_argument('--force', action='store_true', help='Confirma la eliminación.')
    parser.add_argument('--mode', choices=['direct', 'operational'], default='direct', help='Modo de limpieza: direct para filtro directo, operational para datos operativos.')
    parser.add_argument('--date', help='Fecha de corte YYYY-MM-DD para modo operational.')
    parser.add_argument('--dry-run', action='store_true', help='Muestra lo que se eliminaría sin ejecutar la eliminación.')

    args = parser.parse_args()

    if args.mode == 'operational':
        cutoff_date = args.date or os.getenv('FECHA_OPERACION')
        if not cutoff_date:
            raise SystemExit('--mode operational requiere --date o FECHA_OPERACION en .env')
        cleanup_operational(cutoff_date, dry_run=args.dry_run)
        return

    if not args.table:
        raise SystemExit('En modo direct debes indicar --table')

    if args.all and not args.force:
        raise SystemExit('Para eliminar todas las filas se requiere --force')
    if not args.all and not args.where:
        raise SystemExit('Debes indicar al menos un filtro con --where o usar --all --force')

    if args.all:
        print(f'Eliminando todas las filas de {args.table}...')
        if not args.dry_run:
            result = delete_all(args.table)
            print('Resultado:', result)
        else:
            print('Dry-run: no se eliminará nada.')
        return

    filters = parse_filters(args.where)
    print(f'Eliminando filas de {args.table} con filtros: {filters}')
    if not args.dry_run:
        result = delete_rows(args.table, filters)
        print('Resultado:', result)
    else:
        count = get_count(args.table, filters)
        print(f'Dry-run: {count} filas coinciden con el filtro.')


if __name__ == '__main__':
    main()
