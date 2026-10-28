// Pixel-art button icons, drawn as crisp SVG from little grids ('#' = ink).
// Any element with data-icon="name" gets its icon put in front of its text.

const ICONS = {
  skull: [
    '..#####..',
    '.#######.',
    '##..#..##',
    '##..#..##',
    '#########',
    '.###.###.',
    '..#.#.#..',
    '..#####..',
  ],
  moon: [
    '...####.',
    '..###...',
    '.###....',
    '.###....',
    '.###....',
    '.###....',
    '..###...',
    '...####.',
  ],
  ghost: [
    '..####..',
    '.######.',
    '##.##.##',
    '##.##.##',
    '########',
    '########',
    '########',
    '#.##.##.',
  ],
  ghosts: [
    '..###......',
    '.#####.###.',
    '#.#.#######',
    '#.#.##.#.##',
    '#######.#.#',
    '###########',
    '###########',
    '#.#.##.#.#.',
  ],
  trophy: [
    '#########',
    '#.#####.#',
    '#.#####.#',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
    '..#####..',
  ],
  gear: [
    '...#.#...',
    '.#######.',
    '.##...##.',
    '###...###',
    '.##...##.',
    '.#######.',
    '...#.#...',
  ],
  info: [
    '...##...',
    '...##...',
    '........',
    '..###...',
    '...##...',
    '...##...',
    '...##...',
    '..####..',
  ],
  undo: [
    '..#......',
    '.##......',
    '########.',
    '.##.....#',
    '..#.....#',
    '........#',
    '...#####.',
  ],
  eye: [
    '..#####..',
    '.#.....#.',
    '#..###..#',
    '#..###..#',
    '.#.....#.',
    '..#####..',
  ],
  cards: [
    '#####....',
    '#...#....',
    '#..#####.',
    '#..#...#.',
    '####...#.',
    '...#...#.',
    '...#####.',
  ],
  bars: [
    '########',
    '........',
    '########',
    '........',
    '########',
  ],
  help: [
    '.#####.',
    '##...##',
    '.....##',
    '...###.',
    '...##..',
    '.......',
    '...##..',
  ],
  expand: [
    '###..###',
    '##....##',
    '#......#',
    '........',
    '........',
    '#......#',
    '##....##',
    '###..###',
  ],
};

export function iconSVG(name) {
  const rows = ICONS[name];
  if (!rows) return '';
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }));
  return `<svg class="ico" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/** Give every [data-icon] element its icon (once). */
export function decorateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.querySelector(':scope > .ico')) continue;
    el.insertAdjacentHTML('afterbegin', iconSVG(el.dataset.icon));
  }
}
