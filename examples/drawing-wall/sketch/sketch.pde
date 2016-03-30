import oscP5.*;
import netP5.*;

// Networking settings
int serverOSCPort = 9000;
int appPort = 9001;
String serverIP = "127.0.0.1";

// Other settings
int imgSize = 100;
int imgPerSide = 8;
int canvasWidth = imgPerSide * imgSize;
int canvasHeight = imgPerSide * imgSize;
// Must be inside the "blobsDir" folder set in "config-blobs.js"
String saveImgPath = "/tmp/exportedImg.png";
String imgToLoad = null;

int imgCount = 0;
OscP5 oscP5;
NetAddress rhizomeLocation;
void settings() {
  size(canvasWidth, canvasHeight);
}
void setup() {
  background(255);
  oscP5 = new OscP5(this, appPort);
  rhizomeLocation = new NetAddress(serverIP, serverOSCPort);

  // Subscribe to receive messages from /drawing
  OscMessage subscribeMsg = new OscMessage("/sys/subscribe");
  subscribeMsg.add(appPort);
  subscribeMsg.add("/drawing");
  oscP5.send(subscribeMsg, rhizomeLocation);

  // Configure the server to use rhizome-blobs to send/receive images
  OscMessage configMsg = new OscMessage("/sys/config");
  configMsg.add(appPort);
  configMsg.add("blobClient");
  oscP5.send(configMsg, rhizomeLocation);
}

void draw() {
  if (imgToLoad != null) {
    int imgX = (imgCount % imgPerSide) * imgSize;
    int imgY = ((imgCount / imgPerSide) % imgPerSide) * imgSize;
    PImage img = loadImage(imgToLoad);
    image(img, imgX, imgY, imgSize, imgSize);
    imgCount++;
    imgToLoad = null;
  }
}

void oscEvent(OscMessage msg) {
  if (msg.addrPattern().equals("/sys/subscribed")) {
    println("subscribed successfully to /drawing");
  } else if (msg.addrPattern().equals("/sys/configured")) {
    println("successfully configured the blob client");
  } else if (msg.addrPattern().equals("/drawing")) {
    imgToLoad = msg.get(0).stringValue();
    println(msg.addrPattern() + " " + imgToLoad);
  } else {
    println("unexpected message received " + msg.addrPattern());
  }
}

void mouseClicked() {
  save(saveImgPath);
  println("exported current canvas to " + saveImgPath);

  // Send the image to rhizome at address /mosaic
  OscMessage sendBlobMsg = new OscMessage("/sys/blob");
  sendBlobMsg.add(appPort);
  sendBlobMsg.add("/mosaic");
  sendBlobMsg.add(saveImgPath);
  oscP5.send(sendBlobMsg, rhizomeLocation);
}
