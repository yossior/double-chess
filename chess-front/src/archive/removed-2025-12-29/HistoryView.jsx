export default function HistoryView({chess}) {
    console.log(chess.chessGame);
    
    return <div className="flex justify-between mb-4">
        {chess.chessGame.pgn({ maxWidth: 5, newline: '<br />' })}
    </div>
}