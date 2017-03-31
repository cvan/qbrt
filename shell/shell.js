/* Copyright 2017 Mozilla
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { Runtime } = Cu.import('resource://qbrt/modules/Runtime.jsm', {});

const GLOBAL_SHORCUT_KEYCODES = {
  'f5': 116
};
const GLOBAL_SHORTCUT_ACCELERATORS = {
  null: event => event.key && event.key.toLowerCase() === acceleratorKey,
  'f5': event => event.keyCode && event.keyCode === GLOBAL_SHORCUT_KEYCODES.f5 && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey,
  'commandorcontrol+r': event => event.metaKey && event.key && event.key === 'r'
};
// Inspired by `electron.globalShortcut`:
// - https://github.com/electron/electron/blob/master/docs/api/accelerator.md
// - https://github.com/electron/electron/blob/master/docs/api/global-shortcut.md
function GlobalShortcut (browser) {
  var self = this;
  this.accelerators = [];
  this.acceleratorsRegistered = {};
  var getAcceleratorKey = accelerator => {
    let acceleratorKey = typeof accelerator === 'string' ? accelerator.toString().toLowerCase().replace(/\s*/g, '') : accelerator;
    if (acceleratorKey in GLOBAL_SHORTCUT_ACCELERATORS) {
      return acceleratorKey;
    }
    if (typeof acceleratorKey === 'string') {
      return GLOBAL_SHORTCUT_ACCELERATORS[null];
    }
  };
  this.isRegistered = accelerator => {
    let acceleratorKey = getAcceleratorKey(accelerator);
    return acceleratorKey in this.acceleratorsRegistered;
  };
  this.register = (accelerator, callback) => {
    let acceleratorKey = getAcceleratorKey(accelerator);
    let shortcut = {
      accelerator: acceleratorKey,
      callback: callback
    };
    if (acceleratorKey in this.acceleratorsRegistered) {
      this.acceleratorsRegistered[acceleratorKey] = [shortcut];
    } else {
      this.acceleratorsRegistered[acceleratorKey].push(shortcut);
    }
    this.accelerators.push(shortcut);
  };
  this.unregister = accelerator => {
    let acceleratorKey = getAcceleratorKey(accelerator);
    delete this.accelerators.acceleratorKey;
    this.acceleratorsRegistered.forEach((acceleratorRegistered, idx) => {
      if (this.acceleratorRegistered.acclerator === acceleratorKey) {
        this.accelerators.splice(idx, 1);
      }
    }, this);
  };
  this.unregisterAll = accelerator => {
    this.accelerators.length = {};
    this.acceleratorsRegistered = {};
  };
  browser.addEventListener('keydown', event => {
    self.accelerators.forEach(({ accelerator, callback }) => {
      if (callback && typeof accelerator === 'function' && acceleator(event)) {
        callback();
      }
    });
  }, false, true);
  return this;
}

window.addEventListener('load', event => {
  const browser = document.getElementById('content');
  const globalShortcut = new GlobalShortcut(browser);
  const url = window.arguments[0];

  dump('load\n');
  dump(`${JSON.stringify(globalShortcut)}\n`);
  dump(`${globalShortcut.register}\n`);

  browser.loadURI(url, null, null);
  // dump instead of console.log to write to stdout for tests.
  dump(`opened ${url} in new window\n`);

  // Windows/Linux.
  dump(Object.keys(Runtime));
  globalShortcut.register('CommandOrControl+Alt+I', () => {
    Runtime.toggleDevTools(window);
  });
  // macOS.
  globalShortcut.register('CommandOrControl+Option+I', () => {
    Runtime.toggleDevTools(window);
  });

  // Reload the web page when the `F5` key is pressed.
  globalShortcut.register('F5', () => {
    window.location.reload();
  });

  // Reload the web page when the `Command+R`
  // (or `Control+R` on Windows) key combination is pressed.
  globalShortcut.register('CommandOrControl+R', () => {
    window.location.reload();
  });
}, false);
