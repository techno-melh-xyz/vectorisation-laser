import init, { vectorize_rgba } from './pkg/vectorisation_laser.js';
const $ = id => document.getElementById(id);
const canvas = $('original');
const ctx = canvas.getContext('2d', {willReadFrequently:true});
let ready = false, loaded = false, svgText = '';
const cleanedImage = $('cleaned');
const overlay = $('cropOverlay');
const overlayCtx = overlay.getContext('2d');
const sourceCanvas = document.createElement('canvas');
const sourceCtx = sourceCanvas.getContext('2d');
let selection = null, dragging = false, dragStart = null;
let currentCrop = null;
function clearOutput(){invalidate();cleanedImage.removeAttribute('src');$('diagnostic').textContent='Aucune image traitée.';}
function syncOverlay(){overlay.width=canvas.width;overlay.height=canvas.height;drawSelection();}
function drawSelection(){
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  if(!selection)return;
  const {x,y,w,h}=selection;
  overlayCtx.fillStyle='rgba(19,99,165,.18)';overlayCtx.fillRect(x,y,w,h);
  overlayCtx.strokeStyle='#0b61a4';overlayCtx.lineWidth=Math.max(2,canvas.width/600);
  overlayCtx.setLineDash([Math.max(5,canvas.width/150),Math.max(3,canvas.width/300)]);
  overlayCtx.strokeRect(x,y,w,h);overlayCtx.setLineDash([]);
}
function pointerCoords(e){
  const rect=overlay.getBoundingClientRect();
  return {x:Math.max(0,Math.min(canvas.width,(e.clientX-rect.left)*canvas.width/rect.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-rect.top)*canvas.height/rect.height))};
}
$('cropMode').addEventListener('change',()=>{
  $('cropStage').classList.toggle('selecting',$('cropMode').checked && loaded);
  if(!$('cropMode').checked){selection=null;drawSelection();$('applyCrop').disabled=true;}
});
overlay.addEventListener('pointerdown',e=>{
  if(!loaded || !$('cropMode').checked)return;
  dragging=true;dragStart=pointerCoords(e);selection=null;
  overlay.setPointerCapture(e.pointerId);e.preventDefault();
});
overlay.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const p=pointerCoords(e);
  selection={x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};
  drawSelection();
});
function finishSelection(e){
  if(!dragging)return;
  dragging=false;
  const p=pointerCoords(e);
  selection={x:Math.round(Math.min(dragStart.x,p.x)),y:Math.round(Math.min(dragStart.y,p.y)),w:Math.round(Math.abs(p.x-dragStart.x)),h:Math.round(Math.abs(p.y-dragStart.y))};
  if(selection.w<8 || selection.h<8)selection=null;
  drawSelection();$('applyCrop').disabled=!selection;
  $('cropInfo').textContent=selection?`Sélection : ${selection.w} × ${selection.h} px. Cliquez sur « Appliquer le recadrage ».`:'Sélection trop petite : tracez un rectangle plus grand.';
}
overlay.addEventListener('pointerup',finishSelection);
overlay.addEventListener('pointercancel',()=>{dragging=false;selection=null;drawSelection();$('applyCrop').disabled=true;});
function renderCrop(){
  const r=currentCrop || {x:0,y:0,w:sourceCanvas.width,h:sourceCanvas.height};
  canvas.width=r.w;canvas.height=r.h;
  ctx.drawImage(sourceCanvas,r.x,r.y,r.w,r.h,0,0,r.w,r.h);
  selection=null;syncOverlay();$('applyCrop').disabled=true;
  $('resetCrop').disabled=!currentCrop;
  $('cropStage').classList.toggle('selecting',$('cropMode').checked && loaded);
  clearOutput();updateButtons();
}
$('applyCrop').addEventListener('click',()=>{
  if(!selection || !loaded)return;
  // La sélection est exprimée dans les coordonnées de l'image affichée.
  const r=currentCrop || {x:0,y:0,w:sourceCanvas.width,h:sourceCanvas.height};
  currentCrop={x:r.x+selection.x,y:r.y+selection.y,w:Math.min(selection.w,r.w-selection.x),h:Math.min(selection.h,r.h-selection.y)};
  $('cropMode').checked=false;renderCrop();
  $('cropInfo').textContent=`Image recadrée : ${canvas.width} × ${canvas.height} px. Vous pouvez recadrer à nouveau ou rétablir l’image entière.`;
  status('Recadrage appliqué. Cliquez sur Vectoriser pour traiter uniquement cette zone.');
});
$('resetCrop').addEventListener('click',()=>{
  currentCrop=null;$('cropMode').checked=false;renderCrop();
  $('cropInfo').textContent='Image entière rétablie.';status('Image entière rétablie.');
});
function invalidate(){svgText='';$('result').replaceChildren();updateButtons();}
$('adaptive').addEventListener('change',invalidate);
const status = message => $('status').textContent = message;
const updateButtons = () => { $('trace').disabled = !(ready && loaded); $('download').disabled = !svgText; };
for (const [id, format] of [['threshold',v=>v],['contrast',v=>v+' %'],['simplify',v=>Number(v).toFixed(2)]]) {
  $(id).addEventListener('input', () => { $(id+'Val').textContent = format($(id).value); invalidate(); });
}
$('file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  loaded = false; clearOutput(); selection=null;currentCrop=null;$('cropMode').checked=false;$('applyCrop').disabled=true;$('resetCrop').disabled=true;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    sourceCanvas.width = Math.max(1,Math.round(bitmap.width*scale));
    sourceCanvas.height = Math.max(1,Math.round(bitmap.height*scale));
    sourceCtx.fillStyle='#fff'; sourceCtx.fillRect(0,0,sourceCanvas.width,sourceCanvas.height);
    sourceCtx.drawImage(bitmap,0,0,sourceCanvas.width,sourceCanvas.height); bitmap.close();
    loaded=true; renderCrop();$('cropInfo').textContent='Cochez la sélection, puis tracez un rectangle directement sur l’image.'; status(`Image prête (${canvas.width} × ${canvas.height} px).`); updateButtons();
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
    // Aperçu PNG indépendant du canvas : évite un canvas transparent ou mal dimensionné.
    const previewCanvas=document.createElement('canvas');
    previewCanvas.width=width; previewCanvas.height=height;
    const previewContext=previewCanvas.getContext('2d');
    previewContext.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    cleanedImage.src=previewCanvas.toDataURL('image/png');
    cleanedImage.alt='Image réellement envoyée au moteur VTracer';
    let blackPixels=0; for(let i=0;i<pixels.length;i+=4)if(pixels[i]===0)blackPixels++; 
    const blackPercent=(100*blackPixels/(width*height)).toFixed(2);
    $('diagnostic').textContent=`Prétraitement : ${blackPixels.toLocaleString('fr-FR')} pixels noirs sur ${(width*height).toLocaleString('fr-FR')} (${blackPercent} %). Image ${width} × ${height}.`; 
    if(blackPixels===0 || blackPixels===width*height){
      throw new Error('Image nettoyée entièrement '+(blackPixels===0?'blanche':'noire')+'. Ajustez le seuil ou le mode de nettoyage.');
    }
    // Laisser le navigateur afficher l'image nettoyée avant le calcul WASM.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
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
