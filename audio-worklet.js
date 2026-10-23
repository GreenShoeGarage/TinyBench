/* Local AudioWorklet: mono capture, bounded at 20 seconds, silent output. */
class TinyBenchRecorder extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(2048);this.pos=0;this.count=0;this.done=false;this.port.onmessage=e=>{if(e.data==='flush')this.flush(true);};}
 flush(done=false){if(this.pos){const samples=this.buffer.slice(0,this.pos);this.port.postMessage({samples},[samples.buffer]);this.pos=0;}if(done&&!this.done){this.done=true;this.port.postMessage({done:true});}}
 process(inputs){if(this.done)return false;const row=inputs[0]?.[0];if(row)for(const v of row){this.buffer[this.pos++]=v;this.count++;if(this.pos===this.buffer.length)this.flush();if(this.count>=sampleRate*20){this.flush(true);break;}}return !this.done;}
}
registerProcessor('tinybench-recorder',TinyBenchRecorder);
