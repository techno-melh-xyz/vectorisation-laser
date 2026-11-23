import init, { vectorize_rgba } from './pkg/vectorisation_laser.js';
const $ = id => document.getElementById(id);
const canvas = $('original');
const ctx = canvas.getContext('2d', {willReadFrequently:true});
let ready = false, loaded = false, svgText = '';
const cleanedCanvas = $('cleaned');
function invalidate(){svgText='';$('result').replaceChildren();updateButtons();}
$('adaptive').addEventListener('change',invalidate);
const status = message => $('status').textContent = message;
const updateButtons = () => { $('trace').disabled = !(ready && loaded); $('download').disabled = !svgText; };
for (const [id, format] of [['threshold',v=>v],['contrast',v=>v+' %'],['simplify',v=>Number(v).toFixed(2)]]) {
  $(id).addEventListener('input', () => { $(id+'Val').textContent = format($(id).value); invalidate(); });
}
$('file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  loaded = false; invalidate(); cleanedCanvas.width=1; cleanedCanvas.height=1;
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
    const lum = new Float32Array(width*height);
    for(let j=0;j<lum.length;j++){
      const i=j*4, alpha=rgba[i+3]/255;
      lum[j]=(0.2126*rgba[i]+0.7152*rgba[i+1]+0.0722*rgba[i+2])*alpha+255*(1-alpha);
    }
    if($('adaptive').checked){
      // Moyenne locale rapide par image intégrale : neutralise les ombres larges.
      const stride=width+1, integral=new Float64Array(stride*(height+1));
      for(let y=0;y<height;y++){
        let rowSum=0;
        for(let x=0;x<width;x++){
          rowSum+=lum[y*width+x];
          integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+rowSum;
        }
      }
      const radius=Math.max(18,Math.round(Math.min(width,height)/24));
      // Plus le seuil augmente, plus les traits peu contrastés sont détectés.
      // À 128, un écart de 5 niveaux suffit pour les traits fins.
      const delta=Math.max(1.5,Math.min(16,5+(128-threshold)*0.065));
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1);
        const y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1);
        const avg=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
        const j=y*width+x, diff=(avg-lum[j])*contrast;
        const v=diff>delta?0:255, i=j*4;
        pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
      }
    }else{
      for(let j=0;j<lum.length;j++){
        const adjusted=(lum[j]-127.5)*contrast+127.5;
        const v=adjusted<threshold?0:255, i=j*4;
        pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;
      }
    }
    cleanedCanvas.width=width;cleanedCanvas.height=height;
    cleanedCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    const blackPixels=pixels.reduce((n,v,i)=>n+(i%4===0 && v===0?1:0),0);
    const blackPercent=(100*blackPixels/(width*height)).toFixed(2);
    if(blackPixels===0 || blackPixels===width*height){
      throw new Error('Image nettoyée entièrement '+(blackPixels===0?'blanche':'noire')+'. Ajustez le seuil ou le mode de nettoyage.');
    }
    svgText=vectorize_rgba(pixels,width,height,Number($('simplify').value));
    const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
    if(doc.querySelector('parsererror') || doc.documentElement.localName!=='svg') throw new Error('SVG invalide');
    const svg=doc.documentElement;
    // Le contenu provient uniquement du moteur local, pas d'un SVG téléversé.
    $('result').replaceChildren(document.importNode(svg,true));
    status(`Vectorisation terminée — ${blackPercent} % de pixels noirs détectés. Vérifiez l’image nettoyée et les contours avant découpe.`);
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
