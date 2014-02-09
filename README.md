[![Build Status](https://travis-ci.org/sebpiq/rhizome.png)](https://travis-ci.org/sebpiq/rhizome)

**rhizome** is a web server for participative performances and installations.


![Alt text](https://raw2.github.com/sebpiq/rhizome/master/images/schema.png)

**(1)** a participant wants to join in with her tablet. She open her web browser and connects to the web page.

**(2)** the installation sends messages through **OSC** to the rhizome server. Those messages are transmitted to all the participants, and handled by the web page.

**(3)** the web page can also send messages via **websocket** to the rhizome server. Those messages will be transmitted to the installation via OSC. 


So what does rhizome do precisely ?
-------------------------------------

**rhizome** does two things for you. Firstly it is a web server that can serve static content (web page, JavaScript files, images ...). Secondly it provides an easy API for transmitting messages **OSC <-> web page**, therefore allowing you to control the user's devices with your installation, or allowing the participants to control your installation with their smartphones, computers or tablets (in fact pretty much any device that has a web browser).

So **rhizome** provides you with a solid architecture for communication between a web page and a setup that supports OSC. But of course, you still have to implement what's on both ends of the chain :

1. the installation / performance setup. It can be implemented with anything that supports **OSC** messaging (Pure Data, SuperCollider, openFrameworks, ...)
2. the web page. It should be implemented with JavaScript and HTML. However, **rhizome** comes with a JavaScript file that provides an easy API for messaging with the server. So you shouldn't have to worry about the communication part. Instead, focus on implementing a nice user interface / cool visuals / cool sounds.


Getting started
-----------------

#### Installing *Node.js* and *npm*

The simplest way to do this (in my opinion) is by using [nvm](https://github.com/creationix/nvm).

An alternative way is to download an installer directly from [Node.js website](http://nodejs.org/download/).


#### Installing *rhizome*

Open a terminal, and simply run `npm install -g rhizome`.

If this succeeded, you can try to run `rhizome`. This should print **rhizome** help message.


#### Implementing stuff

More documentation will come soon. But for the moment, you can check-out the [example](https://github.com/sebpiq/rhizome/tree/master/example).


#### That's it!

Please if you have any feedback, any problem, if you need help, don't hesitate to drop a message in the [issue tracker](https://github.com/sebpiq/rhizome/issues). 


Real life projects
----------------------

**rhizome** was used to realize the following projects :

- *The Projectionist Orchestra*. Live audio-visual performance, where the audience can control sound and visuals with their smartphones.
- *Fields*. Diffusion of field recordings through the smartphones from people in the audience. The connected devices become a giant granular synthesizer that the performers can manipulate live with a midi controller.


For contributors
------------------

#### Activate logging

```
export DEBUG=rhizome.*
```
