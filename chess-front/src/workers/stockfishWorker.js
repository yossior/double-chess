// stockfishWorker.js
// Use the single-threaded lite JS file
importScripts("/stockfish/stockfish-17.1-lite-single-03e3232.js");

// Forward messages from Stockfish to main thread
onmessage = (event) => {
  stockfish.postMessage(event.data);
};

// Forward Stockfish messages to main thread
stockfish.onmessage = (event) => {
  postMessage(event.data);
};
