#!/usr/bin/env python3
"""
TEXTO SOBRE LAS PIEZAS DE LA CAMPAÑA MOTOR — sep-2026

QUÉ ARREGLA
1. Los 9:16 que se generaron tenían BARRAS BLANCAS arriba y abajo: se armaron
   rellenando el 4:5 en vez de recortarlo. Acá se recorta a sangre desde el
   original, así la foto ocupa toda la pantalla en historias y reels.
2. Le pone el texto encima. Hasta ahora el copy vivía sólo en los campos
   nativos de Meta, que en historias quedan chiquitos abajo y casi no se leen.

CÓMO SE DIBUJA
Una cortina degradada abajo (transparente → negro) y el texto apoyado ahí.
Es lo que permite que el texto se lea SIEMPRE, sin importar si la foto abajo
es clara u oscura, y sin tapar al producto. Nada de cajas sólidas.

Tipografía: Avenir Next Condensed Heavy para el titular (condensada = entran
más caracteres a mayor tamaño) y Helvetica Neue para la bajada.

ZONA SEGURA EN 9:16: Meta tapa ~250 px arriba (nombre de la cuenta) y ~350 px
abajo (botón). Por eso en vertical el bloque de texto sube y no se apoya en el
piso de la imagen.

Uso:  python3 scripts/piezas-overlay.py <carpeta_origen> <carpeta_salida>
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

NEGRO = (10, 10, 10)
BLANCO = (255, 255, 255)
NARANJA = (193, 68, 12)  # config.brand.colors.darkOrange

F_TITULAR = "/System/Library/Fonts/Avenir Next Condensed.ttc"
F_TEXTO = "/System/Library/Fonts/HelveticaNeue.ttc"

# Titular, bajada, chip de oferta y línea de beneficio, por pieza.
# El titular va corto a propósito: en un feed se lee de reojo, y una frase
# larga en mayúscula no se lee nunca.
#
# EL BENEFICIO NO VA EN TODAS, Y ES DELIBERADO
# Precio + cuotas + envío gratis juntos convierten la foto en un volante.
# Va UNO por pieza, el que responde la objeción de ESA pieza:
#   · caro (cargo, jean)          → cuotas, que es lo que desarma el precio
#   · confianza (tela, jornada)   → nada: meter comercio les saca la fuerza
#   · ticket bajo (chomba)        → nada. Ojo: "envío gratis desde $55.000"
#     acá sería CONTRAPRODUCENTE — a alguien mirando algo de $21.999 le
#     estaría diciendo que le falta gastar 2,5 veces más. Es justo la
#     fricción que mata el 73% de los carritos.
#   · kit completo (conjunto)     → envío gratis, porque el kit lo supera solo
#
# "6 cuotas sin interés" va sin el monto por cuota: verificado en la ficha
# real, pero el monto cambia con el precio y la imagen no se actualiza sola.
PIEZAS = {
    # "NO SE ROMPE" se sacó a propósito: es una promesa absoluta que el
    # producto no puede cumplir, y en Argentina lo que dice un aviso obliga
    # (Ley 24.240, art. 8). "Antidesgarro" no es un invento nuestro: es el
    # nombre que le pone el fabricante al producto, así que es defendible.
    "cargo-ripstop":     ("RIPSTOP ANTIDESGARRO", "El cargo que aguanta la jornada", "30% OFF",          "6 cuotas sin interés"),
    "jean-vaquero":      ("EL CLÁSICO",         "Jean recto de trabajo",          "$32.999",              "6 cuotas sin interés"),
    "chomba-micropique": ("ARRANCÓ LA PRIMAVERA", "Chomba micropique Pampero",    "DESDE $21.999",        None),
    "detalle-tela":      ("MIRÁ LA COSTURA",    "Doble refuerzo en cada punto de desgaste", None,        None),
    "jornada":           ("DESDE TEMPRANO",     "Ropa que aguanta la jornada",    None,                   None),
    "conjunto":          ("EQUIPO COMPLETO",    "Pantalón, chomba y borcegos",    "ENVÍO GRATIS +$55.000", "6 cuotas sin interés"),
}

FORMATOS = {"45": (1080, 1350), "916": (1080, 1920)}


def fuente(ruta, tam, indice=0):
    try:
        return ImageFont.truetype(ruta, tam, index=indice)
    except Exception:
        return ImageFont.load_default()


def recortar(img, ancho, alto):
    """Recorta al centro conservando el encuadre y llena todo el lienzo.

    Nunca deforma ni rellena: si la proporción no coincide, sobra imagen y se
    corta. Es justo lo contrario de lo que se había hecho (rellenar con blanco).
    """
    destino = ancho / alto
    w, h = img.size
    actual = w / h
    if actual > destino:           # sobra ancho → recorto a los costados
        nuevo_w = int(h * destino)
        x = (w - nuevo_w) // 2
        img = img.crop((x, 0, x + nuevo_w, h))
    elif actual < destino:         # sobra alto → recorto arriba y abajo
        nuevo_h = int(w / destino)
        y = (h - nuevo_h) // 2
        img = img.crop((0, y, w, y + nuevo_h))
    return img.resize((ancho, alto), Image.LANCZOS)


def cortina(img, altura_rel=0.46, opacidad=232):
    """Degradado de transparente a negro en la parte de abajo."""
    w, h = img.size
    alto = int(h * altura_rel)
    capa = Image.new("RGBA", (w, alto), (0, 0, 0, 0))
    px = capa.load()
    for y in range(alto):
        t = y / max(1, alto - 1)
        a = int(opacidad * (t ** 1.7))  # arranca muy suave, cierra fuerte
        for x in range(w):
            px[x, y] = (0, 0, 0, a)
    img = img.convert("RGBA")
    img.alpha_composite(capa, (0, h - alto))
    return img


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


def componer(origen, destino, clave, formato):
    ancho, alto = FORMATOS[formato]
    img = recortar(Image.open(origen).convert("RGB"), ancho, alto)
    img = cortina(img)
    draw = ImageDraw.Draw(img)

    titular, bajada, chip, beneficio = PIEZAS[clave]
    margen = int(ancho * 0.075)
    ancho_max = ancho - margen * 2
    # En vertical el texto sube: abajo Meta pone el botón y se comería la bajada.
    piso = alto - (int(alto * 0.20) if formato == "916" else int(alto * 0.075))

    # Índice 8 = Heavy RECTA. El 1 es Bold Italic: la inclinación da aire
    # deportivo y acá se vende ropa de trabajo, que pide una letra plantada.
    f_tit = fuente(F_TITULAR, int(ancho * 0.115), 8)
    f_baj = fuente(F_TEXTO, int(ancho * 0.042), 0)
    f_chip = fuente(F_TITULAR, int(ancho * 0.040), 8)
    f_ben = fuente(F_TEXTO, int(ancho * 0.033), 0)

    bloques = []
    if beneficio:
        bloques.append(("beneficio", beneficio, f_ben))
    if chip:
        bloques.append(("chip", chip, f_chip))
    bloques.append(("bajada", bajada, f_baj))
    for linea in reversed(partir(titular, f_tit, draw, ancho_max)):
        bloques.append(("titular", linea, f_tit))

    y = piso
    for tipo, texto, fnt in bloques:
        if tipo == "beneficio":
            # Línea fina, sin caja: es un apoyo, no compite con el chip.
            y -= int(fnt.size * 1.2)
            draw.text((margen, y), texto, font=fnt, fill=(206, 206, 206))
            y -= int(ancho * 0.016)
        elif tipo == "chip":
            tw = draw.textlength(texto, font=fnt)
            pad_x, pad_y = int(ancho * 0.028), int(ancho * 0.016)
            h_chip = int(fnt.size * 1.05) + pad_y * 2
            y -= h_chip
            draw.rounded_rectangle(
                [margen, y, margen + tw + pad_x * 2, y + h_chip],
                radius=int(h_chip / 2), fill=NARANJA,
            )
            draw.text((margen + pad_x, y + pad_y - int(fnt.size * 0.08)), texto, font=fnt, fill=BLANCO)
            y -= int(ancho * 0.028)
        elif tipo == "bajada":
            y -= int(fnt.size * 1.25)
            draw.text((margen, y), texto, font=fnt, fill=(235, 235, 235))
            y -= int(ancho * 0.012)
        else:
            y -= int(fnt.size * 1.02)
            draw.text((margen, y), texto, font=fnt, fill=BLANCO)

    img.convert("RGB").save(destino, "JPEG", quality=92, optimize=True)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    for f in FORMATOS:
        os.makedirs(os.path.join(out, f), exist_ok=True)

    for clave in PIEZAS:
        # Siempre se parte del ORIGINAL de mayor calidad, nunca del 9:16 con
        # barras blancas: recortar eso volvería a arrastrar el marco.
        origen = None
        for cand in (
            os.path.join(src, clave + ".png"),
            os.path.join(src, clave + ".jpg"),
        ):
            if os.path.exists(cand):
                origen = cand
                break
        if not origen:
            print(f"  ✗ falta el original de {clave}")
            continue
        for formato in FORMATOS:
            destino = os.path.join(out, formato, clave + ".jpg")
            componer(origen, destino, clave, formato)
        print(f"  ✓ {clave}")


if __name__ == "__main__":
    main()
