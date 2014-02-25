template-node
=============

mycroft.js is a mycroft client application module/class/template/interface used to interact with the mycroft ai core server. It exports the Mycroft object.

#Example
```js
var MycroftClient = require('mycroft');

var cli = new MycroftClient();
cli.on('MANIFEST_OK', function(reply) {
  cli.up();
});
```

#MycroftClient
##Constructor
```
var cli = new MycroftClient(logfile, manifestfile, hostname, port);
```
All arguments are optional.

##Fields
```
name //logfile name ass passed to contructor or 'mycroft_client'
status //current status, eg. 'down', 'up', or 'in_use'
host //hostname as passed to the constructor or 'localhost'
manifest_loc //manifest file location as passed to the contructor or 'app.json'
port //port as passed to the contructor or 1847
dependencies //dependency list as mantained by APP_DEPENDENCY messages
logger //a winston logger used to record debug output
```

##Functions
###connect(certificate)
Connects to the mycroft server. `certificate` is the location of the certificate file. If it is not passed, it will connect without using TLS.
###sendManifest(path)
Sends the manifest to the connected server. `path` is an optional override to a manifest file.
###up
Sends `APP_UP` to the connected server.
###down
Sends `APP_DOWN` to the connected server.
###in_use
Sends `APP_IN_USE` to the connected server.
###query(capability, action, data, instanceId, priority)
Sends a `MSG_QUERY` to the server. `capability` is the capability to send to, `action` is the action field of the query (optional). `data` is that data of the query (optional). `priority` is the message priority (defaults to 30). `instanceId` is an array of instanceIds to send to (must be an array, defaults to `[]`).
###sendSuccess(id, message)
Sends a `MSG_QUERY_SUCCES` to the connected server for specified `id` with the given `message`.
###sendFail(id, message)
Sends a `MSG_QUERY_FAIL` to the connected server for specified `id` with the given `message`.
###broadcast(content)
Sends a `MSG_BROADCAST` to the connected server with the given `content` (should be a JSON object).
###sendMessage(type, data)
Sends any old message with type string `type` and data block `data`.

##Events
The client fires events for all message types it recieves, as it recieves them. (For example, `APP_DEPENDENCY` or `MSG_QUERY`) Additionally, it also fires:

* `CONNECTION_CLOSED` - Emitted when the connection is closed
* `CONNECTION_ERROR` - Emitted when the connection errors
* `MANIFEST_ERROR` - Emitted when the manifest cannot be loaded



