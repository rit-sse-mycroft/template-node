#! /usr/bin/env node

var Metalsmith = require('metalsmith');
var templates = require('metalsmith-templates');
var prompt = require('metalsmith-prompt');

Metalsmith(__dirname)
  .source('./template')
  .destination(path.resolve(__dirname))
  .use(prompt({
    name: 'string',
    author: 'string',
    repo: 'string',
    license: 'string',
    desc: 'string'
  }))
  .use(templates("handlebars"))
  .build(function(err){
    if (err) throw err;
  });