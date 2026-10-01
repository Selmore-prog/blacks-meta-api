#!/usr/bin/env python3
"""
TARJETAS DE CARRUSEL CON FONDO DESENFOCADO — oct-2026

Pedido de Sebastián (1-oct-2026): un carrusel de "banners" con los más
vendidos, con la foto gigante y desenfocada de fondo, el producto en el medio
tal como está en la tienda y cada tarjeta llevando a su producto.

Por qué así:
  · Sale de la FOTO REAL de la tienda, no de IA: es fiel al producto, no cuesta
    nada y anda aunque Gemini no tenga saldo (el 1-oct seguía en 402).
  · El fondo es la misma foto agrandada sobre la prenda y desenfocada: cada
    tarjeta toma el color de su prenda (azul el jean, verde el cargo) y el
    carrusel se ve variado sin armar escenas a mano.
  · 1080x1080: el carrusel común de Meta es 1:1 (el 4:5 en carrusel existe sólo
    para anuncios de catálogo). En historias Meta pone cada tarjeta sobre su
    propio fondo, así que no hace falta una versión 9:16.
  · Mismas letras y mismo naranja que scripts/piezas-overlay-anuncios.py: el
    carrusel convive en el mismo conjunto que esas piezas.

  python3 scripts/carrusel-tarjetas.py anuncios/2026-10/carrusel-mas-vendidos/tarjetas.json

Spec (lo arma scripts/carrusel-mas-vendidos.js, o a mano):
  { "salida": "carpeta (relativa al spec)",
    "tarjetas": [{ "clave": "jean", "foto": "ruta o URL",
                   "titular": "JEAN CLÁSICO|RECTO"   ("|" fuerza el corte),
                   "precio": 36999, "off": 24        ("off" opcional),
                   "pastilla": "DESDE 10 UNIDADES"   (en vez de "precio", para mayorista),
                   "etiqueta": "MÁS VENDIDO"         (opcional),
                   "foco": [0.5, 0.6]                (opcional: dónde mirar para el
                                                      fondo, 0-1; si falta, el centro
                                                      de la prenda medido en la foto),
                   "zoom": 2.4 }] }
"""

import importlib.util
import io
import json
import os
import ssl
import sys
import urllib.request
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

sys.dont_write_bytecode = True  # que importar el otro script no deje un __pycache__ en scripts/
_spec = importlib.util.spec_from_file_location(
    "overlay", os.path.join(os.path.dirname(os.path.abspath(__file__)), "piezas-overlay-anuncios.py"))
_overlay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_overlay)
BLANCO, NARANJA = _overlay.BLANCO, _overlay.NARANJA
F_TITULAR = _overlay.F_TITULAR
fuente, partir = _overlay.fuente, _overlay.partir

LADO = 1080
MARGEN = 64
FOTO = 700          # lado máximo de la foto del producto en el centro
RADIO = 28


def abrir(origen):
    if origen.startswith("http"):
        # El Python de macOS no trae los certificados raíz: el CDN de
        # Tiendanube es público, así que se baja sin verificar.
        # Sin User-Agent el CDN responde 403.
        ctx = ssl._create_unverified_context()
        pedido = urllib.request.Request(origen, headers={"User-Agent": "Mozilla/5.0 (blacks-content-engine)"})
        with urllib.request.urlopen(pedido, context=ctx, timeout=30) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGB")
    return Image.open(origen).convert("RGB")


def centro_prenda(img):
    """Centro de lo que NO es fondo de estudio (gris claro parejo de las fotos de
    la tienda). Las fotos tienen modelo con remera blanca o zapatillas: se pesa
    por saturación y oscuridad, así el centro cae sobre la prenda y no sobre la
    cara o el piso."""
    chica = img.resize((64, 64), Image.BILINEAR)
    fondo = chica.getpixel((1, 1))
    sx = sy = peso = 0.0
    for y in range(64):
        for x in range(64):
            r, g, b = chica.getpixel((x, y))
            dif = abs(r - fondo[0]) + abs(g - fondo[1]) + abs(b - fondo[2])
            if dif < 40:
                continue
            sat = max(r, g, b) - min(r, g, b)
            oscuro = 255 - (r + g + b) / 3
            w = dif * (1 + sat / 64) * (0.5 + oscuro / 255)
            sx += x * w
            sy += y * w
            peso += w
    if not peso:
        return 0.5, 0.5
    return sx / peso / 63, sy / peso / 63


def fondo_desenfocado(img, foco, zoom):
    w, h = img.size
    cx, cy = foco or centro_prenda(img)
    lado = min(w, h) / zoom
    x0 = min(max(cx * w - lado / 2, 0), w - lado)
    y0 = min(max(cy * h - lado / 2, 0), h - lado)
    recorte = img.crop((int(x0), int(y0), int(x0 + lado), int(y0 + lado))).resize((LADO, LADO), Image.LANCZOS)
    fondo = recorte.filter(ImageFilter.GaussianBlur(46))
    fondo = ImageEnhance.Color(fondo).enhance(1.35)
    fondo = ImageEnhance.Brightness(fondo).enhance(0.7)
    # Viñeta: oscurece los bordes para que el texto blanco tenga contraste
    # aunque la prenda sea clara (remera blanca, alpargata cruda). Elipse
    # desenfocada: con anillos dibujados a mano quedaban bandas visibles.
    vineta = Image.new("L", (LADO, LADO), 255)
    ImageDraw.Draw(vineta).ellipse([110, 150, LADO - 110, LADO - 70], fill=0)
    vineta = vineta.filter(ImageFilter.GaussianBlur(170)).point(lambda v: int(v * 0.72))
    # Franja de arriba un poco más oscura: ahí va el titular.
    franja = Image.new("L", (LADO, LADO), 0)
    df = ImageDraw.Draw(franja)
    for y in range(0, 300):
        df.line([(0, y), (LADO, y)], fill=int(95 * (1 - y / 300) ** 1.5))
    vineta = ImageChops.lighter(vineta, franja)
    return Image.composite(Image.new("RGB", (LADO, LADO), (0, 0, 0)), fondo, vineta)


def redondeada(img, lado, radio):
    foto = img.copy()
    foto.thumbnail((lado, lado), Image.LANCZOS)
    mascara = Image.new("L", foto.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, foto.width - 1, foto.height - 1], radius=radio, fill=255)
    return foto, mascara


def titular_ajustado(draw, texto, ancho_max):
    """Hasta dos renglones; achica la letra hasta que entre. "|" fuerza el corte."""
    for tam in range(92, 50, -2):
        fnt = fuente(F_TITULAR, tam, 8)
        if "|" in texto:
            lineas = [p.strip() for p in texto.split("|")]
        else:
            lineas = partir(texto, fnt, draw, ancho_max)
        if len(lineas) <= 2 and all(draw.textlength(l, font=fnt) <= ancho_max for l in lineas):
            return fnt, lineas
    fnt = fuente(F_TITULAR, 50, 8)
    return fnt, partir(texto.replace("|", " "), fnt, draw, ancho_max)[:2]


def pesos(n):
    return "$" + f"{int(round(n)):,}".replace(",", ".")


def componer(t, destino):
    original = abrir(t["foto"])
    lienzo = fondo_desenfocado(original, t.get("foco"), float(t.get("zoom", 2.4)))
    d = ImageDraw.Draw(lienzo)

    # Titular arriba (1-2 renglones).
    y = MARGEN - 10
    f_tit, lineas = titular_ajustado(d, t["titular"].upper(), LADO - MARGEN * 2)
    alto_linea = int(f_tit.size * 1.0)
    for linea in lineas:
        tw = d.textlength(linea, font=f_tit)
        d.text(((LADO - tw) / 2, y - int(f_tit.size * 0.12)), linea, font=f_tit, fill=BLANCO)
        y += alto_linea
    y += 24

    # Lo que queda entre el titular y la fila del precio es para la foto: la
    # prenda es lo que vende, así que crece todo lo que se pueda.
    fila_precio = 80
    lado_foto = min(FOTO, LADO - MARGEN + 16 - fila_precio - 28 - y)
    foto, mascara = redondeada(original, lado_foto, RADIO)
    x = (LADO - foto.width) // 2
    sombra = Image.new("L", (LADO, LADO), 0)
    ImageDraw.Draw(sombra).rounded_rectangle([x + 6, y + 22, x + foto.width - 6, y + foto.height + 22], radius=RADIO, fill=170)
    sombra = sombra.filter(ImageFilter.GaussianBlur(26))
    lienzo = Image.composite(Image.new("RGB", (LADO, LADO), (0, 0, 0)), lienzo, sombra)
    lienzo.paste(foto, (x, y), mascara)
    d = ImageDraw.Draw(lienzo)

    # Etiqueta ("MÁS VENDIDO") montada sobre la esquina de la foto: no le roba
    # alto a la prenda.
    if t.get("etiqueta"):
        f_et = fuente(F_TITULAR, 30, 8)
        tw = d.textlength(t["etiqueta"], font=f_et)
        alto = 48
        ex, ey = x + 20, y + 20
        d.rounded_rectangle([ex, ey, ex + tw + 36, ey + alto], radius=alto // 2, fill=(20, 20, 20))
        d.text((ex + 18, ey + 7), t["etiqueta"], font=f_et, fill=BLANCO)
    y += foto.height + 28

    # Mayorista no tiene precio publicado: la pastilla lleva un beneficio
    # ("DESDE 10 UNIDADES") en lugar del importe.
    f_precio = fuente(F_TITULAR, 58 if t.get("precio") else 46, 8)
    f_off = fuente(F_TITULAR, 42, 8)
    precio = pesos(t["precio"]) if t.get("precio") else t["pastilla"].upper()
    off = f"{int(t['off'])}% OFF" if t.get("off") else ""
    pw = d.textlength(precio, font=f_precio) + 56
    ow = d.textlength(off, font=f_off) if off else 0
    hueco = 24 if off else 0
    x = (LADO - pw - hueco - ow) / 2
    d.rounded_rectangle([x, y, x + pw, y + fila_precio], radius=fila_precio // 2, fill=NARANJA)
    d.text((x + 28, y + (3 if t.get("precio") else 12)), precio, font=f_precio, fill=BLANCO)
    if off:
        d.text((x + pw + hueco, y + 14), off, font=f_off, fill=BLANCO)
    if y + fila_precio > LADO - 30:
        raise SystemExit(f"✗ {t['clave']}: el precio se sale de la tarjeta (y={y}). Acortá el titular.")

    lienzo.save(destino, "JPEG", quality=92, optimize=True)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python3 scripts/carrusel-tarjetas.py <spec.json>")
    ruta = sys.argv[1]
    spec = json.load(open(ruta, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(ruta))
    salida = os.path.join(base, spec.get("salida", "tarjetas"))
    os.makedirs(salida, exist_ok=True)
    for t in spec["tarjetas"]:
        if not t["foto"].startswith("http") and not os.path.isabs(t["foto"]):
            t = dict(t, foto=os.path.join(base, t["foto"]))
        destino = os.path.join(salida, f"{t['clave']}.jpg")
        componer(t, destino)
        print(f"✓ {destino}")


if __name__ == "__main__":
    main()
