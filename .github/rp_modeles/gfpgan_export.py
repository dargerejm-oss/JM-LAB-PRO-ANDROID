# GFPGAN v1.4 (Apache-2.0, TencentARC) : restauration de visages -> ONNX, visage aligne 512 x 512, valeurs -1..1
import sys, types, torch
# petits remplacements des modules basicsr utilises par l'architecture « clean » (pas besoin d'installer basicsr)
b = types.ModuleType('basicsr'); ba = types.ModuleType('basicsr.archs'); bu = types.ModuleType('basicsr.archs.arch_util'); bur = types.ModuleType('basicsr.utils'); breg = types.ModuleType('basicsr.utils.registry')
def default_init_weights(*a, **k): pass
class _Reg:
    def register(self, *a, **k):
        return (lambda f: f) if not a or not callable(a[0]) else a[0]
bu.default_init_weights = default_init_weights; breg.ARCH_REGISTRY = _Reg()
for n, m in {'basicsr': b, 'basicsr.archs': ba, 'basicsr.archs.arch_util': bu, 'basicsr.utils': bur, 'basicsr.utils.registry': breg}.items(): sys.modules[n] = m
sys.path.insert(0, 'gfpgan_src')
from gfpganv1_clean_arch import GFPGANv1Clean
src, dst = sys.argv[1], sys.argv[2]
m = GFPGANv1Clean(out_size=512, num_style_feat=512, channel_multiplier=2, decoder_load_path=None, fix_decoder=False, num_mlp=8,
                  input_is_latent=True, different_w=True, narrow=1, sft_half=True)
sd = torch.load(src, map_location='cpu'); sd = sd.get('params_ema', sd.get('params', sd))
m.load_state_dict(sd, strict=True); m.eval()
class W(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x): return s.m(x, return_rgb=False, randomize_noise=False)[0]
x = torch.rand(1, 3, 512, 512) * 2 - 1
with torch.no_grad(): torch.onnx.export(W(m), x, dst, input_names=['input'], output_names=['output'], opset_version=17, dynamo=False)
print('ok', dst)
