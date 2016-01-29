Weather = new Mongo.Collection("weather");
PFSense = new Mongo.Collection("pfsense");
ThePing = new Mongo.Collection("ping");

if (Meteor.isClient) {

  Template.weatherbox.helpers({
    conditions: function () {
      var x = 0;
      x = Weather.findOne('conditions').value;
      return x;
    },
    temperature: function () {
      return Weather.findOne('temperature').value;
    },
    humidity: function () {
      return Weather.findOne('humidity').value;
    },
    icon: function () {
      return Weather.findOne('icon').value;
    },
    all: function () {
      return JSON.stringify(Weather.findOne('all').value);
    },
  });
  Template.weatherbox.onRendered(function () {
    console.log("weatherbox render");
    iconify();
  });
  var watchWeather = Weather.find().observeChanges({
    changed: function (id, fields) {
        console.log("weather change:" + id);
        iconify(true);
    },
  });
  Template.pfsensebox.helpers({
    inpercent: function () {
      return speedToCent(PFSense.findOne('in').value,PFSense.findOne('in-max').value);
    },
    intext: function () {
      return bytesToHuman(PFSense.findOne('in').value);
    },
    outpercent: function () {
      return speedToCent(PFSense.findOne('out').value,PFSense.findOne('out-max').value);
    },
    outtext: function () {
      return bytesToHuman(PFSense.findOne('out').value);
    }
  });
  Template.pingbox.helpers({
    pingTarget: function () {
      return ThePing.find({},{limit:20});
    },
    hslaCheat: function () {
      return 100 - this.loss;
    },
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    updateForecast();
//    Meteor.setInterval(function(){updateForecast();}, 1000*60*20); //Every 20mn

    PFSense.upsert("in-raw",{$set: {value: 0}});
    PFSense.upsert("out-raw",{$set: {value: 0}});
    PFSense.upsert("in-max",{$set: {value: Meteor.settings.snmpInBandwidth}});
    PFSense.upsert("out-max",{$set: {value: Meteor.settings.snmpOutBandwidth}});
    getPFSense();
    Meteor.setInterval(function(){getPFSense();}, 1000*Meteor.settings.snmpUpdateTime);

    goPing();
    Meteor.setInterval(function(){getPFSense();}, 1000*10);
  });
}

function updateForecast(){
  console.log("updateForecast()");
  var ForecastApi = Meteor.npmRequire('forecast');
  var forecast = new ForecastApi({
    service: 'forecast.io',
    key: Meteor.settings.ForecastApiKey,
    units: 'f', // Only the first letter is parsed
    cache: true,      // Cache API requests?
    ttl: {            // How long to cache requests. Uses syntax from moment.js: http://momentjs.com/docs/#/durations/creating/
      minutes: 19,
      seconds: 0
      }
  });
  forecast.get(Meteor.settings.ForecastLocation, Meteor.bindEnvironment(function(err, result) {
  if(err) return console.dir(err);
    //console.dir(weather);
    Weather.upsert("icon",{$set: {value: result.currently.icon}});
    Weather.upsert("conditions",{$set: {value: result.currently.summary}});
    Weather.upsert("temperature",{$set: {value: Math.round(parseFloat(result.currently.temperature, 10))}});
    Weather.upsert("humidity",{$set: {value: result.currently.humidity * 100}});
    Weather.upsert("all",{$set: {value: result}});
  }));
}

function getPFSense(){
  console.log("getPFSense()");

  var snmp = Meteor.npmRequire('snmp-native');
  var session = new snmp.Session({ host: Meteor.settings.snmpIP, port: 161, community: Meteor.settings.snmpCommunity});

  getSNMP(session,Meteor.settings.snmpInOID,"in");
  getSNMP(session,Meteor.settings.snmpOutOID,"out");
}

function oidToArray(oid){
  //no needed currently
  if( oid.charAt( 0 ) === '.' ){ oid = oid.slice( 1 ); }

  var arr = oid.split(".");
  arr = arr.map(function (val) { return val; });

  return arr;
}

function getSNMP(session,oidArray,key){
  //console.log("getSNMP() " + oidArray);
  session.get({ oid: oidArray },  Meteor.bindEnvironment(function(error, varbinds) {
    if (error) {
        console.log('Failed SNMP');
    } else {
        //var date = new Date();
        var oldraw = PFSense.findOne(key+'-raw').value;
        var newraw = varbinds[0].value;
        PFSense.upsert(key+'-raw',{$set: {value: newraw}});
        if(oldraw>0 && oldraw < newraw){
          var speed = (newraw-oldraw)/Meteor.settings.snmpUpdateTime;
          PFSense.upsert(key,{$set: {value: speed}});
          console.log(key + speed);
        }else{
          PFSense.upsert(key,{$set: {value: 0}});
        }
      }
  }));
}

function bytesToHuman(x){
  if(x <= 1024){
    return x + " BPS";
  }else if (x<=1024*1024) {
    return (x/1024).toFixed(2) + " KBPS";
  }else if (x<=1024*1024*1024) {
    return (x/1024/1024).toFixed(2) + " MBPS";
  }else {
    return (x/1024/1024/1024).toFixed(2) + " GBPS";
  }
}

function speedToCent(speed,max){
  // original-in-mbps * 1024 (for kbps) * 1024 (for bitsps) / 8 (for bytesps)
  // current speed / top speed = .0X
  // .0X * 100 = int for the CSS to use
  var step1 = max * 1024 * 1024;
  var step2 = speed / step1;
  var step3 = step2 * 100;
  console.log(max + " " + speed + " " + step1 + " " + step2 + " " + step3);
  return step3.toFixed(0);
}

function goPing(){
  var ping = Meteor.npmRequire("tcp-ping");

  var targets = Meteor.settings.pingTargets;
  var exec;
  for (i = 0; i < targets.length; ++i) {
    //console.log(targets[i]);
    ping.ping({ address: targets[i],attempts:10 }, Meteor.bindEnvironment(function(err, data) {
      //      console.log(data);
      var loss=0;
      for(x = 0; x<data.results.length; ++x){
        if(!data.results[x].time){ loss++; }
      }
      var finalLoss = (loss/data.attempts)*100;
      //console.log("loss: " + finalLoss.toFixed(0));
      ThePing.upsert(data.address,{$set: {average: data.avg.toFixed(1), loss:finalLoss.toFixed(0)}});
    }));
  }

  /*var ping = Meteor.npmRequire("ping-wrapper2");
  exec.on("exit", function(data){
  // { sent: 10, recieved: 10, loss: 0, time: 9010 }
   console.log(data);
 }); */
}
function iconify(up){
  console.log("iconify()");
  var x = Weather.findOne('icon').value;
  var icons = new Skycons();
  if(up){
    console.log("update" + x);
    //icons.remove('icon1');
    //icons.add('icon1',x);
    icons.set('icon1', x); 
  }else{
    console.log("add" + x);
    icons.add('icon1', x);
  }
  icons.play();
}
