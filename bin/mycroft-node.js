#! /usr/bin/env node

var Metalsmith = require('metalsmith');
var prompt = require('cli-prompt');
var render = require('consolidate').handlebars.render;

var m = new Metalsmith('/');
m.dir = ''; //Erhmahgerd
m.source(__dirname+'\\\\template');
m.destination(process.cwd());
m.use(ask);
m.use(template);
m.build(function(err){
  if (err) throw err;
});

/**
* Prompt plugin.
*
* @param {Object} files
* @param {Metalsmith} metalsmith
* @param {Function} done
*/

function ask(files, metalsmith, done){
  var prompts = ['name', 'author', 'license', 'desc', 'repo'];
  var metadata = metalsmith.metadata();

  async.eachSeries(prompts, run, done);

  function run(key, done){
    prompt(' ' + key + ': ', function(val){
      metadata[key] = val;
      done();
    });
  }
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