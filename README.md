[![Build Status](https://travis-ci.org/sebpiq/rhizome.png)](https://travis-ci.org/sebpiq/rhizome)
[![Dependency status](https://david-dm.org/sebpiq/rhizome.svg)](https://david-dm.org/sebpiq/rhizome)

rhizome
=========

**rhizome** is a web server for participative performances and installations.

**rhizome** is a solution for transmitting **messages and files** between **OSC** applications, **web pages**, **midi** devices, ... therefore allowing you to control the user's devices with your installation, or allowing the participants to control your installation with their smartphones, computers or tablets.

**rhizome** was used to realize the following projects : https://github.com/sebpiq/rhizome/wiki/Gallery

![rhizome](http://sebpiq.github.io/rhizome/images/schema.svg)


Getting started
-----------------

##### 1) Install Node.js and npm

The simplest and nicest way to do this is probably by installing [nvm](https://github.com/creationix/nvm). You can also download an installer directly from [Node.js website](http://nodejs.org/download/).


##### 2) Install rhizome

Open a terminal, and simply run `npm install -g rhizome-server`. If this succeeded, you can try to run `rhizome`. This should print **rhizome** help message.


##### 3) Create a configuration file

A sample configuration file with all available options can be found [here](https://github.com/sebpiq/rhizome/blob/master/bin/config-samples/rhizome-config.js), you can use it to get started.


##### 4) Start the server

Say you have created a configuration file called `myConfig.js`. You can now start the server by running `rhizome myConfig.js` in your terminal.


##### 5) Do your thing

Now that the server is running, the only thing left is to create your application by programming a few clients for **rhizome**. There is a full example [here](https://github.com/sebpiq/rhizome/tree/master/examples/base), providing bare bones for a web page (and websocket client), a Pure Data client and a SuperCollider client.

If you have any feedback, any problem, if you need help, don't hesitate to drop a message in the [issue tracker](https://github.com/sebpiq/rhizome/issues).

Also, if you would like to add your **rhizome** project to the gallery, please contact me.


Rhizome feature list
---------------------

**Simple communication protocol**. The rhizome server receives connections from different clients (OSC, websockets, ...) and allows them to communicate together through a protocol that looks a lot like OSC :

```
/some/address ["big", "bang"]
/other/address [1.123456, Blob(100000)]
```

**Publish / Subscribe**. To receive messages sent at a given address, a client has to subscribe to that address. This avoids all messages to be sent to all clients, and therefore offers an optimized yet flexible messaging system.

**OSC support**. Any OSC client such as **Pure Data**, **Max/MSP**, **SuperCollider**, **Processing**, ... is supported out of the box.

[example](https://github.com/sebpiq/rhizome/tree/master/examples/base) | [OSC API](#from-osc-client)

**websocket support**. A websocket client is included with rhizome. It can be used in your web pages, and handles all the dirty bits of websocket communication : automatic reconnection and so on ... 

[example](https://github.com/sebpiq/rhizome/tree/master/examples/base) | [websocket client API](#from-websocket-client)

**Transferring files over OSC**. While file transfer (or binary data transfer) is not supported by many OSC clients, rhizome provides a simple tool called **rhizome-blobs** to handle this. This allows you to receive / send files from / to any OSC client through rhizome.

[example](https://github.com/sebpiq/rhizome/tree/master/examples/drawing-wall)

**Static web server**. rhizome can serve static web pages, HTML, JavaScript, CSS, ... so that you don't have to setup a separate HTTP server yourself.

[example](https://github.com/sebpiq/rhizome/tree/master/examples/base)

**Reliability**. Crashes shouldn't happen, but in case they do, your server can be restarted cleanly, and its whole state will be restored.


API
----

### System messages

The following messages are used for communication between one connection and the server

#### From OSC client

  - `/sys/subscribe <appPort> <address>` : subscribes the OSC client running at `<appPort>` to all messages sent at `<address>`.
  - `/sys/resend <appPort> <address>` : resends the last message sent at `<address>` to the OSC client running at `<appPort>`.
  - `/sys/blob <appPort> <address> <blobPath> [<arg1> <arg2> ...]` : sends the file `<blobPath>` from an OSC application to the server using **rhizome-blobs**.
  - `/sys/config <appPort> <parameter> [<arg1> <arg2> ...]` : sends configuration for the OSC client running at `<appPort>` to the rhizome server. Available parameters are :
    - `blobClient [<blobsPort>]` : tell the server that the OSC client uses **rhizome-blobs** for file transfers. `blobsPort` is the port on which **rhizome-blobs** is listening for incoming files. If not provided a default value will be chosen.

#### From WebSocket client

  - `/sys/subscribe <address>` : subscribes the web client to messages sent at `<address>`
  - `/sys/resend <address>` : resends the last message sent at `<address>`.

#### From Both

  - `/sys/connections/sendlist <clientType>` : sends the list of ids of all connections of `<clientType>` currently opened on the server. The response is sent at address `/sys/connections/<clientType>`

### Broadcast messages

The following messages are sent by the server. To receive them, you should subscribe to them.

  - `/broadcast/open/<clientType> <id>` : client `<id>` has just connected. `<clientType>` can be `websockets` or `osc`.
  - `/broadcast/close/<clientType> <id>` : client `<id>` has just disconnected. `<clientType>` can be `websockets` or `osc`


### WebSocket client


#### Event: 'connected'

This event is sent when the client successfully connected (or re-connected) with the server.


#### Event: 'message'

This is the event you need to listen in order to receive messages. For example :

```javascript
rhizome.on('message', function(address, args) {
  if (address === '/background/color') setBgColor(args[0])
})
```


#### Event: 'server full'

This event is sent when connection fails because the server is full.

```javascript
rhizome.start()

rhizome.on('server full', function() {
  showMessage('Waiting for an available space')
})

rhizome.on('connected', function() {
  hideMessage()
})
```


#### Event: 'connection lost'

Emitted when the connection to the server has been lost. You can use this e.g. to deactivate the user interface if the device is not connected anymore :

```javascript
rhizome.on('connection lost', function() {
  hideControls()
  showMessage('Reconnecting ... be patient')
})
```


#### rhizome.start([done])

Starts the client, and executes `done(err)` when complete. The fact that the client is started, doesn't mean that the client is connected. For example, if the server is full, the client will start properly but connection will be delayed until space become available.


#### rhizome.send(address[, args])

Sends a message to `address`, with an optional list of arguments `args`. For example :

```javascript
rhizome.send('/ring', ['wake up', 8.0])
rhizome.send('/mood/bad')
```


#### rhizome.utils.throttle(time, callback)

This is a helper to limit the number of messages sent to the server. Sending too many messages, too fast, might overload the network and cause the system to be unresponsive. This function can help you tackle this issue by forcing `callback(value)` to be called at most every `time` milliseconds. Example :

```javascript
// Let's assume for the sake of the example, the function `onMouseMove`
// is called every 5 milliseconds each time the mouse moves.
// We don't want to send all those messages, so we're gonna use
// `rhizome.utils.throttle` to send every 100 milliseconds instead.

var sendValue = rhizome.utils.throttle(100, function(xy) {
  rhizome.send('/mouse/xy', xy)
})

var onMouseMove function(x, y) {
  sendValue([x, y])
}
```


#### rhizome.isSupported()

Returns `true` if the current browser is supported, `false` otherwise.


#### rhizome.id

Unique id of the client. It is `null` if the web client is not connected.



For contributors
------------------


#### Activate logging

```
export DEBUG=rhizome*
```


#### Running tests and code coverage

Then from the root folder of the project, run tests like so :

```
npm test
```

And generate a coverage report like so :

```
npm run coverage
```


Changelog
-----------

- 0.7.0

  - websockets.Server:
    - changed setting `usersLimit` to `maxSockets`. 
    - removed the queuing system. When server is full, socket is simply closed.
    - each connection can have several sockets open (with same id on client side).

- 0.6.3

  - Added `/sys/connections/getlist` to get a list of connected clients

- 0.6.2

  - Fixed a bug with WebSocket client useCookies

- 0.6.1

  - Fixed a bug with WebSocket client id

- 0.6.0

  - Completely reorganized structure of the library
  - websockets.Client :
    - 'queued' event instead of 'server full'
    - `start` just returns an error if server is full and `queueIfFull` is false
  - Server should now be able to restart nicely and restore its full state after crash or normal stop.

- 0.5.2

  - Exposed clients and servers so that library can be used as a package
  - Server:
    - moved OSC server/clients to a separate library `node-moscow`
    - Refactored servers to implement `Server` and `Connection` base classes.
    - fixed a bug causing server to crash when blob client refuses connection

- 0.5.1

  - Server: fixed a bug with gulp

- 0.5.0

  - Server:
    - option `clients` removed. Now OSC connection are created on the fly instead of being declared in the config file.
    - building the web client with gulp instead of grunt

  - Blob client:
    - option `appPort` removed. Clients don't need to be declared anymore
    - option `fileExtension` to save files with a given extension


- 0.4.3

  - web client:
    - bug fixes

- 0.4.2

  - Server:
    - bug fixes

- 0.4.0

  - get the last message sent to an address by sending to `/sys/resend`

  - Web client:
    - subscribing now happens by sending to `/sys/subscribe`
    - receiving a message by listening to `'message'` event
    - events `'connected'`, `'server full'`, `'connection lost'`, `'reconnected'`
    - added `utils.throttle` function
    - added `isSupported` to test browser support

  - Server : added different transports (TCP, UDP) for OSC.

- 0.3.2

  - Web client:
    - added `utils.throttle` to limit messages sent to server
    - added `isSupported` to test browser support
    - sends `connection lost` and `reconnected` events
    - `debug` renamed to `log`

  - Server : more robust UDP connection handling

- 0.3.1

  - Server:
    - now sends messages to `/broadcast/websockets/open` and `/broadcast/websockets/open` when a websocket connection is opened or closed

  - Web client:
    - throws an error if trying to send invalid args

- 0.3.0

  - App clients:
    - clients must now subscribe by sending to `/sys/subscribe`
    - to send a blob, now clients must send to `/sys/blob`

  - Web client:
    - blobs are now handled like any other argument
    - can now both send and receive blobs
    - `message` renamed to `send`
    - `listen` renamed to `subscribe`

  - Bins:
    - config is now validated and displayed when starting the binaries

- 0.2.0

  - Web client:
    - removed `blob`, now blob sent with `message`
    - renamed `client.config.retry` to `client.config.reconnect`

  - Blob client for sending blobs web client <-> OSC
  - Added address validation

- 0.1.1
  - Fixed bugs with retry
  - In web-client : added `client.status()`

- 0.1.0 Initial release
