/* Vectorisation Laser V9 — algorithms developed for this application.
 * No code imported from KizamuBeam. SVG coordinates are in source-image pixels.
 * Output is intentionally unfilled, with explicit M/L/Z commands.
 */
const OFFSETS = [
  [-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]
];
const opposite = i => 7 - i;
const F = number => Number(number.toFixed(2)).toString();

export function toBinaryMask(rgba, width, height) {
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

export function vectorizeCut(rgba,w,h,simplify=0.5){
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
export function thinBinary(binary,w,h){
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

export function vectorizeCenterline(rgba,w,h,simplify=0.5){
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
