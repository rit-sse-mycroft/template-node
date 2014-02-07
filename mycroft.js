var tls = require('tls');
var net = require('net');
var node_crypto = require('crypto');
var uuid = require('uuid');
var fs = require('fs');
var sys = require('sys')
var exec = require('child_process').exec;
var http = require('http')
var winston = require('winston');
var fs = require('fs')

var readLine = require("readline");
if(process.platform === "win32"){
  var rl = readLine.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function (){
    process.emit ("SIGINT");
  });
}

var MYCROFT_PORT = 1847;

var Mycroft = function(name, manifest, host, port) {

  this.status = 'down';
  this.host = host || 'localhost';
  this.manifest_loc = manifest || 'app.json';
  this.port = port || MYCROFT_PORT;
  this.handlers = {};

  this._unconsumed = '';

  var obj = this
  process.on("SIGINT", function(){
    //graceful shutdown
    obj.connectionClosed();
    process.exit();
  });

  fs.mkdir('logs', function(err){});

  this.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({ level: 'debug', colorize: true, timestamp: true }),
      new (winston.transports.DailyRotateFile)({dirname: 'logs', filename: name + '.log', timestamp: true, json: false})
    ]
  });

  // Parses a received message and returns an array of commands as
  // an Object containing type:String and data:Object.
  // There is not a doubt in my mind that this is not poorly written
  this.parseMessage = function (msg) {
    // Add the message to unconsumed.
    this._unconsumed += msg.toString().trim();
    // Create an array for the newly parsed commands.
    var parsedCommands = [];

    while (this._unconsumed != '') {
      // Get the message-length to read.
      var verbStart = this._unconsumed.indexOf('\n');
      var msgLen = parseInt(this._unconsumed.substr(0, verbStart));
      // Cut off the message length header from unconsumed.
      this._unconsumed = this._unconsumed.substr(verbStart+1);
      // Figure out how many bytes we have left to consume.
      var bytesLeft = Buffer.byteLength(this._unconsumed, 'utf8');
      // Do not process anything if we do not have enough bytes.
      if (bytesLeft < msgLen) {
        break;
      }
      // Isolate the message we are actually handling.
      var unconsumedBuffer = new Buffer(this._unconsumed);
      msg = unconsumedBuffer.slice(0, msgLen).toString();
      // Store remaining stuff in unconsumed.
      this._unconsumed = unconsumedBuffer.slice(msgLen).toString();
      // Go process this single message.
      var type = '';
      var data = {};
      var index = msg.indexOf(' ');
      if (index >= 0) { // If a body was supplied
        type = msg.substr(0, index);
        try {
          var toParse = msg.substr(index);
          data = JSON.parse(toParse);
        }
        catch(err) {
          this.logger.error('Received malformed message, responding with MSG_MALFORMED');
          this.sendMessage("MSG_MALFORMED \n" + err);
          return;
        }
      } else { // No body was supplied
        type = msg;
      }

      this.logger.info('Got message: ' + type);
      this.logger.debug(msg);

      parsedCommands.push({type: type, data: data});
    }
    return parsedCommands;
  }

  // If using TLS, appName is assumed to be the name of the keys.
  //process.argv.length === 3 && process.argv[2] === '--no-tls'
  this.connect = function (cert_name) {
    var client = null;
    if (!cert_name) {
      this.logger.info("Not using TLS");
      client = net.connect({port: this.port, host:this.host}, function(err) {
        if (err) {
          this.logger.error('There was an error establishing connection');
        }
      });
      var obj = this;
      client.on('error', function(err) {
        obj.logger.error("Connection error!")
        obj.logger.error(err)
        obj.handle('CONNECTION_ERROR', err)
      });
    } else {
      this.logger.info("Using TLS");
      var connectOptions = {
        key: fs.readFileSync(cert_name + '.key'),
        cert: fs.readFileSync(cert_name + '.crt'),
        ca: [ fs.readFileSync('ca.crt') ],
        rejectUnauthorized: false,
        port: this.port,
        host: this.host
      };
      client = tls.connect(connectOptions, function(err) {
        if (err) {
          this.logger.error('There was an error in establishing TLS connection');
        }
      });
      var obj = this;
      client.on('error', function(err) {
        obj.logger.error("Connection error!")
        obj.logger.error(err)
        obj.handle('CONNECTION_ERROR', err)
      });
    }
    this.logger.info('Connected to Mycroft');
    this.cli = client;
    var obj = this;
    this.cli.on('data', function(msg) {
      var parsed = obj.parseMessage(msg);
      for(var i = 0; i < parsed.length; i++) {
        obj.handle(parsed[i].type, parsed[i].data);
      }
    });
    this.cli.on('end', function(data) {
      obj.connectionClosed(data);
    });
  }

  this.on = function(name, func) {
    if (!this.handlers[name]) {
      this.handlers[name] = [];
    }
    this.handlers[name].push(func);
  }

  this.connectionClosed = function(data) {
    this.handle('CONNECTION_CLOSED', data)
    this.down();
    this.logger.info("Connection closed.");
  }

  this.handle = function(type, data) {
    if (this.handlers[type]) {
      for (var i=0; i<this.handlers[type].length; i++) {
        this.handlers[type][i](data);
      }
    } else {
      this.logger.warn("not handling messages:");
      this.logger.warn(type+": "+JSON.stringify(data));
    }
  }

  //Given the path to a JSON manifest, converts that manifest to a string,
  //and precedes it with the type MANIFEST
  this.sendManifest = function (path) {
    var obj = this;
    var path = path || this.manifest_loc; //use manifest location from constructor if possible
    try {
      this.logger.debug("Reading a manifest!")
      fs.readFile(path, 'utf-8', function(err, data) {
        if (err) {
          obj.logger.error("Error reading manifest:");
          obj.logger.error(err);
          obj.handle('MANIFEST_ERROR', err);
        }

        var json;
        try {
          json = JSON.parse(data);
        }
        catch(err) {
          obj.logger.error("Error parsing manifest:");
          obj.logger.error(err);
          obj.handle('MANIFEST_ERROR', err);
        }

        if (json) {
          obj.logger.info('Sending Manifest');
          obj.sendMessage('APP_MANIFEST', json);
        }
      })
    }
    catch(err) {
      obj.logger.error('Invalid file path');
      obj.handle('MANIFEST_ERROR', err);
    }
  }

  this.up = function() {
    this.logger.info('Sending App Up');
    this.status = 'up';
    this.sendMessage('APP_UP');
  }

  this.down = function() {
    this.logger.info('Sending App Down');
    this.status = 'down';
    this.sendMessage('APP_DOWN');
  }

  this.in_use = function() {
    this.logger.info('Sending App In Use');
    this.status = 'in use';
    this.sendMessage('APP_IN_USE');
  }

  this.query = function (capability, action, data, instanceId, priority) {
    this.logger.info('Sending query')
    var queryMessage = {
      id: uuid.v4(),
      capability: capability,
      action: action || '',
      data: data || '',
      priority: priority || 30,

    };
    if (typeof(instanceId) != 'undefined') queryMessage.instanceId = instanceId;

    this.sendMessage('MSG_QUERY', queryMessage);
  }

  this.sendSuccess = function(id, ret) {
    this.logger.info('Sending query success')
    var querySuccessMessage = {
      id: id,
      ret: ret
    };

    this.sendMessage('MSG_QUERY_SUCCESS', querySuccessMessage);
  }

  this.sendFail = function (id, message) {
    this.logger.info('Sending query fail')
    var queryFailMessage = {
      id: id,
      message: message
    };

    this.sendMessage('MSG_QUERY_FAIL', queryFailMessage);
  }

  //Sends a message to the Mycroft global message board.
  this.broadcast = function(content) {
    this.logger.info('Sending broadcast');
    message = {
      id: uuid.v4(),
      content: content
    };
    this.sendMessage('MSG_BROADCAST', message);
  }

  this.appManifestOk = function(){
    this.logger.info('Manifest Validated');
  }

  this.appManifestFail = function(){
    this.logger.error('Invalid application manifest')
    throw 'Invalid application manifest';
  }

  this.msgGeneralFailure = function(data){
    this.logger.error(data.message);
  }

  //Sends a message of specified type. Adds byte length before message.
  //Does not need to specify a message object. (e.g. APP_UP and APP_DOWN)
  this.sendMessage = function (type, message) {
    if (typeof(message) === 'undefined') {
      message = '';
    } else {
      message = JSON.stringify(message);
    }
    var body = (type + ' ' + message).trim();
    var length = Buffer.byteLength(body, 'utf8');
    this.logger.debug(length + ' ' + body);
    if (this.cli) {
      this.cli.write(length + '\n' + body);
    } else {
      this.logger.error("The client connection wasn't established, so the message could not be sent.");
    }
  }

  // Some generic handlers that all apps will use
  this.on('APP_MANIFEST_OK', function(data){
    obj.appManifestOk();
  });

  this.on('APP_MANIFEST_FAIL', function(data){
    obj.appManifestFail();
  });

  this.on('MSG_GENERAL_FAILURE', function(data){
    obj.msgGeneralFailure(data);
  });

  return this;
}

exports.Mycroft = Mycroft