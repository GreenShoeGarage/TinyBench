const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=fs.existsSync(path.join(__dirname,'../dist/engine.js'))?'../dist/':'../';const T=require(root+'engine.js'),D=require(root+'dsp.js'),E=require(root+'export.js');
let checks=0,comparisons=0,maxError=0;const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tinybench-learning-'));
try{
 const wave=Array.from({length:128},(_,i)=>[Math.sin(2*Math.PI*12*i/128)]),f=D.features(wave,{features:'spectral'});assert.ok(Math.abs(f[11]-.1875)<1e-10);assert.equal(f.length,12);checks++;
 for(const task of ['classification','regression','anomaly'])for(const features of ['stats','spectral']){
  const p=T.sample(task);p.config.features=features;p.config.epochs=60;const run=T.train(p);T.validateRun(run);const test=T.evaluate(p,run);assert.ok(test.count>0);assert.ok(test.sessions.count>0);
  const altered=T.clone(p);for(const r of altered.records.filter(r=>r.split==='test'))for(const row of r.rows)row[0]+=.2;
  const retrained=T.train(altered);assert.deepEqual(run.model,retrained.model);assert.deepEqual(run.scaler,retrained.scaler);if(run.target)assert.deepEqual(run.target,retrained.target);checks++;
  const rows=run.fixture,expected=T.predict(rows,run),header=E.header(run,.7);fs.writeFileSync(path.join(tmp,'TinyBenchModel.h'),header);
  fs.writeFileSync(path.join(tmp,'main.cpp'),'#include "TinyBenchModel.h"\n#include <cstdio>\nint main(){float x[]={'+rows.flat().map(v=>v.toExponential(10)+'f').join(',')+'};float y[tinybench::OUTPUTS];int result=tinybench::predict(x,y);if(result<0)return 3;for(int i=0;i<tinybench::OUTPUTS;i++)printf("%.10g\\n",y[i]);}');execFileSync('g++',['-std=c++11','-O2','-o',path.join(tmp,'run'),path.join(tmp,'main.cpp')]);const actual=execFileSync(path.join(tmp,'run'),{encoding:'utf8'}).trim().split(/\s+/).map(Number);assert.equal(actual.length,expected.length);actual.forEach((v,i)=>{const error=Math.abs(v-expected[i]);maxError=Math.max(error,maxError);assert.ok(error<.003*Math.max(1,Math.abs(expected[i])),`${task}/${features} parity ${error}`);comparisons++;});
  const rev=T.revision(p,'Before relabel');const changed=T.clone(p);changed.records[0].label=task==='anomaly'?'anomaly':'changed';assert.equal(T.signature(T.restoreRevision(changed,rev)),T.signature(p));checks++;
 }
 const p=T.sample('anomaly'),run=T.train(p);for(const r of p.records.filter(r=>r.split==='calibration'))for(const row of r.rows)row[0]+=.2;const second=T.train(p);assert.deepEqual(second.scaler,run.scaler);assert.notEqual(second.model.threshold,run.model.threshold);checks++;
 const leaking=T.sample('anomaly');leaking.records.find(r=>r.split==='calibration').label='anomaly';assert.throws(()=>T.train(leaking),/normal/);checks++;
 const malicious=T.train(T.sample());malicious.model['bad; #include <unsafe>']=[1];assert.ok(!E.header(malicious,.7).includes('unsafe'));checks++;
 console.log(JSON.stringify({checks,cppComparisons:comparisons,maxAbsoluteError:maxError,physicalBoards:'not tested'}));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
