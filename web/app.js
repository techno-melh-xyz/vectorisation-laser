import init, { vectorize_rgba } from './pkg/vectorisation_laser.js';
const $ = id => document.getElementById(id);
const canvas = $('original');
const ctx = canvas.getContext('2d', {willReadFrequently:true});
let ready = false, loaded = false, svgText = '';
const status = message => $('status').textContent = message;
const updateButtons = () => { $('trace').disabled = !(ready && loaded); $('download').disabled = !svgText; };
for (const [id, format] of [['threshold',v=>v],['contrast',v=>v+' %'],['simplify',v=>Number(v).toFixed(2)]]) {
  $(id).addEventListener('input', () => { $(id+'Val').textContent = format($(id).value); svgText=''; updateButtons(); });
}
$('file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  loaded = false; svgText = ''; $('result').replaceChildren(); updateButtons();
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1,Math.round(bitmap.width*scale));
    canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    loaded=true; status(`Image prête (${canvas.width} × ${canvas.height} px).`); updateButtons();
  } catch(err) {status('Impossible de lire cette image : '+err.message);}
});
$('trace').addEventListener('click', async () => {
  if (!ready || !loaded) return;
  $('trace').disabled = true; status('Vectorisation en cours…');
  await new Promise(resolve=>setTimeout(resolve,30));
  try {
    const {width,height} = canvas;
    const rgba = ctx.getImageData(0,0,width,height).data;
    const pixels = new Uint8Array(rgba.length);
    const threshold = Number($('threshold').value);
    const contrast = Number($('contrast').value)/100;
    for(let i=0;i<rgba.length;i+=4){
      // Les pixels sont composités sur blanc pour éviter les zones transparentes noires.
      const alpha=rgba[i+3]/255;
      const lum=(0.2126*rgba[i]+0.7152*rgba[i+1]+0.0722*rgba[i+2])*alpha+255*(1-alpha);
      const adjusted=(lum-127.5)*contrast+127.5;
      const v=adjusted<threshold?0:255;
      pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
    }
    svgText=vectorize_rgba(pixels,width,height,Number($('simplify').value));
    const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
    if(doc.querySelector('parsererror') || doc.documentElement.localName!=='svg') throw new Error('SVG invalide');
    const svg=doc.documentElement;
    // Le contenu provient uniquement du moteur local, pas d'un SVG téléversé.
    $('result').replaceChildren(document.importNode(svg,true));
    status('Vectorisation terminée. Vérifiez les contours avant découpe.');
  } catch(err){svgText='';status('Erreur : '+String(err));}
  updateButtons();
});
$('download').addEventListener('click',()=>{
  if(!svgText)return;
  const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='dessin-vectorise.svg';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try{await init();ready=true;status('Moteur Rust / WebAssembly prêt. Choisissez une image.');}catch(err){status('Impossible de charger le moteur WASM : '+String(err));}
updateButtons();
