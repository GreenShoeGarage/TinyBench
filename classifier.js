/* TinyBench v1.0.0 — deterministic sensor features and compact neural networks. MIT. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./dsp.js'):root.TBDSP);if(typeof module==='object'&&module.exports)module.exports=api;else root.TBClassifier=api;})(typeof self!=='undefined'?self:globalThis,function(DSP){
  'use strict';
  const VERSION='1.0.0', FEATURES=['mean','std','rms','min','max','mean Δ'];
  const clone=o=>JSON.parse(JSON.stringify(o));
  function rng(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function shuffle(a,random){for(let i=a.length-1;i>0;i--){let j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function insist(condition,message){if(!condition)throw new Error(message);}
  const features=DSP.features;
  function validateConfig(c){
    insist(c&&(DSP.kind(c)==='audio'?[512,1024,2048,4096,8192,16384]:[16,32,64,128,256]).includes(c.window),'Choose a supported window for this feature extractor.');insist(['stats','spectral','audio'].includes(DSP.kind(c)),'Unknown feature extractor.');
    insist([0,.5].includes(c.overlap),'Overlap must be 0 or 50%.');
    insist([0,12,24].includes(c.hidden),'Choose a linear model, 12 neurons, or 24 neurons.');
    insist(Number.isInteger(c.epochs)&&c.epochs>=10&&c.epochs<=400,'Use 10–400 epochs.');
    insist(Number.isFinite(c.rate)&&c.rate>=.0001&&c.rate<=.1,'Learning rate must be 0.0001–0.1.');
    insist(Number.isInteger(c.seed)&&c.seed>=0&&c.seed<=2147483647,'Seed must be a nonnegative 32-bit integer.');
  }
  function validateProject(p){
    insist(p&&p.schema===1&&p.app==='TinyBench','This is not a supported TinyBench schema-1 project.');
    insist(typeof p.name==='string'&&p.name.length<=120,'Project name is invalid.');
    insist(Array.isArray(p.axes)&&p.axes.length>0&&p.axes.length<=8,'Use 1–8 sensor channels.');
    const names=new Set();for(const a of p.axes){insist(a&&typeof a.name==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(a.name)&&!names.has(a.name),'Channel names must be unique simple names, e.g. ax, temperature.');names.add(a.name);insist(typeof a.unit==='string'&&a.unit.length<=20,'Units must be short text.');}
    insist(Number.isFinite(p.sampleRate)&&p.sampleRate>=1&&p.sampleRate<=(DSP.kind(p.config)==='audio'?16000:1000),'Invalid sample rate for this project.');
    validateConfig(p.config);
    insist(Array.isArray(p.records)&&p.records.length<=500,'Maximum 500 recordings per project.');
    let total=0;const ids=new Set(),groups=new Map();
    for(const r of p.records){
      insist(r&&typeof r.id==='string'&&!ids.has(r.id),'Recording IDs must be unique.');ids.add(r.id);
      insist(typeof r.name==='string'&&r.name.length<=160,'Recording name is invalid.');
      insist(typeof r.label==='string'&&r.label.length>0&&r.label.length<=40,'Each recording needs a label (up to 40 characters).');
      insist(typeof r.group==='string'&&r.group.length>0&&r.group.length<=80,'Each recording needs a session/group ID.');
      insist(['train','validation','test','calibration'].includes(r.split),'Unknown data partition.');
      insist(!groups.has(r.group)||groups.get(r.group)===r.split,'Recordings from the same session must stay in one partition.');groups.set(r.group,r.split);
      insist(Array.isArray(r.rows)&&r.rows.length>=2&&r.rows.length<=(DSP.kind(p.config)==='audio'?320000:20000),'Recording exceeds its sample limit.');total+=r.rows.length;
      for(const row of r.rows)insist(Array.isArray(row)&&row.length===p.axes.length&&row.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6),'Sensor rows must contain one finite number per channel (magnitude ≤ 1,000,000).');
    }
    insist(total<=(DSP.kind(p.config)==='audio'?2000000:200000),'Project exceeds its sample limit.');
    return p;
  }
  function signature(p){
    // Change detection only. This is not a cryptographic provenance signature.
    let h=2166136261;const str=JSON.stringify([p.axes,p.sampleRate,p.config,p.records.map(r=>[r.id,r.label,r.group,r.split,r.rows,...((p.task||'classification')==='regression'?[r.target]:[])]),...((p.task||'classification')!=='classification'?[p.task]:[])]);
    for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');
  }
  function partition(records,seed){
    const random=rng(seed),groups=new Map();records.forEach(r=>{if(!groups.has(r.group))groups.set(r.group,[]);groups.get(r.group).push(r);});
    // Stratify sessions with one label; mixed-label sessions are kept together.
    const buckets=new Map();for(const [g,rs] of groups){const key=[...new Set(rs.map(r=>r.label))].sort().join('\u0000');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);}
    for(const gs of buckets.values()){
      shuffle(gs,random);const n=gs.length;
      insist(n>=3,'Auto-split needs at least 3 independent sessions per label (or label combination). Capture more sessions, or assign partitions manually.');
      const nv=Math.max(1,Math.round(n*.2)),nt=Math.max(1,Math.round(n*.2));
      gs.forEach((g,i)=>groups.get(g).forEach(r=>r.split=i<nt?'test':i<nt+nv?'validation':'train'));
    }return records;
  }
  function dataset(p){
    validateProject(p);const labels=[...new Set(p.records.map(r=>r.label))].sort();insist(labels.length>=2&&labels.length<=12,'Train with 2–12 classes.');
    const sets={train:[],validation:[],test:[]},hop=Math.max(1,Math.round(p.config.window*(1-p.config.overlap)));
    for(const r of p.records)for(let i=0;i+p.config.window<=r.rows.length;i+=hop)sets[r.split].push({x:features(r.rows.slice(i,i+p.config.window),p.config),y:labels.indexOf(r.label),record:r.id,group:r.group,offset:i});
    for(const name of Object.keys(sets)){
      insist(sets[name].length<=12000,'Maximum 12,000 windows per partition. Reduce overlap or use fewer recordings.');
      for(let l=0;l<labels.length;l++)insist(sets[name].some(x=>x.y===l),`The ${name} partition needs a full window of class “${labels[l]}”. Use Auto-split sessions or edit recording partitions.`);
    }
    // Exact duplicate recordings across partitions invalidate held-out evidence.
    const seen=new Map();for(const r of p.records){let k=JSON.stringify(r.rows);insist(!seen.has(k)||seen.get(k)===r.split,'Identical recordings occur in different partitions. Remove duplicates before training.');seen.set(k,r.split);}
    return {labels,sets};
  }
  function scaler(rows){const n=rows.length,d=rows[0].x.length,mean=Array(d).fill(0),scale=Array(d).fill(0);for(const r of rows)for(let j=0;j<d;j++)mean[j]+=r.x[j]/n;for(const r of rows)for(let j=0;j<d;j++)scale[j]+=(r.x[j]-mean[j])**2/n;return{mean,scale:scale.map(v=>Math.max(Math.sqrt(v),1e-6))};}
  const normalize=(x,s)=>x.map((v,i)=>(v-s.mean[i])/s.scale[i]);
  function forward(x,m){
    const h=m.hidden?m.b1.map((b,j)=>Math.max(0,b+x.reduce((s,v,i)=>s+v*m.w1[j*x.length+i],0))):x;
    const logits=m.b2.map((b,k)=>b+h.reduce((s,v,j)=>s+v*m.w2[k*h.length+j],0)),max=Math.max(...logits),ex=logits.map(v=>Math.exp(v-max)),sum=ex.reduce((s,v)=>s+v,0);
    return{h,p:ex.map(v=>v/sum)};
  }
  function predict(rows,run){insist(rows.length===run.config.window,'Prediction needs exactly one complete window.');insist(rows.every(r=>r.length===run.axes.length&&r.every(Number.isFinite)),'Prediction channels do not match the model.');return forward(normalize(features(rows,run.config),run.scaler),run.model).p;}
  function metrics(data,m){
    const k=m.b2.length,cm=Array.from({length:k},()=>Array(k).fill(0));let loss=0,correct=0;
    for(const row of data){let p=forward(row.x,m).p,pred=p.indexOf(Math.max(...p));cm[row.y][pred]++;correct+=pred===row.y;loss-=Math.log(Math.max(p[row.y],1e-12));}
    const classes=cm.map((row,i)=>{let tp=row[i],support=row.reduce((s,v)=>s+v,0),pred=cm.reduce((s,r)=>s+r[i],0),precision=pred?tp/pred:0,recall=support?tp/support:0;return{precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0,support};});
    return{accuracy:correct/data.length,loss:loss/data.length,macroF1:classes.reduce((s,c)=>s+c.f1,0)/k,cm,classes,count:data.length};
  }
  function train(p,onProgress=()=>{}){
    const started=Date.now(),{labels,sets}=dataset(p),s=scaler(sets.train),norm=ds=>ds.map(r=>({...r,x:normalize(r.x,s)})),train=norm(sets.train),val=norm(sets.validation),c=p.config,d=train[0].x.length,k=labels.length,h=c.hidden,random=rng(c.seed),rand=n=>Array.from({length:n},()=>2*random()-1);
    let m={hidden:h,w1:h?rand(h*d).map(v=>v*Math.sqrt(2/d)):[],b1:Array(h).fill(0),w2:rand(k*(h||d)).map(v=>v*Math.sqrt(1/(h||d))),b2:Array(k).fill(0)};
    const keys=['w1','b1','w2','b2'],adam1={},adam2={};keys.forEach(key=>{adam1[key]=m[key].map(()=>0);adam2[key]=m[key].map(()=>0);});
    let steps=0,bestLoss=Infinity,best=null,bestEpoch=0,patience=0,history=[];
    for(let ep=1;ep<=c.epochs;ep++){
      shuffle(train,random);
      for(let start=0;start<train.length;start+=32){
        const batch=train.slice(start,start+32),g={};keys.forEach(key=>g[key]=m[key].map(()=>0));
        for(const r of batch){const f=forward(r.x,m),delta=f.p.map((v,i)=>v-(i===r.y?1:0));
          for(let a=0;a<k;a++){g.b2[a]+=delta[a];for(let j=0;j<f.h.length;j++)g.w2[a*f.h.length+j]+=delta[a]*f.h[j];}
          if(h)for(let j=0;j<h;j++){let dh=f.h[j]>0?delta.reduce((sum,v,a)=>sum+v*m.w2[a*h+j],0):0;g.b1[j]+=dh;for(let i=0;i<d;i++)g.w1[j*d+i]+=dh*r.x[i];}
        }
        steps++;for(const key of keys)for(let j=0;j<m[key].length;j++){let grad=g[key][j]/batch.length;adam1[key][j]=.9*adam1[key][j]+.1*grad;adam2[key][j]=.999*adam2[key][j]+.001*grad*grad;m[key][j]-=c.rate*(adam1[key][j]/(1-.9**steps))/(Math.sqrt(adam2[key][j]/(1-.999**steps))+1e-8);}
      }
      const tr=metrics(train,m),v=metrics(val,m);insist(Number.isFinite(v.loss),'Training diverged. Try a lower learning rate.');
      const point={epoch:ep,trainLoss:tr.loss,valLoss:v.loss,trainAccuracy:tr.accuracy,valAccuracy:v.accuracy};history.push(point);
      if(v.loss<bestLoss-1e-6){bestLoss=v.loss;best=clone(m);bestEpoch=ep;patience=0;}else patience++;
      onProgress({...point,total:c.epochs});if(patience>=30)break;
    }
    return{id:'run-'+Date.now().toString(36),version:VERSION,created:new Date().toISOString(),signature:signature(p),name:p.name,axes:clone(p.axes),sampleRate:p.sampleRate,config:clone(c),labels,scaler:s,model:best,history,bestEpoch,train:metrics(norm(sets.train),best),validation:metrics(val,best),test:null,durationMs:Date.now()-started,recordings:p.records.map(r=>({id:r.id,label:r.label,group:r.group,split:r.split,rows:r.rows.length})),fixture:p.records.find(r=>r.split==='validation'&&r.rows.length>=c.window).rows.slice(0,c.window)};
  }
  function evaluate(p,run){insist(signature(p)===run.signature,'The project changed after training. Retrain before evaluating this dataset.');const {sets}=dataset(p);return metrics(sets.test.map(r=>({...r,x:normalize(r.x,run.scaler)})),run.model);}
  function validateRun(r){
    insist(r&&typeof r.id==='string'&&typeof r.signature==='string'&&typeof r.name==='string','Invalid saved model.');
    validateConfig(r.config);insist(Array.isArray(r.axes)&&r.axes.length>=1&&r.axes.length<=8,'Invalid model channels.');
    insist(Array.isArray(r.labels)&&r.labels.length>=2&&r.labels.length<=12&&r.labels.every(s=>typeof s==='string'&&s.length<=40),'Invalid model classes.');
    const d=DSP.count(r.axes.length,r.config),h=r.config.hidden,k=r.labels.length;insist(r.model&&r.model.hidden===h,'Invalid model architecture.');
    for(const [key,len] of Object.entries({w1:h*d,b1:h,w2:k*(h||d),b2:k})){insist(Array.isArray(r.model[key])&&r.model[key].length===len&&r.model[key].every(Number.isFinite),'Invalid model weights.');}
    insist(r.scaler&&r.scaler.mean.length===d&&r.scaler.scale.length===d&&r.scaler.mean.every(Number.isFinite)&&r.scaler.scale.every(v=>Number.isFinite(v)&&v>0),'Invalid normalization.');
    insist(Array.isArray(r.fixture)&&r.fixture.length===r.config.window&&r.fixture.every(row=>row.length===r.axes.length&&row.every(Number.isFinite)),'Invalid model fixture.');
    insist(Number.isFinite(r.sampleRate)&&r.sampleRate>=1&&r.sampleRate<=16000,'Invalid model sample rate.');
    insist(Array.isArray(r.history)&&r.history.length<=400&&r.history.every(x=>Number.isFinite(x.trainLoss)&&Number.isFinite(x.valLoss)),'Invalid training history.');
    for(const m of [r.train,r.validation,...(r.test?[r.test]:[])]){
      insist(m&&Number.isFinite(m.accuracy)&&m.accuracy>=0&&m.accuracy<=1&&Number.isFinite(m.macroF1)&&Number.isFinite(m.loss)&&Number.isInteger(m.count)&&m.count>0,'Invalid model metrics.');
      insist(Array.isArray(m.cm)&&m.cm.length===k&&m.cm.every(row=>Array.isArray(row)&&row.length===k&&row.every(n=>Number.isInteger(n)&&n>=0)),'Invalid confusion matrix.');
      insist(Array.isArray(m.classes)&&m.classes.length===k&&m.classes.every(c=>c&&['precision','recall','f1','support'].every(key=>Number.isFinite(c[key]))),'Invalid per-class metrics.');
    }
    insist(Array.isArray(r.recordings)&&r.recordings.length<=500&&r.recordings.every(x=>x&&typeof x.group==='string'&&['train','validation','test'].includes(x.split)),'Invalid recording manifest.');
    insist(r.axes.every(a=>a&&typeof a.name==='string'&&typeof a.unit==='string'),'Invalid model channel metadata.');
    return r;
  }
  function fresh(){return{app:'TinyBench',schema:1,version:VERSION,name:'Untitled sensor project',sampleRate:50,axes:[{name:'ax',unit:'g'},{name:'ay',unit:'g'},{name:'az',unit:'g'}],board:'nano33',config:{window:64,overlap:.5,hidden:12,epochs:100,rate:.01,seed:42},records:[],runs:[],activeRun:null,baseline:null,assumptions:'Keep sensor mounting, channel order, units, and sample rate consistent between collection and deployment.',evidence:'',threshold:.7};}
  function sample(){const p=fresh();p.name='Three ways to move';p.evidence='Synthetic accelerometer signals generated by TinyBench. Demonstrates the workflow only; accuracy is not evidence of performance on real hardware.';const random=rng(6327);['still','tilted','shaking'].forEach((label,l)=>{for(let r=0;r<9;r++){const phase=random()*6,base=(random()-.5)*.1,rows=Array.from({length:256},(_,i)=>{const n=()=> (random()-.5)*.08,t=i/50;return l===0?[n()+base,n(),1+n()]:l===1?[.75+n()+base,.15+n(),.65+n()]:[Math.sin(t*23+phase)*.7+n(),Math.cos(t*17+phase)*.5+n(),1+Math.sin(t*19+phase)*.3+n()];});p.records.push({id:`demo-${l}-${r}`,name:`${label} ${r+1}`,label,group:`synthetic-${l}-${r}`,split:'train',source:'synthetic demonstration',rows});}});partition(p.records,42);return p;}
  function parseCSV(text,axes){
    const lines=text.trim().replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#'));insist(lines.length>=2,'CSV needs at least 2 data rows.');
    const split=l=>l.split(',').map(v=>v.trim());let first=split(lines[0]),header=first.some(v=>v===''||!Number.isFinite(Number(v))),timeIndex=-1;
    if(header){timeIndex=first.findIndex(v=>/^(timestamp_ms|time_ms|t_ms)$/.test(v));const channels=first.filter((_,i)=>i!==timeIndex);insist(JSON.stringify(channels)===JSON.stringify(axes.map(a=>a.name)),`CSV header must be ${axes.map(a=>a.name).join(',')} (optional leading timestamp_ms).`);lines.shift();}
    const times=[],rows=lines.map((line,i)=>{const cols=split(line);insist(cols.length===axes.length+(timeIndex>=0?1:0),`CSV row ${i+1}: wrong channel count.`);insist(cols.every(v=>v!==''&&Number.isFinite(Number(v))),`CSV row ${i+1}: use finite numeric values.`);const nums=cols.map(Number);if(timeIndex>=0)times.push(nums.splice(timeIndex,1)[0]);return nums;});
    let observedRate=null;if(times.length){const dt=times.slice(1).map((v,i)=>v-times[i]);insist(dt.every(v=>v>0),'CSV timestamps must increase.');const mean=dt.reduce((a,b)=>a+b,0)/dt.length;insist(dt.every(v=>Math.abs(v-mean)<=mean*.2),'CSV timing varies more than 20%. Resample to a regular interval before importing.');observedRate=1000/mean;}
    return{rows,observedRate};
  }
  return{VERSION,FEATURES,clone,rng,features,scaler,normalize,forward,validateProject,validateRun,validateConfig,signature,partition,dataset,train,evaluate,predict,metrics,fresh,sample,parseCSV};
});
