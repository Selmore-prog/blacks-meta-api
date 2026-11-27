#!/usr/bin/env python3
"""
PIEZAS DE CYBER BLACKS — nov-2026

Pedido de Sebastián (27-oct-2026): placas para el Cyber de la semana del
2 al 4 de noviembre con los más vendidos. No puede decir "Cyber Monday" (es
marca de la CACE y la tienda no está adherida), así que el evento se llama
CYBER BLACKS.

Por qué así:
  · LA ESCENA QUE YA VENDE, NO UNA NUEVA. El anuncio que trajo casi todas las
    ventas de octubre es la pila de jeans en el taller con el título y el
    precio arriba. Acá se usan las mismas escenas sin texto (Escritorio,
    piezas-motor) y se les agrega una banda negra de evento arriba: el que ya
    vio el anuncio reconoce la prenda y ve que ahora hay otro precio.
  · LA FOTO EMPIEZA DEBAJO DE LA BANDA. Si la banda se pintara encima, en la
    chomba tapaba la cara. "recorte_<formato>" (0 arriba · 0.5 centro ·
    1 abajo) elige qué franja de la escena queda en el hueco.
  · TACHADO = EL PRECIO DE LISTA DE LA TIENDA (compare_at_price) y el % sale
    contra ese mismo número: es lo que el cliente ve en la ficha durante el
    evento y lo que controla scripts/verificar-precios-anuncios.js. El % se
    redondea PARA ABAJO: si el aviso promete más que la tienda es un error.
  · Misma tipografía y mismas zonas seguras que piezas-overlay-anuncios.py
    (se importa de ahí): texto del 9:16 entre el 14% y el 65% del alto
    (Reels), del 4:5 dentro del cuadrado central (Marketplace recorta).
  · Las piezas con precio NO pueden salir antes de que la tienda tenga el
    precio Cyber cargado: el verificador las marca ✗ y las pausa. La de
    "teaser" no tiene precio y puede correr antes del evento.

  python3 scripts/piezas-cyber.py anuncios/2026-11/cyber-blacks/piezas.json <carpeta_salida> [--guia]

Spec:
  { "evento": "CYBER BLACKS",
    "fecha": "2, 3 y 4 de noviembre",         ← segunda línea de la banda
    "banda_derecha": "Hasta 6 cuotas|sin interés",  ← a la derecha de la banda, en todas
    "piezas": [{
      "clave": "jean-clasico",
      "fuente_45": "...png", "fuente_916": "...png", ("fuente_11" opcional)
      "posicion": "arriba",                    ← el bloque cuelga de la banda (si no, va abajo)
      "titular": "JEAN CLÁSICO RECTO",
      "bajada": "Del 40 al 54 · 5 colores",
      "lista": 48999, "precio": 34999,         ← sin "precio" es una pieza sin precio (teaser)
      "beneficio": "Llevando 2, envío gratis",
      "escala": 0.8,                           ← achica la escena sobre negro (sólo fondos negros)
      "fecha": "...",                          ← pisa la del evento (p. ej. "ÚLTIMO DÍA")
      "productos": [298859922] }] }
  Cualquier campo se puede pisar por formato ("titular_916", "recorte_11"...).
  En el titular, "|" fuerza el corte.
"""

import importlib.util
import json
import os
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # que importar el otro script no deje un __pycache__ en scripts/
_spec = importlib.util.spec_from_file_location("overlay", os.path.join(AQUI, "piezas-overlay-anuncios.py"))
overlay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(overlay)

FORMATOS = overlay.FORMATOS
NARANJA = overlay.NARANJA
BLANCO = overlay.BLANCO
NEGRO = (14, 14, 14)
F_TITULAR = overlay.F_TITULAR
F_TEXTO = overlay.F_TEXTO
fuente = overlay.fuente

CAMPOS = ("titular", "bajada", "beneficio", "posicion", "fecha", "recorte", "escala", "tam_titular")

# Dónde arranca el texto de la banda. 9:16: debajo de lo que tapa Reels (14%).
# 4:5 y 1:1: arriba de todo. En 4:5 la banda queda FUERA del cuadrado central
# que usa Marketplace; se acepta porque los conjuntos minoristas no salen en
# Marketplace ni en el feed de Facebook (sólo Instagram + Reels de FB), y el
# precio, que es lo que obliga, sí queda adentro. Con la banda dentro del
# cuadrado la primera versión tapaba media prenda.
TECHO_BANDA = {"45": 0.045, "916": overlay.REELS_TOP + 0.012, "11": 0.045}
# Dónde puede terminar el bloque de producto.
PISO = {"45": 0.90 - 0.012, "916": overlay.PISO_916, "11": 1 - 0.06}


def pesos(n):
    return "$" + f"{int(round(n)):,}".replace(",", ".")


def off(lista, precio):
    """% de descuento redondeado para abajo: nunca prometer más que la tienda."""
    return int((1 - precio / lista) * 100) if lista and lista > precio else 0


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


def texto_espaciado(draw, xy, texto, fnt, fill, aire):
    x, y = xy
    for c in texto:
        draw.text((x, y), c, font=fnt, fill=fill, anchor="ls")
        x += draw.textlength(c, font=fnt) + aire
    return x


def banda(draw, evento, fecha, derecha, formato, fondo=True):
    """Encabezado del evento: "CYBER BLACKS" + fecha a la izquierda y, a la
    derecha, un dato que vale para todas las piezas (las cuotas). Así el
    bloque de cada prenda tiene un renglón menos.

    fondo=True (4:5 y 1:1): banda negra con filete naranja; la foto va debajo.
    fondo=False (9:16): el texto va sobre la foto, con la cortina detrás. En
    9:16 los primeros 14% los tapa Reels: una banda negra ahí era una franja
    muerta y le robaba alto a la prenda.
    Devuelve dónde termina."""
    ancho, alto = FORMATOS[formato]
    margen = int(ancho * 0.075)
    # Medido: "CYBER BLACKS" a 0.092 del ancho ocupa 609 px y las cuotas a 0.034,
    # 252 px; entre los dos quedan ~57 px de aire. A 0.10 se pisaban.
    f_ev = fuente(F_TITULAR, int(ancho * (0.092 if formato != "11" else 0.084)), 8)
    f_fe = fuente(F_TEXTO, int(ancho * (0.030 if formato != "11" else 0.027)), 1)
    f_de = fuente(F_TITULAR, int(ancho * (0.034 if formato != "11" else 0.031)), 8)
    _, a_ev = asc(draw, evento, f_ev)
    _, a_fe = asc(draw, fecha.upper(), f_fe)
    y_ev = int(alto * TECHO_BANDA[formato]) + a_ev
    y_fe = y_ev + int(f_fe.size * 0.75) + a_fe
    fin = y_fe + int(ancho * 0.038)
    if fondo:
        draw.rectangle([0, 0, ancho, fin], fill=NEGRO)
        draw.rectangle([0, fin, ancho, fin + 8], fill=NARANJA)
    else:
        draw.rectangle([margen + 2, y_fe + int(ancho * 0.022), margen + int(ancho * 0.11), y_fe + int(ancho * 0.022) + 7], fill=NARANJA)
    # "CYBER" en naranja y el resto en blanco: la marca es BLACKS.
    primera, _, resto = evento.partition(" ")
    x = margen
    draw.text((x, y_ev), primera, font=f_ev, fill=NARANJA, anchor="ls")
    x += draw.textlength(primera + " ", font=f_ev)
    draw.text((x, y_ev), resto, font=f_ev, fill=BLANCO, anchor="ls")
    texto_espaciado(draw, (margen + 4, y_fe), fecha.upper(), f_fe, (235, 235, 235), int(ancho * 0.004))
    # A la derecha, alineado con el tope de "CYBER BLACKS", en dos renglones.
    if derecha:
        lineas = [l.strip().upper() for l in derecha.split("|")]
        y = y_ev - a_ev
        for l in lineas:
            w, a = asc(draw, l, f_de)
            y += a
            draw.text((ancho - margen - w, y), l, font=f_de, fill=BLANCO, anchor="ls")
            y += int(f_de.size * 0.34)
    return fin + 8 if fondo else fin + int(ancho * 0.03)


def colocar(origen, ancho, alto, pieza):
    """La escena en un hueco de ancho x alto. Por defecto cubre y recorta
    ("recorte": 0 arriba · 0.5 centro · 1 abajo). Con "escala" < 1 la achica
    sobre negro: sólo para escenas de fondo negro (la grilla de remeras), que
    así bajan y dejan lugar al texto sin que se note el borde."""
    img = Image.open(origen).convert("RGB")
    escala = float(pieza.get("escala") or 1)
    recorte = float(pieza.get("recorte", 0.5))
    if escala >= 1:
        return overlay.encajar(img, ancho, alto, recorte)
    w, h = img.size
    k = max(ancho / w, alto / h) * escala
    img = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
    hueco = Image.new("RGB", (ancho, alto), img.getpixel((2, 2)))
    hueco.paste(img, ((ancho - img.width) // 2, int((alto - img.height) * recorte)))
    return hueco


def maquetar(pieza, formato, draw):
    """Renglones del bloque de producto con su línea de base relativa (0 = techo).

    Compacto a propósito: título de una línea, precio grande con el % y el
    tachado apilados AL COSTADO (no en un renglón aparte). La primera versión,
    con todo en columna, ocupaba la mitad de la placa y tapaba la prenda."""
    ancho, _ = FORMATOS[formato]
    margen = int(ancho * 0.075)
    ancho_max = ancho - margen * 2
    chico = formato == "11"
    f_tit = fuente(F_TITULAR, int(ancho * float(pieza.get("tam_titular", 0.074 if chico else 0.084))), 8)
    f_baj = fuente(F_TEXTO, int(ancho * (0.032 if chico else 0.036)), 0)
    f_precio = fuente(F_TITULAR, int(ancho * (0.13 if chico else 0.155)), 8)
    f_chip = fuente(F_TITULAR, int(ancho * (0.036 if chico else 0.041)), 8)
    f_tach = fuente(F_TEXTO, int(ancho * (0.034 if chico else 0.039)), 0)
    f_ben = fuente(F_TEXTO, int(ancho * (0.029 if chico else 0.032)), 10)

    renglones, y = [], 0

    def sumar(tipo, texto, fnt, aire, **extra):
        nonlocal y
        _, a = asc(draw, texto, fnt)
        y += aire + a
        renglones.append({"tipo": tipo, "texto": texto, "fnt": fnt, "x": margen, "base": y, **extra})
        y += int(fnt.size * 0.22)  # descendentes

    for i, parte in enumerate(pieza["titular"].split("|")):
        for j, linea in enumerate(overlay.partir(parte.strip(), f_tit, draw, ancho_max)):
            sumar("titular", linea, f_tit, 0 if (i, j) == (0, 0) else int(f_tit.size * 0.02))
    if pieza.get("bajada"):
        sumar("bajada", pieza["bajada"], f_baj, int(ancho * 0.010))
    if pieza.get("precio"):
        lista, precio = pieza.get("lista"), pieza["precio"]
        extra = {}
        if lista and lista > precio:
            extra = {"chip": f"{off(lista, precio)}% OFF", "f_chip": f_chip, "tachado": pesos(lista), "f_tach": f_tach}
        sumar("precio", pesos(precio), f_precio, int(ancho * 0.030), **extra)
    # "|" en el beneficio = un renglón por beneficio ("Llevando 2, envío gratis|Hasta 6 cuotas…").
    for i, linea in enumerate((pieza.get("beneficio") or "").split("|")):
        if linea.strip():
            sumar("beneficio", linea.strip(), f_ben, int(ancho * (0.016 if i == 0 else 0.004)))
    return renglones, y


def dibujar(draw, renglones, techo):
    for r in renglones:
        fnt, x, base = r["fnt"], r["x"], techo + r["base"]
        color = {"titular": BLANCO, "precio": BLANCO, "bajada": (240, 240, 240)}.get(r["tipo"], (232, 232, 232))
        draw.text((x, base), r["texto"], font=fnt, fill=color, anchor="ls")
        if r["tipo"] != "precio" or "chip" not in r:
            continue
        # Al costado del precio: el % arriba (alineado con el tope de los
        # números) y el tachado abajo (alineado con la base).
        w, a = asc(draw, r["texto"], fnt)
        x0 = x + w + int(fnt.size * 0.12)
        fc, ft = r["f_chip"], r["f_tach"]
        cw, ca = asc(draw, r["chip"], fc)
        pad_x, pad_y = int(fc.size * 0.45), int(fc.size * 0.26)
        y0 = base - a
        draw.rounded_rectangle([x0, y0, x0 + cw + pad_x * 2, y0 + ca + pad_y * 2], radius=(ca + pad_y * 2) // 2, fill=NARANJA)
        draw.text((x0 + pad_x, y0 + pad_y + ca), r["chip"], font=fc, fill=BLANCO, anchor="ls")
        tw, ta = asc(draw, r["tachado"], ft)
        xt = x0 + 2
        draw.text((xt, base), r["tachado"], font=ft, fill=(225, 225, 225), anchor="ls")
        grosor = max(3, ft.size // 13)
        ym = base - ta // 2
        draw.rectangle([xt - 3, ym - grosor // 2, xt + tw + 3, ym + grosor // 2], fill=(225, 225, 225))


def cortina(ancho, alto, arriba_hasta, abajo_desde):
    """Degradé negro detrás del texto (máscara L). Arriba: lleno hasta
    `arriba_hasta` y se desvanece. Abajo: sube desde antes de `abajo_desde` y
    queda oscuro hasta el borde. Cualquiera de los dos puede ser None."""
    capa = Image.new("L", (ancho, alto), 0)
    d = ImageDraw.Draw(capa)
    if arriba_hasta is not None:
        fin = min(alto, arriba_hasta + int(alto * 0.10))
        for y in range(0, fin):
            t = 1.0 if y <= arriba_hasta else max(0.0, 1 - (y - arriba_hasta) / max(1, fin - arriba_hasta))
            d.line([(0, y), (ancho, y)], fill=int(175 * (t ** 1.3)))
    if abajo_desde is not None:
        ini = max(0, abajo_desde - int(ancho * 0.12))
        tramo = max(1, int(ancho * 0.22))
        for y in range(ini, alto):
            t = min(1.0, (y - ini) / tramo)
            actual = capa.getpixel((0, y))
            d.line([(0, y), (ancho, y)], fill=max(actual, int(185 * (t ** 1.4))))
    return capa


def componer(pieza, formato, origen, destino, evento, derecha, guia=False):
    ancho, alto = FORMATOS[formato]
    sobre_foto = formato == "916"
    lienzo = Image.new("RGB", (ancho, alto), NEGRO)
    draw = ImageDraw.Draw(lienzo)
    fin_banda = banda(draw, evento, pieza["fecha"], derecha, formato, fondo=not sobre_foto)
    if sobre_foto:
        lienzo.paste(colocar(origen, ancho, alto, pieza), (0, 0))
    else:
        lienzo.paste(colocar(origen, ancho, alto - fin_banda, pieza), (0, fin_banda))

    renglones, total = maquetar(pieza, formato, draw)
    arriba = pieza.get("posicion") == "arriba"
    piso_max = int(alto * PISO[formato])
    techo = fin_banda + int(ancho * (0.045 if not sobre_foto else 0.02)) if arriba else piso_max - total
    piso = techo + total
    if techo < fin_banda or piso > piso_max:
        raise SystemExit(f"✗ {pieza.get('clave')} {formato}: el bloque ocupa {techo}-{piso}px y no entra entre la "
                         f"banda ({fin_banda}px) y el piso seguro ({piso_max}px). Acortá el titular o la bajada.")

    if arriba:
        mascara = cortina(ancho, alto, piso, None)
    else:
        mascara = cortina(ancho, alto, fin_banda if sobre_foto else None, techo)
    lienzo = Image.composite(Image.new("RGB", (ancho, alto), (0, 0, 0)), lienzo, mascara)
    draw = ImageDraw.Draw(lienzo)
    banda(draw, evento, pieza["fecha"], derecha, formato, fondo=not sobre_foto)  # encima de la cortina
    dibujar(draw, renglones, techo)
    lienzo.save(destino, "JPEG", quality=92, optimize=True)
    if guia and formato == "916":
        overlay.guardar_guia(lienzo, destino.replace(".jpg", "_guia.jpg"))
    return techo, piso


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    guia = "--guia" in sys.argv
    spec_path, out = args
    base = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path))
    evento = spec.get("evento", "CYBER BLACKS")
    derecha = spec.get("banda_derecha")
    for f in FORMATOS:
        os.makedirs(os.path.join(out, f), exist_ok=True)
    for p in spec["piezas"]:
        p = {"fecha": spec.get("fecha", ""), **p}
        for formato in FORMATOS:
            rel = p.get(f"fuente_{formato}") or (p.get("fuente_45") if formato == "11" else None)
            if not rel:
                continue
            origen = rel if os.path.isabs(rel) else os.path.join(base, rel)
            if not os.path.exists(origen):
                print(f"  ✗ falta {origen}")
                continue
            destino = os.path.join(out, formato, f"{p['clave']}_{formato}.jpg")
            techo, piso = componer(para_formato(p, formato), formato, origen, destino, evento, derecha, guia)
            alto = FORMATOS[formato][1]
            print(f"  ✓ {destino}  texto {100 * techo // alto}%–{100 * piso // alto}% del alto")


if __name__ == "__main__":
    main()
