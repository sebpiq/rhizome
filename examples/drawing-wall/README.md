About Blobs
--------------

This is an example of how to handle *.jpeg* files - binary data and files in general - with rhizome, even if your OSC application doesn't have a good support for sending/receiving files through OSC. The users connected to the web page can draw on a canvas, and when they click on the *"send"* button, the contents of the canvas are exported as *.jpeg*, and transmitted to OSC clients.

Let's assume that we have an OSC application with no support for sending/receiving files (in OSC, files are called *blobs*). *rhizome* comes with an small (optional) tool that takes care of transferring files. This tool needs to run on the computer that also runs the OSC application.


Instructions
--------------

Let's start the example. Open your terminal, go to the example folder and run `rhizome config-server.js`. This should start the server and print an extract of the configuration.

Open another terminal, and run `rhizome-blobs config-blobs.js`. This should start the tool for transferring files between the computer running the OSC application and the server (here they are on the same computer). When the tool started successfully an extract of the configuration should be printed.

Once both are started, you can start the processing sketch. For this sketch to run, you need to install the library [oscP5](http://www.sojamo.de/libraries/oscP5/).

Finally, open your web browser, and go to the address [http://localhost:8000/example/index.html](http://localhost:8000/example/index.html). You should see a canvas and some drawing options. Just draw something and click on *"send"*. The drawing should be transferred to the processing sketch and be displayed there. **Note :** the web page is designed for working on smartphones, therefore if you use a laptop, you can resize the window of your web browser to a "smartphone-ish" size. 
