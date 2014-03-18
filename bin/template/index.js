var Client = require('mycroft');

function createApp(host, port, cert) {
  var client = new Client("{{name}}", path.resolve("app.json"), host, port);
  client.on('MANIFEST_OK', function(reply) {
    client.up();
  });

  function logerror(err) {
    console.log(err);
  }

  client.on('MANIFEST_ERROR', logerror);
  client.on('CONNECTION_ERROR', logerror);

  client.connect(cert);
  
  return client;
}

if (require.main === module) { //Launch normally
  var host = process.argv.length > 2 ? process.argv[2] : "localhost";
  var port = process.argv.length > 3 ? process.argv[3] : null;
  var cert = process.argv.length > 4 ? process.argv[4] : null;
  
  createApp(host, port, cert);
} else { //Export a constructor to use for testing
  module.exports = createApp;
}