#!/usr/bin/env python3
"""Build the single-file game: inlines three.js r128, GLTFLoader, meshopt decoder,
CC0 textures/models (base64) and the game sources into Metro_Horror_HD.html."""
import base64, json, os, sys
D=os.path.dirname(os.path.abspath(__file__))
rd=lambda p:open(os.path.join(D,p),encoding='utf-8').read()
b64=lambda p:base64.b64encode(open(os.path.join(D,p),'rb').read()).decode()
vendor='\n'.join(rd('vendor/'+f) for f in ['three.min.js','GLTFLoader.js','SkeletonUtils.js','meshopt_decoder.js','supabase.js'])
# supabase-js (webpack UMD) probes a script URL for lazy chunks; the single-file build has none, so use a stub base URL
vendor=vendor.replace('throw new Error("Automatic publicPath is not supported in this browser")','e="https://localhost/"')
tex={}
for f in sorted(os.listdir(os.path.join(D,'assets/tex'))):
    n,k=f[:-5].rsplit('_',1); tex.setdefault(n,{})[{'diff':'d','nor':'n','arm':'a'}[k]]='data:image/webp;base64,'+b64('assets/tex/'+f)
glb={f[:-4]:b64('assets/glb/'+f) for f in sorted(os.listdir(os.path.join(D,'assets/glb')))}
assets='window.ASSETS='+json.dumps({'tex':tex,'glb':glb},separators=(',',':'))+';'
game='\n'.join(rd('src/'+f) for f in ['core.js','world.js','actors.js','story.js','net.js','game.js'])
html=rd('src/shell.html').replace('/*VENDOR*/',vendor.replace('</script','<\\/script')).replace('/*ASSETS*/',assets).replace('/*GAME*/',game)
out=os.path.join(D,'Metro_Horror_HD.html');open(out,'w',encoding='utf-8').write(html)
print(out, round(len(html)/1e6,2),'MB')
