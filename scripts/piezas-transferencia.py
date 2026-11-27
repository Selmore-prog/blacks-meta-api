#!/usr/bin/env python3
"""
PLACAS CON EL PRECIO POR TRANSFERENCIA — nov-2026

Pedido de Sebastián (20-nov-2026): que las placas aclaren el precio pagando
por transferencia y que el 10% se vea atractivo, también en pesos.

Por qué así:
  · EL PRECIO GRANDE ES EL DE TRANSFERENCIA. Desde el 12-nov el jean pasó de
    $38.999 a $43.999 y los carritos cayeron a la mitad con las mismas
    visitas; la placa del 16-nov ("$43.999 · Llevando 2…") bajó el CTR de
    ~2,2% a ~1,6%. Por transferencia el jean sale $39.599: debajo de $40.000
    sin tocar el precio de la tienda.
  · EL AHORRO EN PESOS Y EL PRECIO CON TARJETA, A LA VISTA. "Ahorrás $4.400"
    en una pastilla blanca (lo que más se ve después del precio) y al lado
    "Con tarjeta $43.999": el aviso dice las dos cosas que cobra la tienda,
    nada escondido en letra chica (Ley 24.240 art. 8). Son los mismos números
    que muestra la ficha ("Transferencia o efectivo $39.599 · Ahorrás $4.400").
  · LOS NÚMEROS SALEN DEL PRECIO Y DEL %, NO SE ESCRIBEN A MANO. El spec dice
    "precio" (lo que cobra la tienda) y "descuento_transferencia"; el precio
    por transferencia y el ahorro se calculan acá con el mismo redondeo que la
    ficha. scripts/verificar-precios-anuncios.js controla el anuncio con el %
    que la ficha muestra en vivo ("10% de descuento pagando con Transferencia").
  · Misma tipografía, cortina y zonas seguras que piezas-overlay-anuncios.py
    (se importa de ahí): texto del 9:16 entre el 14% y el 65% del alto
    (Reels), del 4:5 dentro del cuadrado central (Marketplace recorta).

  python3 scripts/piezas-transferencia.py anuncios/2026-11/jean-transferencia/piezas.json <carpeta_salida> [--guia]

Spec (lista):
  [{ "clave": "jean-transferencia",
     "fuente_45": "...png", "fuente_916": "...png", ("fuente_11" opcional),
     "posicion": "arriba",
     "titular": "JEAN EN 5 COLORES",
     "precio": 43999,                     ← lo que cobra la tienda con tarjeta
     "descuento_transferencia": 10,       ← % de la ficha
     "tarjeta": "Con tarjeta {precio}",   ← al lado del ahorro ({precio} se reemplaza)
     "lado": "TRANSFERENCIA",             ← debajo del %, al costado del precio
     "beneficio": "Llevando 2: envío gratis",
     "productos": [298859922] }]
  Cualquier campo se puede pisar por formato ("beneficio_11": null, "recorte_11"...).
"""

import importlib.util
import json
import math
import os
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("overlay", os.path.join(AQUI, "piezas-overlay-anuncios.py"))
overlay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(overlay)

FORMATOS = overlay.FORMATOS
NARANJA = overlay.NARANJA
BLANCO = overlay.BLANCO
NEGRO = (16, 16, 16)
GRIS = (226, 226, 226)
F_TITULAR = overlay.F_TITULAR
F_TEXTO = overlay.F_TEXTO
fuente = overlay.fuente

CAMPOS = ("titular", "beneficio", "tarjeta", "lado", "posicion", "tam_titular", "recorte")


def pesos(n):
    return "$" + f"{int(round(n)):,}".replace(",", ".")


def precios(pieza):
    """(precio con tarjeta, precio por transferencia, ahorro) como los muestra
    la ficha: 43.999 × 0,90 = 39.599,10 → "$39.599"; ahorro "$4.400"."""
    precio = float(pieza["precio"])
    pct = float(pieza["descuento_transferencia"])
    transf = precio * (1 - pct / 100)
    return precio, transf, precio - transf


def para_formato(pieza, formato):
    p = dict(pieza)
    for campo in CAMPOS:
        if f"{campo}_{formato}" in pieza:
            p[campo] = pieza[f"{campo}_{formato}"]
    return p


def asc(draw, texto, fnt):
    """Ancho y alto sobre la línea de base (sin descendentes)."""
    l, t, r, _ = draw.textbbox((0, 0), texto, font=fnt, anchor="ls")
    return r - l, -t


def maquetar(pieza, formato, draw):
    """Renglones con su línea de base relativa (0 = techo) y el alto total."""
    ancho, _ = FORMATOS[formato]
    margen = int(ancho * 0.075)
    ancho_max = ancho - margen * 2
    chico = formato == "11"
    f_tit = fuente(F_TITULAR, int(ancho * float(pieza.get("tam_titular", 0.074 if chico else 0.085))), 8)
    f_precio = fuente(F_TITULAR, int(ancho * (0.14 if chico else 0.15)), 8)
    f_chip = fuente(F_TITULAR, int(ancho * (0.038 if chico else 0.043)), 8)
    f_lado = fuente(F_TITULAR, int(ancho * (0.036 if chico else 0.041)), 8)
    f_ahorro = fuente(F_TITULAR, int(ancho * (0.044 if chico else 0.050)), 8)
    f_tarjeta = fuente(F_TEXTO, int(ancho * (0.032 if chico else 0.036)), 0)
    f_ben = fuente(F_TEXTO, int(ancho * (0.029 if chico else 0.032)), 10)

    precio, transf, ahorro = precios(pieza)
    pct = int(pieza["descuento_transferencia"])
    renglones, y = [], 0

    def sumar(tipo, texto, fnt, aire, alto_extra=0, **extra):
        nonlocal y
        _, a = asc(draw, texto, fnt)
        y += aire + a + alto_extra
        renglones.append({"tipo": tipo, "texto": texto, "fnt": fnt, "x": margen, "base": y, **extra})
        y += int(fnt.size * 0.22) + alto_extra

    for i, parte in enumerate(pieza["titular"].split("|")):
        for j, linea in enumerate(overlay.partir(parte.strip(), f_tit, draw, ancho_max)):
            sumar("titular", linea, f_tit, 0 if (i, j) == (0, 0) else int(f_tit.size * 0.02))

    sumar("precio", pesos(transf), f_precio, int(ancho * 0.026),
          chip=f"{pct}% OFF", f_chip=f_chip, lado=pieza.get("lado") or "TRANSFERENCIA", f_lado=f_lado)

    tarjeta = (pieza.get("tarjeta") or "Con tarjeta {precio}").replace("{precio}", pesos(precio))
    pad_y = int(f_ahorro.size * 0.30)
    sumar("ahorro", f"AHORRÁS {pesos(ahorro)}", f_ahorro, int(ancho * 0.020), alto_extra=pad_y,
          pad_y=pad_y, tarjeta=tarjeta, f_tarjeta=f_tarjeta)

    for i, linea in enumerate((pieza.get("beneficio") or "").split("|")):
        if linea.strip():
            sumar("beneficio", linea.strip(), f_ben, int(ancho * (0.022 if i == 0 else 0.004)))

    # Que nada se salga por la derecha (el precio con su costado es lo más ancho):
    # Reels tapa el 6% derecho con los botones; se deja 1% más de aire.
    borde = ancho * 0.93
    for r in renglones:
        if r["tipo"] == "precio":
            w, _ = asc(draw, r["texto"], r["fnt"])
            lado = max(asc(draw, r["chip"], r["f_chip"])[0] + int(r["f_chip"].size * 0.9),
                       asc(draw, r["lado"], r["f_lado"])[0])
            if margen + w + int(r["fnt"].size * 0.12) + lado > borde:
                raise SystemExit(f"✗ {pieza.get('clave')} {formato}: el precio con su costado no entra a lo ancho.")
        if r["tipo"] == "ahorro":
            w, _ = asc(draw, r["texto"], r["fnt"])
            tw, _ = asc(draw, r["tarjeta"], r["f_tarjeta"])
            if margen + w + int(r["fnt"].size * 1.4) + tw > borde:
                raise SystemExit(f"✗ {pieza.get('clave')} {formato}: «{r['tarjeta']}» no entra al lado del ahorro.")
    return renglones, y


def dibujar(draw, renglones, techo):
    for r in renglones:
        fnt, x, base = r["fnt"], r["x"], techo + r["base"]
        if r["tipo"] == "ahorro":
            # Pastilla blanca con texto oscuro: lo segundo que se ve después del precio.
            w, a = asc(draw, r["texto"], fnt)
            pad_x, pad_y = int(fnt.size * 0.55), r["pad_y"]
            caja = [x, base - a - pad_y, x + w + pad_x * 2, base + pad_y]
            draw.rounded_rectangle(caja, radius=(caja[3] - caja[1]) // 2, fill=BLANCO)
            draw.text((x + pad_x, base), r["texto"], font=fnt, fill=NEGRO, anchor="ls")
            ft = r["f_tarjeta"]
            draw.text((caja[2] + int(fnt.size * 0.45), base), r["tarjeta"], font=ft, fill=GRIS, anchor="ls")
            continue
        color = {"titular": BLANCO, "precio": BLANCO}.get(r["tipo"], (232, 232, 232))
        draw.text((x, base), r["texto"], font=fnt, fill=color, anchor="ls")
        if r["tipo"] != "precio":
            continue
        # Al costado del precio: el % arriba (alineado con el tope de los
        # números) y "TRANSFERENCIA" abajo (alineado con la base). "POR TRANSFERENCIA"
        # no entra al lado de un precio de 6 cifras en 1080 px.
        w, a = asc(draw, r["texto"], fnt)
        x0 = x + w + int(fnt.size * 0.12)
        fc, fl = r["f_chip"], r["f_lado"]
        cw, ca = asc(draw, r["chip"], fc)
        pad_x, pad_y = int(fc.size * 0.45), int(fc.size * 0.26)
        y0 = base - a
        draw.rounded_rectangle([x0, y0, x0 + cw + pad_x * 2, y0 + ca + pad_y * 2],
                               radius=(ca + pad_y * 2) // 2, fill=NARANJA)
        draw.text((x0 + pad_x, y0 + pad_y + ca), r["chip"], font=fc, fill=BLANCO, anchor="ls")
        draw.text((x0 + 2, base), r["lado"], font=fl, fill=BLANCO, anchor="ls")


def componer(pieza, formato, origen, destino, guia=False):
    ancho, alto = FORMATOS[formato]
    img = overlay.encajar(Image.open(origen).convert("RGB"), ancho, alto,
                          pieza.get(f"recorte_{formato}", pieza.get("recorte", 0.5)))
    draw = ImageDraw.Draw(img)
    renglones, total = maquetar(pieza, formato, draw)
    arriba = pieza.get("posicion") == "arriba"
    if formato == "916":
        techo = int(alto * (overlay.REELS_TOP + 0.015)) if arriba else int(alto * overlay.PISO_916) - total
    else:
        margen_v = overlay.MARGEN_45 if formato == "45" else 0.065
        techo = int(alto * margen_v) if arriba else alto - int(alto * (margen_v + 0.01)) - total
    piso = techo + total

    if formato == "916" and (techo < alto * overlay.REELS_TOP or piso > alto * (1 - overlay.REELS_BOTTOM)):
        raise SystemExit(f"✗ {pieza.get('clave')}: en 9:16 el texto ocupa {techo}-{piso}px y se sale de la zona "
                         f"segura de Reels ({int(alto * overlay.REELS_TOP)}-{int(alto * (1 - overlay.REELS_BOTTOM))}px).")
    if formato == "45" and (techo < alto * 0.10 or piso > alto * 0.90):
        raise SystemExit(f"✗ {pieza.get('clave')}: en 4:5 el texto ocupa {techo}-{piso}px y se sale del "
                         f"cuadrado central ({int(alto * 0.10)}-{int(alto * 0.90)}px) que usa Marketplace.")

    mascara = overlay.capa_cortina(formato, techo, piso, arriba)
    img = Image.composite(Image.new("RGB", (ancho, alto), (0, 0, 0)), img, mascara)
    dibujar(ImageDraw.Draw(img), renglones, techo)
    img.save(destino, "JPEG", quality=92, optimize=True)
    if guia and formato == "916":
        overlay.guardar_guia(img, destino.replace(".jpg", "_guia.jpg"))
    return techo, piso


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    guia = "--guia" in sys.argv
    spec_path, out = args
    base = os.path.dirname(os.path.abspath(spec_path))
    piezas = json.load(open(spec_path))
    for f in FORMATOS:
        os.makedirs(os.path.join(out, f), exist_ok=True)
    for p in piezas:
        precio, transf, ahorro = precios(p)
        print(f"{p['clave']}: con tarjeta {pesos(precio)} · por transferencia {pesos(transf)} · ahorrás {pesos(ahorro)}")
        for formato in FORMATOS:
            rel = p.get(f"fuente_{formato}") or (p.get("fuente_45") if formato == "11" else None)
            if not rel:
                continue
            origen = rel if os.path.isabs(rel) else os.path.join(base, rel)
            if not os.path.exists(origen):
                print(f"  ✗ falta {origen}")
                continue
            destino = os.path.join(out, formato, f"{p['clave']}_{formato}.jpg")
            techo, piso = componer(para_formato(p, formato), formato, origen, destino, guia)
            alto = FORMATOS[formato][1]
            print(f"  ✓ {destino}  texto {100 * techo // alto}%–{100 * piso // alto}% del alto")


if __name__ == "__main__":
    main()
