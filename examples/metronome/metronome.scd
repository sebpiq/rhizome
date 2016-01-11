m= NetAddr("127.0.0.1", 9000);
m.sendMsg(\reset);  //reset
m.sendMsg(\init, 80, 3);  //blackout + set max number of bars and beats per bar

(
var clock= TempoClock(75/60);  //bpm
clock.sched(0, {
	clock.beatsPerBar= 3;  //should match init above
	clock.sched(clock.nextTimeOnGrid, {
		[clock.bar, clock.beatInBar.asInteger].postln;
			m.sendMsg(\metro, clock.bar, clock.beatInBar.asInteger);
			1;
		});
		nil;
});
)
