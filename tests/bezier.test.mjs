import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePathData,pathData,smoothPath,smoothNode,makeCorner,clonePaths,reducePathNodes} from '../web/bezier-model.js';
test('parcours SVG : M L Z devient des nœuds fermés',()=>{
 const p=parsePathData('M 10 10 L 30 10 L 30 40 L 10 40 Z');
 assert.equal(p.nodes.length,4);assert.equal(p.closed,true);
 assert.match(pathData(p),/ Z$/);
});
test('conversion en Bézier : une polyligne douce génère des C',()=>{
 const p=parsePathData('M 0 0 L 10 4 L 20 7 L 30 9 L 40 10');
 smoothPath(p,.9);
 assert.match(pathData(p),/ C /);
 assert.equal(parsePathData(pathData(p)).nodes.length,5);
});
test('lissage protège la pointe aiguë d’un sapin',()=>{
 const p=parsePathData('M 10 60 L 20 40 L 30 10 L 40 40 L 50 60');
 smoothPath(p,.8);
 assert.equal(p.nodes[2].in,null);assert.equal(p.nodes[2].out,null);
});
test('lissage d’un nœud et conversion en angle',()=>{
 const p=parsePathData('M 0 0 L 10 0 L 20 10');
 smoothNode(p,1,.8);
 assert.ok(p.nodes[1].in);assert.ok(p.nodes[1].out);
 assert.match(pathData(p),/ C /);
 makeCorner(p,1);assert.equal(p.nodes[1].in,null);assert.equal(p.nodes[1].out,null);
});
test('édition d’une courbe cubique : lecture aller-retour des poignées',()=>{
 const d='M 0 0 C 3 4 7 4 10 0 L 20 0';
 const p=parsePathData(d);
 assert.equal(p.nodes[0].out.x,3);assert.equal(p.nodes[1].in.x,7);
 const q=parsePathData(pathData(p));assert.equal(q.nodes[0].out.x,3);
});
test('réduction de points d’une courbe quasi droite',()=>{
 const p=parsePathData('M 0 0 L 2 0.1 L 4 0.05 L 6 0 L 8 0.1 L 10 0');
 const copy=clonePaths([p]);
 reducePathNodes(p,.4);assert.ok(p.nodes.length<copy[0].nodes.length);
 assert.equal(p.nodes.at(-1).x,10);
});
