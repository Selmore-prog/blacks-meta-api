#!/usr/bin/env python3
"""
ESCENA EN MOSAICO CON LAS FOTOS REALES DE LA TIENDA — nov-2026

Para productos que no tienen escena armada (remera Gurre, cargos Gurre): pone
la foto principal de cada color en tarjetas sobre fondo oscuro, dejando
arriba el lugar del texto. Es el mismo formato que "remera-colores", la escena
de la remera Pampero en cuatro colores que ya corrió en la cuenta. La foto es
la de la ficha: lo que ve el anuncio es lo que llega.

Salen las tres escenas SIN texto (4:5, 9:16 y 1:1); el texto, el precio y las
cuotas los pone scripts/piezas-overlay-anuncios.py con "posicion": "arriba".

Uso:
  python3 scripts/escena-mosaico.py <salida_base> <foto1> <foto2> [<foto3> ...]
  → <salida_base>_45.png, <salida_base>_916.png, <salida_base>_11.png
"""

import sys
from PIL import Image, ImageDraw

FONDO = (20, 20, 20)
# Zona de las tarjetas por formato (x0, y0, x1, y1). Arriba queda el texto:
# 4:5 hasta ~50% (entra un titular de dos renglones); 9:16 del 14% al ~42%; 1:1 hasta ~42%.
ZONAS = {
    "45": ((1080, 1350), (30, 680, 1050, 1320)),
    "916": ((1080, 1920), (30, 810, 1050, 1640)),
    "11": ((1080, 1080), (30, 460, 1050, 1050)),
}
GAP = 14
RADIO = 22


def cubrir(img, ancho, alto):
    """Recorta al centro para llenar ancho×alto sin deformar."""
    r = ancho / alto
    w, h = img.size
    if w / h > r:
        nw = int(h * r)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / r)
        img = img.crop((0, 0, w, nh))  # de arriba: las fotos de cuerpo entero no pierden la cabeza
    return img.resize((ancho, alto), Image.LANCZOS)


def tarjeta(img, ancho, alto):
    t = cubrir(img.convert("RGB"), ancho, alto)
    mascara = Image.new("L", (ancho, alto), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, ancho - 1, alto - 1], radius=RADIO, fill=255)
    return t, mascara


def escena(fotos, formato):
    (W, H), (x0, y0, x1, y1) = ZONAS[formato]
    lienzo = Image.new("RGB", (W, H), FONDO)
    n = len(fotos)
    ancho = (x1 - x0 - GAP * (n - 1)) // n
    alto = y1 - y0
    for i, f in enumerate(fotos):
        t, m = tarjeta(Image.open(f), ancho, alto)
        lienzo.paste(t, (x0 + i * (ancho + GAP), y0), m)
    return lienzo


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    base, fotos = sys.argv[1], sys.argv[2:]
    for formato in ZONAS:
        destino = f"{base}_{formato}.png"
        escena(fotos, formato).save(destino)
        print(f"  ✓ {destino}")


if __name__ == "__main__":
    main()
