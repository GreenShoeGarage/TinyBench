/* Run with Node 18+, Python 3 and g++. No hardware is simulated as qualified. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const runtime=fs.existsSync(path.join(__dirname,'../dist/engine.js'))?'../dist/':'../';
const TB=require(runtime+'engine.js'),{TinyProtocol,TinyDiagnostics,TinySerial,validateDevice}=require(runtime+'serial.js'),A=require(runtime+'acquisition.js'),FW=require(runtime+'firmware.js'),EX=require(runtime+'export.js');
const identity=FW.identity('imu',50,'capture'),axes=identity.axes;
const frame=(seq,timestamp=seq*20000)=>({values:[seq%10,0,1],channels:['ax','ay','az'],seq,timestamp,unit:'us'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let checks=0;
(async()=>{
 let events=[],parser=new TinyProtocol((type,data)=>events.push({type,data}));
 const wire='#TB1 READY\n#TB1 '+JSON.stringify(identity)+'\nseq,timestamp_us,ax,ay,az\n0,100,0.1,0.2,1\n1,20100,0.2,0.3,1\n';
 for(const c of wire)parser.feed(c);
 assert.equal(events.filter(e=>e.type==='frame').length,2);assert.deepEqual(events.find(e=>e.type==='frame').data.values,[.1,.2,1]);assert.equal(events[0].type,'ready');checks++;
 parser.feed('2,40100,0,,1\n3,60100,0,1\n');assert.equal(events.filter(e=>e.type==='invalid').length,2);assert.throws(()=>parser.feed('x'.repeat(4097)));checks++;
 events=[];parser=new TinyProtocol((type,data)=>events.push({type,data}));parser.feed('timestamp_ms,ax,ay,az\n0,1,2,3\n20,2,3,4\n');assert.equal(events.at(-1).data.unit,'ms');assert.equal(events.at(-1).data.seq,null);parser.feed('#TB2 READY\n40,1,2,3\n');assert.equal(events.at(-1).type,'error');checks++;
 let d=new TinyDiagnostics(50);for(let i=0;i<10;i++)d.add(frame(i),i*20);assert.equal(d.snapshot().measuredHz,50);assert.equal(d.snapshot().histogram[2],9);d.add(frame(12),240);assert.equal(d.snapshot().missed,2);assert.equal(d.snapshot().uneven,1);assert.equal(d.add(frame(12),240).accept,false);assert.equal(d.add(frame(11),240).accept,false);assert.equal(d.snapshot().duplicates,1);assert.equal(d.snapshot().outOfOrder,1);checks++;
 d=new TinyDiagnostics(50);d.add(frame(0xffffffff,0xfffffff0),0);d.add(frame(0,19984),20);assert.equal(d.snapshot().measuredHz,50);assert.equal(d.snapshot().resets,0);d.add(frame(0,0),40);assert.equal(d.snapshot().duplicates,1);checks++;
 d=new TinyDiagnostics(50);for(let i=0;i<5000;i++)d.add(frame(i),i*20);assert.equal(d.intervals.length,2048);assert.equal(d.snapshot().intervalCount,4999);assert.equal(d.snapshot().histogram[2],4999);checks++;
 d=new TinyDiagnostics(50);for(let i=0;i<100;i++)d.add({...frame(i),timestamp:null,unit:null,seq:null},Math.floor(i/5)*100);assert.equal(d.snapshot().intervalCount,99);assert.equal(d.snapshot().minMs,0);assert.ok(Math.abs(d.snapshot().measuredHz-52.105)<.01);checks++;
 const base={id:'capture1',name:'Motion',label:'still',group:'session1',split:'train',source:'test capture'};
 let cap=new A.Capture(base,axes,50,identity);for(let i=0;i<100;i++)assert.equal(cap.add(frame(i),i*20),null);let saved=cap.finish();assert.equal(saved.rows.length,100);assert.equal(A.quality(saved,50),null);const p=TB.fresh();p.recovery=cap.draft('Cable removed');A.validateDraft(p.recovery,p);assert.equal(A.quality(p.recovery.record,50),null);TB.validateProject({...p,records:[saved]});checks++;
 const signature=TB.signature(p);assert.equal(signature,TB.signature({...p,recovery:null}));cap.add(frame(102),2040);assert.throws(()=>cap.finish());assert.match(A.quality(cap.draft().record,50),/Missing/);checks++;
 assert.match(A.mismatch({...identity,rate_hz:25},axes,50),/rate/);assert.match(A.mismatch({...identity,axes:[{name:'value',unit:'counts'}]},axes,50),/channels/);assert.throws(()=>validateDevice({...identity,protocol:2}));assert.throws(()=>A.validateDraft({...p.recovery,rate:100},p));checks++;
 const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/three-ways-to-move.tinybench.json'),'utf8'));TB.validateProject(old);assert.equal(TB.signature(old),TB.signature({...old,version:'0.2.0',recovery:null}));checks++;
 // Web Serial lifecycle uses real Web Streams with a fake transport, not a board.
 let opens=0,closes=0,choosers=0,writes=[];const port={async open(){opens++;this.readable=new ReadableStream({start:c=>this.controller=c});this.writable=new WritableStream({write:bytes=>{writes.push(new TextDecoder().decode(bytes));this.controller.enqueue(new TextEncoder().encode('#TB1 '+JSON.stringify(identity)+'\n0,0,0,0,1\n'));}});},async close(){closes++;},send(s){this.controller.enqueue(new TextEncoder().encode(s));}};
 let rows=[],states=[];const serial=new TinySerial(f=>rows.push(f),(t,v)=>states.push([t,v]),{api:{requestPort:async()=>{choosers++;return port;}},secure:true,stallMs:30});
 await serial.connect();port.send('ax,ay,az\n1,2,3\n');await sleep(10);assert.equal(writes.length,0);assert.equal(rows.length,1);port.send('#TB1 READY\n');await sleep(20);assert.deepEqual(writes,['#TB1 HELLO\n']);assert.equal(serial.device.board,identity.board);assert.equal(serial.state,'streaming');await assert.rejects(()=>serial.connect());checks++;
 await sleep(550);assert.equal(serial.state,'stalled');assert.ok(states.some(([t])=>t==='interrupted'));await serial.disconnect();assert.equal(serial.state,'disconnected');assert.equal(closes,1);await serial.connect(true);assert.equal(choosers,1);assert.equal(opens,2);port.controller.error(new Error('Unplugged'));await serial.loopPromise;assert.equal(serial.running,false);assert.equal(closes,2);assert.equal(serial.selectedPort,port);checks++;
 // Portable queue: overflow retains queued windows; gaps reset partial windows.
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tinybench-v02-'));
 try{
 fs.writeFileSync(path.join(tmp,'TinyBenchStream.h'),FW.streamHeader());
 fs.writeFileSync(path.join(tmp,'queue.cpp'),`#include "TinyBenchStream.h"\n#include <cassert>\n#include <cmath>\nint main(){tinybench::WindowQueue<1,4> q;float x,out[4],hz;for(unsigned i=0;i<12;i++){x=i;q.push(&x,i,i*20000,20000);}assert(q.dropped==1);assert(q.pop(out,hz)&&out[0]==0&&out[3]==3&&fabs(hz-50)<.01);for(unsigned i=12;i<16;i++){x=i;q.push(&x,i,i*20000,20000);}assert(q.pop(out,hz)&&out[0]==4&&out[3]==7);assert(q.pop(out,hz)&&out[0]==12&&out[3]==15);assert(!q.pop(out,hz));x=16;q.push(&x,16,320000,20000);for(unsigned i=18;i<22;i++){x=i;q.push(&x,i,i*20000,20000);}assert(q.missed==1);assert(q.pop(out,hz)&&out[0]==18&&out[3]==21);tinybench::WindowQueue<1,2> w;x=0;w.push(&x,0xffffffff,0xfffffff0,20000);x=1;w.push(&x,0,19984,20000);assert(w.pop(out,hz)&&w.missed==0&&w.uneven==0);}\n`);
 execFileSync('g++',['-std=c++11','-Wall','-Wextra','-Werror','-Wno-misleading-indentation','-o',path.join(tmp,'queue'),path.join(tmp,'queue.cpp')]);execFileSync(path.join(tmp,'queue'));checks++;
 // Generated sketch syntax against explicit mocks. This does NOT qualify an Arduino core.
 fs.writeFileSync(path.join(tmp,'Arduino.h'),'#pragma once\n#include <stdint.h>\n#include <chrono>\nstruct SerialMock {void begin(int){} explicit operator bool(){return true;} int available(){return 0;} int read(){return 0;} template<typename... T> void print(T...){} template<typename... T> void println(T...){} }; static SerialMock Serial; inline uint32_t millis(){return 0;} inline uint32_t micros(){return 0;} inline void delay(int){} inline int analogRead(int){return 0;} const int A0=0;\n');
 fs.writeFileSync(path.join(tmp,'mbed.h'),'#pragma once\n#include <chrono>\nconst int osPriorityAboveNormal=1; namespace rtos { struct Mutex {void lock(){} void unlock(){}}; struct Thread {Thread(int,unsigned,unsigned char*){} void start(void(*)()){} }; namespace ThisThread {inline void sleep_for(std::chrono::milliseconds) {}}}\n');
 fs.writeFileSync(path.join(tmp,'sensor.h'),'#pragma once\nstruct Sensor {int begin(){return 1;} int accelerationAvailable(){return 1;} int readAcceleration(float& x,float& y,float& z){x=0;y=0;z=1;return 1;}}; static Sensor IMU;\n');
 for(const a of Object.values(FW.adapters))if(a.library)fs.writeFileSync(path.join(tmp,a.library+'.h'),'#include "sensor.h"\n');
 const project=TB.sample();project.config.epochs=10;const run=TB.train(project);const lib=EX.library(run,.7);fs.writeFileSync(path.join(tmp,'TinyBenchModel.h'),EX.header(run,.7));
 const sketches=Object.fromEntries(Object.keys(FW.adapters).map(k=>[k,FW.capture(k,50)]));sketches.bufferedRev2=FW.buffered(run,'imu');sketches.bufferedRev1=FW.buffered(run,'rev1');
 for(const [name,source]of Object.entries(sketches)){const filename=path.join(tmp,name+'.cpp');fs.writeFileSync(filename,source);execFileSync('g++',['-std=c++11','-fsyntax-only','-I',tmp,filename],{stdio:'pipe'});}
 assert.ok(lib['TinyBenchModel/src/TinyBenchStream.h']);assert.ok(lib['TinyBenchModel/examples/NanoSenseRev1Buffered/NanoSenseRev1Buffered.ino']);assert.throws(()=>FW.capture('imu',101));assert.throws(()=>FW.capture('analog',201));checks++;
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 console.log(JSON.stringify({checks,protocol:'passed',recovery:'passed',transport:'fake Web Streams passed',queue:'host C++ passed',sketches:'6 mock-header syntax checks passed',physicalBoards:'not tested'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
