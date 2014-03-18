#! /usr/bin/env node

var Metalsmith = require('metalsmith');
var prompt = require('prompt');
var render = require('consolidate').handlebars.render;
var async = require('async');
var argv = require('minimist')(process.argv.slice(2));

var usage = "usage: mycroft-node new [foldername]";

if ((argv._.length<1) || argv._[0]!=='new') {
  console.log(usage);
  return;
}

var dir = process.cwd();
if (argv._.length>=2) {
  dir += "\\\\"+argv._[1];
}

var m = new Metalsmith('/');
m.dir = ''; //Erhmahgerd
m.source(__dirname+'\\\\template');
m.destination(dir);
m.use(ask);
m.use(template);
m.build(function(err){
  if (err) throw err;
});

var info_schema = {
  properties: {
    name: {
      pattern: /^[a-zA-Z\-\_]+$/,
      message: "Your application's code-safe name (letters, dashes, underscores)",
      required: true
    },
    fancyname: {
      message: "Your application's display name",
      required: true
    },
    instance: {
      message: "A default instanceId for your application",
      default: "instance"
    },
    author: {
      message: "Your name",
      required: true
    },
    license: {
      message: "Your application's license",
      default: "BSD"
    },
    desc: {
      message: "Your application's description",
      default: ''
    }, 
    repo: {
      message: "Your application's repository",
      default: ''
    }
  }
};

/**
* Prompt plugin.
*
* @param {Object} files
* @param {Metalsmith} metalsmith
* @param {Function} done
*/

function ask(files, metalsmith, done){
  var metadata = metalsmith.metadata();

  prompt.start();
  prompt.get(info_schema, function(err, res) {
    if (!err) {
      for (var key in res) {
        var value = res[key];
        metadata[key] = value;
      }
    }
    done();
  });
}

/**
* Template in place plugin.
*
* @param {Object} files
* @param {Metalsmith} metalsmith
* @param {Function} done
*/

function template(files, metalsmith, done){
  var keys = Object.keys(files);
  var metadata = metalsmith.metadata();

  async.each(keys, run, done);

  function run(file, done){
    var str = files[file].contents.toString();
    render(str, metadata, function(err, res){
      if (err) return done(err);
      files[file].contents = new Buffer(res);
      done();
    });
  }
}