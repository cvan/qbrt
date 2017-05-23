#!/usr/bin/env node

// var spawnSync = require('child_process').spawnSync;

// var args = process.argv.slice(2);
// var r = spawnSync(__dirname + '/bin/cli.js', args, {stdio: 'inherit'});

// if (r.error) {
//   throw r.error;
// }

// process.exit(r.status);


// var npm = require('npm');
// npm.load(function (err) {
//   if (err) {
//     console.error(err);
//     return;
//   }

//   npm.commands.install(['qbrt'], (err, data) => {
//     if (err) {
//       console.error(err);
//       return;
//     }
//   });

//   npm.on('log', msg => {
//     console.log(msg);
//   });
// });

// var execSync = require('child_process').execSync;

// execSync('mkdir -p .tmp-qbrt && cd .tmp-qbrt && npm install qbrt', {
//   stdio: 'inherit'
// });


require('./bin/run.js');
