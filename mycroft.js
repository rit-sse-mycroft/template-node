var tls = require('tls');
var net = require('net');
var util = require('util');
var node_crypto = require('crypto');
var uuid = require('uuid');
var fs = require('fs');
var sys = require('sys');
var exec = require('child_process').exec;
var http = require('http');
var EventEmitter = require('events').EventEmitter;

//Default mycroft port, used if port is not passed to constructor
var MYCROFT_PORT = 1847;

var Mycroft = function(name, manifest, host, port) {

  this._manifestOverrides = {};
  if (manifest instanceof Object) {
    //Use the given object as the manifest, sicne it was given instead of a path
    this.manifest = manifest;
  } else {
    this.manifest_loc = manifest;
  }
  this.name = name || 'mycroft_client';
  if (name) {
    this.addManifestOverride('instanceId', name); //Given name overrides instanceId
  }
  this.status = 'down';
  this.host = host || 'localhost';
  this.port = port || MYCROFT_PORT;
  this.dependencies = {};
  this._msgDataBuffer = new Buffer(0);

  //Call our handler when the process dies and close the connection
  var self = this;
  process.on("SIGINT", function(){
    //graceful shutdown
    if (self.conn) {
      self.conn.emit('end', {'sigint': true});
      self.conn.destroy();
    }
    process.exit();
  });

  this.on('APP_DEPENDENCY', this._updateDependencies);
};
util.inherits(Mycroft, EventEmitter); //Gives Mycroft instances the EventEmitter interface

Mycroft.prototype.addManifestOverride = function(key, value) {
  this._manifestOverrides[key] = value;
};

Mycroft.prototype.removeManifestOverride = function(key) {
  delete this._manifestOverrides[key];
};

//Call with the a dependency table to update stored dependencies
Mycroft.prototype._updateDependencies = function(deps) {
  for(var capability in deps){
    this.dependencies[capability] = this.dependencies[capability] || {};
    for(var appId in deps[capability]){
      this.dependencies[capability][appId] = deps[capability][appId];
    }
  }
};

//If cert_name is provided, we connect with TLS, otherwise we do not
Mycroft.prototype.connect = function (cert_name) {
  var client = null;
  if (!cert_name) {
    client = net.connect({port: this.port, host:this.host}, function(err) {
      this.emit('CONNECTION_ERROR', err);
    });
  } else {
    var connectOptions = {
      key: fs.readFileSync(cert_name + '.key'),
      cert: fs.readFileSync(cert_name + '.crt'),
      ca: [ fs.readFileSync('ca.crt') ],
      rejectUnauthorized: false,
      port: this.port,
      host: this.host
    };
    client = tls.connect(connectOptions, function(err) { 
      this.emit('CONNECTION_ERROR', err);
    });
  }

  this._setClient(client);
};

Mycroft.prototype._setClient = function(client) {
  var self = this;
  self.conn = client;

  self.conn.on('error', function(err) {
    self.emit('CONNECTION_ERROR', err);
  }); 
  self.conn.on('data', function(data) {
    self._compileMessage(data);
  });
  self.conn.on('end', function(data) {
    self.emit('CONNECTION_CLOSED', data);
    self.status = 'down';
  });
};

Mycroft.prototype._parseMsg = function(type, data) {
  var jsonobj = null;
  if (data.trim()==='') {
    return this.emit(type, jsonobj);
  }
  try {
    jsonobj = JSON.parse(data);
  } catch (e) {
    this._sendMsg('MSG_GENERAL_FAILURE', {'received': data, 'message': 'Parsing JSON data failed.'});
    return this.emit('MALFORMED_JSON', data);
  }
  return this.emit(type, jsonobj);
};

Mycroft.prototype._compileMessage = function(data) {
  this._msgDataBuffer = Buffer.concat([this._msgDataBuffer, data]);

  //Iterate until newline
  var pos;
  for (var i=0; i<this._msgDataBuffer.length; i++) {
    if (String.fromCharCode(this._msgDataBuffer[i])==='\n') {
      pos = i;
      break;
    }
  }

  //Return if one isn't found
  if (!pos)
    return;

  //Get the size of the message
  var bytesize = parseInt(this._msgDataBuffer.slice(0,pos));

  //Get the remainder of the message
  var remainder = this._msgDataBuffer.slice(pos);

  //Ensure there is at least that size remaining
  if (remainder.length<bytesize) 
    return;

  var message = remainder.slice(0, bytesize+1);
  this._msgDataBuffer = remainder.slice(bytesize+1);
  //Loop until we find a space or a newline
  var spPos;
  for (var j=1; j<message.length; j++) {
    if (String.fromCharCode(message[j]).match(/[\s\n]/)) {
      spPos = j;
      break;
    }
  }

  //Couldn't find a type?
  if (!spPos)
    return;

  var type = message.slice(0, spPos);
  var jsonm = message.slice(spPos);

  this._parseMsg(type.toString().trim(), jsonm.toString().trim());
  if (this._msgDataBuffer.length > 0) {
    this._compileMessage(new Buffer(0));
  }
};

//Sends a message of specified type. Adds byte length before message.
//Does not need to specify a message object. (e.g. APP_UP and APP_DOWN)
Mycroft.prototype._sendMsg = function (type, message) {
  if (typeof(message) === 'undefined') {
    message = '';
  } else {
    message = JSON.stringify(message);
  }
  var body = (type + ' ' + message).trim();
  var length = Buffer.byteLength(body, 'utf8');
  if (this.conn) {
    this.conn.write(length + '\n' + body);
  } else {
    this.emit('CONNECTION_ERROR', {'error': 'Message send failed', 'data': {'type': type, 'message': message}});
  }
};

Mycroft.prototype._applyManifestOverrides = function(json) {        
  for (var k in this._manifestOverrides) {
    if (this._manifestOverrides.hasOwnProperty(k) && (this._manifestOverrides[k]!==null)) {
      json[k] = this._manifestOverrides[k];
    }
  }
  return json;
};

//Call with the path to an app manifest (otherwise we assume the default location)
//Sends the manifest to the server
Mycroft.prototype.sendManifest = function (path) {
  if ((!path) && this.manifest && this.manifest!==null) {
    var json = this._applyManifestOverrides(this.manifest);
    this._sendMsg('APP_MANIFEST', json);
    return; //Had a manifest object
  }
  var self = this;
  path = path || this.manifest_loc; //use manifest location from constructor if possible
  try {
    fs.readFile(path, 'utf-8', function(err, data) {
      if (err) {
        self.emit('MANIFEST_ERROR', err);
      }

      var json;
      try {
        json = JSON.parse(data);
      }
      catch(erro) {
        self.emit('MANIFEST_ERROR', erro);
      }

      if (json) {
        json = self._applyManifestOverrides(json);
        self._sendMsg('APP_MANIFEST', json);
      }
    });
  }
  catch(err) {
    self.emit('MANIFEST_ERROR', err);
  }
};

//Sends APP_UP
Mycroft.prototype.up = function() {
  this.status = 'up';
  this._sendMsg('APP_UP');
};

//Sends APP_DOWN
Mycroft.prototype.down = function() {
  this.status = 'down';
  this._sendMsg('APP_DOWN');
};

//Sends APP_IN_USE
Mycroft.prototype.in_use = function() {
  this.status = 'in use';
  this._sendMsg('APP_IN_USE');
};

//Sends a query to the server
Mycroft.prototype.query = function (capability, action, data, instanceId, priority) {
  var queryMessage = {
    id: uuid.v4(),
    capability: capability,
    action: action || '',
    data: data || '',
    priority: priority || 30,
    instanceId: instanceId || []
  };

  this._sendMsg('MSG_QUERY', queryMessage);
};

//Sends a query success to the server (only call if the server queries you)
Mycroft.prototype.sendSuccess = function(id, ret) {
  var querySuccessMessage = {
    id: id,
    ret: ret
  };

  this._sendMsg('MSG_QUERY_SUCCESS', querySuccessMessage);
};

//Sends a query fail to the server (only call if the server queries you)
Mycroft.prototype.sendFail = function (id, message) {
  var queryFailMessage = {
    id: id,
    message: message
  };

  this._sendMsg('MSG_QUERY_FAIL', queryFailMessage);
};

//Broadcasts a message
Mycroft.prototype.broadcast = function(content) {
  var message = {
    id: uuid.v4(),
    content: content
  };
  this._sendMsg('MSG_BROADCAST', message);
};

module.exports = Mycroft; //Exports the object
