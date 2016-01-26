Weather = new Mongo.Collection("weather");

if (Meteor.isClient) {
  // counter starts at 0
  Session.setDefault('counter', 0);

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

  Template.hello.events({
    'click button': function () {
      // increment the counter when button is clicked
      Session.set('counter', Session.get('counter') + 1);
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {

    var ForecastApi = Meteor.npmRequire('forecast');
    var forecast = new ForecastApi({
      service: 'forecast.io',
      key: Meteor.settings.ForecastApiKey,
      units: 'f', // Only the first letter is parsed
      cache: true,      // Cache API requests?
      ttl: {            // How long to cache requests. Uses syntax from moment.js: http://momentjs.com/docs/#/durations/creating/
        minutes: 27,
        seconds: 45
        }
    });
    forecast.get(Meteor.settings.ForecastLocation, Meteor.bindEnvironment(function(err, result) {
    if(err) return console.dir(err);
      //console.dir(weather);
      //var a = result.currently.summary;
      Weather.upsert("conditions",{$set: {value: result.currently.summary}});
      Weather.upsert("temperature",{$set: {value: Math.round(parseFloat(result.currently.temperature, 10))}});
      Weather.upsert("humidity",{$set: {value: result.currently.humidity * 100}});
      //var b = );
      //var c = result.currently.humidity * 100;
    }));
  // code to run on server at startup


  });


}
