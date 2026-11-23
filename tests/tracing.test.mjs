import test from 'node:test';
import assert from 'node:assert/strict';
import { vectorizeCut, vectorizeCenterline, vectorizeDoubleContours, thinBinary } from '../web/trace-modes.js';

function bitmap(w,h){const b=new Uint8Array(w*h*4);for(let i=0;i<b.length;i+=4){b[i]=b[i+1]=b[i+2]=b[i+3]=255;}return b;}
function dot(b,w,h,x,y,r=1){
  for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++){
    if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const i=(yy*w+xx)*4;b[i]=b[i+1]=b[i+2]=0;
  }
}
function line(b,w,h,a,c,r=1){
  let [x0,y0]=a,[x1,y1]=c,dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx+dy;
  while(true){dot(b,w,h,x0,y0,r);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}
}
function poly(b,w,h,pts,closed=true,r=1){for(let i=1;i<pts.length;i++)line(b,w,h,pts[i-1],pts[i],r);if(closed)line(b,w,h,pts.at(-1),pts[0],r);}

test('découpe: rectangle dessiné à la main → exactement un chemin fermé, sans remplissage',()=>{
 const w=180,h=150,b=bitmap(w,h);poly(b,w,h,[[25,30],[150,30],[150,120],[25,120]],true,2);
 const v=vectorizeCut(b,w,h,.5);
 assert.equal(v.closed,1);assert.equal(v.open,0);assert.match(v.svg,/ Z"\/>/);assert.match(v.svg,/fill="none"/);assert.equal(v.warning,'');
});
test('découpe: silhouette noire pleine → contour extérieur avec avertissement',()=>{
 const w=90,h=90,b=bitmap(w,h);for(let y=30;y<60;y++)for(let x=20;x<70;x++){let i=(y*w+x)*4;b[i]=b[i+1]=b[i+2]=0;}
 const v=vectorizeCut(b,w,h,.4);assert.equal(v.closed,1);assert.match(v.warning,/contour extérieur/);
});
test('gravure: ligne ouverte → une ligne centrale SVG sans remplissage ni fermeture',()=>{
 const w=140,h=120,b=bitmap(w,h);line(b,w,h,[15,55],[112,55],2);
 const v=vectorizeCenterline(b,w,h,.5);
 assert.ok(v.paths>0);assert.ok(v.open>0);assert.match(v.svg,/fill="none"/);assert.doesNotMatch(v.svg,/ Z"\/>/);
});
test('gravure: boucle rectangulaire → trait central parcourant la boucle',()=>{
 const w=140,h=130,b=bitmap(w,h);poly(b,w,h,[[20,30],[112,30],[112,96],[20,96]],true,2);
 const v=vectorizeCenterline(b,w,h,.5);assert.ok(v.closed>=1,`found ${v.closed} closed and ${v.open} open`);
});
test('découpe: sapin fermé → contour fermé exploitable',()=>{
 const w=180,h=200,b=bitmap(w,h);
 const tree=[[90,12],[73,34],[85,34],[57,65],[75,65],[40,99],[69,97],[42,130],[76,125],[76,178],[105,178],[105,125],[137,130],[111,97],[141,99],[113,65],[130,65],[96,34],[107,34]];
 poly(b,w,h,tree,true,2);
 const v=vectorizeCut(b,w,h,.5);
 assert.equal(v.closed,1);assert.equal(v.open,0);
});
test('squelettisation conserve le trait central d’une épaisse barre',()=>{
 const w=70,h=60,mask=new Uint8Array(w*h);
 for(let y=20;y<40;y++)for(let x=8;x<60;x++)mask[y*w+x]=1;
 const out=thinBinary(mask,w,h);const num=out.reduce((a,x)=>a+x,0);assert.ok(num>15&&num<120,`pixel count ${num}`);
});


test('deux bords: un cadre dessiné génère des boucles interne ET externe',()=>{
 const w=180,h=150,b=bitmap(w,h);poly(b,w,h,[[25,30],[150,30],[150,120],[25,120]],true,3);
 const result=vectorizeDoubleContours(b,w,h,.5);
 assert.equal(result.closed,2);assert.equal(result.open,0);
 assert.equal((result.svg.match(/<path /g)||[]).length,2);
 assert.match(result.warning,/deux côtés/);
});
test('deux bords: tache pleine génère une seule boucle',()=>{
 const w=90,h=90,b=bitmap(w,h);
 for(let y=30;y<60;y++)for(let x=20;x<70;x++){const k=4*(y*w+x);b[k]=b[k+1]=b[k+2]=0;}
 const result=vectorizeDoubleContours(b,w,h,.5);
 assert.equal(result.closed,1);
});
