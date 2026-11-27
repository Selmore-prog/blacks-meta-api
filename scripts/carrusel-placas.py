#!/usr/bin/env python3
"""
CARRUSEL DE PLACAS FIJAS (estilo plantilla de catálogo) — oct-2026

Pedido de Sebastián (14-oct-2026): un asesor de Meta Ads recomienda, en vez del
catálogo dinámico, un carrusel PROPIO con buenas fotos de los más vendidos,
"estético y minimalista", como las plantillas de feedr.com (pago). Esto hace
lo mismo sin pagar: cada tarjeta es una "placa" con las fotos REALES de la
tienda —una grande y dos de detalle o de otros colores— sobre un fondo liso,
y una franja abajo con nombre, talles, precio tachado y % OFF.

Por qué así:
  · Fotos reales de estudio de la tienda, nada de IA: la prenda es la que
    llega y no hay que revisar bolsillos inventados. Se usan sólo fotos de
    COLORES CON STOCK (el pantalón de trabajo marrón no tiene: no va).
  · Sin logo: el nombre de la cuenta ya sale arriba del anuncio, y Sebastián
    pidió sacar el logo de las piezas (14-sep-2026).
  · 1080x1080: el carrusel común de Meta es 1:1. Todo el texto queda dentro
    de la placa, así que ninguna ubicación lo recorta.
  · El precio es el MAYOR que cobra la tienda entre las variantes y los
    talles dicen el rango que HOY tiene stock (Ley 24.240 art. 8). El
    verificador de precios controla cada tarjeta igual que en el carrusel
    anterior (manifiesto: "tarjetas").

  python3 scripts/carrusel-placas.py anuncios/2026-10/carrusel-placas/placas.json

Spec:
  { "salida": "carpeta (relativa al spec)",
    "tarjetas": [{
      "clave": "01-jean",
      "fotos": [ {"src": "ruta o URL", "foco": [0.5, 0.4], "zoom": 1.0},  ← la grande
                 {"src": ...}, {"src": ...} ],                            ← detalles (opcional)
      "titular": "Jean Clásico Recto",
      "detalle": "Del 40 al 54 · 5 colores",
      "precio": 38999, "lista": 48999, "off": 20,   ("lista" y "off" opcionales)
      "etiqueta": "MÁS VENDIDO",                   (opcional)
      "pie": "Hasta 6 cuotas sin interés" }] }      (opcional, a la altura del precio)
  "foco" es el punto de la foto que queda en el centro del recorte (0-1) y
  "zoom" > 1 acerca. Sin "foco", el centro.
"""

import io
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

LADO = 1080
FONDO = (243, 241, 237)       # hueso cálido: deja respirar a las fotos grises de la tienda
TINTA = (20, 20, 20)
GRIS = (120, 115, 108)
NARANJA = (193, 68, 12)       # el mismo de las piezas (config.brand.colors.darkOrange)

M = 40        # margen
GAP = 12      # separación entre fotos
FOTO_ALTO = 744
RADIO = 18

F_COND = "/System/Library/Fonts/Avenir Next Condensed.ttc"   # 8 Heavy · 0 Bold · 2 Demi Bold
F_HELV = "/System/Library/Fonts/HelveticaNeue.ttc"           # 0 Regular · 1 Bold · 10 Medium


def fuente(ruta, tam, indice=0):
    try:
        return ImageFont.truetype(ruta, tam, index=indice)
    except Exception:
        return ImageFont.load_default()


def pesos(n):
    return "$" + f"{int(round(n)):,}".replace(",", ".")


def abrir(src, base):
    if src.startswith("http"):
        # curl y no urllib: el Python de la Mac no trae los certificados raíz
        # (CERTIFICATE_VERIFY_FAILED) y no hay por qué apagar la verificación.
        # El CDN de Tiendanube devuelve 403 sin User-Agent.
        datos = subprocess.run(["curl", "-sfL", "-A", "Mozilla/5.0", "--max-time", "30", src],
                               check=True, capture_output=True).stdout
        return Image.open(io.BytesIO(datos)).convert("RGB")
    ruta = src if os.path.isabs(src) else os.path.join(base, src)
    return Image.open(ruta).convert("RGB")


def recortar(img, ancho, alto, foco=(0.5, 0.5), zoom=1.0):
    """Cubre la celda sin deformar; `foco` queda lo más al centro posible."""
    w, h = img.size
    escala = max(ancho / w, alto / h) * max(1.0, float(zoom))
    nw, nh = round(w * escala), round(h * escala)
    img = img.resize((nw, nh), Image.LANCZOS)
    cx, cy = foco[0] * nw, foco[1] * nh
    x = int(min(max(cx - ancho / 2, 0), nw - ancho))
    y = int(min(max(cy - alto / 2, 0), nh - alto))
    return img.crop((x, y, x + ancho, y + alto))


def pegar_redondeada(lienzo, img, x, y):
    mascara = Image.new("L", img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, img.width - 1, img.height - 1), RADIO, fill=255)
    lienzo.paste(img, (x, y), mascara)


def pastilla(draw, x, y, texto, fnt, fondo, color, pad_x=18, pad_y=10):
    """Dibuja una pastilla con su esquina superior izquierda en (x, y); devuelve el ancho."""
    caja = draw.textbbox((0, 0), texto, font=fnt)
    w, h = caja[2] - caja[0], caja[3] - caja[1]
    draw.rounded_rectangle((x, y, x + w + 2 * pad_x, y + h + 2 * pad_y), (h + 2 * pad_y) // 2, fill=fondo)
    draw.text((x + pad_x - caja[0], y + pad_y - caja[1]), texto, font=fnt, fill=color)
    return w + 2 * pad_x


def ajustar(draw, texto, ruta, indice, tam, ancho_max, tam_min):
    while tam > tam_min:
        fnt = fuente(ruta, tam, indice)
        if draw.textlength(texto, font=fnt) <= ancho_max:
            return fnt
        tam -= 2
    return fuente(ruta, tam_min, indice)


def placa(t, base):
    lienzo = Image.new("RGB", (LADO, LADO), FONDO)
    draw = ImageDraw.Draw(lienzo)
    fotos = t["fotos"]
    ancho_util = LADO - 2 * M

    # ---- Fotos: una grande + dos de detalle, o una sola a todo el ancho ----
    if len(fotos) >= 3:
        ancho_grande = round((ancho_util - GAP) * 0.64)
        ancho_chica = ancho_util - GAP - ancho_grande
        alto_chica = (FOTO_ALTO - GAP) // 2
        celdas = [
            (M, M, ancho_grande, FOTO_ALTO),
            (M + ancho_grande + GAP, M, ancho_chica, alto_chica),
            (M + ancho_grande + GAP, M + alto_chica + GAP, ancho_chica, FOTO_ALTO - alto_chica - GAP),
        ]
    else:
        celdas = [(M, M, ancho_util, FOTO_ALTO)]
    for f, (x, y, w, h) in zip(fotos, celdas):
        img = recortar(abrir(f["src"], base), w, h, f.get("foco", (0.5, 0.5)), f.get("zoom", 1.0))
        pegar_redondeada(lienzo, img, x, y)

    if t.get("etiqueta"):
        pastilla(draw, M + 22, M + 22, t["etiqueta"].upper(), fuente(F_HELV, 21, 1), TINTA, (255, 255, 255), 16, 9)

    # ---- Franja de abajo: nombre y talles a la izquierda, precio a la derecha ----
    y0 = M + FOTO_ALTO + 34
    derecha = LADO - M

    precio = pesos(t["precio"])
    f_precio = fuente(F_COND, 92, 8)
    caja_p = draw.textbbox((0, 0), precio, font=f_precio)
    w_precio = caja_p[2] - caja_p[0]
    base_precio = LADO - M - 6        # línea de base visual del precio
    draw.text((derecha - w_precio - caja_p[0], base_precio - caja_p[3]), precio, font=f_precio, fill=TINTA)
    alto_precio = caja_p[3] - caja_p[1]
    tope_precio = base_precio - alto_precio

    if t.get("lista") and t["lista"] > t["precio"]:
        f_lista = fuente(F_HELV, 30, 0)
        lista = pesos(t["lista"])
        caja_l = draw.textbbox((0, 0), lista, font=f_lista)
        w_l, h_l = caja_l[2] - caja_l[0], caja_l[3] - caja_l[1]
        yl = tope_precio - 22 - h_l
        xl = derecha - w_l
        draw.text((xl - caja_l[0], yl - caja_l[1]), lista, font=f_lista, fill=GRIS)
        draw.line((xl - 2, yl + h_l // 2 + 1, xl + w_l + 2, yl + h_l // 2 + 1), fill=GRIS, width=2)
        if t.get("off"):
            f_off = fuente(F_HELV, 22, 1)
            texto_off = f"{t['off']}% OFF"
            caja_o = draw.textbbox((0, 0), texto_off, font=f_off)
            w_o = caja_o[2] - caja_o[0] + 28
            h_o = caja_o[3] - caja_o[1] + 16
            pastilla(draw, xl - 14 - w_o, yl + h_l // 2 - h_o // 2, texto_off, f_off, NARANJA, (255, 255, 255), 14, 8)

    ancho_texto = derecha - w_precio - 40 - M
    titular = t["titular"].upper()
    f_tit = ajustar(draw, titular, F_COND, 8, 62, ancho_texto, 40)
    caja_t = draw.textbbox((0, 0), titular, font=f_tit)
    draw.text((M - caja_t[0], y0 - caja_t[1]), titular, font=f_tit, fill=TINTA)
    if t.get("detalle"):
        f_det = ajustar(draw, t["detalle"], F_HELV, 0, 30, ancho_texto, 22)
        caja_d = draw.textbbox((0, 0), t["detalle"], font=f_det)
        draw.text((M - caja_d[0], y0 + (caja_t[3] - caja_t[1]) + 18 - caja_d[1]), t["detalle"], font=f_det, fill=GRIS)
    if t.get("pie"):
        # A la altura del precio: cierra la franja y no deja un hueco abajo a la izquierda.
        f_pie = ajustar(draw, t["pie"], F_HELV, 10, 26, ancho_texto, 20)
        caja_f = draw.textbbox((0, 0), t["pie"], font=f_pie)
        draw.text((M - caja_f[0], base_precio - caja_f[3]), t["pie"], font=f_pie, fill=TINTA)
    return lienzo


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    spec_path = os.path.abspath(sys.argv[1])
    base = os.path.dirname(spec_path)
    with open(spec_path, encoding="utf-8") as fh:
        spec = json.load(fh)
    salida = os.path.join(base, spec.get("salida", "placas"))
    os.makedirs(salida, exist_ok=True)
    for t in spec["tarjetas"]:
        destino = os.path.join(salida, f"{t['clave']}.jpg")
        placa(t, base).save(destino, quality=92)
        print(f"  ✓ {destino}")


if __name__ == "__main__":
    main()
