/* Vectorisation Laser V10.1 — application autonome sans dépendance WASM au démarrage.
   Les trois modes utilisent les algorithmes JS inclus ci-dessous.
   Les modules séparés restent dans le dépôt pour les tests. */
const {parsePathData,pathData,clonePaths,smoothPath,smoothNode,makeCorner,reducePathNodes} = (() => {
/* Géométrie des courbes pour l'éditeur SVG. Pas de dépendance externe. */
const fmt = n => Number((Number.isFinite(n) ? n : 0).toFixed(2)).toString();
const pos = (x,y) => ({x:Number(x), y:Number(y)});
const copy = p => p ? pos(p.x,p.y) : null;
function clonePaths(paths) {
  return paths.map(path=>({closed:path.closed,nodes:path.nodes.map(n=>({x:n.x,y:n.y,in:copy(n.in),out:copy(n.out)}))}));
}

// Nos vectoriseurs émettent M/L/Z. Le parseur accepte aussi H/V/C/Q/S
// afin de pouvoir recharger les courbes cubiques après édition.
function parsePathData(d) {
  const tokens=(d.match(/[a-zA-Z]|[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g)||[]);
  let i=0,cmd='',x=0,y=0,start=null,lastQuad=null,closed=false;
  const nodes=[];
  const isCommand=t=>/^[A-Za-z]$/.test(t||'');
  const get=()=>{if(i>=tokens.length||isCommand(tokens[i]))throw Error('Données SVG incomplètes');return Number(tokens[i++]);};
  const point=(xx,yy)=>{x=xx;y=yy;nodes.push({x,y,in:null,out:null});};
  while(i<tokens.length){
    if(isCommand(tokens[i])){cmd=tokens[i++];if(cmd.toUpperCase()==='Z'){closed=true;if(start){x=start.x;y=start.y;}cmd='';continue;}}
    if(!cmd)throw Error('Commande SVG manquante');
    const rel=cmd===cmd.toLowerCase(),type=cmd.toUpperCase();
    if(type==='M'){
      const nx=get(),ny=get();point(nx+(rel?x:0),ny+(rel?y:0));start={x,y};
      cmd=rel?'l':'L';lastQuad=null;
    } else if(type==='L'){
      const nx=get(),ny=get();point(nx+(rel?x:0),ny+(rel?y:0));lastQuad=null;
    } else if(type==='H'){
      const nx=get();point(nx+(rel?x:0),y);lastQuad=null;
    } else if(type==='V'){
      const ny=get();point(x,ny+(rel?y:0));lastQuad=null;
    } else if(type==='C'){
      const bx=x,by=y;
      const c1=pos(get(),get()),c2=pos(get(),get()),p=pos(get(),get());
      if(rel){for(const v of [c1,c2,p]){v.x+=bx;v.y+=by;}}
      if(nodes.length)nodes.at(-1).out=c1;
      point(p.x,p.y);nodes.at(-1).in=c2;lastQuad=null;
    } else if(type==='Q'){
      const bx=x,by=y,q=pos(get(),get()),p=pos(get(),get());
      if(rel){q.x+=bx;q.y+=by;p.x+=bx;p.y+=by;}
      if(nodes.length)nodes.at(-1).out=pos(bx+(q.x-bx)*2/3,by+(q.y-by)*2/3);
      point(p.x,p.y);nodes.at(-1).in=pos(p.x+(q.x-p.x)*2/3,p.y+(q.y-p.y)*2/3);
      lastQuad=q;
    } else if(type==='S'){
      const bx=x,by=y,c2=pos(get(),get()),p=pos(get(),get());
      if(rel){c2.x+=bx;c2.y+=by;p.x+=bx;p.y+=by;}
      const prev=nodes.at(-1);
      if(prev)prev.out=prev.in?pos(2*bx-prev.in.x,2*by-prev.in.y):pos(bx,by);
      point(p.x,p.y);nodes.at(-1).in=c2;lastQuad=null;
    } else if(type==='T'){
      const bx=x,by=y,p=pos(get(),get());
      if(rel){p.x+=bx;p.y+=by;}
      const q=lastQuad?pos(2*bx-lastQuad.x,2*by-lastQuad.y):pos(bx,by);
      if(nodes.length)nodes.at(-1).out=pos(bx+(q.x-bx)*2/3,by+(q.y-by)*2/3);
      point(p.x,p.y);nodes.at(-1).in=pos(p.x+(q.x-p.x)*2/3,p.y+(q.y-p.y)*2/3);lastQuad=q;
    } else {
      throw Error(`Commande ${type} non prise en charge par cet éditeur`);
    }
  }
  if(nodes.length<2)throw Error('Chemin trop court');
  return {nodes,closed};
}
function pathData(path) {
  const n=path.nodes;
  if(n.length<2)return '';
  let d=`M ${fmt(n[0].x)} ${fmt(n[0].y)}`;
  const segment=(from,to)=>{
    if(from.out||to.in){
      const a=from.out||pos(from.x+(to.x-from.x)/3,from.y+(to.y-from.y)/3);
      const b=to.in||pos(from.x+2*(to.x-from.x)/3,from.y+2*(to.y-from.y)/3);
      return ` C ${fmt(a.x)} ${fmt(a.y)} ${fmt(b.x)} ${fmt(b.y)} ${fmt(to.x)} ${fmt(to.y)}`;
    }
    return ` L ${fmt(to.x)} ${fmt(to.y)}`;
  };
  for(let i=1;i<n.length;i++)d+=segment(n[i-1],n[i]);
  if(path.closed){
    if(n.at(-1).out||n[0].in)d+=segment(n.at(-1),n[0]);
    d+=' Z';
  }
  return d;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const unit=(dx,dy)=>{const len=Math.hypot(dx,dy);return len>1e-7?{x:dx/len,y:dy/len}:pos(0,0);};
function handlesForNode(nodes,i,closed,intensity,protectCorners){
  const n=nodes.length,p=nodes[i];
  const prev=i>0?nodes[i-1]:(closed?nodes[n-1]:null);
  const next=i+1<n?nodes[i+1]:(closed?nodes[0]:null);
  if(!prev&&!next)return {in:null,out:null};
  if(!prev){
    const u=unit(next.x-p.x,next.y-p.y);
    return {in:null,out:pos(p.x+u.x*distance(next,p)*intensity/3,p.y+u.y*distance(next,p)*intensity/3)};
  }
  if(!next){
    const u=unit(p.x-prev.x,p.y-prev.y);
    return {in:pos(p.x-u.x*distance(prev,p)*intensity/3,p.y-u.y*distance(prev,p)*intensity/3),out:null};
  }
  const v1=unit(prev.x-p.x,prev.y-p.y),v2=unit(next.x-p.x,next.y-p.y);
  const cos=Math.max(-1,Math.min(1,v1.x*v2.x+v1.y*v2.y));
  const angle=Math.acos(cos)*180/Math.PI;
  if(protectCorners&&angle<118)return {in:null,out:null};
  const u=unit(v2.x-v1.x,v2.y-v1.y);
  const inLen=distance(prev,p)*intensity/3;
  const outLen=distance(next,p)*intensity/3;
  return {in:pos(p.x-u.x*inLen,p.y-u.y*inLen),out:pos(p.x+u.x*outLen,p.y+u.y*outLen)};
}
function smoothNode(path,index,intensity=0.8){
  if(index<0||index>=path.nodes.length)return false;
  const h=handlesForNode(path.nodes,index,path.closed,intensity,false);
  path.nodes[index].in=h.in;path.nodes[index].out=h.out;
  return true;
}
function makeCorner(path,index){
  if(index<0||index>=path.nodes.length)return false;
  path.nodes[index].in=null;path.nodes[index].out=null;
  return true;
}
function smoothPath(path,intensity=0.8){
  const nodes=path.nodes;
  const hs=nodes.map((_,i)=>handlesForNode(nodes,i,path.closed,intensity,true));
  nodes.forEach((node,i)=>{node.in=hs[i].in;node.out=hs[i].out;});
  return path;
}
function pointToSegment2(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  if(!den)return (p.x-a.x)**2+(p.y-a.y)**2;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den));
  return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
}
function rdpOpen(points,tol){
  if(points.length<=2)return points;
  const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
  const stack=[[0,points.length-1]],limit=tol*tol;
  while(stack.length){
    const [start,end]=stack.pop();let best=limit,idx=-1;
    for(let i=start+1;i<end;i++){
      const d=pointToSegment2(points[i],points[start],points[end]);
      if(d>best){best=d;idx=i;}
    }
    if(idx>=0){keep[idx]=1;stack.push([start,idx],[idx,end]);}
  }
  return points.filter((_,i)=>keep[i]);
}
function reducePathNodes(path,tolerance=2){
  const points=path.nodes;
  if(points.length<4)return path;
  let result;
  if(!path.closed){result=rdpOpen(points,tolerance);}
  else {
    const p0=points[0];let far=1,max=0;
    for(let i=1;i<points.length;i++){
      const d=(p0.x-points[i].x)**2+(p0.y-points[i].y)**2;
      if(d>max){max=d;far=i;}
    }
    const a=rdpOpen(points.slice(0,far+1),tolerance);
    const b=rdpOpen([...points.slice(far),points[0]],tolerance);
    result=[...a,...b.slice(1,-1)];
  }
  if(result.length<(path.closed?3:2))return path;
  path.nodes=result.map(n=>({x:n.x,y:n.y,in:null,out:null}));
  return path;
}

return {parsePathData, pathData, clonePaths, smoothPath, smoothNode, makeCorner, reducePathNodes};
})();
const {vectorizeCut,vectorizeCenterline,vectorizeDoubleContours} = (() => {
/* Vectorisation Laser V9 — algorithms developed for this application.
 * No code imported from KizamuBeam. SVG coordinates are in source-image pixels.
 * Output is intentionally unfilled, with explicit M/L/Z commands.
 */
const OFFSETS = [
  [-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]
];
const opposite = i => 7 - i;
const F = number => Number(number.toFixed(2)).toString();

function toBinaryMask(rgba, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4] < 128 ? 1 : 0;
  return mask;
}
function makeSvg(paths, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g></svg>`;
}
function sqDist(p, a, b) {
  const dx = b.x-a.x, dy = b.y-a.y;
  const den=dx*dx+dy*dy;
  if (den === 0) return (p.x-a.x)**2 + (p.y-a.y)**2;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den));
  return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
}
function simplifyOpen(pts, epsilon) {
  if (pts.length <= 2 || epsilon <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0]=keep[pts.length-1]=1;
  const stack=[[0,pts.length-1]];
  const maxSquare=epsilon*epsilon;
  while (stack.length) {
    const [start,end]=stack.pop();
    let best=maxSquare, at=-1;
    for (let i=start+1;i<end;i++) {
      const d=sqDist(pts[i],pts[start],pts[end]);
      if(d>best){best=d;at=i;}
    }
    if(at>=0){keep[at]=1;stack.push([start,at],[at,end]);}
  }
  return pts.filter((_,i)=>keep[i]);
}
function simplifyClosed(points, epsilon) {
  if(points.length<4)return points;
  const first=points[0];
  let far=1, farDist=0;
  for(let i=1;i<points.length;i++){
    const d=(points[i].x-first.x)**2+(points[i].y-first.y)**2;
    if(d>farDist){farDist=d;far=i;}
  }
  if(far===0||far===points.length-1)return points;
  const firstHalf=simplifyOpen(points.slice(0,far+1),epsilon);
  const secondHalf=simplifyOpen([...points.slice(far),points[0]],epsilon);
  const joined=[...firstHalf,...secondHalf.slice(1,-1)];
  return joined.length>=3?joined:points;
}
function pathD(points, closed) {
  if(points.length<2)return null;
  const cmds=[`M ${F(points[0].x)} ${F(points[0].y)}`];
  for(let i=1;i<points.length;i++)cmds.push(`L ${F(points[i].x)} ${F(points[i].y)}`);
  if(closed)cmds.push('Z');
  return cmds.join(' ');
}

// 4-connected flood fill of WHITE pixels, beginning at the picture border.
// White pixels that cannot reach the border are the interior of closed drawn figures.
function findEnclosedWhite(mask, w, h, minArea) {
  const n=w*h, seen=new Uint8Array(n), queue=new Int32Array(n);
  let head=0,tail=0;
  const add = idx => {if(!mask[idx]&&!seen[idx]){seen[idx]=1;queue[tail++]=idx;}};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
  for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(head<tail){
    const p=queue[head++],x=p%w,y=(p/w)|0;
    if(x>0)add(p-1);if(x<w-1)add(p+1);
    if(y>0)add(p-w);if(y<h-1)add(p+w);
  }
  const regions=[];
  for(let p=0;p<n;p++){
    if(mask[p]||seen[p])continue;
    head=tail=0;seen[p]=1;queue[tail++]=p;
    while(head<tail){
      const v=queue[head++],x=v%w,y=(v/w)|0;
      if(x>0)add(v-1);if(x<w-1)add(v+1);
      if(y>0)add(v-w);if(y<h-1)add(v+w);
    }
    if(tail>=minArea)regions.push(Array.from(queue.subarray(0,tail)));
  }
  return regions;
}

// Fallback for solid black figures; only used when no enclosed white region exists.
function findBlackShapes(mask,w,h,minArea){
  const n=w*h,seen=new Uint8Array(n),queue=new Int32Array(n),regions=[];
  for(let i=0;i<n;i++){
    if(!mask[i]||seen[i])continue;
    let head=0,tail=0;queue[tail++]=i;seen[i]=1;
    while(head<tail){
      const p=queue[head++],x=p%w,y=(p/w)|0;
      if(x>0&&mask[p-1]&&!seen[p-1]){seen[p-1]=1;queue[tail++]=p-1;}
      if(x<w-1&&mask[p+1]&&!seen[p+1]){seen[p+1]=1;queue[tail++]=p+1;}
      if(y>0&&mask[p-w]&&!seen[p-w]){seen[p-w]=1;queue[tail++]=p-w;}
      if(y<h-1&&mask[p+w]&&!seen[p+w]){seen[p+w]=1;queue[tail++]=p+w;}
    }
    if(tail>=minArea)regions.push(Array.from(queue.subarray(0,tail)));
  }
  return regions;
}

// Trace one or more closed contours of a pixel region using oriented grid edges.
function regionContours(region,w,h,maskWorkspace){
  const stride=w+1, edges=[],startingAt=new Map();
  for(const p of region)maskWorkspace[p]=1;
  const edge=(x1,y1,x2,y2)=>{
    const from=y1*stride+x1,to=y2*stride+x2;
    const i=edges.length;edges.push({from,to,used:false});
    if(!startingAt.has(from))startingAt.set(from,[]);
    startingAt.get(from).push(i);
  };
  for(const p of region){
    const x=p%w,y=(p/w)|0;
    if(y===0||!maskWorkspace[p-w])edge(x,y,x+1,y);
    if(x===w-1||!maskWorkspace[p+1])edge(x+1,y,x+1,y+1);
    if(y===h-1||!maskWorkspace[p+w])edge(x+1,y+1,x,y+1);
    if(x===0||!maskWorkspace[p-1])edge(x,y+1,x,y);
  }
  const loops=[];
  for(let e=0;e<edges.length;e++){
    if(edges[e].used)continue;
    const initial=edges[e].from,points=[];
    let current=e,done=false;
    for(let k=0;k<=edges.length;k++){
      const seg=edges[current];if(seg.used)break;seg.used=true;
      points.push({x:seg.from%stride,y:(seg.from/stride)|0});
      if(seg.to===initial){done=true;break;}
      const next=(startingAt.get(seg.to)||[]).find(i=>!edges[i].used);
      if(next===undefined)break;
      current=next;
    }
    if(done && points.length>=4)loops.push(points);
  }
  for(const p of region)maskWorkspace[p]=0;
  return loops;
}

function vectorizeCut(rgba,w,h,simplify=0.5){
  if(w<3||h<3)throw Error('Image trop petite.');
  const binary=toBinaryMask(rgba,w,h), minArea=Math.max(50,Math.round(w*h*0.0001));
  let regions=findEnclosedWhite(binary,w,h,minArea);
  const silhouetteFallback=regions.length===0;
  if(silhouetteFallback)regions=findBlackShapes(binary,w,h,minArea);
  if(!regions.length)throw Error('Aucune forme exploitable : recadrez et vérifiez le nettoyage.');
  const regionMask=new Uint8Array(w*h),paths=[];
  let contourCount=0;
  for(const region of regions){
    const loops=regionContours(region,w,h,regionMask);
    // In fallback mode, don't cut both edges of outline strokes:
    // only emit the largest exterior contour for each black component.
    const selected=silhouetteFallback ? loops.sort((a,b)=>b.length-a.length).slice(0,1) : loops;
    for(const points of selected){
      const reduced=simplifyClosed(points,Math.max(0,Number(simplify)*2.5));
      if(reduced.length<3)continue;
      const d=pathD(reduced,true);
      if(d){paths.push(`<path d="${d}"/>`);contourCount++;}
    }
  }
  if(!paths.length)throw Error('Aucun contour fermé trouvé. Vérifiez la fermeture du dessin.');
  return {
    svg:makeSvg(paths,w,h),
    paths:contourCount,
    closed:contourCount,
    open:0,
    warning:silhouetteFallback?'Aucune zone blanche intérieure fermée : contour extérieur des surfaces noires utilisé. Attention, vérifiez les doubles découpes et les coupures.':''
  };
}

// Zhang–Suen thinning, two alternating topology-preserving erosion phases.
function thinBinary(binary,w,h){
  const skel=new Uint8Array(binary), n=w*h;
  const marked=new Int32Array(n);
  let nChanged=1,iteration=0;
  while(nChanged && iteration++<90){
    nChanged=0;
    for(let pass=0;pass<2;pass++){
      let count=0;
      for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
          const i=y*w+x;if(!skel[i])continue;
          const a=skel[i-w],b=skel[i-w+1],c=skel[i+1],d=skel[i+w+1];
          const e=skel[i+w],f=skel[i+w-1],g=skel[i-1],j=skel[i-w-1];
          const neighbors=a+b+c+d+e+f+g+j;
          if(neighbors<2||neighbors>6)continue;
          const transitions=(!a&&b)+(!b&&c)+(!c&&d)+(!d&&e)+(!e&&f)+(!f&&g)+(!g&&j)+(!j&&a);
          if(transitions!==1)continue;
          if(pass===0){if(a*c*e||c*e*g)continue;}
          else {if(a*c*g||a*e*g)continue;}
          marked[count++]=i;
        }
      }
      for(let k=0;k<count;k++)skel[marked[k]]=0;
      nChanged+=count;
    }
  }
  return skel;
}

function buildSkeletonPaths(skel,w,h){
  const n=w*h,all=[];
  for(let i=0;i<n;i++)if(skel[i])all.push(i);
  const visit=new Uint8Array(n),degree=new Uint8Array(n);
  function neighbors(p){
    const x=p%w,y=(p/w)|0, out=[];
    for(let d=0;d<8;d++){
      const [dx,dy]=OFFSETS[d],xx=x+dx,yy=y+dy;
      if(xx<0||xx>=w||yy<0||yy>=h)continue;
      const next=yy*w+xx;if(!skel[next])continue;
      // Remove triangles in 8-neighbour graphs at elbow corners.
      if(dx&&dy&&(skel[y*w+xx]||skel[yy*w+x]))continue;
      out.push({p:next,d});
    }
    return out;
  }
  for(const p of all)degree[p]=neighbors(p).length;
  function take(start,edge){
    const chain=[start];let curr=start,e=edge,closed=false;
    for(let steps=0;steps<=all.length;steps++){
      const next=e.p;
      visit[curr]|=1<<e.d;visit[next]|=1<<opposite(e.d);
      chain.push(next);
      if(next===start){closed=true;break;}
      if(degree[next]!==2)break;
      const options=neighbors(next).filter(v=>!(visit[next]&(1<<v.d)));
      if(!options.length)break;
      curr=next;e=options[0];
    }
    return {chain,closed};
  }
  const paths=[];
  for(const p of all){
    if(degree[p]===2||degree[p]===0)continue;
    for(const e of neighbors(p))if(!(visit[p]&(1<<e.d)))paths.push(take(p,e));
  }
  for(const p of all){
    for(const e of neighbors(p))if(!(visit[p]&(1<<e.d)))paths.push(take(p,e));
  }
  return paths;
}

function vectorizeCenterline(rgba,w,h,simplify=0.5){
  if(w<3||h<3)throw Error('Image trop petite.');
  const skel=thinBinary(toBinaryMask(rgba,w,h),w,h);
  const traced=buildSkeletonPaths(skel,w,h),paths=[];
  let closed=0,open=0,ignored=0;
  const tol=Math.max(0,Number(simplify)*1.2);
  for(const trace of traced){
    const points=trace.chain.map(i=>({x:(i%w)+0.5,y:((i/w)|0)+0.5}));
    if(points.length<3){ignored++;continue;}
    // Ignore very short isolated branches, not long engraved outlines.
    if(!trace.closed && points.length<5){ignored++;continue;}
    const reduced=trace.closed ? simplifyClosed(points.slice(0,-1),tol) : simplifyOpen(points,tol);
    const d=pathD(reduced,trace.closed);
    if(!d)continue;
    paths.push(`<path d="${d}"/>`);
    if(trace.closed)closed++;else open++;
  }
  if(!paths.length)throw Error('Aucune ligne centrale détectée après nettoyage.');
  return {
    svg:makeSvg(paths,w,h),paths:paths.length,closed,open,ignored,
    warning:open?'Les lignes ouvertes conviennent à la gravure, mais pas à une découpe de formes fermées.':''
  };
}


// Troisième mode : trace les deux bords de chaque bande d'encre.
// En suivant les surfaces noires, on obtient à la fois le contour extérieur
// et le contour intérieur du trait épais (ainsi que d'éventuels trous).
function vectorizeDoubleContours(rgba,w,h,simplify=0.5){
  if(w<3||h<3)throw Error('Image trop petite.');
  const black=toBinaryMask(rgba,w,h);
  const minArea=Math.max(18,Math.round(w*h*0.00002));
  const regions=findBlackShapes(black,w,h,minArea);
  if(!regions.length)throw Error('Aucun trait noir exploitable après nettoyage.');
  const regionMask=new Uint8Array(w*h),paths=[];
  let loopsCount=0;
  for(const region of regions){
    // Conserver toutes les boucles des composantes noires : contrairement au
    // mode découpe, on ne supprime PAS le bord intérieur des traits.
    for(const loop of regionContours(region,w,h,regionMask)){
      const pts=simplifyClosed(loop,Math.max(0,Number(simplify)*2.5));
      if(pts.length<3)continue;
      const d=pathD(pts,true);
      if(d){paths.push(`<path d="${d}"/>`);loopsCount++;}
    }
  }
  if(!paths.length)throw Error('Aucun contour double détecté.');
  return {
    svg:makeSvg(paths,w,h),paths:loopsCount,closed:loopsCount,open:0,
    warning:'Les deux côtés des traits sont vectorisés : attention aux doubles passages du laser en mode découpe.'
  };
}

return {vectorizeCut, vectorizeCenterline, vectorizeDoubleContours};
})();
const {createCurveEditor} = (() => {


const NS='http://www.w3.org/2000/svg';
const el=(tag,attributes={})=>{
  const e=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attributes))e.setAttribute(k,String(v));
  return e;
};
const coord=(e,svg)=>{
  const m=svg?.getScreenCTM();
  if(!m)return null;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
  return {x:p.x,y:p.y};
};

function createCurveEditor({stage,getSvg,onCommit,onState,onMessage,getIntensity,isLinked}){
  let enabled=false,paths=[],sourceNodes=[],overlay=null;
  let selected=-1,selectedNode=-1,drag=null,history=[],original=null;

  function state(){
    onState({enabled,selected,node:selectedNode,undo:history.length>0,
      nodeCount:selected>=0?paths[selected].nodes.length:0,pathCount:paths.length});
  }
  function before(){history.push(clonePaths(paths));if(history.length>35)history.shift();}
  function svgScale(){
    const m=getSvg()?.getScreenCTM();
    return m?Math.max(.00001,Math.hypot(m.a,m.b)):1;
  }
  function setSourcePaths(){
    const svg=getSvg();if(!svg)return false;
    sourceNodes=Array.from(svg.querySelectorAll('path')).filter(e=>!e.closest('.curve-editor-overlay'));
    try {paths=sourceNodes.map(node=>parsePathData(node.getAttribute('d')||''));}
    catch(err){onMessage('Impossible d’éditer ce chemin SVG : '+err.message);return false;}
    original=clonePaths(paths);history=[];selected=-1;selectedNode=-1;
    return paths.length>0;
  }
  function render(){
    if(!enabled)return;
    const svg=getSvg();if(!svg)return;
    if(overlay)overlay.remove();
    overlay=el('g',{'class':'curve-editor-overlay'});
    const scale=svgScale(), width=Math.max(.1,14/scale),r=Math.max(.15,5/scale);
    paths.forEach((model,i)=>{
      if(i===selected){
        overlay.append(el('path',{d:pathData(model),class:'curve-editor-highlight',
          'stroke-width':Math.max(.1,2.5/scale),'vector-effect':'non-scaling-stroke'}));
      }
      overlay.append(el('path',{d:pathData(model),class:'curve-editor-hit',
        'stroke-width':width,'data-edit-kind':'path','data-path':i}));
    });
    if(selected>=0){
      const nodes=paths[selected].nodes;
      const step=Math.max(1,Math.ceil(nodes.length/220));
      nodes.forEach((n,i)=>{
        if(i%step!==0 && i!==selectedNode)return;
        if(i===selectedNode){
          for(const type of ['in','out'])if(n[type]){
            overlay.append(el('line',{x1:n.x,y1:n.y,x2:n[type].x,y2:n[type].y,
              class:'curve-editor-tangent','stroke-width':Math.max(.1,1/scale)}));
            overlay.append(el('circle',{cx:n[type].x,cy:n[type].y,r:r*.9,
              class:'curve-editor-handle','data-edit-kind':type,'data-node':i}));
          }
        }
        overlay.append(el('circle',{cx:n.x,cy:n.y,r:i===selectedNode?r*1.2:r,
          class:i===selectedNode?'curve-editor-node is-selected':'curve-editor-node',
          'data-edit-kind':'node','data-node':i}));
      });
    }
    svg.append(overlay);
    state();
  }
  function sync(commit=true){
    sourceNodes.forEach((node,i)=>node.setAttribute('d',pathData(paths[i])));
    if(commit)onCommit(paths.map(pathData));
    render();
  }
  function selectPath(i){
    if(i<0||i>=paths.length)return;
    selected=i;selectedNode=-1;render();
  }
  function enable(next){
    if(enabled===next)return enabled;
    if(next){if(!setSourcePaths()){onMessage('Aucun chemin éditable dans cet aperçu.');return false;}}
    enabled=next;
    if(!next){drag=null;overlay?.remove();overlay=null;}
    else render();
    state();
    return enabled;
  }
  function pointerDown(e){
    if(!enabled||e.button!==0)return false;
    const t=e.target.closest?.('[data-edit-kind]');
    if(!t)return false;
    const kind=t.dataset.editKind;
    if(kind==='path'){
      selectPath(Number(t.dataset.path));
      return true;
    }
    if(selected<0)return false;
    const index=Number(t.dataset.node);
    if(!Number.isInteger(index)||index<0||index>=paths[selected].nodes.length)return false;
    selectedNode=index;
    const start=coord(e,getSvg());if(!start)return false;
    before();
    drag={id:e.pointerId,kind,index,start,initial:clonePaths(paths),moved:false};
    stage.setPointerCapture(e.pointerId);render();state();return true;
  }
  function pointerMove(e){
    if(!drag||!enabled||drag.id!==e.pointerId)return false;
    const p=coord(e,getSvg());if(!p)return true;
    const delta={x:p.x-drag.start.x,y:p.y-drag.start.y};
    if(Math.abs(delta.x)+Math.abs(delta.y)>0.001)drag.moved=true;
    const initial=drag.initial[selected].nodes[drag.index];
    const node=paths[selected].nodes[drag.index];
    if(drag.kind==='node'){
      node.x=initial.x+delta.x;node.y=initial.y+delta.y;
      node.in=initial.in?{x:initial.in.x+delta.x,y:initial.in.y+delta.y}:null;
      node.out=initial.out?{x:initial.out.x+delta.x,y:initial.out.y+delta.y}:null;
    }else {
      node[drag.kind]={x:initial[drag.kind].x+delta.x,y:initial[drag.kind].y+delta.y};
      if(isLinked()){
        const opposite=drag.kind==='in'?'out':'in';
        node[opposite]={x:2*node.x-node[drag.kind].x,y:2*node.y-node[drag.kind].y};
      }
    }
    sync(false);return true;
  }
  function pointerUp(e){
    if(!drag||drag.id!==e.pointerId)return false;
    if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
    const changed=drag.moved;drag=null;
    if(changed)sync(true);
    else {history.pop();render();}
    return true;
  }
  function action(fn,message){
    if(!enabled||selected<0)return;
    before();fn(paths[selected]);selectedNode=-1;sync(true);
    if(message)onMessage(message);
  }
  function smoothSelected(){
    action(path=>smoothPath(path,getIntensity()),'Courbes de Bézier créées. Les pointes marquées sont conservées.');
  }
  function reduceSelected(){
    action(path=>{
      reducePathNodes(path,Math.max(.3,getIntensity()*5));
      smoothPath(path,getIntensity());
    },'Points rapprochés simplifiés, puis courbes de Bézier lissées.');
  }
  function smoothSelectedNode(){
    if(selectedNode<0)return;
    const i=selectedNode;
    before();smoothNode(paths[selected],i,getIntensity());sync(true);
    onMessage('Nœud lissé : les poignées de Bézier sont visibles et déplaçables.');
  }
  function cornerSelectedNode(){
    if(selectedNode<0)return;
    const i=selectedNode;
    before();makeCorner(paths[selected],i);sync(true);
    onMessage('Nœud transformé en angle.');
  }
  function deleteSelectedNode(){
    if(selectedNode<0)return;
    const path=paths[selected];
    if(path.nodes.length<=(path.closed?3:2)){onMessage('Pas assez de nœuds pour supprimer ce point.');return;}
    before();path.nodes.splice(selectedNode,1);selectedNode=-1;sync(true);
    onMessage('Nœud supprimé.');
  }
  function undo(){
    if(!enabled||!history.length)return;
    paths=history.pop();selectedNode=-1;
    if(selected>=paths.length)selected=paths.length-1;
    sync(true);
    onMessage('Dernière modification annulée.');
  }
  function reset(){
    if(!enabled||!original)return;
    before();paths=clonePaths(original);selectedNode=-1;sync(true);
    onMessage('Courbes rétablies à leur état avant l’édition.');
  }
  function close(){enable(false);paths=[];sourceNodes=[];history=[];original=null;}
  return {enable,close,refresh:render,pointerDown,pointerMove,pointerUp,
    smoothSelected,reduceSelected,smoothSelectedNode,cornerSelectedNode,deleteSelectedNode,undo,reset};
}

return {createCurveEditor};
})();
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
ready=true;
status('Application prête : 3 modes de vectorisation et éditeur Bézier opérationnels (traitement local).');
updateButtons();
