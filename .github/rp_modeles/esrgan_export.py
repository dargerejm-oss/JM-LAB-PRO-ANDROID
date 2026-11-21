# Conversion du modele officiel Real-ESRGAN « realesr-general-x4v3 » (BSD-3, xinntao) en ONNX
# architecture SRVGGNetCompact recopiee de basicsr/realesrgan (num_feat 64, num_conv 32, x4, PReLU)
import sys, torch, torch.nn as nn, torch.nn.functional as F
class SRVGGNetCompact(nn.Module):
    def __init__(s, nin=3, nout=3, nf=64, nc=32, up=4):
        super().__init__(); s.up = up; s.body = nn.ModuleList()
        s.body.append(nn.Conv2d(nin, nf, 3, 1, 1)); s.body.append(nn.PReLU(num_parameters=nf))
        for _ in range(nc): s.body.append(nn.Conv2d(nf, nf, 3, 1, 1)); s.body.append(nn.PReLU(num_parameters=nf))
        s.body.append(nn.Conv2d(nf, nout * up * up, 3, 1, 1)); s.ups = nn.PixelShuffle(up)
    def forward(s, x):
        o = x
        for m in s.body: o = m(o)
        return s.ups(o) + F.interpolate(x, scale_factor=s.up, mode='nearest')
src, dst = sys.argv[1], sys.argv[2]
m = SRVGGNetCompact(); sd = torch.load(src, map_location='cpu'); sd = sd.get('params', sd.get('params_ema', sd))
m.load_state_dict(sd, strict=True); m.eval()
x = torch.rand(1, 3, 64, 64)
torch.onnx.export(m, x, dst, input_names=['input'], output_names=['output'], opset_version=17,
                  dynamic_axes={'input': {2: 'h', 3: 'w'}, 'output': {2: 'H', 3: 'W'}}, dynamo=False)
print('ok', dst)
