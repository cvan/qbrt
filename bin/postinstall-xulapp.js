#!/usr/bin/env node

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

const chalk = require('chalk');
const cli = require('cli');
const fs = require('fs-extra');
const path = require('path');
const pify = require('pify');
const request = require('request');

const OPENVR_ENABLED = true;
const OPENVR_URL = 'https://github.com/ValveSoftware/openvr/raw/v1.0.6/bin/win64/openvr_api.dll';
const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
const openvrPath = path.join(resourcesDir, 'qbrt', 'openvr_api.dll');

exports.install = () => {
  // Copy the qbrt xulapp to the target directory.

  // TODO: move qbrt xulapp files into a separate source directory
  // that we can copy in one fell swoop.

  const sourceDir = path.join(__dirname, '..');
  const targetDir = path.join(resourcesDir, 'qbrt');

  const files = [
    'application.ini',
    'chrome',
    'chrome.manifest',
    'components',
    'defaults',
    'devtools.manifest',
    'modules',
  ];

  return pify(fs.ensureDir)(targetDir)
  .then(() => {
    return Promise.all(files.map(file => pify(fs.copy)(path.join(sourceDir, file), path.join(targetDir, file))));
  }).then(() => {
    return new Promise((resolve, reject) => {
      if (!OPENVR_ENABLED) {
        resolve();
        return;
      }

      const openvrReq = request(OPENVR_DLL_URL)
        .on('end', () => {
          // `close()` is async, so call `cb` after closed.
          openvrReq.close(() => {
            fs.appendFileSync(path.join(targetDir, 'defaults', 'preferences', 'prefs.js'),
              `\npref('gfx.vr.openvr-runtime', '${openvrPath}');\n`);
            resolve();
          });
        })
        .on('error', reject)
        .pipe(fs.createWriteStream(openvrPath));
    });
  });
};

if (require.main === module) {
  cli.spinner('  Installing XUL app…');
  exports.install()
  .then(() => {
    cli.spinner(chalk.green.bold('✓ ') + 'Installing XUL app… done!', true);
  })
  .catch(error => {
    cli.spinner(chalk.red.bold('✗ ') + 'Installing XUL app… failed!', true);
    console.error(`  Error: ${error}`);
  });
}
