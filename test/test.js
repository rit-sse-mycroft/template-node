/* jshint expr: true */
var mocha = require('mocha'); 
var should = require('chai').should();
var uuid = require('uuid');
var EventEmitter = require('events').EventEmitter;
var MycroftClient = require('../mycroft.js');

describe('The Mycroft Client', function() {
  var client = null;
  var written = null;
  beforeEach(function() {
    written = null;
    client = new MycroftClient();
    var cli = new EventEmitter(); //We can call .emit on this to simulate recieving 'data' and 'end'
    cli.write = function(str) {
      written = str;
    };
    //Give it a fake 'client' instead of connecting for testing.
    client.setClient(cli);
  });
  
  it('can send a message', function() {
    var obj = {
      test: 'message'
    };
    var ttype = 'TEST_MESSAGE'
    client.sendMessage(ttype, obj);
    var pat = new RegExp('\\d+\n'+ttype+' (.*)');
    var match = written.match(pat);
    match.should.not.be.null;
    var retobj = JSON.parse(match[1]);
    retobj.should.deep.equal(obj);
  });
  
  it('can send a broadcast',function() {
    var obj = {
      test: 'broadcast'
    };
    client.broadcast(obj);
    var match = written.match(/\d+\nMSG_BROADCAST (.*)/);
    match.should.not.be.null;
    var retobj = JSON.parse(match[1]);
    retobj.content.should.deep.equal(obj);
  });
  
  it('can send a query',function() {
    var expected = {
      capability: 'video',
      priority: 20,
      action: 'start_stream',
      data: {
        url: 'file:///none'
      },
      instanceId: 'test'
    };
    client.query(expected.capability, expected.action, expected.data, expected.instanceId, expected.priority);
    var match = written.match(/\d+\nMSG_QUERY (.*)/);
    match.should.not.be.null;
    var retobj = JSON.parse(match[1]);
    retobj.id.should.exist;
    retobj.priority.should.equal(expected.priority);
    retobj.action.should.equal(expected.action);
    retobj.data.should.deep.equal(expected.data);
    retobj.instanceId.should.equal(expected.instanceId);
  });
  
  it('can send a query fail',function() {
    var message = 'testing query fail';
    var uid = uuid.v4();
    client.sendFail(uid, message);
    var match = written.match(/\d+\nMSG_QUERY_FAIL (.*)/);
    match.should.not.be.null;
    var retobj = JSON.parse(match[1]);
    retobj.id.should.equal(uid);
    retobj.message.should.equal(message);
  });
  
  it('can send a query success',function() {
    var message = {
      test: 'success'
    };
    var uid = uuid.v4();
    client.sendSuccess(uid, message);
    var match = written.match(/\d+\nMSG_QUERY_SUCCESS (.*)/);
    match.should.not.be.null;
    var retobj = JSON.parse(match[1]);
    retobj.id.should.equal(uid);
    retobj.ret.should.deep.equal(message);
  });
  
  it('can send an app up',function() {
    client.up();
    var match = written.match(/\d+\nAPP_UP$/);
    match.should.not.be.null;
  });
  
  it('can send an app down',function() {
    client.down();
    var match = written.match(/\d+\nAPP_DOWN$/);
    match.should.not.be.null;
  });
  
  it('can send an app in use',function() {
    client.in_use();
    var match = written.match(/\d+\nAPP_IN_USE$/);
    match.should.not.be.null;
  });
  
  it('parses incoming data correctly', function(done) {
    var obj = {
      test: 'data'
    }
    var objstr = JSON.stringify(obj);
    var typestr = 'TEST_DATA';
    var body = typestr + ' ' + objstr;
    client.on(typestr, function(retobj) {
      retobj.should.deep.equal(obj);
      done();
    });
    var size = Buffer.byteLength(body, 'utf8');
    client.cli.emit('data', size+'\n'+body);
    client.cli.emit('end');
  });
  
  it('throws appropriately on malformed incoming data', function() {
    var objstr = '{ \"meh\":..~~}';
    var typestr = 'TEST_DATA';
    var body = typestr + ' ' + objstr;
    var size = Buffer.byteLength(body, 'utf8');
    client.cli.emit('data', size+'\n'+body);
    
    var exptedtr = /\d+\nMSG_MALFORMED (.*)/;
    var match = written.match(exptedtr);
    match.should.not.be.null;
    match[1].should.not.be.null;
    client.cli.emit('end');
  });
});