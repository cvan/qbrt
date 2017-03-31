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
const decompress = require('decompress');
const extract = require('extract-zip');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');
const packageJson = require('../package.json');
const path = require('path');
const pify = require('pify');
const plist = require('simple-plist');
const postinstallXULApp = require('./postinstall-xulapp');
const spawn = require('child_process').spawn;

const DOWNLOAD_LOCALE = 'en-US';
const DOWNLOAD_OS = (() => {
  switch (process.platform) {
    case 'win32':
      switch (process.arch) {
        case 'ia32':
          return 'win';
        case 'x64':
          return 'win64';
        default:
          throw new Error(`unsupported Windows architecture ${process.arch}`);
      }
    case 'linux':
      switch (process.arch) {
        case 'ia32':
          return 'linux';
        case 'x64':
          return 'linux64';
        default:
          throw new Error(`unsupported Linux architecture ${process.arch}`);
      }
    case 'darwin':
      return 'osx';
  }
})();

// TODO: Move these JSON files to a remote location hosted on a server.
const DOWNLOAD_INFO_URLS = {
  linux: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-10-01-59-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.linux-i686.json`,
  linux64: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-10-01-59-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.linux-x86_64.json`,
  osx: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-03-02-02-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.mac.json`,
  win: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-03-02-02-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.win32.json`,
  win64: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-03-02-02-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.win64.json`,
};
const DOWNLOAD_INFO_URL = DOWNLOAD_INFO_URLS[DOWNLOAD_OS];
const DOWNLOAD_BIN_URLS = {
  linux: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-10-01-59-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.linux-i686.tar.bz2`,
  linux64: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-10-01-59-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.linux-x86_64.tar.bz2`,
  mac: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-03-02-02-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.mac.dmg`,
  win: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-03-02-02-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.win32.installer.exe`,
  win64: `https://archive.mozilla.org/pub/firefox/nightly/2017/04/2017-04-02-03-02-02-mozilla-central/firefox-55.0a1.${DOWNLOAD_LOCALE}.win64.installer.exe`,
};
const DOWNLOAD_URL = DOWNLOAD_BIN_URLS[DOWNLOAD_OS] || `https://download.mozilla.org/?product=firefox-nightly-latest-ssl&lang=${DOWNLOAD_LOCALE}&os=${DOWNLOAD_OS}`;

const distDir = path.join(__dirname, '..', 'dist', process.platform);
const installDir = path.join(distDir, process.platform === 'darwin' ? 'Runtime.app' : 'runtime');
const resourcesDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
const runtimeInfo = path.join(distDir, 'runtime-info.json');
const browserJAR = path.join(resourcesDir, 'browser', 'omni.ja');

const FILE_EXTENSIONS = {
  'application/x-apple-diskimage': 'dmg',
  'application/zip': 'zip',
  'application/x-tar': 'tar.bz2',
};

cli.spinner('  Setting up runtime…');

fs.ensureDirSync(distDir);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${packageJson.name}-`));
const mountPoint = path.join(tempDir, 'volume');

let currentBrowserInfo = {};
let filePath;
let fileStream;

new Promise((resolve, reject) => {
  cli.spinner('  Checking runtime…');

  if (DOWNLOAD_INFO_URL) {
    fs.readFile(runtimeInfo, (error, data) => {
      if (error) {
        resolve(false);
      }

      const oldFirefoxInfo = JSON.parse(data || '{}');

      https.get(DOWNLOAD_INFO_URL, function(response) {
        currentBrowserInfo = {};
        try {
          currentBrowserInfo = JSON.parse(response);
        } catch (e) {
          reject(e);
          return;
        }

        if (currentBrowserInfo.buildid === oldFirefoxInfo.buildid &&
            currentBrowserInfo.target_alias === oldFirefoxInfo.target_alias) {
          resolve(true);
          return;
        }

        // Continue to download.
        resolve();
      }).on('error', reject);
    });
  }
  else {
    resolve();
  }
})
.then((isRuntimeUpToDate) => {
  if (isRuntimeUpToDate) {
    cli.spinner(chalk.green.bold('✓ ') + `Checking runtime… done! Already using latest version (build ID: ${currentBrowserInfo.buildid}; platform: ${currentBrowserInfo.target_alias}).`,
      currentBrowserInfo, true);
    return Promise.resolve();
  }
  else {
    cli.spinner(chalk.green.bold('✓ ') + `Checking runtime… done! New version available for download (build ID: ${currentBrowserInfo.buildid}; platform: ${currentBrowserInfo.target_alias}).`,
      currentBrowserInfo, true);
    return downloadRuntime();
  }
})
.then(installRuntime)
.catch(error => {
  cli.spinner(chalk.red.bold('✗ ') + 'Checking runtime… failed!', true);
  console.error(`  Error: ${error}`);
});

var downloadRuntime = () => new Promise((resolve, reject) => {
  cli.spinner('  Downloading runtime…');

  function download(url) {
    https.get(url, function(response) {
      if (response.headers.location) {
        let location = response.headers.location;
        // Rewrite Windows installer links to point to the ZIP equivalent,
        // since it's hard to expand the installer programmatically (requires
        // a Node implementation of 7zip).
        if (process.platform === 'win32') {
          location = location.replace(/\.installer\.exe$/, '.zip');
        }
        download(location);
      }
      else {
        resolve(response);
      }
    }).on('error', reject);
  }
  download(DOWNLOAD_URL);
})
.then((response) => {
  const extension = FILE_EXTENSIONS[response.headers['content-type']];
  filePath = path.join(tempDir, `runtime.${extension}`);
  fileStream = fs.createWriteStream(filePath);
  response.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', () => {
      if (currentBrowserInfo) {
        fs.writeFile(runtimeInfo, JSON.stringify(currentBrowserInfo, null, 2) + '\n');
      }
      resolve();
    });
    response.on('error', reject);
  });
}).then(() => {
  cli.spinner(chalk.green.bold('✓ ') + 'Downloading runtime… done!', true);
})
.catch(error => {
  cli.spinner(chalk.red.bold('✗ ') + 'Downloading runtime… failed!', true);
  console.error(`  Error: ${error}`);
  if (fileStream) {
    fileStream.end();
  }
});

var installRuntime = new Promise(() => {
  cli.spinner('  Installing runtime…');

  if (process.platform === 'win32') {
    const source = filePath;
    const destination = distDir;
    return pify(fs.remove)(path.join(destination, 'runtime'))
    .then(() => {
      return decompress(source, destination);
    })
    .then(() => {
      return pify(fs.rename)(path.join(destination, 'firefox'), path.join(destination, 'runtime'));
    });
  }
  else if (process.platform === 'darwin') {
    return (new Promise((resolve, reject) => {
      const child = spawn(
        'hdiutil',
        [ 'attach', filePath, '-mountpoint', mountPoint, '-nobrowse', '-quiet' ],
        {
          stdio: 'inherit',
        }
      );
      child.on('exit', resolve);
      child.on('error', reject);
    }))
    .then((exitCode) => {
      if (exitCode) {
        throw new Error(`'hdiutil attach' exited with code ${exitCode}`);
      }

      const source = path.join(mountPoint, 'FirefoxNightly.app');
      // Unlike Windows and Linux, where the destination is the parent dir,
      // on Mac the destination is the installation dir itself, because we've
      // already expanded the archive (DMG) and are copying the dir inside it.
      //
      // XXX Give the destination a different name so searching for "Firefox"
      // in Spotlight doesn't return this copy.
      //
      const destination = path.join(distDir, 'Runtime.app');
      fs.removeSync(destination);
      return fs.copySync(source, destination);
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        const child = spawn(
          'hdiutil',
          [ 'detach', mountPoint, '-quiet' ],
          {
            stdio: 'inherit',
          }
        );
        child.on('exit', resolve);
        child.on('error', reject);
      });
    })
    .then((exitCode) => {
      if (exitCode) {
        throw new Error(`'hdiutil detach' exited with code ${exitCode}`);
      }
    });
  }
  else if (process.platform === 'linux') {
    const source = filePath;
    const destination = distDir;
    fs.removeSync(path.join(destination, 'runtime'));
    return decompress(source, destination)
    .then(() => {
      fs.renameSync(path.join(destination, 'firefox'), path.join(destination, 'runtime'));
    });
  }
})
.then(() => {
  return postinstallXULApp.install();
})
.then(() => {
  // Expand the browser xulapp's JAR archive so we can access its devtools.
  // We have to expand it into a subdirectory of qbrt's xulapp directory,
  // because chrome manifests can't reference super-directories.

  // TODO: limit expansion to browser files that are necessary for devtools.

  const targetDir = path.join(resourcesDir, 'qbrt', 'browser');

  // "decompress" fails silently on omni.ja, so we use extract-zip here instead.
  // TODO: figure out the issue with "decompress" (f.e. that the .ja file
  // extension is unrecognized or that the chrome.manifest file in the archive
  // conflicts with the one already on disk).
  return pify(extract)(browserJAR, { dir: targetDir });
})
.then(() => {
  // Copy devtools pref files from browser to qbrt.

  const sourceDir = path.join(resourcesDir, 'qbrt', 'browser', 'defaults', 'preferences');
  const targetDir = path.join(resourcesDir, 'qbrt', 'defaults', 'preferences');

  const prefFiles = [
    'debugger.js',
    'devtools.js',
  ];

  for (const file of prefFiles) {
    fs.copySync(path.join(sourceDir, file), path.join(targetDir, file));
  }
})
.then(() => {
  // Copy and configure the stub executable.

  switch (process.platform) {
    case 'win32': {
      // Copy the stub executable to the executable dir.
      fs.copySync(path.join(__dirname, '..', 'launcher.bat'), path.join(executableDir, 'launcher.bat'));
      break;
    }
    case 'darwin': {
      fs.copySync(path.join(__dirname, '..', 'launcher.sh'), path.join(executableDir, 'launcher.sh'));

      // Configure the bundle to run the stub executable.
      const plistFile = path.join(installDir, 'Contents', 'Info.plist');
      const appPlist = plist.readFileSync(plistFile);
      appPlist.CFBundleExecutable = 'launcher.sh';
      plist.writeFileSync(plistFile, appPlist);

      break;
    }
    case 'linux': {
      // Copy the stub executable to the executable dir.
      fs.copySync(path.join(__dirname, '..', 'launcher.sh'), path.join(executableDir, 'launcher.sh'));
      break;
    }
  }
})
.then(() => {
  cli.spinner(chalk.green.bold('✓ ') + 'Setting up runtime… done!', true);
})
.catch(error => {
  cli.spinner(chalk.red.bold('✗ ') + 'Setting up runtime… failed!', true);
  console.error(`  Error: ${error}`);
  if (fileStream) {
    fileStream.end();
  }
})
.then(() => {
  // Clean up.  This function executes whether or not there was an error
  // during the postinstall process, so put stuff here that should happen
  // in both cases.
  fs.removeSync(filePath);
  fs.rmdirSync(tempDir);
  // XXX Remove partial copy of Firefox.
  process.exit();
});
