module.exports = {
  // [required] : the path on your file system of the folder where you want to save blobs 
  blobsDir: '/tmp/',

  // [default=44444] : the port on which rhizome-blobs will receive blobs on your local machine
  blobsPort: 44444,

  // [default=44445] : the port on which the server will receive blobs
  serverBlobsPort: 44445,

  // [default='localhost'] : the ip or hostname of the server
  serverHostname: 'localhost',

  // [optional] : set this if you want blobs to be saved with a given file extension
  fileExtension: '.txt'
}