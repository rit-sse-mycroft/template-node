var mocha = require('mocha');
var net = require('net');
var app = require('../index.js');

describe('{{name}}', function() {

  var port = 6001;
  var setupCliServ = function(test) {
    var serv = net.createServer(function(c) {
      test(c);
    });
    serv.listen(port);
    var cli = app("localhost", port);
    return {client: cli, server: serv};
  };
  
  it('should establish a connection to a mycroft server', function(done) {
    var expected_type = /APP_MANIFEST/;
    setupCliServ(function(conn){
      var buf = new Buffer(0);
      conn.on('data', function(data) {
        buf = Buffer.concat(buf, data);
        if (buf.toString().match(expected_type)) {
          done();
        }
      });
      
      conn.on('end', function(dat) {
        done("Connection ended before manifest message was recieved.");
      });
    });
  });
  
});