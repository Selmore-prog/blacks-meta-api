# La caja del producto en cada render (lo que no es fondo blanco), en proporción
# de la foto: así cada producto ocupa lo mismo en su tarjeta.  python3 medir.py
import json
from PIL import Image, ImageChops
d = json.load(open('renders/renders.json'))
for x in d:
    im = Image.open(x['foto']).convert('RGB')
    dif = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > 18 else 0)
    x0, y0, x1, y1 = dif.getbbox()
    W, H = im.size
    x['caja'] = [round(x0 / W, 4), round(y0 / H, 4), round(x1 / W, 4), round(y1 / H, 4)]
    print(x['clave'], x['caja'])
json.dump(d, open('renders/renders.json', 'w'), indent=2, ensure_ascii=False)
