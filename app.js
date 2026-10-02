(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var NS='http://www.w3.org/2000/svg';
var state={bots:null,facts:'',notes:[],sel:null};

function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function get(u,type){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(u+' '+r.status);return type==='json'?r.json():r.text()})}

/* ---------- tabs ---------- */
function showTab(name){
  if(!$('#tab-'+name))name='map';
  $$('.panel').forEach(function(p){p.hidden=p.id!=='tab-'+name});
  $$('.tabs button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===name)});
  if(location.hash!=='#'+name)history.replaceState(null,'','#'+name);
  window.scrollTo(0,0);
}
$$('.tabs button').forEach(function(b){b.addEventListener('click',function(){showTab(b.dataset.tab)})});

/* ---------- tiny markdown ---------- */
function inline(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>');
}
function md(src){
  src=src.replace(/<!--[\s\S]*?-->/g,'');
  var out=[],list=null,para=[],pills=false;
  function flushP(){if(para.length){out.push('<p>'+inline(para.join(' '))+'</p>');para=[]}}
  function flushL(){if(list){out.push('</ul>');list=null}}
  src.split('\n').forEach(function(line){
    var m;
    if((m=/^(#{1,3})\s+(.*)/.exec(line))){
      flushP();flushL();var n=m[1].length;
      pills=/customers/i.test(m[2]);
      out.push('<h'+n+'>'+inline(m[2])+'</h'+n+'>');
    }else if((m=/^\s*-\s+(.*)/.exec(line))){
      flushP();
      if(!list){out.push('<ul'+(pills&&!/\*\*/.test(m[1])&&m[1].length<40?' class="pills"':'')+'>');list=1}
      out.push('<li>'+inline(m[1])+'</li>');
    }else if(!line.trim()){flushP();flushL()}
    else para.push(line.trim());
  });
  flushP();flushL();
  return out.join('\n');
}

/* ---------- bot map ---------- */
function byId(id){return state.bots.bots.filter(function(b){return b.id===id})[0]}
function laneOf(b){return b.status==='new'&&b.lane==='shop'?'shop':b.lane}
function el(n,a,t){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);if(t!=null)e.textContent=t;return e}

function drawDiagram(){
  var d=state.bots,W=400,H=730,svg=el('svg',{viewBox:'0 0 '+W+' '+H,role:'group','aria-label':'Bot map diagram'});
  var shop=d.bots.filter(function(b){return b.lane==='shop'});
  var draft=d.bots.filter(function(b){return b.lane==='draft'});
  var grok=byId('grok'),pm=byId('projects');
  svg.appendChild(el('path',{'class':'spine',d:'M200 62 V670'}));
  // hub
  svg.appendChild(el('rect',{'class':'hubbox',x:100,y:6,width:200,height:60,rx:16}));
  svg.appendChild(el('text',{'class':'hubt',x:200,y:36},d.hub.name));
  svg.appendChild(el('text',{'class':'hubs',x:200,y:56},'shared facts + notes'));
  function node(b,x,y,w,h,side){
    var g=el('g',{'class':'node '+b.lane+(b.status==='new'?' new':''),'data-id':b.id,tabindex:0,role:'button','aria-label':b.name+'. '+b.job});
    g.appendChild(el('rect',{x:x,y:y,width:w,height:h,rx:12}));
    var label=b.name,tag=b.status==='new'?'NEW':b.status==='waiting'?'WAITING':'';
    g.appendChild(el('text',{x:x+w/2,y:y+(tag?h/2-3:h/2+5),'text-anchor':'middle'},label));
    if(tag)g.appendChild(el('text',{'class':'tag',x:x+w/2,y:y+h/2+13,'text-anchor':'middle'},tag));
    g.addEventListener('click',function(){select(b.id,true)});
    g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();select(b.id,true)}});
    return g;
  }
  // grok on the spine
  svg.appendChild(node(grok,120,92,160,48,0));
  svg.appendChild(el('path',{'class':'spine',d:'M200 66 V92'}));
  // lane headings
  svg.appendChild(el('text',{'class':'laneh',x:8,y:176},'Shop lane'));
  svg.appendChild(el('text',{'class':'laneh',x:392,y:176,'text-anchor':'end'},'Draft Night lane'));
  var y0=190,step=56,h=44,w=172;
  var stubs=document.createDocumentFragment(),nodes=document.createDocumentFragment();
  shop.forEach(function(b,i){var y=y0+i*step;
    stubs.appendChild(el('path',{'class':'stub',d:'M'+(6+w)+' '+(y+h/2)+' H200',stroke:'#2b3b4f'}));
    nodes.appendChild(node(b,6,y,w,h))});
  draft.forEach(function(b,i){var y=y0+i*step;
    stubs.appendChild(el('path',{'class':'stub',d:'M200 '+(y+h/2)+' H'+(394-w),stroke:'#2b3b4f'}));
    nodes.appendChild(node(b,394-w,y,w,h))});
  svg.appendChild(el('path',{'class':'spine',d:'M200 140 V170'}));
  svg.appendChild(stubs);svg.appendChild(nodes);
  svg.appendChild(node(pm,100,672,200,48));
  var box=$('#diagram');box.innerHTML='';box.appendChild(svg);
}

function chip(id){var b=byId(id);return '<button class="chip '+b.lane+'" data-go="'+b.id+'">'+esc(b.name)+'</button>'}
function badge(b){return b.status==='new'?'<span class="badge new">New</span>':b.status==='waiting'?'<span class="badge waiting">Waiting</span>':''}

function drawCards(){
  var d=state.bots,html='';
  [{id:'shop',label:'Shop lane',sub:'SC Precision Deburring'},{id:'draft',label:'Draft Night lane',sub:'Fantasy football app'},{id:'core',label:'Core',sub:'Coordinator and project tracker'}].forEach(function(L){
    var list=d.bots.filter(function(b){return b.lane===L.id});
    html+='<div class="lane"><h2>'+L.label+' <small>'+L.sub+'</small></h2>';
    list.forEach(function(b){
      html+='<article class="card bot '+b.lane+'" id="bot-'+b.id+'" data-id="'+b.id+'"><h3>'+esc(b.name)+' '+badge(b)+'</h3><p>'+esc(b.job)+'</p>'+
      '<p class="handlabel">Hands off to</p><div class="chips">'+b.handoff.map(chip).join('')+'</div></article>';
    });
    html+='</div>';
  });
  $('#cards').innerHTML=html;
}

function select(id,scroll){
  state.sel=id;var b=byId(id);
  var targets=b.handoff;
  $$('.node').forEach(function(n){
    var nid=n.dataset.id;
    n.classList.toggle('sel',nid===id);
    n.classList.toggle('tgt',targets.indexOf(nid)>-1);
    n.classList.toggle('dim',nid!==id&&targets.indexOf(nid)<0);
  });
  $$('.bot').forEach(function(c){c.classList.toggle('sel',c.dataset.id===id)});
  var from=state.bots.bots.filter(function(x){return x.handoff.indexOf(id)>-1});
  $('#detail').innerHTML='<h3>'+esc(b.name)+' '+badge(b)+'</h3><p>'+esc(b.job)+'</p>'+
    '<p class="handlabel">Hands off to (green dashed)</p><div class="chips">'+targets.map(chip).join('')+'</div>'+
    '<p class="handlabel">Receives from</p><div class="chips">'+(from.length?from.map(function(x){return chip(x.id)}).join(''):'<span class="muted">Nobody. It starts work on its own.</span>')+'</div>'+
    '<p><button class="chip" data-clear="1">Clear selection</button></p>';
}
function clearSel(){
  state.sel=null;
  $$('.node').forEach(function(n){n.classList.remove('sel','tgt','dim')});
  $$('.bot').forEach(function(c){c.classList.remove('sel')});
  $('#detail').innerHTML='<h3>Pick a bot</h3><p class="muted">Tap any bot in the diagram or the list. You will see who it hands off to and who hands off to it.</p>';
}
document.addEventListener('click',function(e){
  var c=e.target.closest&&e.target.closest('[data-go]');
  if(c){select(c.dataset.go);var d=$('#detail');if(window.innerWidth<900)d.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(e.target.closest&&e.target.closest('[data-clear]'))clearSel();
});

/* ---------- facts ---------- */
function drawFacts(){$('#facts').innerHTML=md(state.facts)}

/* ---------- notes ---------- */
function drawNotes(){
  var list=state.notes.slice().sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:0});
  $('#notes').innerHTML=list.map(function(n){
    var text=n.text;
    return '<li><time datetime="'+esc(n.date)+'">'+esc(n.date)+'</time><span class="who">'+esc(n.author||'')+'</span><p>'+esc(text)+'</p>'+
      (n.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('')+'</li>';
  }).join('')||'<li>No notes yet.</li>';
}

/* ---------- context pack ---------- */
function pack(){
  var t=[];
  t.push('SHOP BRAIN CONTEXT PACK');
  t.push('Generated: '+new Date().toISOString().slice(0,10));
  t.push('Read this first. Treat it as ground truth. Do not invent facts beyond it.');
  t.push('');
  t.push('=== FACTS ===');
  t.push(state.facts.replace(/<!--[\s\S]*?-->/g,'').replace(/\*\*/g,'').trim());
  t.push('');
  t.push('=== BOTS (name: job. hands off to) ===');
  state.bots.bots.forEach(function(b){
    t.push('- ['+b.lane+'] '+b.name+': '+b.job+' Hands off to: '+b.handoff.map(function(i){return byId(i).name}).join(', ')+'.');
  });
  t.push('');
  t.push('=== NOTES (newest first) ===');
  state.notes.slice().sort(function(a,b){return a.date<b.date?1:-1}).forEach(function(n){
    t.push('- '+n.date+' ('+(n.author||'unknown')+'): '+n.text);
  });
  return t.join('\n');
}
function copyText(s){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(s);
  return new Promise(function(res,rej){
    var ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy')?res():rej()}catch(e){rej(e)}ta.remove();
  });
}
$('#copy').addEventListener('click',function(){
  var s=pack(),m=$('#copied');
  copyText(s).then(function(){m.textContent='Copied! Paste it into your AI chat.'},function(){
    m.textContent='Could not copy automatically. Open "Preview the text" and copy it by hand.';
    $('#pack').parentNode.open=true;
  });
});

/* ---------- boot ---------- */
Promise.all([get('data/bots.json','json'),get('data/facts.md'),get('data/notes.json','json')]).then(function(r){
  state.bots=r[0];state.facts=r[1];state.notes=r[2].notes||[];
  drawDiagram();drawCards();clearSel();drawFacts();drawNotes();
  $('#pack').textContent=pack();
  var latest=state.notes.map(function(n){return n.date}).sort().pop();
  $('#stamp').textContent=latest?'last note '+latest:'';
  showTab((location.hash||'#map').slice(1));
}).catch(function(e){
  var m=$('#loaderr');m.hidden=false;
  m.textContent='Could not load the data files ('+e.message+'). If you opened index.html straight from disk, serve the folder instead: run "python3 -m http.server" inside it and open http://localhost:8000.';
});
})();
