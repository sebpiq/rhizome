// To receive OSC messages from rhizome
OSCFunc.new({ |args|
	('RECEIVED : ' + args).postln;
}, '/click', nil, 9001);

// For sending osc messages to rhizome
b = NetAddr.new("localhost", 9000);

// Change lower canvas to red
b.sendMsg("/color/lowerCanvas", "red");

// Change upper canvas to green
b.sendMsg("/color/upperCanvas", "green");

// Unknown element
b.sendMsg("/color/wot", "red");

// The click page is not listening to this address, nothing happens
b.sendMsg("/hello", "there");