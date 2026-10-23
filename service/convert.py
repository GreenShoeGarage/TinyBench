"""Convert a validated TinyBench classifier/regressor using TensorFlow 2.20.0."""
import json,sys,pathlib
import numpy as np
import tensorflow as tf
if tf.__version__!='2.20.0':raise RuntimeError('Use tensorflow-cpu==2.20.0 for this converter.')
data=json.loads(pathlib.Path(sys.argv[1]).read_text());out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
r=data['run'];m=r['model'];dims=len(r['scaler']['mean']);hidden=m['hidden'];outputs=len(m['b2']);reg=r.get('task')=='regression'
class Model(tf.Module):
 @tf.function(input_signature=[tf.TensorSpec([1,dims],tf.float32)])
 def __call__(self,x):
  if hidden:x=tf.nn.relu(tf.matmul(x,tf.constant(np.array(m['w1'],np.float32).reshape(hidden,dims).T))+tf.constant(m['b1'],tf.float32))
  x=tf.matmul(x,tf.constant(np.array(m['w2'],np.float32).reshape(outputs,hidden or dims).T))+tf.constant(m['b2'],tf.float32)
  return x if reg else tf.nn.softmax(x)
model=Model();converter=tf.lite.TFLiteConverter.from_concrete_functions([model.__call__.get_concrete_function()],model)
if data['quantization']=='int8':
 converter.optimizations=[tf.lite.Optimize.DEFAULT]
 converter.representative_dataset=lambda:([np.asarray([row],dtype=np.float32)] for row in data['representative'])
 converter.target_spec.supported_ops=[tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
 converter.inference_input_type=tf.int8;converter.inference_output_type=tf.int8
blob=converter.convert();(out/'model.tflite').write_bytes(blob)
interpreter=tf.lite.Interpreter(model_content=blob,num_threads=1);interpreter.allocate_tensors();inp=interpreter.get_input_details()[0];output=interpreter.get_output_details()[0];x=np.asarray([data['fixture']],np.float32)
if inp['dtype']==np.int8:
 scale,zero=inp['quantization'];x=np.clip(np.rint(x/scale)+zero,-128,127).astype(np.int8)
interpreter.set_tensor(inp['index'],x);interpreter.invoke();y=interpreter.get_tensor(output['index']).astype(np.float32)
if output['dtype']==np.int8:
 scale,zero=output['quantization'];y=(y-zero)*scale
if reg:y=y*r['target']['scale']+r['target']['mean']
values=y[0].tolist();error=max(abs(a-b) for a,b in zip(values,data['expected']));report={'tensorflow':tf.__version__,'bytes':len(blob),'quantization':data['quantization'],'input':{'dtype':inp['dtype'].__name__,'quantization':inp['quantization']},'output':{'dtype':output['dtype'].__name__,'quantization':output['quantization']},'representativeTrainingWindows':len(data['representative']),'validationFixtureOutput':values,'nativeFixtureOutput':data['expected'],'maxAbsoluteFixtureDifference':error,'physicalHardwareTested':False}
(out/'conversion.json').write_text(json.dumps(report,indent=2));(out/'model_data.h').write_text('#pragma once\n#include <stdint.h>\nalignas(16) const unsigned char model_data[]={'+','.join(map(str,blob))+'};\nconst unsigned int model_data_len='+str(len(blob))+';\n')
print(json.dumps({'stage':'converted','bytes':len(blob),'fixtureMaxError':error}),flush=True)
