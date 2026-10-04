import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

if (typeof global.crypto !== 'object') {
  global.crypto = {};
}
if (typeof global.crypto.getRandomValues !== 'function') {
  global.crypto.getRandomValues = function getRandomValues(array) {
    if (array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return array;
  };
}

AppRegistry.registerComponent(appName, () => App);
