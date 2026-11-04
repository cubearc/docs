// Display convention from the Solitaire reference linked by the locked Core:
// https://www.schneier.com/academic/solitaire/ (v1.2, bridge suit order).
// The cipher still receives the original numeric IDs. This module only draws.
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
const GLYPHS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PORTRAITS = new URL('./assets/solitaire-court-portraits.png', import.meta.url).href;
const PIPS = {
  clubs: 'M0 2 C-13 5 -15 -10 -5 -10 C-11 -24 11 -24 5 -10 C15 -10 13 5 0 2 L5 11 L-5 11 Z',
  diamonds: 'M0 -18 L12 -3 L0 12 L-12 -3 Z',
  hearts: 'M0 12 C-3 6 -14 -2 -14 -9 C-14 -21 -2 -22 0 -12 C2 -22 14 -21 14 -9 C14 -2 3 6 0 12 Z',
  spades: 'M0 -19 C-3 -13 -14 -5 -14 2 C-14 11 -4 13 0 5 L-5 13 L5 13 L0 5 C4 13 14 11 14 2 C14 -5 3 -13 0 -19 Z',
};

export function solitaireCard(value) {
  if (!Number.isInteger(value) || value < 1 || value > 54) return {name: `Invalid card ID ${String(value)}`, rank: '?', valid: false};
  if (value > 52) return {name: `Joker ${value === 53 ? 'A' : 'B'}`, rank: value === 53 ? 'A' : 'B', portrait: value - 50, valid: true, joker: true, red: value === 54};
  const rank = (value - 1) % 13;
  const suit = SUITS[Math.floor((value - 1) / 13)];
  return {name: `${RANKS[rank]} of ${suit}`, rank: GLYPHS[rank], suit, pips: rank + 1, portrait: rank >= 10 ? rank - 10 : undefined, red: suit === 'diamonds' || suit === 'hearts', valid: true};
}

function svg(tag, attributes = {}, ...children) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const child of children.flat()) element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return element;
}
function pip(suit, x, y, scale = .55, inverted = false) {
  return svg('path', {class: 'solitaire-pip', d: PIPS[suit], transform: `translate(${x} ${y}) scale(${scale})${inverted ? ' rotate(180)' : ''}`, fill: 'currentColor'});
}
function corners(face, key) {
  const id = `solitaire-corner-${key}`;
  // Mirrored SVG reuse keeps one text label for a graphical rank. The button's
  // accessible name includes that visible abbreviation and the full card name.
  return [svg('g', {id},
    svg('text', {x: 10, y: 20, 'text-anchor': 'middle', class: 'solitaire-rank'}, `${face.rank} `),
    ...(face.suit ? [pip(face.suit, 10, 33, .35)] : [])),
    svg('use', {href: `#${id}`, transform: 'rotate(180 50 70)'})];
}

// Conventional pip layout, strictly decorative. Counts do not affect the deck.
function pipPositions(count) {
  if (count === 1) return [[50, 72]];
  if (count === 2) return [[50, 38], [50, 104]];
  if (count === 3) return [[50, 38], [50, 71], [50, 104]];
  const rows = count < 6 ? [38, 104] : count < 9 ? [38, 71, 104] : [34, 58, 84, 108];
  const points = rows.flatMap(y => [[33, y], [67, y]]);
  if (count === 5 || count === 9) points.push([50, 71]);
  if (count === 7) points.push([50, 54]);
  if (count === 8 || count === 10) points.push([50, 49], [50, 94]);
  return points;
}

export function solitaireFace(value, key) {
  const face = solitaireCard(value);
  const body = [];
  if (face.portrait !== undefined) {
    // Five equal columns in one original ImageGen asset. SVG viewport clipping
    // keeps each portrait separate without rasterizing ranks or suit marks.
    // The generated red joker's hat crosses slightly into the navy slot.
    const portraitWidth = face.portrait === 3 ? 376.6 : 396.6;
    const width = portraitWidth * 112 / 793;
    body.push(svg('svg', {x: (100 - width) / 2, y: 15, width, height: 112, viewBox: `${face.portrait * 396.6} 0 ${portraitWidth} 793`, overflow: 'hidden', preserveAspectRatio: 'none'},
      svg('image', {href: PORTRAITS, width: 1983, height: 793})));
    if (face.joker) body.push(svg('text', {x: 50, y: 135, 'text-anchor': 'middle', class: 'solitaire-joker-name'}, 'JOKER '));
  } else if (face.valid) {
    body.push(...pipPositions(face.pips).map(([x, y]) => pip(face.suit, x, y, face.pips === 1 ? 1.1 : .5, face.pips > 1 && y > 71)));
  } else {
    body.push(svg('text', {x: 50, y: 82, 'text-anchor': 'middle', class: 'solitaire-invalid'}, '?'));
  }
  return svg('svg', {viewBox: '0 0 100 140', class: `solitaire-face${face.red ? ' red' : ''}`, 'aria-hidden': 'true', focusable: 'false'}, ...body, ...corners(face, key));
}
