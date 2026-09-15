// SPDX-License-Identifier: GPL-3.0-only
export function requestSegmentService(identity,signal,Bridge=globalThis.PalmServiceBridge){
 return new Promise((resolve,reject)=>{
  let done=false,timer;const bridge=new Bridge();
  const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);bridge.onservicecallback=()=>{};try{bridge.cancel();}catch{}error?reject(error):resolve(data);};
  const abort=()=>finish(new DOMException('Cancelado','AbortError'));if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(Error('Serviço de trechos indisponível.')),15000);
  bridge.onservicecallback=raw=>{try{const response=JSON.parse(raw);finish(response.returnValue===true?null:Error('Trechos indisponíveis.'),response.data);}catch{finish(Error('Resposta inválida.'));}};
  try{bridge.call('luna://org.nuviofork.webos.segments/segments',JSON.stringify(identity));}catch{finish(Error('Serviço de trechos indisponível.'));}
 });
}
