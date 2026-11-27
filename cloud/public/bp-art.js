const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function rewardArtPath(level){const n=Number(level);return Number.isInteger(n)&&n>=1&&n<=30?"./icons/bp-reward-"+n+".svg":null;}
export function rewardArtwork(r,className="tp-bp-art"){const src=rewardArtPath(r?.level);return src?'<img class="'+esc(className)+'" src="'+src+'" alt="'+esc(r?.name||"Battle Pass")+'" width="256" height="256" decoding="async">':'<span class="tp-bp-glyph" aria-hidden="true">'+esc(r?.glyph)+'</span>';}
