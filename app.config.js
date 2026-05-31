const base = require('./app.json');

module.exports = {
  ...base.expo,
  ios: {
    ...base.expo.ios,
    config: {
      ...base.expo.ios?.config,
      googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY,
    },
  },
  android: {
    ...base.expo.android,
    config: {
      ...base.expo.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
};
