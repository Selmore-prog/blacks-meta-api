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
    "sale": 6.2,                  // opcional: el texto se va a los 6,2 s (sólo gancho)
    "cortes": [[1.84, 5.22], [6.30, 23.90]],   // opcional: tramos del original que quedan
    "subtitulos": [{"texto": "Te presento", "desde": 0.0, "hasta": 0.6}, ...],
                                  // opcional: tiempos del video YA cortado; sólo en el 9:16
    "productos": [298859922], "descuento": 24 }

Videos del equipo (oct-2026): llegan con frases para sacar (lo que no se puede
afirmar, "entrá a la web" cuando el botón lleva a WhatsApp). "cortes" deja sólo
esos tramos, unidos con un fundido de audio de 30-40 ms para que no haga clic,
y "subtitulos" los escribe con la letra de la marca, en mayúsculas bien
acentuadas y dentro de la zona segura de Reels. Los que traen subtítulos
quemados de CapCut no sirven: errores ("CHOMPAS", "MáS") y a la altura que tapa
Reels. Se le pide al equipo el archivo sin subtítulos ni música.

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


def cortar(video, cortes, destino):
    """Deja sólo los tramos de `cortes` (segundos del original) y los une. Se
    recodifica casi sin pérdida (crf 12): el render final vuelve a comprimir."""
    partes, entradas = [], ""
    for i, (a, b) in enumerate(cortes):
        d = float(b) - float(a)
        # El último tramo cierra con un fundido más largo: es el final del video.
        fin = f"afade=t=out:st={d - 0.30:.2f}:d=0.30" if i == len(cortes) - 1 else f"afade=t=out:st={d - 0.04:.2f}:d=0.04"
        partes.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}]")
        partes.append(f"[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.03,{fin}[a{i}]")
        entradas += f"[v{i}][a{i}]"
    partes.append(f"{entradas}concat=n={len(cortes)}:v=1:a=1[v][a]")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", video, "-filter_complex", ";".join(partes),
                    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-r", "30",
                    "-c:a", "aac", "-b:a", "192k", destino], check=True)
    return destino


def capa_subtitulo(texto, carpeta, n):
    """Un subtítulo en un PNG transparente de 1080x1920: mayúsculas de la marca,
    blanco con borde oscuro, centrado a lo ancho y con el renglón de abajo por
    encima del 64% del alto (debajo, Reels lo tapa con su interfaz)."""
    ancho, alto = overlay.FORMATOS["916"]
    img = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fnt = overlay.fuente(overlay.F_TITULAR, int(ancho * 0.07), 8)
    renglones = overlay.partir(texto.upper(), fnt, draw, int(ancho * 0.80))
    paso = int(ancho * 0.07 * 1.12)
    y = int(alto * overlay.PISO_916) - paso * len(renglones)
    for r in renglones:
        draw.text((ancho // 2, y), r, font=fnt, fill=(255, 255, 255), anchor="mt",
                  stroke_width=7, stroke_fill=(15, 15, 15))
        y += paso
    ruta = os.path.join(carpeta, f"sub_{n:03d}.png")
    img.save(ruta)
    return ruta


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
    # "sale": el texto se va a esa altura del video. Sirve cuando el texto es
    # sólo el gancho y después el video habla por sí mismo: en los videos del
    # equipo vienen primeros planos de la prenda que el texto taparía.
    sale = f",fade=t=out:st={float(pieza['sale'])}:d=0.35:alpha=1" if pieza.get("sale") is not None else ""

    # Siempre se lleva a 1080x1920 primero (cubrir y recortar al centro) y el
    # 4:5 sale de una franja de ese vertical: así los dos formatos son el
    # MISMO plano y no dos encuadres distintos del modelo.
    base = "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1"
    if formato != "916":
        y = int((1920 - alto) * float(pieza.get(f"recorte_{formato}", 0.5)))
        base += f",crop=1080:{alto}:0:{y}"
    filtro = (
        f"[0:v]{base}[v];"
        f"[1:v]format=rgba,fade=t=in:st={t1}:d=0.35:alpha=1{sale}[a];"
        f"[2:v]format=rgba,fade=t=in:st={t2}:d=0.35:alpha=1{sale}[b];"
        f"[v][a]overlay=0:0:shortest=1[va];[va][b]overlay=0:0:shortest=1[vb]"
    )
    # Subtítulos: sólo en el 9:16, que es el que va a Reels e Historias (y el
    # único que usa el anuncio a WhatsApp). Cada uno es un PNG que se muestra
    # entre su "desde" y su "hasta".
    subs = (pieza.get("subtitulos") or []) if formato == "916" else []
    extra, previo = [], "vb"
    for i, s in enumerate(subs):
        extra += ["-loop", "1", "-t", f"{dur:.2f}", "-i", capa_subtitulo(s["texto"], carpeta, i)]
        filtro += f";[{previo}][{3 + i}:v]overlay=0:0:enable='between(t,{float(s['desde']):.2f},{float(s['hasta']):.2f})'[s{i}]"
        previo = f"s{i}"
    filtro += f";[{previo}]format=yuv420p[out]"
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-i", video,
           "-loop", "1", "-t", f"{dur:.2f}", "-i", ruta_a,
           "-loop", "1", "-t", f"{dur:.2f}", "-i", ruta_b, *extra,
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
        if pieza.get("cortes"):
            video = cortar(video, pieza["cortes"], os.path.join(tmp, "cortado.mp4"))
            print(f"  · cortado: {len(pieza['cortes'])} tramos, {duracion(video):.1f}s")
        for formato in ("916", "45", "11"):
            destino = os.path.join(out, f"{pieza['clave']}_{formato}.mp4")
            renderizar(video, overlay.para_formato(pieza, formato), formato, destino, tmp)


if __name__ == "__main__":
    main()
