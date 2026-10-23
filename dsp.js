/* Shared deterministic DSP. Windowed FFT uses DC removal and a symmetric Hann window. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TBDSP=api;})(globalThis,function(){
'use strict';
const kind=c=>c?.features||'stats';
const count=(axes,c)=>axes*(kind(c)==='spectral'?12:kind(c)==='audio'?34:6);
function fftPower(input){const n=input.length,re=input.slice(),im=Array(n).fill(0),mean=input.reduce((a,b)=>a+b,0)/n;for(let i=0;i<n;i++)re[i]=(re[i]-mean)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}for(let len=2;len<=n;len*=2){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let xr=1,xi=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2,tr=xr*re[l]-xi*im[l],ti=xr*im[l]+xi*re[l];re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;const nr=xr*wr-xi*wi;xi=xr*wi+xi*wr;xr=nr;}}}return re.slice(0,n/2+1).map((v,i)=>(v*v+im[i]*im[i])/(n*n));}
function features(rows,c={}){const n=rows.length,out=[],mode=kind(c);for(let a=0;a<rows[0].length;a++){const input=rows.map(r=>r[a]);let sum=0,sq=0,low=Infinity,high=-Infinity,delta=0;for(let i=0;i<n;i++){const v=input[i];sum+=v;sq+=v*v;low=Math.min(low,v);high=Math.max(high,v);if(i)delta+=Math.abs(v-input[i-1]);}const mu=sum/n;
 if(mode==='audio'){const means=Array(16).fill(0),squares=Array(16).fill(0);let frames=0;for(let start=0;start+512<=n;start+=256){const power=fftPower(input.slice(start,start+512)),bands=Array(16).fill(0);for(let k=1;k<=256;k++)bands[Math.min(15,Math.floor((k-1)*16/256))]+=power[k];for(let b=0;b<16;b++){const v=Math.log1p(10000*bands[b]);means[b]+=v;squares[b]+=v*v;}frames++;}for(let b=0;b<16;b++)out.push(means[b]/frames);for(let b=0;b<16;b++)out.push(Math.sqrt(Math.max(0,squares[b]/frames-(means[b]/frames)**2)));let z=0;for(let i=1;i<n;i++)if((input[i]>=0)!==(input[i-1]>=0))z++;out.push(Math.sqrt(sq/n),z/(n-1));
 }else{out.push(mu,Math.sqrt(Math.max(0,sq/n-mu*mu)),Math.sqrt(sq/n),low,high,delta/(n-1));if(mode==='spectral'){const power=fftPower(input),bands=Array(4).fill(0);let total=0,weighted=0,peak=1;for(let k=1;k<power.length;k++){bands[Math.min(3,Math.floor((k-1)*4/(n/2)))]+=power[k];total+=power[k];weighted+=power[k]*k/(n/2);if(power[k]>power[peak])peak=k;}out.push(...bands.map(v=>Math.log1p(v)),total?weighted/total:0,total?peak/(n/2):0);}}
 }return out;}
function cpp(c){const mode=kind(c);return `
inline void powerFFT(const float* input,int axis,int start,int n,double* re,double* im){
 double mu=0;for(int i=0;i<n;i++)mu+=input[(start+i)*AXES+axis];mu/=n;
 for(int i=0;i<n;i++){re[i]=(input[(start+i)*AXES+axis]-mu)*(.5-.5*cos(6.283185307179586*i/(n-1)));im[i]=0;}
 for(int i=1,j=0;i<n;i++){int bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){double v=re[i];re[i]=re[j];re[j]=v;}}
 for(int len=2;len<=n;len*=2){double a=-6.283185307179586/len,wr=cos(a),wi=sin(a);for(int i=0;i<n;i+=len){double xr=1,xi=0;for(int j=0;j<len/2;j++){int k=i+j,l=k+len/2;double tr=xr*re[l]-xi*im[l],ti=xr*im[l]+xi*re[l];re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;double nr=xr*wr-xi*wi;xi=xr*wi+xi*wr;xr=nr;}}}
 for(int k=0;k<=n/2;k++)re[k]=(re[k]*re[k]+im[k]*im[k])/(n*n);
}
inline bool extract(const float* input,float* out){
 for(int a=0;a<AXES;a++){double sum=0,sq=0,delta=0;float low=INFINITY,high=-INFINITY;for(int i=0;i<WINDOW;i++){float v=input[i*AXES+a];if(!isfinite(v))return false;sum+=v;sq+=(double)v*v;low=fminf(low,v);high=fmaxf(high,v);if(i)delta+=fabs((double)v-input[(i-1)*AXES+a]);}
 ${mode==='audio'?`double mean[16]={0},square[16]={0},re[512],im[512];int frames=0;for(int start=0;start+512<=WINDOW;start+=256){powerFFT(input,a,start,512,re,im);double bands[16]={0};for(int k=1;k<=256;k++)bands[(k-1)*16/256]+=re[k];for(int b=0;b<16;b++){double v=log1p(10000*bands[b]);mean[b]+=v;square[b]+=v*v;}frames++;}int base=a*34;for(int b=0;b<16;b++){out[base+b]=mean[b]/frames;out[base+16+b]=sqrt(fmax(0.0,square[b]/frames-(mean[b]/frames)*(mean[b]/frames)));}int z=0;for(int i=1;i<WINDOW;i++)if((input[i*AXES+a]>=0)!=(input[(i-1)*AXES+a]>=0))z++;out[base+32]=sqrt(sq/WINDOW);out[base+33]=(double)z/(WINDOW-1);`:
 `double mu=sum/WINDOW;int b=a*${mode==='spectral'?12:6};out[b]=mu;out[b+1]=sqrt(fmax(0.0,sq/WINDOW-mu*mu));out[b+2]=sqrt(sq/WINDOW);out[b+3]=low;out[b+4]=high;out[b+5]=delta/(WINDOW-1);${mode==='spectral'?`double re[WINDOW],im[WINDOW],bands[4]={0},total=0,weighted=0;int peak=1;powerFFT(input,a,0,WINDOW,re,im);for(int k=1;k<=WINDOW/2;k++){bands[(k-1)*4/(WINDOW/2)]+=re[k];total+=re[k];weighted+=re[k]*k/(WINDOW/2);if(re[k]>re[peak])peak=k;}for(int k=0;k<4;k++)out[b+6+k]=log1p(bands[k]);out[b+10]=total?weighted/total:0;out[b+11]=total?(double)peak/(WINDOW/2):0;`:''}`}
 }return true;
}
`;}
return{kind,count,features,fftPower,cpp};
});
