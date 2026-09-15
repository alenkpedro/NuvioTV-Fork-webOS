// SPDX-License-Identifier: GPL-3.0-only
'use strict';
var Service=require('webos-service'),requestSegments=require('./request').requestSegments;
var service=new Service('org.nuviofork.webos.segments'),active=0;
service.register('segments',function(message){
 if(active>=2){message.respond({returnValue:false,errorText:'Busy'});return;}
 active++;
 requestSegments(message.payload).then(function(data){active--;message.respond({returnValue:true,data:data});},function(){active--;message.respond({returnValue:false,errorText:'Segments unavailable'});});
});
