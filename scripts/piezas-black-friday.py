#!/usr/bin/env python3
"""
PIEZAS DE BLACK FRIDAY — nov-2026

Pedido de Sebastián (23-nov-2026): dejar armadas todas las piezas de Black
Friday para activarlas cuando arranque. En Argentina el Black Friday no lo
organiza nadie (el Cyber sí, la CACE): cada marca lo hace a su manera. Cae el
viernes 27-nov y la mayoría lo estira hasta el lunes 30.

Reusa TODO el armado de scripts/piezas-cyber.py (escenas, tipografía, zonas
seguras de Reels, tachado = precio de lista de la tienda y % redondeado para
abajo). Sólo cambian:
  · LA BANDA: "BLACK" en blanco y "FRIDAY" en naranja (en el Cyber era al
    revés, "CYBER" naranja y "BLACKS" blanco). La marca es BLACKS: el evento
    tiene que leerse como propio.
  · LOS BANNERS DEL HOME (--banners): carrusel de escritorio 1920x823 (21:9,
    lo importante dentro del 62% central porque el celular recorta), versión
    celular 1080x1440 y grilla 1200x1200. Medidas de src/homeBanners.js.

Uso:
  python3 scripts/piezas-black-friday.py anuncios/2026-11/black-friday/piezas.json <carpeta> [--guia]
  python3 scripts/piezas-black-friday.py anuncios/2026-11/black-friday/banners.json <carpeta> --banners

Si cambian las fechas: cambiar "fecha" en los dos JSON y volver a correr.
"""

import importlib.util
import json
import os
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("cyber", os.path.join(AQUI, "piezas-cyber.py"))
cyber = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cyber)

FORMATOS = cyber.FORMATOS
NARANJA, BLANCO, NEGRO = cyber.NARANJA, cyber.BLANCO, cyber.NEGRO
F_TITULAR, F_TEXTO = cyber.F_TITULAR, cyber.F_TEXTO
fuente, asc, pesos, off = cyber.fuente, cyber.asc, cyber.pesos, cyber.off


def banda_bf(draw, evento, fecha, derecha, formato, fondo=True):
    """Igual que la banda del Cyber, con la última palabra del evento en naranja."""
    ancho, alto = FORMATOS[formato]
    margen = int(ancho * 0.075)
    f_ev = fuente(F_TITULAR, int(ancho * (0.092 if formato != "11" else 0.084)), 8)
    f_fe = fuente(F_TEXTO, int(ancho * (0.030 if formato != "11" else 0.027)), 1)
    f_de = fuente(F_TITULAR, int(ancho * (0.034 if formato != "11" else 0.031)), 8)
    _, a_ev = asc(draw, evento, f_ev)
    _, a_fe = asc(draw, fecha.upper(), f_fe)
    y_ev = int(alto * cyber.TECHO_BANDA[formato]) + a_ev
    y_fe = y_ev + int(f_fe.size * 0.75) + a_fe
    fin = y_fe + int(ancho * 0.038)
    if fondo:
        draw.rectangle([0, 0, ancho, fin], fill=NEGRO)
        draw.rectangle([0, fin, ancho, fin + 8], fill=NARANJA)
    else:
        draw.rectangle([margen + 2, y_fe + int(ancho * 0.022), margen + int(ancho * 0.11), y_fe + int(ancho * 0.022) + 7], fill=NARANJA)
    inicio, _, ultima = evento.rpartition(" ")
    x = margen
    if inicio:
        draw.text((x, y_ev), inicio, font=f_ev, fill=BLANCO, anchor="ls")
        x += draw.textlength(inicio + " ", font=f_ev)
    draw.text((x, y_ev), ultima, font=f_ev, fill=NARANJA, anchor="ls")
    cyber.texto_espaciado(draw, (margen + 4, y_fe), fecha.upper(), f_fe, (235, 235, 235), int(ancho * 0.004))
    if derecha:
        y = y_ev - a_ev
        for l in [l.strip().upper() for l in derecha.split("|")]:
            w, a = asc(draw, l, f_de)
            y += a
            draw.text((ancho - margen - w, y), l, font=f_de, fill=BLANCO, anchor="ls")
            y += int(f_de.size * 0.34)
    return fin + 8 if fondo else fin + int(ancho * 0.03)


cyber.banda = banda_bf  # componer() de piezas-cyber.py usa esta

# "bajar" (fracción del alto, por formato: "bajar_916": 0.14) corre la escena
# hacia abajo sobre negro. En el 9:16 la banda va SOBRE la foto y en la escena
# de la chomba le tapaba la cara al modelo.
cyber.CAMPOS = cyber.CAMPOS + ("bajar",)
_colocar_original = cyber.colocar


def colocar_bf(origen, ancho, alto, pieza):
    img = _colocar_original(origen, ancho, alto, pieza)
    bajar = float(pieza.get("bajar") or 0)
    if bajar <= 0:
        return img
    dy = int(alto * bajar)
    hueco = Image.new("RGB", (ancho, alto), NEGRO)
    hueco.paste(img, (0, dy))
    # Fundido del borde de arriba de la escena, para que no se vea el corte.
    fundido = Image.new("L", (ancho, alto), 0)
    d = ImageDraw.Draw(fundido)
    tramo = int(alto * 0.08)
    for y in range(dy, min(alto, dy + tramo)):
        d.line([(0, y), (ancho, y)], fill=int(255 * (1 - (y - dy) / tramo)))
    return Image.composite(Image.new("RGB", (ancho, alto), NEGRO), hueco, fundido)


cyber.colocar = colocar_bf


# ------------------------------------------------------------------ banners del home

BANNERS = {"slider": (1920, 823), "mobile": (1080, 1440), "grid": (1200, 1200)}


def texto_largo(draw, xy, texto, fnt, fill):
    draw.text(xy, texto, font=fnt, fill=fill, anchor="ls")
    return draw.textlength(texto, font=fnt)


def banner(spec, b, nombre, destino):
    """Un banner: escena a la derecha (o abajo en el celular), texto sobre negro.

    Escritorio: el carrusel del celular recorta al centro (safeCenter 0.62), así
    que el bloque de texto vive dentro del 62% central y no pegado al borde."""
    ancho, alto = BANNERS[nombre]
    lienzo = Image.new("RGB", (ancho, alto), NEGRO)
    origen = b[f"fuente_{nombre}"] if f"fuente_{nombre}" in b else b["fuente"]
    recorte = float(b.get(f"recorte_{nombre}", b.get("recorte", 0.5)))
    if nombre == "slider":
        # Escena en la mitad derecha, fundida hacia la izquierda.
        ancho_foto = int(ancho * 0.47)
        foto = cyber.overlay.encajar(Image.open(origen).convert("RGB"), ancho_foto, alto, recorte)
        lienzo.paste(foto, (ancho - ancho_foto, 0))
        mascara = Image.new("L", (ancho, alto), 0)
        d = ImageDraw.Draw(mascara)
        x0, x1 = ancho - ancho_foto, ancho - ancho_foto + int(ancho * 0.16)
        for x in range(0, ancho):
            t = 1.0 if x <= x0 else max(0.0, 1 - (x - x0) / (x1 - x0))
            d.line([(x, 0), (x, alto)], fill=int(255 * t))
        lienzo = Image.composite(Image.new("RGB", (ancho, alto), NEGRO), lienzo, mascara)
        margen_x = int(ancho * 0.19)          # adentro del 62% central (19%-81%)
        caja = (margen_x, int(alto * 0.17), int(ancho * 0.60), int(alto * 0.90))
        escala = alto / 823
    else:
        alto_foto = int(alto * (0.36 if nombre == "mobile" else 0.36))
        foto = cyber.overlay.encajar(Image.open(origen).convert("RGB"), ancho, alto_foto, recorte)
        lienzo.paste(foto, (0, alto - alto_foto))
        mascara = Image.new("L", (ancho, alto), 0)
        d = ImageDraw.Draw(mascara)
        y0, y1 = alto - alto_foto, alto - alto_foto + int(alto * 0.14)
        for y in range(0, alto):
            t = 1.0 if y <= y0 else max(0.0, 1 - (y - y0) / (y1 - y0))
            d.line([(0, y), (ancho, y)], fill=int(255 * t))
        lienzo = Image.composite(Image.new("RGB", (ancho, alto), NEGRO), lienzo, mascara)
        margen_x = int(ancho * 0.08)
        caja = (margen_x, int(alto * 0.07), ancho - margen_x, alto - alto_foto + int(alto * 0.06))
        escala = ancho / 1080 * (0.92 if nombre == "grid" else 1.0)

    draw = ImageDraw.Draw(lienzo)
    x, y = caja[0], caja[1]
    k = escala * {"slider": 0.80, "mobile": 1.10, "grid": 0.84}[nombre]
    f_ev = fuente(F_TITULAR, int(150 * k), 8)
    f_fe = fuente(F_TEXTO, int(30 * k), 1)
    f_tit = fuente(F_TITULAR, int(66 * k), 8)
    f_precio = fuente(F_TITULAR, int(150 * k), 8)
    f_chip = fuente(F_TITULAR, int(38 * k), 8)
    f_tach = fuente(F_TEXTO, int(34 * k), 0)
    f_ben = fuente(F_TEXTO, int((32 if nombre == 'slider' else 36) * k), 10)

    # BLACK FRIDAY grande: es lo que se ve a 2 segundos. En el carrusel ancho va
    # en un renglón; en el celular y la grilla, en dos.
    _, a = asc(draw, "BLACK", f_ev)
    y += a
    draw.text((x, y), "BLACK", font=f_ev, fill=BLANCO, anchor="ls")
    if nombre == "slider":
        draw.text((x + draw.textlength("BLACK ", font=f_ev), y), "FRIDAY", font=f_ev, fill=NARANJA, anchor="ls")
    else:
        y += int(f_ev.size * 0.92)
        draw.text((x, y), "FRIDAY", font=f_ev, fill=NARANJA, anchor="ls")
    fecha_grande = b.get(f"fecha_grande_{nombre}", b.get("fecha_grande"))
    if fecha_grande:
        # Banner genérico (sin precios): las fechas son el mensaje, van grandes.
        f_fg = fuente(F_TITULAR, int(78 * k), 8)
        y += int(f_fg.size * 0.25)
        for i, linea in enumerate(fecha_grande.split("|")):
            y += int(f_fg.size * (1.05 if i == 0 else 0.98))
            if x + draw.textlength(linea.strip(), font=f_fg) > ancho - int(ancho * 0.05):
                raise SystemExit(f"✗ banner {b['clave']} {nombre}: «{linea.strip()}» se sale por la derecha. Partilo en más renglones.")
            draw.text((x, y), linea.strip(), font=f_fg, fill=BLANCO, anchor="ls")
        y += int(f_tit.size * 0.35)
    else:
        y += int(f_fe.size * 1.7)
        cyber.texto_espaciado(draw, (x + 4, y), spec["fecha"].upper(), f_fe, (235, 235, 235), int(4 * k))
        y += int(f_tit.size * 1.45)
    for linea in (b.get("titular") or "").split("|"):
        if not linea.strip():
            continue
        draw.text((x, y), linea.strip(), font=f_tit, fill=BLANCO, anchor="ls")
        y += int(f_tit.size * 1.0)
    if b.get("precio"):
        y += int(f_precio.size * 0.78)
        draw.text((x, y), pesos(b["precio"]), font=f_precio, fill=BLANCO, anchor="ls")
        w, ap = asc(draw, pesos(b["precio"]), f_precio)
        if b.get("lista"):
            x0 = x + w + int(f_precio.size * 0.12)
            chip = f"{off(b['lista'], b['precio'])}% OFF"
            cw, ca = asc(draw, chip, f_chip)
            px, py = int(f_chip.size * 0.45), int(f_chip.size * 0.26)
            y0 = y - ap
            draw.rounded_rectangle([x0, y0, x0 + cw + px * 2, y0 + ca + py * 2], radius=(ca + py * 2) // 2, fill=NARANJA)
            draw.text((x0 + px, y0 + py + ca), chip, font=f_chip, fill=BLANCO, anchor="ls")
            tach = pesos(b["lista"])
            tw, ta = asc(draw, tach, f_tach)
            draw.text((x0 + 2, y), tach, font=f_tach, fill=(225, 225, 225), anchor="ls")
            g = max(3, f_tach.size // 13)
            draw.rectangle([x0 - 1, y - ta // 2 - g // 2, x0 + tw + 5, y - ta // 2 + g // 2], fill=(225, 225, 225))
    for i, linea in enumerate((b.get("beneficio") or "").split("|")):
        if linea.strip():
            y += int(f_ben.size * (1.9 if i == 0 else 1.35))
            draw.text((x, y), linea.strip(), font=f_ben, fill=(235, 235, 235), anchor="ls")
    if b.get("boton"):
        y += int(f_ben.size * 1.2)
        f_bt = fuente(F_TITULAR, int(36 * k), 8)
        tw, ta = asc(draw, b["boton"].upper(), f_bt)
        px, py = int(34 * k), int(20 * k)
        draw.rounded_rectangle([x, y, x + tw + px * 2, y + ta + py * 2], radius=int(8 * k), fill=NARANJA)
        draw.text((x + px, y + py + ta), b["boton"].upper(), font=f_bt, fill=BLANCO, anchor="ls")
        y += ta + py * 2
    if y > caja[3]:
        raise SystemExit(f"✗ banner {b['clave']} {nombre}: el texto llega a {y}px y el máximo es {caja[3]}px. Acortalo.")
    lienzo.save(destino, "JPEG", quality=90, optimize=True)
    return y


def main_banners(spec, out):
    for nombre in BANNERS:
        os.makedirs(os.path.join(out, nombre), exist_ok=True)
    solo = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--solo=")), None)
    for b in spec["banners"]:
        if solo and b["clave"] not in solo:
            continue
        for nombre in BANNERS:
            destino = os.path.join(out, nombre, f"{b['clave']}_{nombre}.jpg")
            banner(spec, b, nombre, destino)
            print(f"  ✓ {destino}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    if "--banners" in sys.argv:
        main_banners(json.load(open(args[0])), args[1])
    else:
        cyber.main()
