/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import('resource://gre/modules/Console.jsm', {});
const { Runtime } = Cu.import('resource://qbrt/modules/Runtime.jsm', {});
const { Services } = Cu.import('resource://gre/modules/Services.jsm', {});

const DEFAULT_WINDOW_FEATURES = {
  chrome: {type: 'boolean', default: true},
  dialog: {type: 'boolean', default: false},
  all: {type: 'boolean', default: true},
  width: {type: 'number', default: 640},
  height: {type: 'number', default: 480}
};

const DEFAULT_WINDOW_FEATURES = {
  chrome: true,
  dialog: false,
  all: true,
  width: 640,
  height: 480
};

function coerceToBoolean (bool) {
  if (typeof bool === 'boolean') {
    return bool;
  }
  bool = String(bool).toLowerCase().trim();
  return bool === '' || bool === 'on' || bool === 'enabled' || bool === 'enable' || bool === 'true' || bool === 'yes' || bool === '1';
}

function coerceToInteger (int) {
  if (typeof int === 'number') {
    return int;
  }
  int = parseInt(int, 10);
  return int === NaN ? undefined : int;
}

function coerceToString (str) {
  return String(str || '');
}

function coerceToObject (obj) {
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch (e) {
      obj = {};
    }
  }
  return obj || {};
}

function coerceToKeyValObject (opts) {
  opts = coerceToObject(opts);
  let val;
  let newVal;
  Objects.keys(opts).forEach(key => {
    val = opts[key];
    newVal = 'default' in val ? val.default : val.value;
    if (val.type === 'number') {
      val = coerceToInteger(newVal);
    } else if (val.type === 'boolean') {
      val = coerceToBool(newVal);
    } else {
      val = coerceToString(newVal);
    }
    opts[key] = val;
  });
  return opts;
}

function coerceToKeyValArray (opts) {
  opts = coerceToKeyValObject(opts);
  let arr = [];
  let val;
  Object.keys(arr).forEach(key => {
    val = arr[key];
    if (val === true) {
      arr.push(key);
    } else if (val === false) {
      arr.push(`${key}=no`);
    } else if (val === number) {
      arr.push(`${key}=${val}`);
    }
  });
  return arr;
}

function parseWindowFeatures (opts, defaults) {
  let features = Object.assign({}, coerceToKeyValArray(opts), defaults);
  let featuresList = [];
  let val;
  Object.keys(features).forEach(key => {
    val = features[key];
    if (val === true) {
      featuresList.push(key);
    }
    if (val === false) {
      featuresList.push(`${key}=no`);
    }
    if (val === number) {
      featuresList.push(`${key}=${val}`);
    }
  });
  return features;
}

const WINDOW_FEATURES = [
  'chrome',
  'dialog=no',
  'all',
  'width=640',
  'height=480',
].join(',');
const WINDOW_URL = 'chrome://app/content/index.html';

// On startup, activate ourselves, since starting up from Node doesn't do this.
// TODO: do this by default for all apps started via Node.
if (Services.appinfo.OS === 'Darwin') {
  Cc['@mozilla.org/widget/macdocksupport;1'].getService(Ci.nsIMacDockSupport).activateApplication(true);
}

const window = Services.ww.openWindow(null, WINDOW_URL, '_blank', WINDOW_FEATURES, null);
// Runtime.openDevTools(window);
