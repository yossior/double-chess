self.onerror = function(msg, url, line, col, error) {
  console.error('[FairyWorker] Global Error:', msg, url, line, col, error);
};

// Define Module before importing to catch early configuration
var Module = {
  locateFile: function(path) {
    console.log('[FairyWorker] locateFile:', path);
    if (path.indexOf('stockfish.wasm') > -1) {
        return '/stockfish/fairy/stockfish.wasm';
    }
    if (path.indexOf('stockfish.worker.js') > -1) {
        return '/stockfish/fairy/stockfish.worker.js';
    }
    return '/stockfish/fairy/' + path;
  },
  print: function(text) {
    console.log('[FairyWorker] print:', text);
  },
  printErr: function(text) {
    console.warn('[FairyWorker] printErr:', text);
  },
  mainScriptUrlOrBlob: '/stockfish/fairy/stockfish.js' // Help Emscripten find itself
};

importScripts('stockfish.js');

console.log('[FairyWorker] Scripts imported. Stockfish type:', typeof Stockfish);

if (typeof Stockfish === 'function') {
    Stockfish(Module).then(sf => {
      console.log('[FairyWorker] Engine initialized');
      
      self.onmessage = function(event) {
        if (!event) {
            console.warn('[FairyWorker] Received null event');
            return;
        }
        console.log('[FairyWorker] Main -> Engine:', event.data);
        sf.postMessage(event.data);
      };

      sf.addMessageListener(function(line) {
        console.log('[FairyWorker] Engine -> Main:', line);
        self.postMessage(line);
      });
    }).catch(err => {
        console.error('[FairyWorker] Initialization failed:', err);
        self.postMessage('error: ' + err.message);
    });
} else {
    console.error('[FairyWorker] Stockfish function not found after import.');
}
