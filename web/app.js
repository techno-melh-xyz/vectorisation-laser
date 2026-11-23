import init from './pkg/vectorisation_laser.js';
import { vectorizeCut, vectorizeCenterline, vectorizeDoubleContours } from './trace-modes.js';
import { createCurveEditor } from './curve-editor.js';
const $ = id => document.getElementById(id);
$('threshold').value = '128'; $('contrast').value = '100'; $('simplify').value = '0.5';
$('thresholdVal').textContent = '128'; $('contrastVal').textContent = '100 %'; $('simplifyVal').textContent = '0.50';
const canvas = $('original');
const ctx = canvas.getContext('2d', {willReadFrequently:true});
let ready = false, loaded = false, svgText = '';
let curveEditor = null;
const cleanedImage = $('cleaned');
const overlay = $('cropOverlay');
const cropStage = $('cropStage');
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
  const rect=canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return {x:0,y:0};
  return {x:Math.max(0,Math.min(canvas.width,(e.clientX-rect.left)*canvas.width/rect.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-rect.top)*canvas.height/rect.height))};
}
$('cropMode').addEventListener('change',()=>{
  $('cropStage').classList.toggle('selecting',$('cropMode').checked && loaded);
  $('cropHelp').textContent=$('cropMode').checked ? 'Cliquez et faites glisser la souris sur le sapin pour dessiner le rectangle bleu.' : 'Cochez le mode recadrage sous l’image d’origine, puis dessinez un rectangle ici.';
  $('cropInfo').textContent=$('cropMode').checked ? 'Dessinez un rectangle sur l’image d’origine, dans le panneau de gauche.' : 'Activez la sélection pour recadrer l’image.';
  if(!$('cropMode').checked){selection=null;drawSelection();$('applyCrop').disabled=true;}
});
cropStage.addEventListener('pointerdown',e=>{
  if(!loaded || !$('cropMode').checked)return;
  dragging=true;dragStart=pointerCoords(e);selection=null;
  cropStage.setPointerCapture(e.pointerId);drawSelection();e.preventDefault();
});
cropStage.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const p=pointerCoords(e);
  selection={x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};
  drawSelection(); e.preventDefault();
});
function finishSelection(e){
  if(!dragging)return;
  dragging=false;
  const p=pointerCoords(e);
  selection={x:Math.round(Math.min(dragStart.x,p.x)),y:Math.round(Math.min(dragStart.y,p.y)),w:Math.round(Math.abs(p.x-dragStart.x)),h:Math.round(Math.abs(p.y-dragStart.y))};
  if(selection.w<8 || selection.h<8)selection=null;
  drawSelection();$('applyCrop').disabled=!selection;
  if(selection) $('cropMode').checked=true;
  $('cropInfo').textContent=selection?`Sélection : ${selection.w} × ${selection.h} px. Cliquez sur « Appliquer le recadrage ».`:'Sélection trop petite : tracez un rectangle plus grand.';
}
cropStage.addEventListener('pointerup',finishSelection);
cropStage.addEventListener('pointercancel',()=>{dragging=false;selection=null;drawSelection();$('applyCrop').disabled=true;});
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
function invalidate(){svgText='';$('result').replaceChildren();$('traceStats').textContent='';fitBox=null;closeSvgDialog();updateButtons();}
$('adaptive').addEventListener('change',invalidate);
function selectedMode(){ return document.querySelector('input[name="traceMode"]:checked')?.value || 'cut'; }
for (const control of document.querySelectorAll('input[name="traceMode"]')) {
  control.addEventListener('change', () => {
    $('modeInfo').textContent=selectedMode()==='cut'
      ? 'Découpe : recherche les formes fermées. Si aucune forme intérieure n’est détectée, un contour extérieur est proposé avec avertissement.'
      : selectedMode()==='double'
        ? 'Deux bords : vectorise les deux limites de la bande d’encre noire, sans fusionner l’intérieur et l’extérieur.'
        : 'Gravure : amincit les traits en un axe central. Les chemins ouverts sont autorisés.';
    invalidate();
  });
}

const status = message => $('status').textContent = message;
const updateButtons = () => {
  $('trace').disabled = !(ready && loaded);
  $('download').disabled = !svgText;
  $('openSvgPreview').disabled = !svgText;
};
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

function despeckleBinary(pixels, width, height) {
  const total = width * height;
  const black = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) black[i] = pixels[p] === 0 ? 1 : 0;

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const minArea = Math.max(12, Math.round(Math.min(width, height) / 45));
  const borderMargin = Math.max(2, Math.round(Math.min(width, height) / 100));
  let removedSpeckles = 0;
  let removedBorderBlobs = 0;
  let keptComponents = 0;

  const neighbors = [-1, 1, -width, width];
  for (let start = 0; start < total; start++) {
    if (!black[start] || visited[start]) continue;
    let qh = 0, qt = 0;
    queue[qt++] = start;
    visited[start] = 1;
    let area = 0;
    let touchesBorder = false;
    const component = [];
    while (qh < qt) {
      const idx = queue[qh++];
      component.push(idx);
      area++;
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x <= borderMargin || y <= borderMargin || x >= width - 1 - borderMargin || y >= height - 1 - borderMargin) touchesBorder = true;
      // 4-neighborhood with edge checks
      if (x > 0) {
        const n = idx - 1;
        if (black[n] && !visited[n]) { visited[n] = 1; queue[qt++] = n; }
      }
      if (x + 1 < width) {
        const n = idx + 1;
        if (black[n] && !visited[n]) { visited[n] = 1; queue[qt++] = n; }
      }
      if (y > 0) {
        const n = idx - width;
        if (black[n] && !visited[n]) { visited[n] = 1; queue[qt++] = n; }
      }
      if (y + 1 < height) {
        const n = idx + width;
        if (black[n] && !visited[n]) { visited[n] = 1; queue[qt++] = n; }
      }
    }

    const remove = area < minArea || touchesBorder;
    if (remove) {
      if (touchesBorder) removedBorderBlobs++; else removedSpeckles++;
      for (const idx of component) {
        const p = idx * 4;
        pixels[p] = pixels[p + 1] = pixels[p + 2] = 255;
      }
    } else {
      keptComponents++;
    }
  }
  return { removedSpeckles, removedBorderBlobs, keptComponents, minArea };
}


// Aperçu vectoriel : le SVG reçu peut avoir des dimensions fixes très grandes.
// Son viewBox est recalculé à partir des formes réelles (avec une marge).
// On n'altère jamais svgText, afin de préserver l'export tel que produit par VTracer.
let fitBox = null;
let viewerSvg = null;
let viewerView = null;
let viewerBase = null;
let panPoint = null;
const svgDialog = $('svgDialog');
const zoomStage = $('svgZoomStage');
function isValidBox(b) {
  return !!b && [b.x,b.y,b.width,b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;
}
function paddedBox(b) {
  const margin=Math.max(2,Math.max(b.width,b.height)*0.045);
  return {x:b.x-margin,y:b.y-margin,width:b.width+2*margin,height:b.height+2*margin};
}
function fitSvgToContent(svg, width, height) {
  svg.setAttribute('width','100%');
  svg.setAttribute('height','100%');
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  // Calculer la boîte englobante après insertion dans le document :
  // contrairement au width/height du SVG, elle tient compte des tracés réels.
  let bounds;
  try { bounds=svg.getBBox(); } catch (_) { /* SVG sans géométrie mesurable */ }
  const fallback={x:0,y:0,width:width||1,height:height||1};
  const base=isValidBox(bounds) ? paddedBox(bounds) : paddedBox(fallback);
  svg.setAttribute('viewBox',`${base.x} ${base.y} ${base.width} ${base.height}`);
  return base;
}
function copyBox(b){return {x:b.x,y:b.y,width:b.width,height:b.height};}
function setViewerView(b) {
  if(!viewerSvg || !isValidBox(b)) return;
  viewerView=copyBox(b);
  viewerSvg.setAttribute('viewBox',`${b.x} ${b.y} ${b.width} ${b.height}`);
  curveEditor?.refresh();
  const percent=Math.round(100*viewerBase.width/b.width);
  $('zoomValue').textContent=`${percent} %`;
  $('zoomOut').disabled=percent<=10;
  $('zoomIn').disabled=percent>=1600;
}
function fitViewer(){if(viewerBase)setViewerView(viewerBase);}
function closeSvgDialog(){
  curveEditor?.close();
  $('editSvg').checked=false;$('editorTools').hidden=true;
  zoomStage.classList.remove('is-editing');
  if(svgDialog.open)svgDialog.close();
  zoomStage.replaceChildren();
  viewerSvg=null;viewerBase=null;viewerView=null;panPoint=null;
}
function openSvgDialog(){
  const source=$('result').querySelector('svg');
  if(!source || !fitBox)return;
  curveEditor?.close();
  $('editSvg').checked=false;$('editorTools').hidden=true;
  zoomStage.classList.remove('is-editing');
  viewerSvg=source.cloneNode(true);
  zoomStage.replaceChildren(viewerSvg);
  viewerBase=copyBox(fitBox);
  viewerView=copyBox(fitBox);
  svgDialog.showModal();
  requestAnimationFrame(()=>{
    if(viewerSvg){fitViewer();$('closeSvgPreview').focus();}
  });
}
function zoomAt(multiplier,clientX=null,clientY=null){
  if(!viewerSvg || !viewerView)return;
  const current=viewerView;
  const currentPercent=viewerBase.width/current.width;
  const targetPercent=Math.min(16,Math.max(.1,currentPercent/multiplier));
  const factor=currentPercent/targetPercent;
  const next={x:current.x,y:current.y,width:current.width*factor,height:current.height*factor};
  // La molette conserve le point du dessin sous le curseur.
  let anchor={x:current.x+current.width/2,y:current.y+current.height/2};
  if(clientX!==null && clientY!==null){
    const mat=viewerSvg.getScreenCTM();
    if(mat){
      const pt=new DOMPoint(clientX,clientY).matrixTransform(mat.inverse());
      if(Number.isFinite(pt.x)&&Number.isFinite(pt.y))anchor={x:pt.x,y:pt.y};
    }
  }
  next.x=anchor.x-(anchor.x-current.x)*factor;
  next.y=anchor.y-(anchor.y-current.y)*factor;
  setViewerView(next);
}
$('openSvgPreview').addEventListener('click',openSvgDialog);
$('closeSvgPreview').addEventListener('click',closeSvgDialog);
$('fitSvg').addEventListener('click',fitViewer);
$('zoomIn').addEventListener('click',()=>zoomAt(1/1.25));
$('zoomOut').addEventListener('click',()=>zoomAt(1.25));
svgDialog.addEventListener('close',()=>{
  // Échap et fermeture native : réinitialiser le déplacement et l’éditeur.
  curveEditor?.close();
  $('editSvg').checked=false;$('editorTools').hidden=true;
  zoomStage.classList.remove('is-editing');
  panPoint=null;zoomStage.classList.remove('is-panning');
});
zoomStage.addEventListener('wheel',e=>{
  if(!viewerSvg)return;
  e.preventDefault();
  zoomAt(e.deltaY<0 ? 1/1.15 : 1.15,e.clientX,e.clientY);
},{passive:false});
zoomStage.addEventListener('pointerdown',e=>{
  if(!viewerSvg || e.button!==0)return;
  if(curveEditor?.pointerDown(e)){e.preventDefault();return;}
  panPoint={id:e.pointerId,x:e.clientX,y:e.clientY};
  zoomStage.setPointerCapture(e.pointerId);
  zoomStage.classList.add('is-panning');
  e.preventDefault();
});
zoomStage.addEventListener('pointermove',e=>{
  if(curveEditor?.pointerMove(e)){e.preventDefault();return;}
  if(!panPoint || panPoint.id!==e.pointerId || !viewerView)return;
  const rect=zoomStage.getBoundingClientRect();
  const scale=Math.min(rect.width/viewerView.width,rect.height/viewerView.height);
  if(scale>0){
    setViewerView({
      ...viewerView,
      x:viewerView.x-(e.clientX-panPoint.x)/scale,
      y:viewerView.y-(e.clientY-panPoint.y)/scale
    });
  }
  panPoint.x=e.clientX;panPoint.y=e.clientY;
  e.preventDefault();
});
function stopPan(e){
  if(curveEditor?.pointerUp(e))return;
  if(!panPoint || panPoint.id!==e.pointerId)return;
  if(zoomStage.hasPointerCapture(e.pointerId))zoomStage.releasePointerCapture(e.pointerId);
  panPoint=null;zoomStage.classList.remove('is-panning');
}
zoomStage.addEventListener('pointerup',stopPan);
zoomStage.addEventListener('pointercancel',stopPan);

// Édition Bézier : les données exportées sont mises à jour seulement après
// modification. On travaille sur le SVG source, sans exporter les repères.
curveEditor=createCurveEditor({
  stage:zoomStage,
  getSvg:()=>viewerSvg,
  getIntensity:()=>Number($('smoothIntensity').value)/100,
  isLinked:()=>$('linkHandles').checked,
  onMessage:message=>{$('editInfo').textContent=message;},
  onState:s=>{
    $('smoothSelected').disabled=!s.enabled||s.selected<0;
    $('reduceSelected').disabled=!s.enabled||s.selected<0;
    $('smoothNode').disabled=!s.enabled||s.node<0;
    $('cornerNode').disabled=!s.enabled||s.node<0;
    $('deleteNode').disabled=!s.enabled||s.node<0;
    $('undoEdit').disabled=!s.enabled||!s.undo;
    $('resetEdit').disabled=!s.enabled;
    if(s.enabled){
      const sel=s.selected>=0?`Tracé ${s.selected+1}/${s.pathCount} — ${s.nodeCount} nœuds. `:'Cliquez sur un chemin SVG pour sélectionner ses nœuds. ';
      $('editInfo').textContent=sel+(s.node>=0?`Nœud ${s.node+1} sélectionné. Déplacez-le ou ses poignées vertes.`:'Choisissez ensuite un point bleu ou utilisez « Lisser le tracé ».');
    }
  },
  onCommit:ds=>{
    const parser=new DOMParser();
    const doc=parser.parseFromString(svgText,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw Error('Impossible de mettre à jour le SVG à exporter.');
    const sourcePaths=[...doc.querySelectorAll('path')];
    const preview=$('result').querySelector('svg');
    const previewPaths=preview?[...preview.querySelectorAll('path')]:[];
    if(sourcePaths.length!==ds.length||previewPaths.length!==ds.length)throw Error('Nombre de chemins SVG inattendu.');
    ds.forEach((d,i)=>{sourcePaths[i].setAttribute('d',d);previewPaths[i].setAttribute('d',d);});
    svgText=new XMLSerializer().serializeToString(doc.documentElement);
    if(preview){fitBox=fitSvgToContent(preview,canvas.width,canvas.height);viewerBase=copyBox(fitBox);}
    updateButtons();
    status('SVG modifié : les nouvelles courbes et poignées seront conservées dans le fichier téléchargé.');
  }
});
$('editSvg').addEventListener('change',e=>{
  const ok=curveEditor.enable(e.target.checked);
  if(e.target.checked&&!ok)e.target.checked=false;
  $('editorTools').hidden=!ok;
  zoomStage.classList.toggle('is-editing',ok);
});
for(const [id,fn] of [
  ['smoothSelected','smoothSelected'],['reduceSelected','reduceSelected'],
  ['smoothNode','smoothSelectedNode'],['cornerNode','cornerSelectedNode'],
  ['deleteNode','deleteSelectedNode'],['undoEdit','undo'],['resetEdit','reset']
])$(id).addEventListener('click',()=>curveEditor[fn]());
$('smoothIntensity').addEventListener('input',()=>{
  $('smoothIntensityValue').textContent=$('smoothIntensity').value+' %';
});
svgDialog.addEventListener('keydown',e=>{
  if(!$('editSvg').checked||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();curveEditor.undo();
  }else if(e.key==='Delete'||e.key==='Backspace'){
    e.preventDefault();curveEditor.deleteSelectedNode();
  }
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
      const stride=width+1, integral=new Float64Array(stride*(height+1));
      for(let y=0;y<height;y++){
        let rowSum=0;
        for(let x=0;x<width;x++){
          rowSum+=lum[y*width+x];
          integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+rowSum;
        }
      }
      const radius=Math.max(18,Math.round(Math.min(width,height)/24));
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

    const filtering = despeckleBinary(pixels, width, height);

    const previewCanvas=document.createElement('canvas');
    previewCanvas.width=width; previewCanvas.height=height;
    const previewContext=previewCanvas.getContext('2d');
    previewContext.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    cleanedImage.src=previewCanvas.toDataURL('image/png');
    cleanedImage.alt='Image réellement envoyée au moteur VTracer';

    let blackPixels=0; for(let i=0;i<pixels.length;i+=4)if(pixels[i]===0)blackPixels++;
    const blackPercent=(100*blackPixels/(width*height)).toFixed(2);
    $('diagnostic').textContent=`Prétraitement : ${blackPixels.toLocaleString('fr-FR')} pixels noirs sur ${(width*height).toLocaleString('fr-FR')} (${blackPercent} %). Image ${width} × ${height}. Composantes gardées : ${filtering.keptComponents}. Parasites supprimés : ${filtering.removedSpeckles}. Taches de bord supprimées : ${filtering.removedBorderBlobs}.`;
    if(blackPixels===0 || blackPixels===width*height){
      throw new Error('Image nettoyée entièrement '+(blackPixels===0?'blanche':'noire')+'. Ajustez le seuil ou le mode de nettoyage.');
    }

    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const mode=selectedMode();
    // Two distinct geometric tracers: filled regions for closed cutting outlines,
    // or thinning + graph walk for single-stroke engraving.
    const tracing=mode==='cut'
      ? vectorizeCut(pixels,width,height,Number($('simplify').value))
      : mode==='double'
        ? vectorizeDoubleContours(pixels,width,height,Number($('simplify').value))
        : vectorizeCenterline(pixels,width,height,Number($('simplify').value));
    svgText=tracing.svg;
    $('traceStats').textContent=(mode==='cut'
      ? `Découpe : ${tracing.closed} contour(s) fermé(s), ${tracing.open} chemin(s) ouvert(s). `
      : mode==='double'
        ? `Deux bords du trait : ${tracing.closed} contour(s) fermé(s) (intérieur et extérieur). `
        : `Gravure : ${tracing.paths} tracé(s) central(aux), dont ${tracing.closed} boucle(s) et ${tracing.open} chemin(s) ouvert(s). `)
      +(tracing.warning||'');
    const doc=new DOMParser().parseFromString(svgText,'image/svg+xml');
    if(doc.querySelector('parsererror') || doc.documentElement.localName!=='svg') throw new Error('SVG invalide');
    const svg=doc.documentElement;
    const previewSvg=document.importNode(svg,true);
    $('result').replaceChildren(previewSvg);
    // Forcer un vrai viewBox et une échelle adaptée à la zone d'affichage.
    // Le texte SVG à télécharger reste inchangé.
    fitBox=fitSvgToContent(previewSvg,width,height);
    status(`Vectorisation ${mode==='cut'?'pour découpe':mode==='double'?'des deux bords du trait':'pour gravure'} terminée — ${blackPercent} % de pixels noirs après nettoyage. Vérifiez les tracés et l’échelle physique.`);
  } catch(err){svgText='';$('traceStats').textContent='';status('Erreur : '+String(err?.message || err));}
  updateButtons();
});
function downloadSvg(){
  if(!svgText)return;
  const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=selectedMode()==='cut'?'dessin-decoupe-contours-fermes.svg':selectedMode()==='double'?'dessin-double-contour.svg':'dessin-gravure-ligne-centrale.svg';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('download').addEventListener('click',downloadSvg);
$('downloadEdited').addEventListener('click',downloadSvg);
try{await init();ready=true;status('Application prête : trois modes de vectorisation et édition des courbes dans Agrandir / Zoom.');}catch(err){ready=true;status('WASM VTracer indisponible : les trois modes de vectorisation JavaScript restent opérationnels.');}
updateButtons();
