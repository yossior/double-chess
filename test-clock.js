// Simulate the frontend formatClockTime function
const formatClockTime = (move) => {
  if (!move || typeof move === 'string') return null;
  const color = move.color;
  const ms = color === 'w' ? move.whiteMs : move.blackMs;
  console.log('  color:', color, 'whiteMs:', move.whiteMs, 'blackMs:', move.blackMs, 'selected ms:', ms);
  if (ms === undefined || ms === null) return null;
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + seconds.toString().padStart(2, '0');
};

// Test with sample moves like the server would send
const testMoves = [
  { san: 'e4', color: 'w', whiteMs: 182000, blackMs: 180000 },
  { san: 'd5', color: 'b', whiteMs: 182000, blackMs: 178500 },
  { san: 'Nf3', color: 'w', whiteMs: 180000, blackMs: 178500 },
];

console.log('Testing formatClockTime with sample moves:');
testMoves.forEach((move, i) => {
  console.log('Move ' + i + ': ' + move.san);
  const time = formatClockTime(move);
  console.log('  Result:', time);
});
