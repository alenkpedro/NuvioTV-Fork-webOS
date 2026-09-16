// SPDX-License-Identifier: GPL-3.0-only
'use strict';
var Service=require('webos-service'),requestSegments=require('./request').requestSegments,request=require('./net').request;
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
