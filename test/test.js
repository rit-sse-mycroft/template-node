/*jshint expr: true*/
var mocha = require('mocha'); 
var should = require('chai').should();
var EventEmitter = require('events').EventEmitter;
var MycroftClient = require('../mycroft.js');

describe('The Mycroft Client', function() {
  var cli = null;
  var written = null;
  beforeEach(function() {
    written = null;
    cli = new MycroftClient();
    //Give it a fake 'client' instead of connecting for testing.
    cli.cli = new EventEmitter(); //We can call .emit on this to simulate recieving 'data' and 'end'
    cli.cli.write = function(str) {
      written = str;
    };
  });
  
  it('can send a broadcast',function() {
    var obj = {
      test: 'broadcast'
    };
    cli.broadcast(obj);
    var match = written.match(/\d+\nMSG_BROADCAST (.*)/);
    match.should.not.be.null;
    var retobj = JSON.parse(match[1]);
    retobj.content.should.deep.equal(obj);
  });
});