/* Géométrie des courbes pour l'éditeur SVG. Pas de dépendance externe. */
const fmt = n => Number((Number.isFinite(n) ? n : 0).toFixed(2)).toString();
const pos = (x,y) => ({x:Number(x), y:Number(y)});
const copy = p => p ? pos(p.x,p.y) : null;
export function clonePaths(paths) {
  return paths.map(path=>({closed:path.closed,nodes:path.nodes.map(n=>({x:n.x,y:n.y,in:copy(n.in),out:copy(n.out)}))}));
}

// Nos vectoriseurs émettent M/L/Z. Le parseur accepte aussi H/V/C/Q/S
// afin de pouvoir recharger les courbes cubiques après édition.
export function parsePathData(d) {
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
export function pathData(path) {
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
export function smoothNode(path,index,intensity=0.8){
  if(index<0||index>=path.nodes.length)return false;
  const h=handlesForNode(path.nodes,index,path.closed,intensity,false);
  path.nodes[index].in=h.in;path.nodes[index].out=h.out;
  return true;
}
export function makeCorner(path,index){
  if(index<0||index>=path.nodes.length)return false;
  path.nodes[index].in=null;path.nodes[index].out=null;
  return true;
}
export function smoothPath(path,intensity=0.8){
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
export function reducePathNodes(path,tolerance=2){
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
