import decodeCompact from './decodeCompact';
import { data } from './dataStore';

export function init(dataName, url, ready) {
  "use strict";

  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (this.readyState !== 4) return;
    if (this.status === 200) {
      dataReceived(dataName, xhr.responseText);
      ready(true);
    }
    else ready(false);
  };
  xhr.send();

  function dataReceived(dataName, responseText) {
    data[dataName] = JSON.parse(responseText);
    data[dataName].substrokes = decodeCompact(data[dataName].substrokes);
  }
}
