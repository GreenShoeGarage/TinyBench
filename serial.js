/* TinyBench v1.0.0. No flashing. HELLO is sent only after a recognized TB1 beacon. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);})(globalThis,function(){
'use strict';
const uint=x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
const text=(x,n=100)=>typeof x==='string'&&x.length>0&&x.length<=n;
function validateDevice(d){
 if(!d||d.type!=='hello'||d.protocol!==1||!text(d.board)||!text(d.sensor)||!text(d.firmware,32)||!['capture','inference','audio'].includes(d.mode)||!Number.isFinite(d.rate_hz)||d.rate_hz<1||d.rate_hz>16000||!Array.isArray(d.axes)||d.axes.length<1||d.axes.length>8||!d.axes.every(a=>a&&text(a.name,24)&&/^[A-Za-z][A-Za-z0-9_]*$/.test(a.name)&&text(a.unit,24))||new Set(d.axes.map(a=>a.name)).size!==d.axes.length||!Array.isArray(d.capabilities)||d.capabilities.length>10||!d.capabilities.every(c=>text(c,32)))throw new Error('Invalid TB1 device identity.');
 if(d.mode==='audio'&&(d.rate_hz!==16000||d.axes.length!==1||d.axes[0].name!=='audio'||d.axes[0].unit!=='FS'))throw new Error('Audio identity must declare mono 16 kHz full-scale PCM.');
 if(d.mode==='capture'&&d.rate_hz>1000)throw new Error('Sensor capture rate exceeds supported limits.');
 if(d.mode==='inference'&&(!text(d.model_id,160)||!Number.isInteger(d.window)||d.window<16||d.window>16384))throw new Error('Invalid inference identity.');
 return JSON.parse(JSON.stringify(d));
}
class TinyDiagnostics{
 constructor(rate){this.rate=rate;this.rows=0;this.invalid=0;this.missed=0;this.duplicates=0;this.outOfOrder=0;this.resets=0;this.uneven=0;this.intervals=[];this.bins=[0,0,0,0,0];this.count=0;this.total=0;this.min=Infinity;this.max=0;this.prev=null;this.clock=null;this.firstArrival=null;this.lastArrival=null;}
 reject(){this.invalid++;}
 add(f,arrival=performance.now()){
  const clock=f.timestamp===null?'browser':f.unit;const prev=this.prev;let fault=null,dt=null;
  if(prev&&(f.seq===null)!==(prev.seq===null)){this.resets++;fault='Sequence format changed';}
  if(prev&&clock!==this.clock){this.resets++;fault='Timestamp format changed';}
  if(prev&&f.seq!==null&&prev.seq!==null){const diff=(f.seq-prev.seq)>>>0;if(diff===0){this.duplicates++;return{accept:false,fault:'Duplicate sequence number'};}if(diff>0x7fffffff){if(f.seq===0){this.resets++;fault='Device sequence restarted';}else{this.outOfOrder++;return{accept:false,fault:'Out-of-order sequence number'};}}else if(diff>1){this.missed+=diff-1;fault='Missing sample sequence';}}
  if(prev&&clock===this.clock){if(clock==='browser')dt=(arrival-this.lastArrival)*1000;else{dt=f.timestamp-prev.timestamp;if(dt<0&&f.unit==='us'&&prev.timestamp>0xf0000000&&f.timestamp<0x10000000)dt+=0x100000000;if(f.unit==='ms')dt*=1000;if(dt<=0){this.resets++;fault='Device clock restarted or repeated';dt=null;}}}
  if(dt!==null&&dt>=0){this.count++;this.total+=dt;this.min=Math.min(this.min,dt);this.max=Math.max(this.max,dt);this.intervals.push(dt);if(this.intervals.length>2048)this.intervals.shift();const ratio=dt/(1e6/this.rate);this.bins[ratio<.8?0:ratio<.95?1:ratio<=1.05?2:ratio<=1.2?3:4]++;if(clock!=='browser'&&(ratio<.8||ratio>1.2)){this.uneven++;fault=fault||'Device interval outside ±20%';}}
  this.prev=f;this.clock=clock;if(this.firstArrival===null)this.firstArrival=arrival;this.lastArrival=arrival;this.rows++;return{accept:true,fault};
 }
 snapshot(){const s=this.intervals.slice().sort((a,b)=>a-b),q=n=>s.length?s[Math.min(s.length-1,Math.floor((s.length-1)*n))]/1000:null;return{rows:this.rows,invalid:this.invalid,missed:this.missed,duplicates:this.duplicates,outOfOrder:this.outOfOrder,resets:this.resets,uneven:this.uneven,clock:this.clock||'unknown',measuredHz:this.total?this.count*1e6/this.total:null,arrivalHz:this.lastArrival>this.firstArrival?(this.rows-1)*1000/(this.lastArrival-this.firstArrival):null,minMs:this.count?this.min/1000:null,p50Ms:q(.5),p95Ms:q(.95),maxMs:this.count?this.max/1000:null,histogram:this.bins.slice(),intervalCount:this.count,percentileSamples:s.length};}
}
class TinyProtocol{
 constructor(emit){this.emit=emit;this.pending='';this.header=null;this.device=null;this.tb1=false;this.blocked=false;}
 feed(chunk){this.pending+=chunk;let nl;while((nl=this.pending.indexOf('\n'))>=0){if(nl>4096)throw new Error('Serial line exceeds 4096 characters.');const line=this.pending.slice(0,nl).trim();this.pending=this.pending.slice(nl+1);this.line(line);}if(this.pending.length>4096)throw new Error('Serial line exceeds 4096 characters.');}
 line(line){if(!line)return;
  if(line.startsWith('#TB')){
   if(!line.startsWith('#TB1 ')){this.blocked=true;this.emit('error','Unsupported TinyBench protocol. Upload a current TB1 capture sketch.');return;}
   this.tb1=true;if(line==='#TB1 READY'){this.emit('ready');return;}
   try{const d=JSON.parse(line.slice(5));if(d.type==='hello'){this.device=validateDevice(d);this.blocked=false;this.header=d.mode==='capture'?['seq','timestamp_us',...d.axes.map(a=>a.name)]:null;this.emit('device',this.device);}else if(d.type==='audio'){if(this.device?.mode!=='audio'||!uint(d.seq)||typeof d.samples!=='string'||d.samples.length!==684||!/^([A-Za-z0-9+/]{4}){170}[A-Za-z0-9+/]{3}=$/.test(d.samples))throw new Error('Invalid PCM packet.');const raw=atob(d.samples);if(raw.length!==512)throw new Error('Invalid PCM length.');const samples=Array.from({length:256},(_,i)=>{const n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);return (n>=32768?n-65536:n)/32768;});this.emit('audio',{seq:d.seq,samples});}else if(d.type==='prediction'){if(!this.device||this.device.mode!=='inference')throw new Error('Prediction before device identity.');if(!uint(d.inference_us)||!Number.isFinite(d.sample_hz)||d.sample_hz<0||!uint(d.missed)||!uint(d.dropped)||!uint(d.uneven)||!Number.isInteger(d.class_index)||d.class_index< -1||d.class_index>11||!Array.isArray(d.scores)||d.scores.length<2||d.scores.length>12||!d.scores.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||d.class_index>=d.scores.length)throw new Error('Invalid prediction.');this.emit('prediction',d);}else if(d.type==='error'){throw new Error(text(d.message,200)?d.message:'Device reported an error.');}else throw new Error('Unknown protocol message.');}catch(e){this.blocked=true;this.emit('error',e.message);}return;
  }
  if(line.startsWith('#'))return;if(this.blocked)return;
  const parts=line.split(',').map(s=>s.trim());
  if(parts.every(s=>/^[A-Za-z][A-Za-z0-9_]*$/.test(s))){if(this.tb1&&this.header&&JSON.stringify(parts)!==JSON.stringify(this.header)){this.emit('invalid','Protocol header mismatch');return;}this.header=parts;this.emit('header',parts);return;}
  if(parts.length>10||parts.some(s=>s===''||!Number.isFinite(Number(s)))){this.emit('invalid','Malformed numeric row');return;}
  if(this.tb1&&!this.device)return;
  if(this.device && this.device.mode!=='capture')return;
  let values=parts.map(Number),seq=null,timestamp=null,unit=null,channels=this.header?.slice()||null;
  if(channels){if(channels.length!==values.length){this.emit('invalid','Row length differs from header');return;}for(let i=channels.length-1;i>=0;i--){const name=channels[i];if(name==='seq'){seq=values.splice(i,1)[0];channels.splice(i,1);if(!uint(seq)){this.emit('invalid','Invalid sequence');return;}}else if(/^(timestamp_us|timestamp_ms|time_ms|t_ms)$/.test(name)){if(timestamp!==null){this.emit('invalid','Multiple clocks');return;}timestamp=values.splice(i,1)[0];unit=name==='timestamp_us'?'us':'ms';channels.splice(i,1);if(timestamp<0||(unit==='us'&&!uint(timestamp))){this.emit('invalid','Invalid timestamp');return;}}}}
  if(values.length<1||values.length>8||values.some(v=>Math.abs(v)>1e6)){this.emit('invalid','Channel value out of bounds');return;}
  this.emit('frame',{values,channels,seq,timestamp,unit});
 }
}
class TinySerial{
 constructor(onRow,onStatus,options={}){this.onRow=onRow;this.onStatus=onStatus;this.api=options.api||globalThis.navigator?.serial;this.secure=options.secure??globalThis.isSecureContext;this.port=null;this.selectedPort=null;this.running=false;this.busy=false;this.state='disconnected';this.token=0;this.stallMs=options.stallMs||3500;this.lastData=0;this.device=null;}
 status(state,data){this.state=state;this.onStatus('state',{state,detail:data});}
 async connect(retry=false){if(this.busy||this.running)throw new Error('Disconnect before opening another port.');if(!this.api||!this.secure)throw new Error('USB requires desktop Chrome or Edge on HTTPS or localhost.');this.busy=true;const token=++this.token;this.status(retry?'reconnecting':'opening');
  try{const port=retry?this.selectedPort:await this.api.requestPort();if(!port)throw new Error('Choose a serial port first.');if(token!==this.token)return;this.selectedPort=port;await port.open({baudRate:115200});if(token!==this.token){await port.close();return;}this.port=port;this.running=true;this.device=null;this.helloPending=false;this.lastHello=0;this.protocol=new TinyProtocol((type,data)=>this.event(type,data));this.lastData=performance.now();this.onStatus('connected');this.status('identifying');this.watch=setInterval(()=>{if(this.running&&performance.now()-this.lastData>this.timeout()&&this.state!=='stalled'){this.status('stalled','No new samples or predictions');this.onStatus('interrupted','Sensor stream stalled');}},500);this.loopPromise=this.read(port,token);
  }catch(e){this.status('error',e.message);throw new Error('Could not open serial. Close Serial Monitor and retry. '+e.message);}finally{this.busy=false;}
 }
 timeout(){return this.device?.mode==='inference'?Math.max(this.stallMs,2*(this.device.window||256)/this.device.rate_hz*1000+3000):this.stallMs;}
 event(type,data){
  if(type==='ready'){if(!this.helloPending&&(!this.lastHello||performance.now()-this.lastHello>1000))this.helloPromise=this.hello();return;}
  if(type==='device'){this.device=data;this.onStatus('device',data);return;}
  if(type==='frame'||type==='prediction'||type==='audio'){this.lastData=performance.now();const state=type==='prediction'?'monitoring':'streaming';if(this.state!==state)this.status(state);if(type==='frame')this.onRow(data);else this.onStatus(type,data);return;}
  if(type==='error'){this.status('error',data);this.onStatus('interrupted',data);}this.onStatus(type,data);
 }
 async hello(){this.helloPending=true;this.lastHello=performance.now();let writer;try{writer=this.port?.writable?.getWriter();this.writer=writer;if(!writer)throw new Error('Serial port has no writer.');await writer.write(new TextEncoder().encode('#TB1 HELLO\n'));}catch(e){this.onStatus('error','Identity request failed: '+e.message);}finally{writer?.releaseLock();this.writer=null;this.helloPending=false;}}
 async read(port,token){const decoder=new TextDecoder();let reader;
  try{reader=port.readable.getReader();this.reader=reader;while(this.running&&token===this.token){const{value,done}=await reader.read();if(done)break;this.protocol.feed(decoder.decode(value,{stream:true}));}}
  catch(e){if(this.running)this.onStatus('error',e.message);}
  finally{clearInterval(this.watch);reader?.releaseLock();if(this.reader===reader)this.reader=null;this.running=false;try{await this.writer?.abort();}catch{}if(this.helloPromise)await this.helloPromise;try{await port.close();}catch{}this.port=null;this.status('disconnected');this.onStatus('disconnected');}
 }
 async disconnect(){this.token++;this.running=false;clearInterval(this.watch);try{await this.writer?.abort();}catch{}if(this.reader)await this.reader.cancel();if(this.loopPromise)await this.loopPromise;this.status('disconnected');}
}
return{TinyDiagnostics,TinyProtocol,TinySerial,validateDevice};
});
