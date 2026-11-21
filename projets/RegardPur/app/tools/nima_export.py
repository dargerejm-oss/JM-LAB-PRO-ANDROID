# Prepare l'"oeil artistique" (modele NIMA MobileNet, idealo/image-quality-assessment, licence Apache 2.0)
# pour Regard Pur : telecharge les poids, replie la normalisation dans les convolutions,
# et ecrit renderer/vendor/nima/nima.bin + nima.json (lus par l'appli avec tfjs).
import json, os, sys, urllib.request
import numpy as np, h5py

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'renderer', 'vendor', 'nima')
os.makedirs(OUT, exist_ok=True)
URL = 'https://raw.githubusercontent.com/idealo/image-quality-assessment/master/models/MobileNet/weights_mobilenet_aesthetic_0.07.hdf5'
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'aesthetic.hdf5')
if not os.path.exists(SRC):
    urllib.request.urlretrieve(URL, SRC)
f = h5py.File(SRC, 'r')
def g(layer, name): return np.array(f[layer][layer][name + ':0'], dtype=np.float32)
EPS = 1e-3
def fold(kern, bn, depthwise=False):
    gam, bet, mu, var = g(bn, 'gamma'), g(bn, 'beta'), g(bn, 'moving_mean'), g(bn, 'moving_variance')
    k = gam / np.sqrt(var + EPS)
    W = kern * (k.reshape(1, 1, -1, 1) if depthwise else k.reshape(1, 1, 1, -1))
    return W.astype(np.float32), (bet - mu * k).astype(np.float32)
layers = []
W, b = fold(g('conv1', 'kernel'), 'conv1_bn'); layers.append(('conv1', W, b))
for i in range(1, 14):
    W, b = fold(g('conv_dw_%d' % i, 'depthwise_kernel'), 'conv_dw_%d_bn' % i, True); layers.append(('dw%d' % i, W, b))
    W, b = fold(g('conv_pw_%d' % i, 'kernel'), 'conv_pw_%d_bn' % i); layers.append(('pw%d' % i, W, b))
layers.append(('dense', g('dense_1', 'kernel'), g('dense_1', 'bias')))
man, off = [], 0
with open(os.path.join(OUT, 'nima.bin'), 'wb') as o:
    for n, W, b in layers:
        for kind, a in (('w', W), ('b', b)):
            o.write(a.tobytes()); man.append({'n': n + '.' + kind, 's': list(a.shape), 'o': off}); off += a.size
json.dump(man, open(os.path.join(OUT, 'nima.json'), 'w'))
f.close()
if len(sys.argv) <= 1: os.remove(SRC)
print('oeil artistique pret :', off * 4, 'octets')
