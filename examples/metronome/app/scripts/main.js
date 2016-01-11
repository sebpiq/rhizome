(function() {
    var ctx;
    var maxBars= 100;
    var maxBeat= 3;
    var can;

    function ctxInit() {
        can= document.getElementById('canvas');
        can.setAttribute('width', window.innerWidth);
        can.setAttribute('height', window.innerHeight);
        ctx= can.getContext('2d');
        ctx.font= ''+(can.width*0.1)+'px sans-serif';
    }
    function ctxClear() {
        ctx.clearRect(0, 0, can.width, can.height);
    }
    function ctxMetro(bar, beat) {
        var x, r;
        ctxClear();
        ctx.beginPath();
        ctx.fillStyle= 'white';
        ctx.fillText(''+bar+'/'+maxBars, can.width*0.05, can.height*0.5);
        if(beat===0) {
            ctx.fillStyle= 'red';
        } else {
            ctx.fillStyle= 'grey';
        }
        r= (can.width*0.5)/maxBeat;
        x= beat*r;
        ctx.arc(x+(can.width*0.5), can.height*0.45, r*0.5, 0, 2*Math.PI);
        ctx.fill();
    }

    (function() {
        console.log('metro starting....');
        rhizome.start(function(err) {
            if (err) throw err;
            console.log('metro subscribing...');
            rhizome.send('/sys/subscribe', ['/metro']);
            rhizome.send('/sys/subscribe', ['/reset']);
            rhizome.send('/sys/subscribe', ['/init']);
        });
        rhizome.on('message', function(addr, args) {
            console.log('received:', addr, args);
            if(addr==='/metro') {
                ctxMetro(args[0], args[1]);
            } else if(addr==='/reset') {
                ctxMetro(0, 0);
            } else if(addr==='/init') {
                if (typeof(args[0])==='undefined') {
                    maxBars= 100;
                } else {
                    maxBars= args[0];
                }
                if (typeof(args[1])==='undefined') {
                    maxBeat= 3;
                } else {
                    maxBeat= args[1];
                }
                console.log('setting maxBars to '+maxBars+' and maxBeat to '+maxBeat);
                ctxClear(); //blackout
            }
        });
        rhizome.on('connected', function() {
            console.log('metro connected');
        });
        ctxInit();
    })();
})();
