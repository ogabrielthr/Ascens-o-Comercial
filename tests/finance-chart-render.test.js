const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const timers=[];
 class E{constructor(tag,props={}){this.tag=tag;this.attrs=props;this.children=[];this.parent=null;this.style=props.style||{};this.clientWidth=640;this.nodeType=1;const classes=new Set((props.class||'').split(' '));this.classList={add:x=>classes.add(x),contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}};}appendChild(x){if(x==null||x===false)return;if(Array.isArray(x))return x.forEach(y=>this.appendChild(y));this.children.push(x);if(x.nodeType)x.parent=this;return x;}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}addEventListener(){}setAttribute(k,v){this.attrs[k]=v;}getTotalLength(){return 1000;}}
 const create=(tag,...args)=>{let p={};if(args[0]&&typeof args[0]==='object'&&!args[0].nodeType&&!Array.isArray(args[0]))p=args.shift();const parts=tag.split('.'),e=new E(parts[0],{...p,class:[p.class||'',...parts.slice(1)].join(' ')});args.flat(Infinity).forEach(x=>e.appendChild(x));return e;},walk=n=>[n,...n.children.filter(x=>x?.nodeType).flatMap(walk)];
 const AGIR={dom:{h:create,s:create,clear:n=>n.children=[],qsa:(selector,n)=>walk(n).slice(1).filter(e=>selector.split(',').some(s=>s[0]==='.'?e.classList.contains(s.slice(1)):e.tag===s))},fmt:{numShort:v=>String(v)},onPageDispose(){}};
 vm.runInNewContext(fs.readFileSync('assets/js/core/charts.js','utf8'),{window:{AGIR},document:{createElementNS:(_,tag)=>new E(tag),addEventListener(){},removeEventListener(){},hidden:false},ResizeObserver:class{observe(){}disconnect(){}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console});
 const host=create('div');return {AGIR,host,walk,draw(options){AGIR.charts.area(host,options);while(timers.length)timers.shift()();return walk(host);}};
}
test('signed chart bars stay inside the plot and straddle their zero baseline',()=>{const app=setup(),nodes=app.draw({height:260,labels:['Jan','Fev'],legend:false,series:[{name:'Resultado',kind:'bar',values:[-100,50]}]}),bars=nodes.filter(n=>n.classList.contains('ch-bar'));assert.equal(bars.length,2);for(const r of bars){assert.ok(r.attrs.y>=14);assert.ok(r.attrs.y+r.attrs.height<=234.001);assert.ok(r.attrs.x>=46);assert.ok(r.attrs.x+r.attrs.width<=628);}assert.ok(bars[0].attrs.y>bars[1].attrs.y);const labels=nodes.filter(n=>n.tag==='text').map(n=>Number(n.attrs.text));assert.ok(labels.some(v=>v<0));});
test('entirely negative lines and areas remain visible rather than escaping below the chart',()=>{const app=setup(),nodes=app.draw({height:260,smooth:false,labels:['Jan','Fev'],legend:false,series:[{name:'Saldo',kind:'area',values:[-200,-100]}]});for(const p of nodes.filter(n=>n.classList.contains('ch-pt')))assert.ok(p.attrs.cy>=14&&p.attrs.cy<=234);const area=nodes.find(n=>n.classList.contains('ch-area'));assert.match(area.attrs.d,/ 14 Z$/);});
test('projected bars retain their dashed stroke and accessible toggle state',()=>{const app=setup(),nodes=app.draw({height:260,labels:['Jan'],series:[{name:'Realizado',kind:'bar',values:[100]},{name:'Projetado',kind:'bar',projected:true,values:[160]}]}),bars=nodes.filter(n=>n.classList.contains('ch-bar'));assert.equal(bars[1].attrs['stroke-dasharray'],'3 2');assert.equal(bars[1].attrs['fill-opacity'],.12);const buttons=nodes.filter(n=>n.tag==='button');assert.equal(buttons.length,2);assert.equal(buttons[1].attrs['aria-pressed'],'true');});

test('glass charts resolve every gradient locally and use new identifiers for distinct instances',()=>{
 const app=setup(),options={glass:true,smooth:'monotone',height:260,labels:['Jan','Fev','Mar'],series:[{name:'Realizado',kind:'bar',values:[100,50,140]},{name:'Projetado',kind:'bar',projected:true,values:[120,60,180]},{name:'Saldo',kind:'area',values:[20,-50,90]}]},nodes=app.draw(options);
 const ids=new Set(nodes.filter(n=>n.attrs.id).map(n=>n.attrs.id));
 for(const node of nodes)for(const key of ['fill','stroke']){const match=String(node.attrs[key]||'').match(/^url\(#(.+)\)$/);if(match)assert.ok(ids.has(match[1]),'unresolved '+match[1]);}
 const bars=nodes.filter(n=>n.classList.contains('ch-bar'));
 assert.match(bars[0].attrs.fill,/^url\(#/);assert.equal(bars[3].attrs['stroke-dasharray'],'3 2');assert.equal(bars[3].attrs['fill-opacity'],.12);
 const next=app.draw(options).filter(n=>n.attrs.id).map(n=>n.attrs.id);assert.ok(next.every(id=>!ids.has(id)));
});

test('monotone financial curves preserve flat spans and keep control points within each observed interval',()=>{
 const {AGIR}=setup();
 for(const values of [[0,100,0,0,-100,0],[20,25,200,201,-30,-30],[-200,-100,-150,-10],[0,0,0,0]]){
  const pts=values.map((v,i)=>[i*20,v]),d=AGIR.charts.monotonePath(pts),segments=Array.from(d.matchAll(/C([^C]+)/g));
  assert.equal(segments.length,values.length-1);
  segments.forEach((match,i)=>{const coords=match[1].trim().split(/[ ,]+/).map(Number),lo=Math.min(values[i],values[i+1]),hi=Math.max(values[i],values[i+1]);assert.ok(coords.every(Number.isFinite));for(const y of [coords[1],coords[3]])assert.ok(y>=lo-1e-9&&y<=hi+1e-9,'invented extreme '+y);assert.equal(coords[4],pts[i+1][0]);assert.equal(coords[5],pts[i+1][1]);});
 }
 assert.equal(AGIR.charts.monotonePath([]),'');assert.equal(AGIR.charts.monotonePath([[10,-5]]),'M10 -5');
});

test('negative glass areas fade toward zero while signed values and their baseline remain intact',()=>{
 const app=setup(),nodes=app.draw({glass:true,smooth:'monotone',height:260,labels:['Jan','Fev'],legend:false,series:[{name:'Saldo',kind:'area',values:[-200,-100]}]});
 const area=nodes.find(n=>n.classList.contains('ch-area')),id=area.attrs.fill.match(/url\(#(.+)\)/)[1],gradient=nodes.find(n=>n.attrs.id===id);
 assert.equal(gradient.attrs.y1,1);assert.equal(gradient.attrs.y2,0);assert.match(area.attrs.d,/ 14 Z$/);
 for(const p of nodes.filter(n=>n.classList.contains('ch-pt')))assert.ok(p.attrs.cy>=14&&p.attrs.cy<=234);
});
