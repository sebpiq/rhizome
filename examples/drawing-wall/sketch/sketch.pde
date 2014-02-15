import oscP5.*;
import netP5.*;

int imgSize = 100;
int imgPerRow = 8;
int imgPerCol = 6;

int imgCount = 0;
OscP5 oscP5;
NetAddress myRemoteLocation;

void setup() {
  size(imgPerRow * imgSize, imgPerCol * imgSize);
  oscP5 = new OscP5(this, 9001);
  myRemoteLocation = new NetAddress("127.0.0.1", 5001);
  //noLoop();
}

void draw() {}

void oscEvent(OscMessage msg) 
{
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
