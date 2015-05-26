Instructions
--------------

This folder contains a full **rhizome** application.

It shows simple message sending / receiving with different clients for **rhizome** :

- a static webpage (communication over websockets)
- SuperCollider (communication over OSC)
- Pure Data (communication over OSC)

To start the server, open your terminal, go to the example folder and run `rhizome config.js`. This should start the server and print an extract of the configuration.

Then, open either of the clients and try sending messages. Other clients that have subscribed to the right address should receive these messages.

To open the web page (websocket client), just go to [http://localhost:8000/index.html](http://localhost:8000/index.html).

All the code for the web page is in [pages/index.html](https://github.com/sebpiq/rhizome/blob/master/examples/base/pages/index.html) once you got the example working, you can just modify the html/javascript there to fit your needs.
