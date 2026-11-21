# SCUNet (Apache-2.0, cszn) : debruitage de photos reelles -> ONNX, morceaux fixes de 256 px
import sys, torch
sys.path.insert(0, 'scunet_src')
from network_scunet import SCUNet
src, dst = sys.argv[1], sys.argv[2]
m = SCUNet(in_nc=3, config=[4, 4, 4, 4, 4, 4, 4], dim=64)
m.load_state_dict(torch.load(src, map_location='cpu'), strict=True); m.eval()
x = torch.rand(1, 3, 256, 256)
with torch.no_grad(): torch.onnx.export(m, x, dst, input_names=['input'], output_names=['output'], opset_version=17, dynamo=False)
print('ok', dst)
