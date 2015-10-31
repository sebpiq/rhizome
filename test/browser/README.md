Browser testing
================

- `index.html` is a page loading the test suite and running it with mocha. It contains some code to optionally report test results to SauceLabs.
- `websocket-server.js` is a server which builds the test suite with browserify, serves the test page `index.html`, and provides an AJAX API to start/stop the websocket server, test message sending, etc ... This server can either be started as standalone to test on local browser, or it can be imported.
- `websocket-server-commands.js` is a bunch of helpers to be used by the test suite to send AJAX calls to the server `websocket-server.js`.
- `saucelabs.js` is a test runner for saucelabs. It starts `websocket-server.js`, starts an ngrok tunnel, and create a test on SauceLabs pointing to the ngrok url.