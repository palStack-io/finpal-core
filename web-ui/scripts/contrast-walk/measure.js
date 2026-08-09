(function () {
  // The account rows are the DIRECT CHILDREN of the grid that holds them, not
  // "anything with a 12px radius" — that matched a child element too and
  // double-counted every account. Find the grid whose child count varies.
  const grids = [...document.querySelectorAll('div')].filter((d) => {
    const cs = getComputedStyle(d);
    return cs.display === 'grid' && d.children.length > 1;
  });
  const list = grids.sort((a, b) => b.children.length - a.children.length)[0];
  const rows = list ? [...list.children] : [];
  const rects = rows.map((r) => r.getBoundingClientRect());
  const pitches = [];
  for (let i = 1; i < rects.length; i += 1) pitches.push(rects[i].top - rects[i - 1].top);

  const pre = document.createElement('pre');
  pre.textContent = 'M::' + JSON.stringify({
    rows: rows.length,
    rowHeight: rects.length ? +rects[0].height.toFixed(2) : null,
    pitch: pitches.length ? +(pitches.reduce((a, b) => a + b, 0) / pitches.length).toFixed(2) : null,
    // The LIST's own height — body scrollHeight is dominated by min-height:100vh
    // and was identical for every count, which is how the first attempt reported
    // a constant page size for 2, 8 and 20 accounts.
    listHeight: list ? +list.getBoundingClientRect().height.toFixed(2) : null,
  }) + '::END';
  document.body.appendChild(pre);
})();
