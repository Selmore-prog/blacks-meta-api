#!/usr/bin/env python3
"""
TEXTO SOBRE LAS PIEZAS DE PRIMAVERA 26 — sep-2026

Hermano de piezas-overlay.py, para la tanda nueva. Dos diferencias con aquel:

1. NO HAY QUE RECORTAR. Las piezas nuevas ya vinieron en 4:5 (1122x1402) y en
   9:16 (941x1672), cada una generada en su proporción. La tanda vieja se había
   armado rellenando el 4:5 y por eso tenía barras blancas. Acá sólo se escala
   al tamaño exacto que pide Meta.

2. EL UMBRAL DE ENVÍO GRATIS BAJÓ A $45.000 (aplicado el 21-sep-2026). Eso
   cambia qué beneficio va en cada pieza: el cargo ($59.999) y el conjunto
   (jean $32.999 + chomba $24.999 = $57.998) lo superan solos, así que pueden
   decir "envío gratis" sin mentir. Con el umbral viejo de $55.000 el conjunto
   quedaba $2 abajo y la pieza no se podía publicar.

UN SOLO BENEFICIO POR PIEZA (mismo criterio que el script viejo)
Precio + cuotas + envío gratis juntos convierten la foto en un volante. Va el
que responde la objeción de ESA pieza:
  · caro (cargo, jean)   → el descuento en el chip, las cuotas abajo
  · ticket bajo (chomba) → NADA de envío gratis: a alguien mirando algo de
    $24.999 le estaría diciendo que le falta gastar casi el doble. Es justo
    la fricción que mata los carritos.
  · dupla (conjunto)     → envío gratis, que es la razón de ser de la pieza

Los descuentos están verificados contra la API (promotional_price vs
compare_at_price) el 21-sep-2026. Lo que dice un aviso obliga (Ley 24.240
art. 8): si cambia el precio en la tienda, hay que regenerar las piezas.

Uso:  python3 scripts/piezas-overlay-primavera.py <carpeta_piezas> <salida>
      donde <carpeta_piezas> contiene "nuevas 4.5" y "nuevas 9.16".
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

BLANCO = (255, 255, 255)
NARANJA = (193, 68, 12)  # config.brand.colors.darkOrange

F_TITULAR = "/System/Library/Fonts/Avenir Next Condensed.ttc"
F_TEXTO = "/System/Library/Fonts/HelveticaNeue.ttc"

FORMATOS = {"45": (1080, 1350), "916": (1080, 1920)}

# clave -> (titular, bajada, chip, beneficio)
PIEZAS = {
    "jean-vaquero": (
        "EL CLÁSICO RECTO",
        "Del 40 al 54, en cinco colores",
        "28% OFF",
        "6 cuotas sin interés",
    ),
    # Precio actualizado el 21-sep-2026: pasó de $21.999 a $24.999. La pieza
    # vieja quedó al aire un rato con el precio anterior — si el precio se
    # vuelve a tocar en Tiendanube, hay que regenerar Y reemplazar el anuncio,
    # no alcanza con cambiarlo acá.
    "chomba-micropique": (
        "ARRANCÓ LA PRIMAVERA",
        "Chomba micropique, del S al XXXL",
        "DESDE $24.999",
        None,
    ),
    "cargo-ripstop": (
        "RIPSTOP ANTIDESGARRO",
        "El cargo que aguanta la jornada",
        "30% OFF",
        "Envío gratis a todo el país",
    ),
    "conjunto": (
        "EL EQUIPO DE PRIMAVERA",
        "Jean clásico + chomba micropique",
        "ENVÍO GRATIS",
        "6 cuotas sin interés",
    ),
}

# Los nombres de archivo no son consistentes entre carpetas (hay espacios, y
# uno termina con espacio antes del .png), así que se mapean a mano en vez de
# adivinar con un patrón.
ORIGENES = {
    "45": {
        "jean-vaquero":      "nuevas 4.5/jean-vaquero.png",
        "chomba-micropique": "nuevas 4.5/chombamicropique.png",
        "cargo-ripstop":     "nuevas 4.5/pantalonripstop.png",
        "conjunto":          "nuevas 4.5/chomba y vaquero.png",
    },
    "916": {
        "jean-vaquero":      "nuevas 9.16/jean vaquero.png",
        "chomba-micropique": "nuevas 9.16/chomba micropique.png",
        "cargo-ripstop":     "nuevas 9.16/cargo ripstop.png",
        "conjunto":          "nuevas 9.16/chomba y jean .png",
    },
}


def fuente(ruta, tam, indice=0):
    try:
        return ImageFont.truetype(ruta, tam, index=indice)
    except Exception:
        return ImageFont.load_default()


def encajar(img, ancho, alto):
    """Escala al tamaño exacto. Si la proporción no da, recorta al centro.

    Nunca deforma ni rellena con barras: las piezas nuevas ya vienen en la
    proporción correcta, así que en la práctica esto es sólo un resize.
    """
    destino = ancho / alto
    w, h = img.size
    actual = w / h
    if abs(actual - destino) > 0.005:
        if actual > destino:
            nuevo_w = int(h * destino)
            x = (w - nuevo_w) // 2
            img = img.crop((x, 0, x + nuevo_w, h))
        else:
            nuevo_h = int(w / destino)
            y = (h - nuevo_h) // 2
            img = img.crop((0, y, w, y + nuevo_h))
    return img.resize((ancho, alto), Image.LANCZOS)


def cortina(img, techo_texto, opacidad=224):
    """Degradado que termina de oscurecerse JUSTO donde empieza el texto.

    ⚠️ La versión del script viejo anclaba el degradado al piso de la imagen y
    le daba una altura fija. En 4:5 funcionaba de casualidad, porque el texto
    se apoya abajo. En 9:16 NO: ahí el bloque de texto sube un 20% para
    esquivar el botón de Meta, así que caía en la parte del degradado que
    todavía es casi transparente. Verificado sobre la pieza del conjunto, que
    tiene madera clara detrás: "6 cuotas sin interés" en gris sobre madera
    iluminada quedaba ilegible.

    Ahora el degradado se calcula DESPUÉS de medir el bloque: transparente
    arriba, opaco a la altura donde arranca el titular, y opaco de ahí para
    abajo. Así se lee igual en las dos proporciones y sobre cualquier foto.
    """
    w, h = img.size
    fundido = min(techo_texto, int(h * 0.32))
    arranque = techo_texto - fundido
    capa = Image.new("RGBA", (w, h - arranque), (0, 0, 0, 0))
    px = capa.load()
    for y in range(capa.size[1]):
        if y < fundido:
            t = y / max(1, fundido - 1)
            a = int(opacidad * (t ** 1.7))  # arranca muy suave, cierra fuerte
        else:
            a = opacidad
        for x in range(w):
            px[x, y] = (0, 0, 0, a)
    img = img.convert("RGBA")
    img.alpha_composite(capa, (0, arranque))
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
    img = encajar(Image.open(origen).convert("RGB"), ancho, alto)
    draw = ImageDraw.Draw(img)

    titular, bajada, chip, beneficio = PIEZAS[clave]
    margen = int(ancho * 0.075)
    ancho_max = ancho - margen * 2
    # ZONA SEGURA EN 9:16: Meta tapa ~250 px arriba (nombre de la cuenta) y
    # ~350 px abajo (botón). Por eso en vertical el bloque de texto sube.
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

    def maquetar(dib):
        """Recorre los bloques de abajo hacia arriba y devuelve el techo del
        texto. Con dib=None sólo mide, sin dibujar: eso es lo que permite
        calcular la cortina antes de escribir encima."""
        y = piso
        for tipo, texto, fnt in bloques:
            if tipo == "beneficio":
                y -= int(fnt.size * 1.2)
                if dib:
                    dib.text((margen, y), texto, font=fnt, fill=(206, 206, 206))
                y -= int(ancho * 0.016)
            elif tipo == "chip":
                tw = draw.textlength(texto, font=fnt)
                pad_x, pad_y = int(ancho * 0.028), int(ancho * 0.016)
                h_chip = int(fnt.size * 1.05) + pad_y * 2
                y -= h_chip
                if dib:
                    dib.rounded_rectangle(
                        [margen, y, margen + tw + pad_x * 2, y + h_chip],
                        radius=int(h_chip / 2), fill=NARANJA,
                    )
                    dib.text((margen + pad_x, y + pad_y - int(fnt.size * 0.08)), texto, font=fnt, fill=BLANCO)
                y -= int(ancho * 0.028)
            elif tipo == "bajada":
                y -= int(fnt.size * 1.25)
                if dib:
                    dib.text((margen, y), texto, font=fnt, fill=(235, 235, 235))
                y -= int(ancho * 0.012)
            else:
                y -= int(fnt.size * 1.02)
                if dib:
                    dib.text((margen, y), texto, font=fnt, fill=BLANCO)
        return y

    techo = maquetar(None)
    img = cortina(img, max(0, techo - int(ancho * 0.03)))
    maquetar(ImageDraw.Draw(img))

    img.convert("RGB").save(destino, "JPEG", quality=92, optimize=True)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    for f in FORMATOS:
        os.makedirs(os.path.join(out, f), exist_ok=True)

    hechos = 0
    for formato in FORMATOS:
        for clave, rel in ORIGENES[formato].items():
            origen = os.path.join(src, rel)
            if not os.path.exists(origen):
                print(f"  ✗ falta {origen}")
                continue
            destino = os.path.join(out, formato, f"{clave}_{formato}.jpg")
            componer(origen, destino, clave, formato)
            kb = os.path.getsize(destino) // 1024
            print(f"  ✓ {destino}  ({kb} KB)")
            hechos += 1
    print(f"\n{hechos} piezas compuestas.")


if __name__ == "__main__":
    main()
