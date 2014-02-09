// To receive OSC messages from rhizome
OSCFunc.new({ |args|
	("RECEIVED : ".ccatList(args)).postln;
}, '/click', nil, 9001);

// For sending osc messages to rhizome
b = NetAddr.new("localhost", 9000);

// Change lower canvas to red
b.sendMsg("/color/lowerCanvas", 0, "red");

// Change upper canvas to green
b.sendMsg("/color/upperCanvas", 0, "green");

// Correct message but for another user
b.sendMsg("/color/upperCanvas", 12, "green");

// Unknown element
b.sendMsg("/color/wot", 0, "red");

// The click page is not listening to this address, nothing happens
b.sendMsg("/hello", "there");