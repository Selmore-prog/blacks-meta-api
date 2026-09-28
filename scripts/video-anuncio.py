#!/usr/bin/env python3
"""
VIDEO → ANUNCIO DE META EN 9:16 Y 4:5, CON EL TEXTO DE LA MARCA — oct-2026

Por qué existe: el 50% del gasto del conjunto de prospecting va a Reels y ahí
mostrábamos una foto quieta. Este script toma cualquier video vertical (uno de
Veo, uno grabado con el celular) y devuelve las dos versiones que pide el
anuncio, con la MISMA tipografía que las piezas fijas (usa maquetar() de
piezas-overlay-anuncios.py) y el texto dentro de la zona segura de Reels.

El texto entra en tiempos: primero titular y bajada, después el chip y el
beneficio. Un bloque entero de entrada es un volante; en dos tiempos el ojo
lee primero QUÉ es y después POR QUÉ comprarlo ahora.

Uso:
  python3 scripts/video-anuncio.py <video.mp4> <spec.json> <carpeta_salida>

Spec (una pieza, mismos campos que las fotos + tiempos):
  { "clave": "video-jean", "titular": "EL CLÁSICO RECTO", "bajada": "...",
    "chip": "24% OFF", "beneficio": "Hasta 6 cuotas sin interés",
    "entra_titular": 0.3, "entra_chip": 2.8,
    "posicion_916": "abajo", "posicion_45": "arriba",
    "recorte_45": 0.5,            // qué franja del vertical queda en el 4:5 (0 arriba, 1 abajo)
    "recorte_11": 0.5,            // ídem para el 1:1 (columna derecha, Marketplace, etc.)
    "portada_seg": 3.2,           // de qué segundo sale la miniatura (por defecto, el final)
    "productos": [298859922], "descuento": 24 }

Salida: <clave>_916.mp4, <clave>_45.mp4, <clave>_11.mp4 y sus portadas .jpg
(el último cuadro, con todo el texto, para `thumbnail_hash`).
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # que importar el otro script no deje un __pycache__ en scripts/
_spec = importlib.util.spec_from_file_location("overlay", os.path.join(AQUI, "piezas-overlay-anuncios.py"))
overlay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(overlay)

# El ffmpeg que trae el proyecto (@ffmpeg-installer) si no hay uno en el PATH:
# en la Mac no está instalado y en Render/Actions sí.
FFMPEG = shutil.which("ffmpeg") or os.path.join(
    AQUI, "..", "node_modules", "@ffmpeg-installer", "darwin-arm64", "ffmpeg")

PRIMEROS = ("titular", "bajada")
SEGUNDOS = ("chip", "beneficio")


def capas(pieza, formato, carpeta):
    """Dos PNG transparentes del tamaño del formato: (1) degradé + titular y
    bajada, (2) chip y beneficio. Se calculan con UNA sola maqueta, así el
    segundo tiempo no corre de lugar al primero."""
    ancho, alto = overlay.FORMATOS[formato]
    renglones, techo, piso = overlay.maquetar(pieza, formato)
    mascara = overlay.capa_cortina(formato, techo, piso, pieza.get("posicion") == "arriba")

    a = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    a.putalpha(mascara)
    overlay.dibujar(ImageDraw.Draw(a), renglones, PRIMEROS)
    b = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    overlay.dibujar(ImageDraw.Draw(b), renglones, SEGUNDOS)

    ruta_a = os.path.join(carpeta, f"capa_a_{formato}.png")
    ruta_b = os.path.join(carpeta, f"capa_b_{formato}.png")
    a.save(ruta_a)
    b.save(ruta_b)
    return ruta_a, ruta_b, techo, piso


def duracion(video):
    salida = subprocess.run([FFMPEG, "-hide_banner", "-i", video], capture_output=True, text=True).stderr
    for linea in salida.splitlines():
        if "Duration:" in linea:
            h, m, s = linea.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise SystemExit(f"No pude leer la duración de {video}")


def renderizar(video, pieza, formato, destino, carpeta):
    ancho, alto = overlay.FORMATOS[formato]
    ruta_a, ruta_b, techo, piso = capas(pieza, formato, carpeta)
    dur = duracion(video)
    t1 = float(pieza.get("entra_titular", 0.3))
    t2 = float(pieza.get("entra_chip", 2.8))

    # Siempre se lleva a 1080x1920 primero (cubrir y recortar al centro) y el
    # 4:5 sale de una franja de ese vertical: así los dos formatos son el
    # MISMO plano y no dos encuadres distintos del modelo.
    base = "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1"
    if formato != "916":
        y = int((1920 - alto) * float(pieza.get(f"recorte_{formato}", 0.5)))
        base += f",crop=1080:{alto}:0:{y}"
    filtro = (
        f"[0:v]{base}[v];"
        f"[1:v]format=rgba,fade=t=in:st={t1}:d=0.35:alpha=1[a];"
        f"[2:v]format=rgba,fade=t=in:st={t2}:d=0.35:alpha=1[b];"
        f"[v][a]overlay=0:0:shortest=1[va];[va][b]overlay=0:0:shortest=1,format=yuv420p[out]"
    )
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-i", video,
           "-loop", "1", "-t", f"{dur:.2f}", "-i", ruta_a,
           "-loop", "1", "-t", f"{dur:.2f}", "-i", ruta_b,
           "-filter_complex", filtro, "-map", "[out]", "-map", "0:a?",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", destino]
    subprocess.run(cmd, check=True)

    # Portada: por defecto el cuadro final, con todo el texto ya puesto. Con
    # "portada_seg" se elige otro: en el video del combo el final son los
    # escalones vacíos (el modelo ya se fue) y como miniatura no vende nada.
    portada = destino.replace(".mp4", ".jpg")
    donde = ["-ss", str(pieza["portada_seg"])] if pieza.get("portada_seg") is not None else ["-sseof", "-0.5"]
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *donde, "-i", destino,
                    "-frames:v", "1", "-q:v", "2", portada], check=True)
    print(f"  ✓ {destino}  ({dur:.1f}s, texto {100 * techo // alto}%–{100 * piso // alto}% del alto)")


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    video, spec_path, out = sys.argv[1:4]
    pieza = json.load(open(spec_path))
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for formato in ("916", "45", "11"):
            destino = os.path.join(out, f"{pieza['clave']}_{formato}.mp4")
            renderizar(video, overlay.para_formato(pieza, formato), formato, destino, tmp)


if __name__ == "__main__":
    main()
