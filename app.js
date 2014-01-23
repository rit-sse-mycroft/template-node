var tls = require('tls');
var net = require('net');
var uuid = require('uuid');
var fs = require('fs');
var MYCROFT_PORT = 1847;

var _unconsumed = '';

// Parses a received message and returns an array of commands as
// an Object containing type:String and data:Object.
function parseMessage(msg) {
  // Add the message to unconsumed.
  _unconsumed += msg.toString().trim();
  // Create an array for the newly parsed commands.
  var parsedCommands = [];
  
  while (_unconsumed != '') {
    // Get the message-length to read.
    var verbStart = _unconsumed.indexOf('\n');
    var msgLen = parseInt(_unconsumed.substr(0, verbStart));
    // Cut off the message length header from unconsumed.
    _unconsumed = _unconsumed.substr(verbStart+1);
    // Figure out how many bytes we have left to consume.
    var bytesLeft = Buffer.byteLength(_unconsumed, 'utf8');
    // Do not process anything if we do not have enough bytes.
    if (bytesLeft < msgLen) {
      break;
    }
    // Isolate the message we are actually handling.
    var unconsumedBuffer = new Buffer(_unconsumed);
    msg = unconsumedBuffer.slice(0, msgLen).toString();
    // Store remaining stuff in unconsumed.
    _unconsumed = unconsumedBuffer.slice(msgLen).toString();
    // Go process this single message.
    console.log('Got message:');
    console.log(msg);
    var type = '';
    var data = {};
    var index = msg.indexOf(' {');
    if (index >= 0) { // If a body was supplied
      type = msg.substr(0, index);
      try {
        var toParse = msg.substr(index+1);
        data = JSON.parse(toParse);
      }
      catch(err) {
        console.error('Malformed message 01');
        sendMessage(cli, "MSG_MALFORMED \n" + err);
        return;
      }
    } else { // No body was supplied
      type = msg;
    }
    
    parsedCommands.push({type: type, data: data});
  }
  return parsedCommands;
}

// If using TLS, appName is assumed to be the name of the keys.
function connectToMycroft(appName) {
  var client = null;
  if (process.argv.length === 3 && process.argv[2] === '--no-tls') {
    console.log("Not using TLS");
    client = net.connect({port: 1847}, function(err) {
      if (err) {
        console.error('There was an error establishing connection');
      }
    });
  } else {
    console.log("Using TLS");
    var connectOptions = {
      key: fs.readFileSync(appName + '.key'),
      cert: fs.readFileSync(appName + '.crt'),
      ca: [ fs.readFileSync('ca.crt') ],
      rejectUnauthorized: false,
      port: MYCROFT_PORT
    };
    client = tls.connect(connectOptions, function(err) {
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
function sendManifest(connection, path) {
  try {
    var manifest = require(path);
  }
  catch(err) {
    console.error('Invalid file path');
  }
  console.log('Sending Manifest');
  sendMessage(connection, 'APP_MANIFEST', manifest)
}

function up(connection) {
  console.log('Sending App Up');
  sendMessage(connection, 'APP_UP');
}

function down(connection) {
  console.log('Sending App Down');
  sendMessage(connection, 'APP_DOWN');
}

function query(connection, capability, action, data, instanceId, priority) {
  queryMessage = {
    id: uuid.v4(),
    capability: capability,
    action: action,
    data: data,
    priority: priority,

  };
  if (typeof(instanceId) != 'undefined') queryMessage.instanceId = instanceId;

  sendMessage(connection, 'MSG_QUERY', queryMessage);
}

//Sends a message to the Mycroft global message board.
function broadcast(connection, content) {
  message = {
    content: content
  };
  sendMessage(connection, 'MSG_BROADCAST', message);
}

// Checks if the manifest was validated and returns dependencies
function manifestCheck(parsed) {
  if (parsed.type === 'APP_MANIFEST_OK' || parsed.type === 'APP_MANIFEST_FAIL') {
    console.log('Response type: ' +  parsed.type);
    console.log('Response recieved: ' + JSON.stringify(parsed.data));

    if (parsed.type === 'APP_MANIFEST_OK') {
      console.log('Manifest Validated');
      return parsed.data.dependencies;
    } else {
      throw 'Invalid application manifest';
    }
  }
}

//Sends a message of specified type. Adds byte length before message.
//Does not need to specify a message object. (e.g. APP_UP and APP_DOWN)
function sendMessage(connection, type, message) {
  if (typeof(message) === 'undefined') {
    message = '';
  } else {
    message = JSON.stringify(message);
  }
  var body = (type + ' ' + message).trim();
  var length = Buffer.byteLength(body, 'utf8');
  console.log('Sending Message');
  console.log(length);
  console.log(body);
  connection.write(length + '\n' + body);

}

exports.parseMessage = parseMessage
exports.connectToMycroft = connectToMycroft;
exports.sendManifest = sendManifest;
exports.up = up;
exports.down = down;
exports.query = query;
exports.broadcast = broadcast;
exports.manifestCheck = manifestCheck;