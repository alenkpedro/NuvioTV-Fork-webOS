// SPDX-License-Identifier: GPL-3.0-only
'use strict';
var Service=require('webos-service'),requestSegments=require('./request').requestSegments,request=require('./net').request,media=require('./media');
var service=new Service('org.nuviofork.webos.segments'),active=0,netActive=0;
service.register('segments',function(message){
 if(active>=2){message.respond({returnValue:false,errorText:'Busy'});return;}
 active++;
 requestSegments(message.payload).then(function(data){active--;message.respond({returnValue:true,data:data});},function(){active--;message.respond({returnValue:false,errorText:'Segments unavailable'});});
});
// Bounded like the segments command: this TV has a handful of API clients, not a server.
service.register('fetch',function(message){
 if(netActive>=4){message.respond({returnValue:false,errorText:'Busy'});return;}
 netActive++;
 request(message.payload).then(function(data){netActive--;message.respond({returnValue:true,data:data});},function(error){netActive--;message.respond({returnValue:false,errorText:String(error && error.message || 'Request failed')});});
});
// Faixas paralelas: o serviço abre a fonte com as próprias conexões e cabeçalhos e serve os
// bytes em 127.0.0.1, onde o player da TV lê como se fosse um arquivo local. Sem suporte a
// Range na fonte, `mediastart` recusa com o motivo e o app toca a URL original.
service.register('mediastart',function(message){
 media.start(message.payload).then(function(data){message.respond({returnValue:true,data:data});},function(error){message.respond({returnValue:false,errorText:String(error&&error.message||'Media unavailable')});});
});
service.register('mediastats',function(message){
 message.respond({returnValue:true,data:media.stats(message.payload)});
});
service.register('mediastop',function(message){
 message.respond({returnValue:true,data:media.stop(message.payload)});
});
// Uma célula da varredura: mede o transporte com a configuração pedida e devolve a taxa, as
// sub-janelas e o motivo quando falhou. É o `StreamSpeedTester` do fork dentro do serviço.
service.register('measure',function(message){
 media.measure(message.payload).then(function(data){message.respond({returnValue:true,data:data});},function(error){message.respond({returnValue:false,errorText:String(error&&error.message||'Measure failed')});});
});

