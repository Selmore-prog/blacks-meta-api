#!/usr/bin/env python3
"""
TEXTO SOBRE LAS PIEZAS DE ANUNCIOS DE META — desde oct-2026

Reemplaza a piezas-overlay.py y piezas-overlay-primavera.py para todo lo nuevo.
Tres cambios de fondo, los tres medidos en la cuenta el 28-sep-2026:

1. ZONA SEGURA DE REELS, NO LA DE HISTORIAS. El 100% de la entrega del
   conjunto de prospecting fue a Historias y Reels, mitad y mitad. Las piezas
   viejas dejaban el texto hasta el 80% del alto (regla de Historias: 14% libre
   abajo), pero Reels tapa el 35% inferior con el nombre de la cuenta, el texto
   del anuncio y el botón. Resultado: en la mitad del gasto el precio y las
   cuotas quedaban debajo de la interfaz. Acá el bloque de texto del 9:16 vive
   entre el 14% y el 65% del alto, que sirve para las dos ubicaciones. El
   script FALLA si un bloque no entra ahí, en vez de dejarlo pasar.

2. LOS DATOS VIENEN DE UN ARCHIVO, NO DEL CÓDIGO. Los precios cambian seguido
   (lista nueva el 28-sep: el jean pasó de $32.999 a $36.999 y los anuncios
   siguieron diciendo lo viejo). Cada pieza declara en el JSON qué productos
   promete y a qué precio/descuento; scripts/verificar-precios-anuncios.js
   usa ESE mismo archivo para avisar cuando la tienda ya no coincide.

3. SIN "DESDE" NI "TODOS LOS TALLES" SALVO QUE SEA VERDAD. Lo que dice un
   aviso obliga (Ley 24.240 art. 8). El JSON sólo lleva afirmaciones que se
   verificaron contra la API de Tiendanube el día que se generó la pieza.

Uso:
  python3 scripts/piezas-overlay-anuncios.py <spec.json> <carpeta_salida> [--guia]

  --guia  además genera <clave>_916_guia.jpg con las zonas que tapa Reels en
          rojo, para revisar a ojo antes de subir.

Formato del spec (lista):
  [{ "clave": "jean-clasico", "fuente_45": "...png", "fuente_916": "...png",
     "titular": "EL CLÁSICO RECTO", "bajada": "Del 40 al 54, en cinco colores",
     "chip": "24% OFF", "beneficio": "Hasta 6 cuotas sin interés",
     "productos": [298859922], "descuento": 24 }]

  "posicion": "arriba" (opcional) cuelga el bloque desde arriba — para escenas
  con el producto en el centro. Cualquier campo se puede pisar por formato
  ("posicion_45", "beneficio_916": null...). En el titular, "|" fuerza el corte.

  Salen TRES formatos: 4:5 (feeds), 9:16 (historias y reels) y 1:1 (todo lo
  demás). El 1:1 usa "fuente_11" o, si no hay, la escena del 4:5 recortada;
  "recorte_11" (0 arriba · 0.5 centro · 1 abajo) elige qué franja queda.

scripts/video-anuncio.py usa `maquetar()` y `capa_cortina()` de acá, así la
foto y el video de una misma campaña tienen exactamente la misma tipografía.
"""

import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

BLANCO = (255, 255, 255)
NARANJA = (193, 68, 12)  # config.brand.colors.darkOrange

F_TITULAR = "/System/Library/Fonts/Avenir Next Condensed.ttc"
F_TEXTO = "/System/Library/Fonts/HelveticaNeue.ttc"

# 4:5 para los feeds, 9:16 para historias y reels, 1:1 para todo lo demás
# (columna derecha, búsqueda, Marketplace, Messenger, Audience Network): esas
# ubicaciones RECORTAN el 4:5 a cuadrado y se comían el titular o las cuotas.
FORMATOS = {"45": (1080, 1350), "916": (1080, 1920), "11": (1080, 1080)}

# Zona segura de Reels (guía de Meta): 14% arriba, 35% abajo, 6% a los costados.
# Historias pide 14% arriba y abajo, así que cumpliendo Reels se cumplen las dos.
REELS_TOP = 0.14
REELS_BOTTOM = 0.35
PISO_916 = 0.64  # un punto de aire sobre el 65%
# ZONA SEGURA DEL 4:5: el cuadrado central (10%-90% del alto). Verificado con
# las vistas previas oficiales de Meta el 28-sep: Marketplace (y otras que Meta
# agrupa con los feeds) NO usa la versión 1:1 aunque se la asigne; recorta el
# 4:5 al centro y se comía la primera línea del titular. Con el texto dentro
# del cuadrado central, el recorte no pierde nada.
MARGEN_45 = 0.115
CAMPOS = ("titular", "bajada", "chip", "beneficio", "posicion")


def fuente(ruta, tam, indice=0):
    try:
        return ImageFont.truetype(ruta, tam, index=indice)
    except Exception:
        return ImageFont.load_default()


def encajar(img, ancho, alto, recorte=0.5):
    """Escala hasta cubrir y recorta. Nunca deforma ni mete barras.
    `recorte` elige qué franja queda cuando sobra alto (0 arriba, 0.5 centro,
    1 abajo): el 1:1 sale del 4:5 y no siempre conviene el centro."""
    w, h = img.size
    escala = max(ancho / w, alto / h)
    nuevo = img.resize((round(w * escala), round(h * escala)), Image.LANCZOS)
    x = (nuevo.width - ancho) // 2
    y = int((nuevo.height - alto) * float(recorte))
    return nuevo.crop((x, y, x + ancho, y + alto))


def partir(texto, fnt, draw, ancho_max):
    palabras, lineas, actual = texto.split(), [], ""
    for p in palabras:
        prueba = (actual + " " + p).strip()
        if draw.textlength(prueba, font=fnt) <= ancho_max:
            actual = prueba
        else:
            if actual:
                lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    return lineas


def para_formato(pieza, formato):
    """Aplica los campos pisados por formato ("beneficio_916": null, etc.)."""
    p = dict(pieza)
    for campo in CAMPOS:
        if f"{campo}_{formato}" in pieza:
            p[campo] = pieza[f"{campo}_{formato}"]
    return p


def maquetar(pieza, formato):
    """Calcula dónde va cada renglón SIN dibujar.

    Devuelve (renglones, techo, piso) donde cada renglón es
    {tipo, texto, fnt, x, y, alto_chip?}. Sale de acá tanto la foto como el
    video, así el texto no se mueve entre un formato y otro de la campaña."""
    ancho, alto = FORMATOS[formato]
    medir = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    margen = int(ancho * 0.075)
    ancho_max = ancho - margen * 2

    f_tit = fuente(F_TITULAR, int(ancho * 0.115), 8)
    f_baj = fuente(F_TEXTO, int(ancho * 0.042), 0)
    f_chip = fuente(F_TITULAR, int(ancho * 0.040), 8)
    f_ben = fuente(F_TEXTO, int(ancho * 0.033), 0)

    # "|" fuerza el corte de línea del titular ("SE ESTIRA|CON VOS"): el corte
    # automático deja palabras huérfanas y en un titular de 3 palabras se nota.
    orden = [("titular", l, f_tit) for parte in pieza["titular"].split("|")
             for l in partir(parte.strip(), f_tit, medir, ancho_max)]
    if pieza.get("bajada"):
        orden.append(("bajada", pieza["bajada"], f_baj))
    if pieza.get("chip"):
        orden.append(("chip", pieza["chip"], f_chip))
    if pieza.get("beneficio"):
        orden.append(("beneficio", pieza["beneficio"], f_ben))

    def alto_de(tipo, fnt):
        if tipo == "titular":
            return int(fnt.size * 1.02), 0
        if tipo == "bajada":
            return int(fnt.size * 1.25), int(ancho * 0.012)
        if tipo == "chip":
            return int(fnt.size * 1.05) + int(ancho * 0.016) * 2, int(ancho * 0.028)
        return int(fnt.size * 1.2), int(ancho * 0.016)

    # De arriba hacia abajo, con el aire ANTES de cada bloque que no es titular.
    y, renglones = 0, []
    for tipo, texto, fnt in orden:
        h, aire = alto_de(tipo, fnt)
        y += aire
        renglones.append({"tipo": tipo, "texto": texto, "fnt": fnt, "x": margen, "y": y, "h": h})
        y += h
    total = y

    margen_v = MARGEN_45 if formato == "45" else 0.065
    if pieza.get("posicion") == "arriba":
        techo = int(alto * (REELS_TOP + 0.015)) if formato == "916" else int(alto * margen_v)
    else:
        piso = int(alto * PISO_916) if formato == "916" else alto - int(alto * (margen_v + 0.01))
        techo = piso - total
    for r in renglones:
        r["y"] += techo
    piso = techo + total

    if formato == "916" and (techo < alto * REELS_TOP or piso > alto * (1 - REELS_BOTTOM)):
        raise SystemExit(f"✗ {pieza.get('clave')}: el texto ocupa {techo}-{piso}px y se sale de la zona "
                         f"segura de Reels ({int(alto * REELS_TOP)}-{int(alto * (1 - REELS_BOTTOM))}px). "
                         "Acortá el titular o la bajada.")
    if formato == "45" and (techo < alto * 0.10 or piso > alto * 0.90):
        raise SystemExit(f"✗ {pieza.get('clave')}: en 4:5 el texto ocupa {techo}-{piso}px y se sale del "
                         f"cuadrado central ({int(alto * 0.10)}-{int(alto * 0.90)}px) que usa Marketplace.")
    return renglones, techo, piso


def dibujar(draw, renglones, tipos=None):
    """Dibuja los renglones (o sólo los de `tipos`, para el video en tiempos)."""
    for r in renglones:
        if tipos and r["tipo"] not in tipos:
            continue
        fnt, x, y = r["fnt"], r["x"], r["y"]
        if r["tipo"] == "chip":
            tw = draw.textlength(r["texto"], font=fnt)
            pad_x = int(fnt.size * 0.7)
            pad_y = (r["h"] - int(fnt.size * 1.05)) // 2
            draw.rounded_rectangle([x, y, x + tw + pad_x * 2, y + r["h"]], radius=r["h"] // 2, fill=NARANJA)
            draw.text((x + pad_x, y + pad_y - int(fnt.size * 0.08)), r["texto"], font=fnt, fill=BLANCO)
        else:
            color = {"titular": BLANCO, "bajada": (240, 240, 240)}.get(r["tipo"], (228, 228, 228))
            draw.text((x, y), r["texto"], font=fnt, fill=color)


def capa_cortina(formato, techo, piso, arriba):
    """Degradé negro detrás del texto como máscara (L): 0 transparente, ~180 lleno.
    Abajo: sube desde un poco antes del texto y queda oscuro hasta el borde.
    Arriba: cuelga del borde superior y se desvanece debajo del texto."""
    ancho, alto = FORMATOS[formato]
    capa = Image.new("L", (ancho, alto), 0)
    d = ImageDraw.Draw(capa)
    if arriba:
        # Lleno hasta pasado el texto: sobre fondos claros (una pared blanca) la
        # última línea quedaba sin contraste con el degradé corto de la primera versión.
        fin = min(alto, piso + int(alto * 0.12))
        lleno = int(piso * 0.85)
        for y in range(0, fin):
            t = 1.0 if y <= lleno else max(0.0, 1 - (y - lleno) / max(1, fin - lleno))
            d.line([(0, y), (ancho, y)], fill=int(175 * (t ** 1.2)))
    else:
        desde = max(0, techo - int(ancho * 0.10))
        tramo = max(1, piso - desde)
        for y in range(desde, alto):
            t = min(1.0, (y - desde) / tramo)
            d.line([(0, y), (ancho, y)], fill=int(180 * (t ** 1.4)))
    return capa


def componer(pieza, formato, origen, destino, guia=False):
    ancho, alto = FORMATOS[formato]
    img = encajar(Image.open(origen).convert("RGB"), ancho, alto, pieza.get(f"recorte_{formato}", 0.5))
    renglones, techo, piso = maquetar(pieza, formato)
    mascara = capa_cortina(formato, techo, piso, pieza.get("posicion") == "arriba")
    img = Image.composite(Image.new("RGB", (ancho, alto), (0, 0, 0)), img, mascara)
    dibujar(ImageDraw.Draw(img), renglones)
    img.save(destino, "JPEG", quality=92, optimize=True)
    if guia and formato == "916":
        guardar_guia(img, destino.replace(".jpg", "_guia.jpg"))
    return techo, piso


def guardar_guia(img, destino):
    """Copia con las zonas que tapa Reels pintadas en rojo, para revisar a ojo."""
    ancho, alto = img.size
    g = img.convert("RGBA")
    capa = Image.new("RGBA", g.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    rojo = (230, 40, 40, 110)
    d.rectangle([0, 0, ancho, int(alto * REELS_TOP)], fill=rojo)
    d.rectangle([0, int(alto * (1 - REELS_BOTTOM)), ancho, alto], fill=rojo)
    d.rectangle([ancho - int(ancho * 0.06), 0, ancho, alto], fill=rojo)
    Image.alpha_composite(g, capa).convert("RGB").save(destino, "JPEG", quality=80)


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
        for formato in FORMATOS:
            # El 1:1 sale de la misma escena del 4:5 si no hay una propia.
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
