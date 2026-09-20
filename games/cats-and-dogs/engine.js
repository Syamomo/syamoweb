export const PLAYERS = ['cat', 'dog'];
export const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const PIECES = PLAYERS.flatMap(owner => [1,2,3].flatMap(size => [0,1].map(copy => Object.freeze({id:`${owner}-${size}-${copy}`, owner, size}))));
const byId = new Map(PIECES.map(piece => [piece.id, piece]));
export const pieceById = id => byId.get(id);
export const other = owner => owner === 'cat' ? 'dog' : 'cat';

export class Game {
  constructor(first = 'cat') { this.reset(first); }
  reset(first = 'cat') {
    this.board = Array.from({length:9}, () => []);
    this.reserve = new Set(PIECES.map(p => p.id));
    this.turn = PLAYERS.includes(first) ? first : 'cat';
    this.held = null;
    this.winner = null;
    this.winLine = [];
    this.winReason = null;
    this.moves = 0;
  }
  top(cell) { return pieceById(this.board[cell]?.at(-1)); }
  locate(id) {
    if (this.reserve.has(id)) return null;
    return this.board.findIndex(stack => stack.at(-1) === id);
  }
  destinations(piece, from = -1) {
    return this.board.flatMap((_, cell) => cell !== from && (!this.top(cell) || this.top(cell).size < piece.size) ? [cell] : []);
  }
  canLift(id) {
    const piece = pieceById(id);
    if (!piece || this.winner || piece.owner !== this.turn) return false;
    if (this.held) return this.held.piece.id === id;
    const from = this.locate(id);
    return from !== -1 && this.destinations(piece, from).length > 0;
  }
  lift(id) {
    if (!this.canLift(id)) return {ok:false};
    if (this.held) return {ok:true, resumed:true};
    const piece = pieceById(id);
    const from = this.locate(id);
    this.held = {piece, from};
    if (from === null) this.reserve.delete(id);
    else this.board[from].pop();
    if (from !== null) this.checkWinner('uncover');
    return {ok:true, winner:this.winner};
  }
  canDrop(cell) {
    if (!this.held || this.winner || !Number.isInteger(cell) || cell < 0 || cell > 8 || cell === this.held.from) return false;
    return !this.top(cell) || this.top(cell).size < this.held.piece.size;
  }
  drop(cell) {
    if (!this.canDrop(cell)) return {ok:false};
    this.board[cell].push(this.held.piece.id);
    this.held = null;
    this.moves++;
    this.checkWinner('line');
    if (!this.winner) this.turn = other(this.turn);
    return {ok:true, winner:this.winner};
  }
  cancelReserve() {
    if (!this.held || this.held.from !== null || this.winner) return false;
    this.reserve.add(this.held.piece.id);
    this.held = null;
    return true;
  }
  checkWinner(reason) {
    for (const line of LINES) {
      const owner = this.top(line[0])?.owner;
      if (owner && line.every(cell => this.top(cell)?.owner === owner)) {
        this.winner = owner;
        this.winLine = [...line];
        this.winReason = reason;
        return owner;
      }
    }
    return null;
  }
  visibleState() {
    return {turn:this.turn, moves:this.moves, winner:this.winner, winReason:this.winReason,
      board:this.board.map((_,cell) => this.top(cell) ?? null),
      reserve:PIECES.filter(piece => this.reserve.has(piece.id)),
      held:this.held ? {...this.held} : null};
  }
}
