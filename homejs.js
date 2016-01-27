Weather = new Mongo.Collection("weather");
PFSense = new Mongo.Collection("pfsense");

if (Meteor.isClient) {

  Template.weatherbox.helpers({
    conditions: function () {
      return Weather.findOne('conditions').value;
    },
    temperature: function () {
      return Weather.findOne('temperature').value;
    },
    humidity: function () {
      return Weather.findOne('humidity').value;
    }
  });
  Template.pfsensebox.helpers({
    in: function () {
      return PFSense.findOne('in').value;
    },
    out: function () {
      return PFSense.findOne('out').value;
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    updateForecast();
    Meteor.setInterval(function(){updateForecast();}, 1000*60*20); //Every 20mn

    getPFSense();
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
    Weather.upsert("conditions",{$set: {value: result.currently.summary}});
    Weather.upsert("temperature",{$set: {value: Math.round(parseFloat(result.currently.temperature, 10))}});
    Weather.upsert("humidity",{$set: {value: result.currently.humidity * 100}});
  }));
}

function getPFSense(){
  console.log("getPFSense()");
  //var inOid = oidToArray(Meteor.settings.snmpInOID);
  //var outOid = oidToArray(Meteor.settings.snmpOutOID);

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
        console.log('Fail :(');
    } else {
        //var date = new Date();
        PFSense.upsert(key,{$set: {value: varbinds[0].value}});
    }
  }));
}
