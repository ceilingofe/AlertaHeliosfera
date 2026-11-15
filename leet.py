import csv
import io
import json
import re
import urllib.request
from collections import defaultdict

SOL_INICIAL = 30
DIAS_OBJETIVO = 30
ARCHIVO_SALIDA = "clima_jezero_30_dias.json"

resultado = {
    "metadata": {
        "ubicacion": "Cráter Jezero (Octavia E. Butler Landing), Marte",
        "coordenadas": "18.44° N, 77.45° E",
        "instrumento": "Mars 2020 Perseverance MEDA (CAL_ATS)",
        "doi": "10.17189/1522849",
        "total_dias": DIAS_OBJETIVO
    },
    "dias": []
}

sol = SOL_INICIAL
while len(resultado["dias"]) < DIAS_OBJETIVO and sol <= 500:
    # El PDS agrupa los directorios en bloques de 90 soles (ej. sol_0000_0089, sol_0090_0179)
    bloque_inicio = (sol // 90) * 90
    bloque_fin = bloque_inicio + 89
    base_url = (
        f"https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/"
        f"data_calibrated_env/sol_{bloque_inicio:04d}_{bloque_fin:04d}/sol_{sol:04d}/"
    )

    try:
        html = urllib.request.urlopen(base_url, timeout=15).read().decode("utf-8")
        match = re.search(r'href="(WE__[^"]+CAL_ATS[^"]+\.CSV)"', html, re.IGNORECASE)
        if not match:
            sol += 1
            continue

        nombre_csv = match.group(1)
        por_hora = defaultdict(list)

        # Lee el CSV directo en memoria sin guardar 30 archivos pesados en disco
        with urllib.request.urlopen(base_url + nombre_csv, timeout=30) as resp:
            reader = csv.DictReader(io.TextIOWrapper(resp, encoding="utf-8"))
            for row in reader:
                val = row.get("ATS_LOCAL_TEMP1", "").strip()
                tiempo = row.get("LTST", "").strip()
                if not val or val in ("NaN", "NULL", "UNK") or not tiempo:
                    continue
                hora = tiempo.split("M")[-1].split(" ")[-1][:2]
                por_hora[hora].append(float(val) - 273.15)

        # Solo guarda el día si tiene lecturas reales en las 24 horas
        if len(por_hora) == 24:
            temperaturas = {
                h: round(sum(por_hora[h]) / len(por_hora[h]), 1)
                for h in sorted(por_hora.keys())
            }
            todas = list(temperaturas.values())
            resultado["dias"].append({
                "dia_juego": len(resultado["dias"]) + 1,
                "sol_real": sol,
                "archivo_fuente": nombre_csv,
                "resumen": {
                    "min_c": min(todas),
                    "max_c": max(todas),
                    "promedio_c": round(sum(todas) / 24, 1)
                },
                "temperatura_horaria_c": temperaturas
            })
            print(f"[{len(resultado['dias']):02d}/{DIAS_OBJETIVO}] Sol {sol:04d} guardado (Mín: {min(todas)} °C | Máx: {max(todas)} °C)")
        else:
            print(f"[Saltado] Sol {sol:04d} incompleto ({len(por_hora)}/24 h)")

    except Exception as e:
        print(f"[Aviso] Sol {sol:04d} omitido ({e})")

    sol += 1

with open(ARCHIVO_SALIDA, "w", encoding="utf-8") as f:
    json.dump(resultado, f, indent=2, ensure_ascii=False)

print(f"\nListo: {len(resultado['dias'])} días reales guardados en '{ARCHIVO_SALIDA}'.")