Instructions
--------------

This folder contains a full **rhizome** application. It is a very simple example of two ways communication between a Pd/SuperCollider patch and a webpage.

To start the example, open your terminal, go to the example folder and run `rhizome config.js`. This should start the server and print `rhizome ready`. Once the server is started, open your web browser, and go to the address [http://localhost:8001/example/index.html](http://localhost:8001/example/index.html). You should see a very simple web page with two pannels. Now, open either the SuperCollider or Pure Data patch (*osc-trace.sc* or *osc-trace.pd*). They will allow you to monitor OSC messages coming in.

Time to play! Click anywhere on the upper pannel, and you should see the messages coming into Pure Data or SuperCollider. If you open the same page into another tab, and click again, you see that messages are sent as well but the first argument is different. This is because we send the **user id** as first argument. Each connected participant has a unique id that allows our installation to recognize him.

We can also send messages the other way around. In the patches provided there should be something to do that. Send a message and observe the results on the web page!
