import {parsePathData,pathData,clonePaths,smoothPath,smoothNode,makeCorner,reducePathNodes} from './bezier-model.js';

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

export function createCurveEditor({stage,getSvg,onCommit,onState,onMessage,getIntensity,isLinked}){
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
