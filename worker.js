importScripts('dsp.js','classifier.js','engine.js');
self.onmessage=e=>{try{const run=TB.train(e.data,p=>self.postMessage({type:'progress',data:p}));self.postMessage({type:'done',data:run});}catch(err){self.postMessage({type:'error',message:err.message});}};
