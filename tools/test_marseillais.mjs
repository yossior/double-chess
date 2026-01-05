import { fileURLToPath, pathToFileURL } from 'url';

async function test() {
  const path = pathToFileURL(new URL('../chess-front/src/engines/marseillaisEngine.js', import.meta.url).pathname);
  const mod = await import('../chess-front/src/engines/marseillaisEngine.js');

  const fen = 'rnbqkbnr/pppppppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 1';
  console.log('Testing findBestMove for fen:', fen);
  const best = await mod.findBestMove(fen, 3);
  console.log('Best move returned:', best);
}

test().catch((e) => console.error(e));
