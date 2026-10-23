'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const runtime=fs.existsSync(path.join(__dirname,'../dist/engine.js'))?'../dist/':'../';
const TB=require(runtime+'engine.js'),EX=require(runtime+'export.js');
async function main(){
  const p=TB.sample();TB.validateProject(p);const {sets}=TB.dataset(p);
  assert(sets.train.length&&sets.validation.length&&sets.test.length);
  const groups={};for(const r of p.records){assert(!groups[r.group]||groups[r.group]===r.split);groups[r.group]=r.split;}
  const run=TB.train(p);TB.validateRun(run);assert.equal(run.test,null);assert(run.validation.accuracy>.9);assert(TB.evaluate(p,run).accuracy>.9);
  const changed=TB.clone(p);changed.records[0].rows[0][0]+=.5;assert.throws(()=>TB.evaluate(changed,run),/changed/);
  const duplicate=TB.clone(p),train=duplicate.records.find(r=>r.split==='train');duplicate.records.push({...TB.clone(train),id:'duplicate',group:'duplicate',split:'test'});assert.throws(()=>TB.dataset(duplicate),/Identical/);
  const overlap=TB.clone(p);overlap.records[0].group=overlap.records.find(r=>r.split!==overlap.records[0].split).group;assert.throws(()=>TB.validateProject(overlap),/session/);
  const invalid=TB.clone(p);invalid.records[0].rows[0][0]=NaN;assert.throws(()=>TB.validateProject(invalid),/finite/);
  TB.features([[1],[2],[3]]).forEach((x,i)=>assert(Math.abs(x-[2,Math.sqrt(2/3),Math.sqrt(14/3),1,3,1][i])<1e-12));
  const csv=TB.parseCSV('timestamp_ms,ax,ay,az\n0,1,2,3\n20,2,3,4\n40,3,4,5',p.axes);assert.equal(csv.observedRate,50);assert.equal(csv.rows.length,3);assert.throws(()=>TB.parseCSV('ax,ay,az\n1,,3\n1,2,3',p.axes),/numeric/);
  const round=JSON.parse(JSON.stringify({...p,runs:[run],activeRun:run.id}));TB.validateProject(round);TB.validateRun(round.runs[0]);assert.deepEqual(TB.predict(run.fixture,run),TB.predict(round.runs[0].fixture,round.runs[0]));
  // A decisive leakage test: held-out values must not change fitted weights or normalization.
  const held=TB.clone(p);held.records.filter(r=>r.split==='test').forEach(r=>r.rows=r.rows.map(row=>row.map(v=>v+10)));const run2=TB.train(held);assert.deepEqual(run.model,run2.model);assert.deepEqual(run.scaler,run2.scaler);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tinybench-test-'));let comparisons=0,maxError=0;
  // Compile both supported model families and compare real sensor windows, not just weights.
  for(const hidden of [0,12,24]){
    const cfg=TB.clone(p);cfg.config.hidden=hidden;cfg.config.epochs=60;const r=TB.train(cfg);r.test=TB.evaluate(cfg,r);
    fs.writeFileSync(path.join(dir,'TinyBenchModel.h'),EX.header(r,.7));
    const windows=cfg.records.filter(x=>x.split==='test').slice(0,6).map(x=>x.rows.slice(16,16+cfg.config.window));
    fs.writeFileSync(path.join(dir,'compare.cpp'),'#include "TinyBenchModel.h"\n#include <stdio.h>\nint main(){\n'+windows.map((rows,i)=>`{float x[]={${rows.flat().map(v=>v.toExponential(9)+'f').join(',')}};float scores[tinybench::CLASSES];int best=tinybench::predict(x,scores);if(best<0)return 3;for(int k=0;k<tinybench::CLASSES;k++)printf("%.9f ",scores[k]);puts("");}\n`).join('')+'return 0;}');
    execFileSync('g++',['-std=c++11','-O2',path.join(dir,'compare.cpp'),'-o',path.join(dir,'compare')]);const result=execFileSync(path.join(dir,'compare'),{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));
    for(let i=0;i<windows.length;i++)for(let j=0;j<r.labels.length;j++){const error=Math.abs(result[i][j]-TB.predict(windows[i],r)[j]);maxError=Math.max(maxError,error);assert(error<2e-5,`C++/JS divergence ${error}`);comparisons++;}
    const files=EX.library(r,.7),zip=EX.zip(files);fs.writeFileSync(path.join(dir,'library.zip'),Buffer.from(await zip.arrayBuffer()));execFileSync('python3',['-c','import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert "TinyBenchModel/src/TinyBenchModel.h" in z.namelist()',path.join(dir,'library.zip')]);
  }
  // Verify a label cannot inject source into generated C++.
  const quoted=TB.clone(run);quoted.labels[0]='x";\\\n💡';fs.writeFileSync(path.join(dir,'TinyBenchModel.h'),EX.header(quoted));execFileSync('g++',['-std=c++11','-fsyntax-only',path.join(dir,'compare.cpp')]);
  fs.rmSync(dir,{recursive:true,force:true});
  console.log(JSON.stringify({ok:true,checks:['held-out leakage isolation','session partition isolation','duplicate protection','validation/test accuracy','project round-trip','CSV timing and invalid data','C++ compiler and inference parity','Arduino ZIP CRC','C++ label escaping'],cppScoreComparisons:comparisons,maxCppScoreError:maxError,validationAccuracy:run.validation.accuracy,testAccuracy:TB.evaluate(p,run).accuracy},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
