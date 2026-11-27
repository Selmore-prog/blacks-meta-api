#!/usr/bin/env python3
"""Hoja de revisión: todas las piezas de un formato en una sola imagen.

  python3 anuncios/2026-11/black-friday/hoja.py ~/Desktop/piezas-motor/noviembre/black-friday 45 anuncios/2026-11/black-friday/revision-45.jpg
"""
import glob
import os
import sys

from PIL import Image

carpeta, formato, destino = sys.argv[1:4]
archivos = sorted(f for f in glob.glob(os.path.join(carpeta, formato, "*.jpg")) if not f.endswith("_guia.jpg"))
ancho_celda = 360
imgs = [Image.open(f).convert("RGB") for f in archivos]
alto_celda = int(ancho_celda * imgs[0].height / imgs[0].width)
columnas = 5 if formato != "916" else 9
filas = (len(imgs) + columnas - 1) // columnas
hoja = Image.new("RGB", (columnas * (ancho_celda + 8), filas * (alto_celda + 8)), (255, 255, 255))
for i, im in enumerate(imgs):
    im = im.resize((ancho_celda, alto_celda), Image.LANCZOS)
    hoja.paste(im, ((i % columnas) * (ancho_celda + 8), (i // columnas) * (alto_celda + 8)))
hoja.save(destino, "JPEG", quality=85)
print(destino)
