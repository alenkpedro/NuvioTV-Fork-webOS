// SPDX-License-Identifier: GPL-3.0-only
'use strict';
var https=require('https');
function valid(p){return p && /^tt\d{1,12}$/.test(p.imdb_id) && Number.isInteger(p.season) && p.season>=0 && p.season<=1000 && Number.isInteger(p.episode) && p.episode>0 && p.episode<=10000;}
function requestSegments(p,transport){
 if(!valid(p))return Promise.reject(new Error('Invalid episode'));
 transport=transport||https;
 return new Promise(function(resolve,reject){
  var finished=false,bytes=0,chunks=[],req,timer;
  function finish(error,data){if(finished)return;finished=true;clearTimeout(timer);if(error&&req)req.destroy();error?reject(error):resolve(data);}
  timer=setTimeout(function(){finish(new Error('Timeout'));},14000);
  req=transport.get({hostname:'api.introdb.app',path:'/segments?imdb_id='+encodeURIComponent(p.imdb_id)+'&season='+p.season+'&episode='+p.episode,method:'GET',headers:{Accept:'application/json'},rejectUnauthorized:true},function(res){
   if(res.statusCode!==200){res.resume();finish(new Error('HTTP '+res.statusCode));return;}
   res.on('data',function(chunk){bytes+=chunk.length;if(bytes>32768){res.destroy();finish(new Error('Response too large'));return;}chunks.push(chunk);});
   res.on('end',function(){if(finished)return;try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){finish(e);}});
   res.on('error',function(e){finish(e);});res.on('aborted',function(){finish(new Error('Aborted'));});
  });req.on('error',function(e){finish(e);});
 });
}
module.exports={valid:valid,requestSegments:requestSegments};
