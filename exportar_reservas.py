import argparse
import os
from datetime import datetime
import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

CONN_STRING = os.getenv('SUPABASE_POSTGRES_URL') or os.getenv('DATABASE_URL')
if not CONN_STRING:
    raise Exception('Falta SUPABASE_POSTGRES_URL o DATABASE_URL en .env')

DEFAULT_DATE = os.getenv('FECHA_OPERACION')

QUERY_TEMPLATE = """
select
  "Fecha",
  "Código",
  "Nombre",
  "RUT",
  "Email",
  "Teléfono",
  "Dirección",
  "Conductor",
  "Cod Movil",
  "Capacidad",
  "Unidad",
  "Comuna",
  "Sentido",
  to_char("Fecha de reserva", 'YYYY-MM-DD') as "Fecha de reserva",
  to_char("Hora de reserva"::time, 'HH24:MI') as "Hora de reserva",
  "Hora (observación)",
  "Validado",
  "Validado por",
  "Fecha de validación",
  "Anulado",
  case
    when "Hora Salida" is null then ''
    else to_char(("Hora Salida" at time zone 'UTC')::timestamp, 'HH24:MI')
  end as "Hora Salida",
  case
    when "Hora Llegada" is null then ''
    else to_char(("Hora Llegada" at time zone 'UTC')::timestamp, 'HH24:MI')
  end as "Hora Llegada",
  "Tipo de Transporte"
from vista_consolidacion_final_operativa
where "Fecha de reserva" = date '{fecha}'
order by "Conductor", "Hora de reserva", "Nombre";
"""


def ajustar_columnas_excel(writer, df):
    ws = writer.sheets['Reservas']
    for col in ws.columns:
        max_length = 0
        col_letter = col[0].column_letter
        for cell in col:
            try:
                if cell.value is not None:
                    max_length = max(max_length, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = max_length + 2


def exportar_reservas(fecha, output_path):
    with psycopg2.connect(CONN_STRING) as conn:
        query = QUERY_TEMPLATE.format(fecha=fecha)
        df = pd.read_sql(query, conn)

    if df.empty:
        print(f'No se encontraron reservas para {fecha}')
        return

    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Reservas')
        ajustar_columnas_excel(writer, df)

    print(f'Reservas exportadas correctamente a {output_path}')


def main():
    parser = argparse.ArgumentParser(description='Exporta reservas a Excel desde Supabase/Postgres.')
    parser.add_argument('--fecha', default=DEFAULT_DATE, help='Fecha de reserva en formato YYYY-MM-DD')
    parser.add_argument('--output', help='Archivo de salida .xlsx')
    args = parser.parse_args()

    if not args.fecha:
        args.fecha = datetime.now().strftime('%Y-%m-%d')

    salida = args.output or f'reservas_{args.fecha}.xlsx'
    exportar_reservas(args.fecha, salida)


if __name__ == '__main__':
    main()
