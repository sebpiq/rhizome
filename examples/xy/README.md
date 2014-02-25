Instructions
--------------

This folder contains a full **rhizome** application.

It is a very simple example, where 6 users connected to the web page can control a synthesizer implemented in Pure Data. 

To start the example, open your terminal, go to the example folder and run `rhizome config.js`. This should start the server and print an extract of the configuration.

Once the server is started, open your web browser, and go to the address [http://localhost:8000/example/index.html](http://localhost:8000/example/index.html). You should see a black web page.

Finally, open the Pure Data patch *lame-fm.pd*.

Now just click and move your mouse on the web page and you should hear sound coming from Pure Data.

You can also try to open the same page into another tab, to simulate multiple connections. The pitch should be different for each user.
