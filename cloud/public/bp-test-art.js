// TEST only. Never call these RPCs against the production project.
const levels=["0","3","11","21","30"];
const names={master:"Vice City Master",ocean:"Ocean Drive",tropical:"Tropical Hotline",midnight:"Midnight Boulevard"};
export function isTestBuild(cfg){return cfg?.staging===true&&cfg?.supabaseUrl==="https://cpycfxolqpidfjbhhsmr.supabase.co";}
export function validateCards(cards){
 if(!cards||typeof cards!=="object"||Array.isArray(cards)||Object.keys(cards).length!==5||JSON.stringify(cards).length>1200000)throw Error("Ungültiges Grafikpaket.");
 const safe={};for(const key of levels){
  const v=cards[key];if(typeof v!=="string"||v.length>230000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(v))throw Error("Ungültige WebP-Visitenkarte.");
  let bytes;try{bytes=atob(v.slice(v.indexOf(",")+1));}catch{throw Error("Ungültige Bilddaten.");}
  if(bytes.length<24||bytes.slice(0,4)!=="RIFF"||bytes.slice(8,12)!=="WEBP")throw Error("Ungültige WebP-Datei.");
  safe[key]=v;
 }return safe;
}
export function parseArtPack(text){if(typeof text!=="string"||text.length>1200000)throw Error("Grafikpaket zu groß.");const p=JSON.parse(text);if(p?.version!==1||p?.season!=="Vice City")throw Error("Falsches Grafikpaket.");return validateCards(p.cards);}
export function normalizeTestArt(data){const cards=data?.cards;return {cards:cards&&Object.keys(cards).length?validateCards(cards):{},can_install:data?.can_install===true,test_unlocked:data?.test_unlocked===true};}
export function applyPremiumArt(doc,data){const cards=data?.cards||{},root=doc.documentElement;for(const level of levels){const key="--bp-card-art-"+level;const value=cards[level];if(value&&/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))root.style.setProperty(key,'url("'+value+'")');else root.style.removeProperty(key);}}
export function testToolsMarkup(data){
 if(!data?.can_install)return "";
 const ready=Object.keys(data.cards||{}).length===5;
 return '<section class="tp-bp-section tp-bp-test-tools"><h3>TEST · Premium-Visitenkarten</h3><p>'+(ready?'✓ Originalgrafiken installiert. Sie gelten für alle TEST-Geräte.':'Einmalig das Vice-City-Grafikpaket auswählen. Danach werden die Originalmotive auf allen TEST-Geräten verwendet.')+'</p><label class="tp-bp-art-picker"><span>Grafikpaket '+(ready?'ersetzen':'installieren')+'</span><input type="file" data-test-bp-art accept=".json,application/json" aria-label="Vice City Grafikpaket auswählen"></label>'+(data.test_unlocked?'<h3>TEST-Ausrüstungssets</h3><p>Alle 30 Stufen freigeschaltet. Ein Set ersetzt nur Visitenkarte, Titel, Emblem und Rahmen.</p><div class="tp-bp-presets">'+Object.entries(names).map(([k,n])=>'<button type="button" data-test-bp-preset="'+k+'">'+n+'</button>').join("")+'</div>':'')+'</section>';
}
export async function getTestArt(db){const {data,error}=await db.rpc("tp_test_bp_art_get");if(error)throw error;return normalizeTestArt(data);}
export async function installTestArt(db,cards){const {data,error}=await db.rpc("tp_test_bp_art_install",{p_cards:validateCards(cards)});if(error)throw error;return normalizeTestArt(data);}
export async function testPreset(db,preset){if(!Object.hasOwn(names,preset))throw Error("Unbekanntes Set.");const {data,error}=await db.rpc("tp_test_bp_preset",{p_preset:preset});if(error)throw error;if(!Array.isArray(data))throw Error("Inventar nicht verfügbar.");return data;}
