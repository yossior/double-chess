import Board from "./Board";

/**
 * Local board: creates chess controller + stockfish engine and passes them to BoardCore
 */
export default function LocalBoard({
  chess,          // <--- Make sure this is destructured
  stockfish,
  clock,
  ...props        // <--- Catch 'viewIndex' and 'onNavigate' here
}) {
  return (
    <div className="flex flex-col gap-4">
      <Board
        chess={chess}       // <--- Pass it down!
        mode="local"
        opponent={stockfish}
        clock={clock}
        {...props}          // <--- Pass history props down
      />
      {/* Any other local UI (like difficulty selector) goes here */}
    </div>
  );
}
