import oscP5.*;
import netP5.*;

int imgSize = 100;
int imgPerRow = 8;
int imgPerCol = 6;

int imgCount = 0;
OscP5 oscP5;
NetAddress rhizomeLocation;
int serverOSCPort = 9000;
int appPort = 9001;
String serverIP = "127.0.0.1";

void setup() {
  size(imgPerRow * imgSize, imgPerCol * imgSize);
  
  oscP5 = new OscP5(this, appPort);
  rhizomeLocation = new NetAddress(serverIP, serverOSCPort);
  
  // Subscribe to receive messages
  OscMessage subscribeMsg = new OscMessage("/sys/subscribe");
  subscribeMsg.add(appPort);
  subscribeMsg.add("/drawing");
  oscP5.send(subscribeMsg, rhizomeLocation);
  
  //noLoop();
}

void draw() {}

void oscEvent(OscMessage msg) 
{
  if (msg.addrPattern().equals("/sys/subscribed")) {
    println("subscribed successfully to /drawing");
  } else {
    String imgPath = msg.get(0).stringValue();
    PImage img;
    int imgX = (imgCount % imgPerRow) * imgSize;
    int imgY = ((imgCount / imgPerRow) % imgPerCol) * imgSize;
    print(msg.addrPattern() + " " + imgPath);
    
    img = loadImage(imgPath, "jpg");
    image(img, imgX, imgY, imgSize, imgSize);
    redraw();
    imgCount++;
  }
}
