// To receive OSC messages from rhizome
(
thisProcess.openUDPPort(9002);
thisProcess.addOSCRecvFunc({ |args|
	("RECEIVED : ".ccatList(args)).postln;
});
)

b = NetAddr.new("localhost", 9000);

// Subscribing to receive all messages
b.sendMsg("/sys/subscribe", 9002, "/");

// Now sending stuff
b.sendMsg("/hello", "there");