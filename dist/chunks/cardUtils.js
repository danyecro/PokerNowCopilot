function cardToString(card) {
  const suitSymbols = { h: "♥", d: "♦", c: "♣", s: "♠" };
  return `${card.rank}${suitSymbols[card.suit]}`;
}
function boardToString(board) {
  return board.map(cardToString).join(" ");
}
export {
  boardToString as b,
  cardToString as c
};
//# sourceMappingURL=cardUtils.js.map
