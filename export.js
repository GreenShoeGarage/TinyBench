(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./firmware.js'):root.TBFirmware,typeof module==='object'&&module.exports?require('./dsp.js'):root.TBDSP);if(typeof module==='object'&&module.exports)module.exports=api;else root.TBExport=api;})(typeof self!=='undefined'?self:globalThis,function(FW,DSP){
  'use strict';
  const enc=new TextEncoder();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function zip(files){
    const chunks=[],directory=[];let offset=0;const u16=(v,n,x)=>v.setUint16(n,x,true),u32=(v,n,x)=>v.setUint32(n,x,true);
    for(const [path,content] of Object.entries(files)){const name=enc.encode(path),data=typeof content==='string'?enc.encode(content):content,crc=crc32(data),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u16(v,12,33);u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,name.length);header.set(name,30);chunks.push(header,data);
      const central=new Uint8Array(46+name.length),d=new DataView(central.buffer);u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x800);u16(d,14,33);u32(d,16,crc);u32(d,20,data.length);u32(d,24,data.length);u16(d,28,name.length);u32(d,42,offset);central.set(name,46);directory.push(central);offset+=header.length+data.length;}
    const size=directory.reduce((s,v)=>s+v.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);u32(e,0,0x06054b50);u16(e,8,directory.length);u16(e,10,directory.length);u32(e,12,size);u32(e,16,offset);return new Blob([...chunks,...directory,end],{type:'application/zip'});
  }
  const cf=x=>{if(!Number.isFinite(x))throw new Error('Nonfinite model parameter.');return Number(x).toExponential(9)+'f';};
  const cs=s=>'"'+Array.from(enc.encode(s)).map(b=>'\\'+b.toString(8).padStart(3,'0')).join('')+'"';
  function memory(run){const m=run.model,d=DSP.count(run.axes.length,run.config),k=run.labels.length,h=m.hidden;return{constants:4*(m.w1.length+m.b1.length+m.w2.length+m.b2.length+2*d),working:4*(run.config.window*run.axes.length+d+(h||d)+k)+(DSP.kind(run.config)==='spectral'?16*run.config.window:DSP.kind(run.config)==='audio'?16*512+16*16:0)};}
  function header(run,threshold=.7){
    const mode=run.task||'classification',d=DSP.count(run.axes.length,run.config),h=run.model.hidden,k=run.labels.length,arrays={mean:run.scaler.mean,scale:run.scaler.scale,w1:run.model.w1,b1:run.model.b1,w2:run.model.w2,b2:run.model.b2};
    return `// TinyBench v1.0.0 | ${run.id.replace(/[^A-Za-z0-9_-]/g,'')} | MIT
#ifndef TINYBENCH_MODEL_H
#define TINYBENCH_MODEL_H
#include <math.h>
#include <stddef.h>
namespace tinybench {
static const int AXES=${run.axes.length},WINDOW=${run.config.window},FEATURES=${d},CLASSES=${k},HIDDEN=${h||d},OUTPUTS=${mode==='classification'?k:1},TASK=${mode==='classification'?0:mode==='regression'?1:2};
static const float SAMPLE_HZ=${cf(run.sampleRate)},THRESHOLD=${cf(mode==='anomaly'?run.model.threshold:threshold)};
static const char* const labels[CLASSES]={${run.labels.map(cs).join(',')}};
${Object.entries(arrays).filter(([,v])=>Array.isArray(v)&&v.length).map(([name,a])=>`static const float ${name}[${a.length}]={${a.map(cf).join(',')}};`).join('\n')}
${DSP.cpp(run.config)}
// OUTPUTS floats: classification scores, one numeric estimate, or one anomaly score.
// Return -1 for invalid data; otherwise class index (0 for numeric regression).
inline int predict(const float* input,float* scores){
 float x[FEATURES],z[HIDDEN];if(!extract(input,x))return -1;
 for(int i=0;i<FEATURES;i++){x[i]=(x[i]-mean[i])/scale[i];if(!isfinite(x[i]))return -1;}
 ${mode==='anomaly'?`double sum=0;for(int i=0;i<FEATURES;i++)sum+=(double)x[i]*x[i];scores[0]=sum/FEATURES;return isfinite(scores[0])?(scores[0]>THRESHOLD?1:0):-1;`:`${h?`for(int j=0;j<HIDDEN;j++){float sum=b1[j];for(int i=0;i<FEATURES;i++)sum+=w1[j*FEATURES+i]*x[i];z[j]=fmaxf(0,sum);}`:'for(int j=0;j<HIDDEN;j++)z[j]=x[j];'}
 ${mode==='regression'?`float y=b2[0];for(int j=0;j<HIDDEN;j++)y+=w2[j]*z[j];scores[0]=y*${cf(run.target.scale)}+${cf(run.target.mean)};return isfinite(scores[0])?0:-1;`:`float maxLogit=-INFINITY;for(int c=0;c<CLASSES;c++){float sum=b2[c];for(int j=0;j<HIDDEN;j++)sum+=w2[c*HIDDEN+j]*z[j];if(!isfinite(sum))return -1;scores[c]=sum;maxLogit=fmaxf(maxLogit,sum);}float sum=0;for(int c=0;c<CLASSES;c++){scores[c]=expf(scores[c]-maxLogit);sum+=scores[c];}int best=0;for(int c=0;c<CLASSES;c++){scores[c]/=sum;if(scores[c]>scores[best])best=c;}return best;`}`}
}
inline int classify(const float* input,float* scores){int best=predict(input,scores);return ${mode==='classification'?'best>=0&&scores[best]>=THRESHOLD?best:-1':'best'};}
}
#endif
`;
  }
  function fixtureSketch(run){const mode=run.task||'classification';return `#include <Arduino.h>
#include <TinyBenchModel.h>
const float sample[tinybench::WINDOW*tinybench::AXES]={${run.fixture.flat().map(cf).join(',')}};
void setup(){Serial.begin(115200);unsigned long t=millis();while(!Serial&&millis()-t<5000){}float output[tinybench::OUTPUTS];int best=tinybench::predict(sample,output);if(best<0){Serial.println("Invalid input");return;}
${mode==='classification'?'for(int i=0;i<tinybench::CLASSES;i++){Serial.print(tinybench::labels[i]);Serial.print(": ");Serial.println(output[i],6);}':`Serial.print("${mode==='regression'?'Estimate':'Anomaly score'}: ");Serial.println(output[0],6);`}
${mode!=='regression'?'Serial.print("Result: ");Serial.println(tinybench::labels[best]);':''}
}
void loop(){}
`;}
  const captureSketch=FW.capture;
  function library(run,threshold){
    const mem=memory(run),root='TinyBenchModel/',files={};
    files[root+'library.properties']='name=TinyBenchModel\nversion=1.0.0\nauthor=Green Shoe Garage\nmaintainer=Green Shoe Garage\nsentence=Locally trained TinyBench sensor classifier.\nparagraph=Feature extraction, normalization, weights, and inference with no ML runtime dependency.\ncategory=Data Processing\nurl=https://greenshoegarage.com\narchitectures=*\nincludes=TinyBenchModel.h\n';
    files[root+'src/TinyBenchModel.h']=header(run,threshold);
    files[root+'src/TinyBenchStream.h']=FW.streamHeader();
    files[root+'examples/StaticBuffer/StaticBuffer.ino']=fixtureSketch(run);
    const imu=(run.task||'classification')==='classification'&&run.axes.length===3&&run.axes.every((a,i)=>a.name===['ax','ay','az'][i]&&a.unit==='g')&&run.sampleRate<=100;
    if(DSP.kind(run.config)==='audio' && (!run.task||run.task==='classification'))files[root+'examples/NanoSenseAudio/NanoSenseAudio.ino']=FW.pdmInference(run);
    if(imu)for(const [kind,name] of [['imu','NanoSenseRev2Buffered'],['rev1','NanoSenseRev1Buffered']])files[root+'examples/'+name+'/'+name+'.ino']=FW.buffered(run,kind);
    files[root+'model.json']=JSON.stringify(run,null,2);
    files[root+'README.txt']=`TinyBench export 1.0.0 | Arduino learning model (model run version ${run.version})\n\n1. Arduino IDE: Sketch > Include Library > Add .ZIP Library.\n2. Select your board and install its board package.\n3. Open File > Examples > TinyBenchModel > StaticBuffer.\n4. Upload and open Serial Monitor at 115200 baud.\n5. Compare scores against model.json fixture using TinyBench's replay.\n${imu?'6. For Nano 33 BLE Sense REV2, install Arduino_BMI270_BMM150 and try NanoSenseRev2Buffered. Rev1 uses Arduino_LSM9DS1 and NanoSenseRev1Buffered.\n':''}\nOther boards/sensors: supply WINDOW rows of AXES float values, row-major, to tinybench::predict(). Call classify() to apply the adjustable threshold. Use SAMPLE_HZ and exactly the recorded channel order and units.\n\nTask: ${run.task||'classification'}\nFeatures: ${DSP.kind(run.config)}\nChannels: ${run.axes.map(a=>a.name+' ['+a.unit+']').join(', ')}\nSample rate: ${run.sampleRate} Hz\nWindow: ${run.config.window} samples\nThreshold: ${threshold} (uncalibrated model score; not out-of-distribution detection)\nModel/scaler float constants: ${mem.constants} bytes\nApproximate working buffers: ${mem.working} bytes\nThese estimates omit code, runtime stack, labels, sensor libraries, and example fixture data. Some cores copy constants to RAM. Inspect the Arduino compiler report and measure on hardware.\n\nPortable C++ source is exported; the optional local worker can compile StaticBuffer; upload remains external. No physical board validation has been performed. architectures=* is a portable-source declaration, not certification of every Arduino.\n${imu?'Buffered Nano Sense examples use a separate Mbed sensor thread and three window buffers. Connect in TinyBench to request identity and monitor predictions. Counters report missed samples, discarded windows, and uneven intervals. Non-overlapping inference windows. Sampling gaps reset partial windows. Processing overflow drops the newest complete window. Continuous operation must be measured on hardware; no guarantee of gap-free timing. Additional streaming storage is three input windows plus a 4096-byte sampler stack, queue metadata, mutex and RTOS objects.\n':''}\nData signature: ${run.signature} (change detector, not cryptographic)\nHeld-out test evaluated: ${run.test?'yes':'no'}\nNo Edge Impulse account, service, SDK, EON compiler, or proprietary code is used.\n`;
    files[root+'LICENSE.txt']='MIT License\n\nCopyright (c) 2026 Green Shoe Garage\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to inclusion of this notice.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n';return files;
  }
  return{zip,header,library,captureSketch,memory,fixtureSketch};
});
