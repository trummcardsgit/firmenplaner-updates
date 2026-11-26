from PIL import Image
from pathlib import Path
import hashlib
root=Path('cloud/public/icons')
original=Path('branding-source/branding/original.png')
preview=Path('branding-source/branding/preview.webp')
assert original.exists() and all((Path('branding-source/branding')/(v+'.png')).exists() for v in ('tickets','admin')), 'Production requires all three original images'
if original.exists():
    im=Image.open(original).convert('RGBA')
    assert min(im.size)>=512,'Original artwork must be at least 512 pixels'
    assert im.getchannel('A').getextrema()[0]==0,'Original artwork needs a transparent background'
    print(f'RHTFLOW: original transparent artwork {im.width}x{im.height}')
else:
    assert hashlib.sha256(preview.read_bytes()).hexdigest()=='761781915996e229ba816af5b392ef3e6b13f7fb5590bab043d4229e451d6cfc', 'Preview artwork corrupted'
    im=Image.open(preview).convert('RGBA')
    print('RHTFLOW: existing preview remains until branding/original.png is uploaded')
def fit(size):
    out=Image.new('RGBA',(size,size))
    img=im.copy()
    img.thumbnail((size,size),Image.Resampling.LANCZOS)
    out.alpha_composite(img,((size-img.width)//2,(size-img.height)//2))
    return out
# No white background or forced downsampling of the full logo.
im.save(root/'logo-full.webp',quality=96,method=6,exact=True)
for name,size in [('icon-192.png',192),('icon-512.png',512)]:
    fit(size).save(root/name)
apple=Image.new('RGBA',(180,180),'#171529')
apple.alpha_composite(fit(180))
apple.convert('RGB').save(root/'apple-touch-icon.png')
mask=Image.new('RGBA',(512,512),'#171529')
mask.alpha_composite(fit(288),(112,112))
mask.convert('RGB').save(root/'icon-maskable-512.png')
# Override old white frame only in TEST builds.
css=root.parent/'vice-city-theme.css'
css.write_text(css.read_text(encoding='utf8')+'\n.vice-city-theme .brand,.vice-city-theme .auth-logo{background:transparent;border:0;padding:0;border-radius:0;box-shadow:none;object-fit:contain}\n.vice-city-theme .brand{width:100%;max-width:210px;height:auto;max-height:210px}\n',encoding='utf8')
# Optional original menu artwork. Keep exact original dimensions and transparency.
import re
import json
html=root.parent/'index.html'
app=root.parent/'app.js'
menu_assets={}
for view in ('tickets','admin'):
    artwork=Path('branding-source/branding')/(view+'.png')
    if not artwork.exists():
        print(f'RHTFLOW: upload branding/{view}.png for the original menu artwork')
        continue
    icon=Image.open(artwork).convert('RGBA')
    assert min(icon.size)>=512, f'{view} artwork must be high resolution'
    out=root/('menu-'+view+'.webp')
    icon.save(out,quality=97,method=6,exact=True)
    assert Image.open(out).size==icon.size
    menu_assets[view]='./icons/'+out.name
    markup=html.read_text(encoding='utf8')
    pattern=r'(<button\b[^>]*\bdata-view="'+view+r'"[^>]*>)<span class="tp-ticket-nav" aria-hidden="true">[^<]*</span>'
    markup,n=re.subn(pattern,lambda m:m[1]+'<img class="tp-enterprise-menu-icon" src="'+menu_assets[view]+'" alt="" aria-hidden="true" width="38" height="38">',markup)
    assert n==2, f'Expected desktop and mobile icons for {view}, got {n}'
    html.write_text(markup,encoding='utf8')
    print(f'RHTFLOW: {view} artwork {icon.width}x{icon.height}, desktop/mobile/header')
if menu_assets:
    js=app.read_text(encoding='utf8')
    old='const src="./icons/hd-"+state.view+".svg";'
    assert js.count(old)==1,'Header artwork mapping changed'
    js=js.replace(old,'const src=('+json.dumps(menu_assets)+')[state.view]||"./icons/hd-"+state.view+".svg";')
    app.write_text(js,encoding='utf8')
    style=root.parent/'game-progression.css'
    style.write_text(style.read_text(encoding='utf8')+'\n.vice-city-theme .sidebar .tp-enterprise-menu-icon,.vice-city-theme .bottom-nav .tp-enterprise-menu-icon{display:block;width:38px;height:38px;flex:0 0 auto;object-fit:contain;background:transparent;border:0;padding:0;border-radius:8px;box-shadow:none}\n@media(max-width:680px){.vice-city-theme .bottom-nav .tp-enterprise-menu-icon{width:34px;height:34px}}\n',encoding='utf8')
    worker=root.parent/'sw.js'
    js=worker.read_text(encoding='utf8')
    assert js.count('const ASSETS=[')==1
    js=js.replace('const ASSETS=[','const ASSETS=['+','.join(json.dumps(v) for v in menu_assets.values())+',',1)
    worker.write_text(js,encoding='utf8')
# Every actual artwork change invalidates only this PWA's own cached assets.
sw=root.parent/'sw.js'
source=sw.read_text(encoding='utf8')
digest=hashlib.sha256((root/'logo-full.webp').read_bytes()+b''.join((root/Path(v).name).read_bytes() for v in menu_assets.values())).hexdigest()[:12]
import re
source,n=re.subn(r'(const CACHE=CACHE_PREFIX\+"[^"]+)(")',lambda m:m[1]+'-branding.'+digest+m[2],source,count=1)
assert n==1,'Missing scoped cache version'
sw.write_text(source,encoding='utf8')

# Desktop install identity stays unchanged; new icon URLs force a fresh fetch.
# Windows uses small taskbar bitmaps as well as large Start menu artwork.
manifest_path=root.parent/'manifest.webmanifest'
manifest=json.loads(manifest_path.read_text(encoding='utf8'))
assert manifest['id']=='./' and manifest['start_url']=='./' and manifest['scope']=='./'
version='taskbar-v2-'+hashlib.sha256(original.read_bytes()).hexdigest()[:10]
desktop_icons=[]
for size in (16,24,32,48,64,128,192,256,512):
    name=f'rhtflow-{version}-{size}.png'
    icon=fit(size)
    icon.save(root/name)
    assert icon.size==(size,size) and icon.getchannel('A').getextrema()[0]==0
    desktop_icons.append({'src':'./icons/'+name,'sizes':f'{size}x{size}','type':'image/png','purpose':'any'})
mask_name=f'rhtflow-{version}-maskable-512.png'
mask.convert('RGB').save(root/mask_name)
manifest['icons']=desktop_icons+[{'src':'./icons/'+mask_name,'sizes':'512x512','type':'image/png','purpose':'maskable'}]
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
ico_name=f'rhtflow-{version}.ico'
fit(256).save(root/ico_name,format='ICO',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
with Image.open(root/ico_name) as ico:
    assert {(16,16),(32,32),(48,48),(256,256)}.issubset(ico.ico.sizes())
markup=html.read_text(encoding='utf8')
favicon='<link rel="icon" type="image/x-icon" href="./icons/'+ico_name+'"><link rel="icon" type="image/png" sizes="32x32" href="'+desktop_icons[2]['src']+'">'
markup,n=re.subn(r'<link rel="icon" href="\./icons/icon-192\.png">',lambda _:favicon,markup,count=1)
assert n==1,'Favicon declaration changed'
html.write_text(markup,encoding='utf8')
source=sw.read_text(encoding='utf8')
assets=[i['src'] for i in manifest['icons']]+['./icons/'+ico_name]
source=source.replace('const ASSETS=[','const ASSETS=['+','.join(json.dumps(a) for a in assets)+',',1)
sw.write_text(source,encoding='utf8')
print('RHTFLOW: Windows icon set generated from original logo:',version)
