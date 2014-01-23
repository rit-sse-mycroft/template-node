var tls = require('tls');
var net = require('net');
var uuid = require('uuid');
var fs = require('fs');
var MYCROFT_PORT = 1847;

function parseMessage(msg){
  msg = msg.toString();

  var re = /(\d+)\n([A-Z_]*) ({.*})$/;
  var msgSplit = re.exec(msg);

  if (!msgSplit) { //There is no body to this message
    re = /(\d+)\n([A-Z_]*)/
    msgSplit = re.exec(msg)
    if (!msgSplit) { //RE still doesn't match... something is wrong.
      throw "Error: Malformed Message"
    }
    var type = msgSplit[2];
    var data = {};

  } else {
    var type = msgSplit[2];
    var data = JSON.parse(msgSplit[3]);
  }
  return {type: type, data: data};
}

//path is the path to the json manifest
function connectToMycroft() {
  var client = null;
  if (process.argv.length === 3 && process.argv[2] === '--no-tls') {
    console.log("Not using TLS");
    client = net.connect({port: 1847}, function(err){
      if (err) {
        console.error('There was an error establishing connection');
      }
    });
  }
  else {
    console.log("Using TLS");
    var connectOptions = {
      key: fs.readFileSync('mock_app.key'),
      cert: fs.readFileSync('mock_app.crt'),
      ca: [ fs.readFileSync('ca.crt') ],
      rejectUnauthorized: false,
      port: MYCROFT_PORT
    };
    client = tls.connect(connectOptions, function(err){
      if (err) {
        console.error('There was an error in establishing TLS connection');
      }
    });
  }
  console.log('Connected to Mycroft');
  return client;
}

//Given the path to a JSON manifest, converts that manifest to a string,
//and precedes it with the type MANIFEST
function sendManifest(client, path) {
  try {
    var manifest = require(path);
  }
  catch(err) {
    console.error('Invalid file path');
  }
  console.log('Sending Manifest');
  sendMessage(client, 'APP_MANIFEST', manifest)
}

function up(client) {
  console.log('Sending App Up');
  sendMessage(client, 'APP_UP');
}

function down(client) {
  console.log('Sending App Down');
  sendMessage(client, 'APP_DOWN');
}

function query(client, capability, action, data, instanceId, priority) {
  queryMessage = {
    id: uuid.v4(),
    capability: capability,
    action: action,
    data: data,
    priority: priority,

  };
  if (typeof(instanceId) != 'undefined') queryMessage.instanceId = instanceId;

  sendMessage(client, 'MSG_QUERY', queryMessage);
}

function querySuccess(client, id, ret ) {
  querySuccessMessage = {
    id: id,
    ret: ret
  };

  sendMessage(client, 'MSG_QUERY_SUCCESS', querySuccessMessage);
}

function queryFail(client, id, message){
  queryFailMessage = {
    id: id,
    message: message
  };

  sendMessage(client, 'MSG_QUERY_FAIL', queryFailMessage);
}

//Sends a message to the Mycroft global message board.
function broadcast(client, content) {
  message = {
    content: content
  };
  sendMessage(client, 'MSG_BROADCAST', message);
}

// Checks if the manifest was validated and returns dependencies
function manifestCheck(data) {
  var parsed = parseMessage(data);
  if (parsed.type === 'APP_MANIFEST_OK' || parsed.type === 'APP_MANIFEST_FAIL') {
    console.log('Response type: ' +  parsed.type);
    console.log('Response recieved: ' + JSON.stringify(parsed.data));

    if (parsed.type === 'APP_MANIFEST_OK') {
      console.log('Manifest Validated');
    } else {
      throw 'Invalid application manifest';
    }
  }
}

//Sends a message of specified type. Adds byte length before message.
//Does not need to specify a message object. (e.g. APP_UP and APP_DOWN)
function sendMessage(client, type, message) {
  if (typeof(message) === 'undefined') message = '';
  else message = JSON.stringify(message);
  var body = (type + ' ' + message).trim();
  var length = Buffer.byteLength(body, 'utf8');
  console.log('Sending Message');
  console.log(length);
  console.log(body);
  client.write(length + '\n' + body);

}

exports.parseMessage = parseMessage
exports.connectToMycroft = connectToMycroft;
exports.sendManifest = sendManifest;
exports.up = up;
exports.down = down;
exports.query = query;
exports.querySuccess = querySuccess;
exports.queryFail = queryFail;
exports.broadcast = broadcast;
exports.manifestCheck = manifestCheck;
