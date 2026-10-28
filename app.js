/* =========================================================
   山东大学拉屎指南 · 校园建造动画
   Pure Canvas 2D isometric engine — no dependencies.
   ========================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('scene');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TAU = Math.PI * 2;
  const SQRT2 = Math.SQRT2;
  const IX = Math.cos(Math.PI / 6);
  const IY = 0.5;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = (t) => {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const easeOutBack = (t) => {
    t = clamp(t, 0, 1);
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ---------------- colour ---------------- */
  const shadeCache = new Map();
  function shade(hex, amt) {
    if (!hex) return '#000000';
    const key = hex + '|' + amt.toFixed(3);
    const hit = shadeCache.get(key);
    if (hit) return hit;
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    if (amt >= 0) {
      r = Math.round(r + (255 - r) * amt);
      g = Math.round(g + (255 - g) * amt);
      b = Math.round(b + (255 - b) * amt);
    } else {
      const k = -amt;
      r = Math.round(r * (1 - k) + 26 * k);
      g = Math.round(g * (1 - k) + 38 * k);
      b = Math.round(b * (1 - k) + 48 * k);
    }
    const out = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    shadeCache.set(key, out);
    return out;
  }
  const matCache = new Map();
  function matte(base, top = 0.10, right = -0.02, left = -0.15) {
    const key = base + '|' + top + '|' + right + '|' + left;
    let m = matCache.get(key);
    if (!m) {
      m = {
        base,
        top: shade(base, top),
        right: shade(base, right),
        left: shade(base, left),
        edge: shade(base, -0.34),
      };
      matCache.set(key, m);
    }
    return m;
  }
  function glassMatte(base) {
    return {
      base,
      top: shade(base, 0.22),
      right: shade(base, 0.06),
      left: shade(base, -0.07),
      edge: shade(base, -0.42),
    };
  }

  const DBG = new URLSearchParams(location.search);
  const skip = (k) => DBG.get(k) === '1';
  let debugEl = null;
  const C = {
    paper: '#F7F2E7',
    paper2: '#FBF7EE',
    ink: '#17293D',
    ink2: '#33495E',
    red: '#9C1B22',
    red2: '#B5463F',
    line: 'rgba(150,136,110,.30)',
    line2: 'rgba(150,136,110,.16)',
    road: '#EDE2CD',
    roadEdge: '#D8C8AC',
    roadLine: '#FFFDF6',
    grass: '#DCE3D1',
    grass2: '#CFDAC4',
    shadow: 'rgba(87,76,52,.13)',
    slate: '#5C666E',
  };

  /* ---------------- viewport ---------------- */
  let W = 0, H = 0, DPR = 1;
  const view = { x: 0, y: 0, scale: 14 };

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    recomputeBaseScale();
  }
  let baseScale = 14;
  function recomputeBaseScale() {
    let ref;
    if (W < 700) ref = 48;
    else if (W < 1200) ref = lerp(48, 116, (W - 700) / 500);
    else ref = 132;
    baseScale = clamp(W / ref, 6.2, 15);
  }
  window.addEventListener('resize', resize);

  /* ---------------- projection ---------------- */
  function proj(x, z, y = 0) {
    return {
      x: (x - z) * IX * view.scale + view.x,
      y: (x + z) * IY * view.scale + view.y - y * view.scale,
    };
  }
  function depth(x, z) { return x + z; }

  /* ---------------- path ---------------- */
  function chaikin(pts, iters) {
    let p = pts;
    for (let k = 0; k < iters; k++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }

  class Route {
    constructor(points) {
      const dense = chaikin(points, 3);
      const raw = [dense[0]];
      for (let i = 1; i < dense.length; i++) {
        const a = dense[i - 1], b = dense[i];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.0001) continue;
        raw.push(b);
      }
      // resample at fixed spacing
      this.pts = [];
      this.s = [];
      let acc = 0;
      this.pts.push([raw[0][0], raw[0][1]]);
      this.s.push(0);
      let carry = 0;
      for (let i = 1; i < raw.length; i++) {
        const ax = raw[i - 1][0], az = raw[i - 1][1];
        const bx = raw[i][0], bz = raw[i][1];
        const seg = Math.hypot(bx - ax, bz - az);
        let d = carry;
        while (d < seg) {
          const t = d / seg;
          this.pts.push([ax + (bx - ax) * t, az + (bz - az) * t]);
          acc += 0.5;
          this.s.push(acc);
          d += 0.5;
        }
        carry = d - seg;
      }
      const last = raw[raw.length - 1];
      if (this.pts.length === 1 || Math.hypot(last[0] - this.pts[this.pts.length - 1][0], last[1] - this.pts[this.pts.length - 1][1]) > 0.01) {
        const prev = this.pts[this.pts.length - 1];
        acc += Math.hypot(last[0] - prev[0], last[1] - prev[1]);
        this.pts.push([last[0], last[1]]);
        this.s.push(acc);
      }
      this.length = this.s[this.s.length - 1];
    }
    at(d) {
      d = clamp(d, 0, this.length);
      let lo = 0, hi = this.s.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (this.s[mid] <= d) lo = mid; else hi = mid;
      }
      const a = this.pts[lo], b = this.pts[hi];
      const span = this.s[hi] - this.s[lo] || 1;
      const t = clamp((d - this.s[lo]) / span, 0, 1);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
    }
    tangent(d) {
      const a = this.at(Math.max(0, d - 0.6));
      const b = this.at(Math.min(this.length, d + 0.6));
      const dx = b.x - a.x, dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    }
    closest(x, z) {
      let best = 0, bd = 1e9;
      for (let i = 0; i < this.pts.length; i++) {
        const p = this.pts[i];
        const d = (p[0] - x) * (p[0] - x) + (p[1] - z) * (p[1] - z);
        if (d < bd) { bd = d; best = i; }
      }
      return { d: this.s[best], dist: Math.sqrt(bd) };
    }
  }

  const PATH_PTS = [
    [-52, -64], [-24, -64], [-24, -38], [4, -38], [4, -12],
    [32, -12], [32, 14], [60, 14], [88, 14],
  ];
  const route = new Route(PATH_PTS);

  /* ---------------- themes ---------------- */
  const THEMES = {
    brick: {
      wall: '#E2CDB2', wall2: '#CDB393', trim: '#8C4B34', roof: '#7C4034',
      roof2: '#5C2F28', glass: '#C2D5D1', accent: '#9C1B22', floor: '#D9C6A8',
      stone: '#D9C9B2', interior: '#F1E6D2', facade: 'brick', roofType: 'gable',
    },
    tower: {
      wall: '#E9DFCE', wall2: '#D5C9B4', trim: '#3C5260', roof: '#64737C',
      roof2: '#4B5A63', glass: '#B3CCD2', accent: '#9C1B22', floor: '#D8D0C0',
      stone: '#E0D6C4', interior: '#F4EBDD', facade: 'grid', roofType: 'flat',
    },
    gate: {
      wall: '#DED6C9', wall2: '#C9BFB0', trim: '#8E2A24', roof: '#3F4A49',
      roof2: '#2D3737', glass: '#C4D4D0', accent: '#8E2A24', floor: '#D4C9B8',
      stone: '#D2C8B7', interior: '#F2E9DA', facade: 'chinese', roofType: 'chinese',
    },
    hill: {
      wall: '#E7D7BD', wall2: '#D2BE9F', trim: '#7A674E', roof: '#7C8A76',
      roof2: '#5F6D5B', glass: '#BCD2D1', accent: '#A33A2C', floor: '#DACAB3',
      stone: '#D7C8B0', interior: '#F5ECDC', facade: 'band', roofType: 'flat',
    },
    valley: {
      wall: '#E5DDCC', wall2: '#D0C7B4', trim: '#5D6B69', roof: '#88948E',
      roof2: '#68746E', glass: '#B7CFD0', accent: '#9C1B22', floor: '#D7CFBF',
      stone: '#DCD2C0', interior: '#F3EBDE', facade: 'glass', roofType: 'flat',
    },
    coast: {
      wall: '#F1EADD', wall2: '#DDD5C6', trim: '#3F6273', roof: '#DEE5E1',
      roof2: '#C4D1CF', glass: '#AFCDD2', accent: '#9C1B22', floor: '#E3DBCB',
      stone: '#E7DDCB', interior: '#F8F1E5', facade: 'sail', roofType: 'sail',
    },
    sea: {
      wall: '#F2E9D8', wall2: '#DFD3BE', trim: '#896A4B', roof: '#CBD5CF',
      roof2: '#B2C1BA', glass: '#B4CFD1', accent: '#9C1B22', floor: '#DDCFB8',
      stone: '#E4D9C7', interior: '#F8F0E1', facade: 'wood', roofType: 'sail',
    },
  };

  const DEFS = [
    {
      id: 'hongjialou', campus: '洪家楼校区', short: '洪家楼', theme: 'brick',
      landmark: 'church', label: ['洪家楼天主教堂', 'HONGJIALOU CATHEDRAL'],
      landmarkOff: [9, -13], labelOff: [-150, -196], pavW: 15, pavD: 12, zoom: 0.90,
    },
    {
      id: 'zhixin', campus: '中心校区', short: '中心', theme: 'tower',
      landmark: 'zhixin', label: ['知新楼', 'ZHIXIN TOWER · 139.1M'],
      landmarkOff: [2, -9], labelOff: [146, -172], pavW: 15, pavD: 12, zoom: 0.78, focusY: 14,
    },
    {
      id: 'baotuquan', campus: '趵突泉校区', short: '趵突泉', theme: 'gate',
      landmark: 'gate', label: ['校友门', 'ALUMNI GATE · 1924'],
      landmarkOff: [22, -10], labelOff: [80, -132], pavW: 15, pavD: 12, zoom: 0.90, tx: -0.025,
    },
    {
      id: 'qianfoshan', campus: '千佛山校区', short: '千佛山', theme: 'hill',
      landmark: 'hall', label: ['千佛山', 'QIANFOSHAN'],
      landmarkOff: [1, -22], labelOff: [120, -190], pavW: 15, pavD: 12, zoom: 0.82, focusY: 15,
    },
    {
      id: 'xinglongshan', campus: '兴隆山校区', short: '兴隆山', theme: 'valley',
      landmark: 'tri', label: ['兴隆山图书馆', 'XINGLONGSHAN LIBRARY'],
      landmarkOff: [0, -21], labelOff: [150, -190], pavW: 15, pavD: 12, zoom: 0.88, tx: 0.015,
    },
    {
      id: 'qingdao', campus: '青岛校区', short: '青岛', theme: 'coast',
      landmark: 'qingdao', label: ['黄海 · 青岛校区', 'YELLOW SEA'],
      landmarkOff: [0, -23], labelOff: [158, -150], pavW: 15, pavD: 12, zoom: 0.94, cardSide: 'left', tx: 0.04,
    },
    {
      id: 'weihai', campus: '威海校区', short: '威海', theme: 'sea',
      landmark: 'weihai', label: ['玛珈山 · 威海', 'MAJIASHAN'],
      landmarkOff: [-4, -22], labelOff: [-160, -158], pavW: 15, pavD: 12, zoom: 0.96,
    },
  ];

  const chapters = [];
  for (let i = 0; i < DEFS.length; i++) {
    const def = DEFS[i];
    const bend = PATH_PTS[i + 1];
    const near = route.closest(bend[0], bend[1]);
    const anchor = route.at(near.d);
    const side = i % 2 === 0 ? 1 : -1;
    const pav = { x: anchor.x + side * 11, z: anchor.z - side * 11 };
    const theme = THEMES[def.theme];
    const ch = {
      ...def,
      index: i,
      d: near.d,
      anchor,
      side,
      pav,
      lx: pav.x + def.landmarkOff[0],
      lz: pav.z + def.landmarkOff[1],
      theme,
      cardSide: def.cardSide || (i % 2 === 0 ? 'left' : 'right'),
      buildStart: near.d - 20,
      buildEnd: near.d - 3,
      landmarkStart: near.d - 22,
      landmarkEnd: near.d - 4,
      labelAlpha: 0,
    };
    ch.p = 0;
    ch.lp = 0;
    chapters.push(ch);
  }
  const dEnd = chapters[chapters.length - 1].d;
  const JOURNEY_LEN = route.length;
  const cameraMaxD = dEnd;

  /* ---------------- preload logo ---------------- */
  const logo = new Image();
  let logoReady = false;
  logo.onload = () => { logoReady = true; };
  logo.src = 'assets/sdu-mark.png';

  /* ---------------- primitives ---------------- */
  function withAlpha(a, fn) {
    if (a >= 0.999) { fn(); return; }
    ctx.save();
    ctx.globalAlpha *= Math.max(0, a);
    fn();
    ctx.restore();
  }

  function poly(points, fill, stroke, lw, alpha) {    if (!points.length) return;
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw == null ? 0.7 : lw;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBox(x, z, w, d, y0, y1, m, opt = {}) {
    if (y1 <= y0 + 0.001) return;
    const x1 = x + w, z1 = z + d;
    const a = proj(x, z, y1), b = proj(x1, z, y1), c = proj(x1, z1, y1), e = proj(x, z1, y1);
    const b0 = proj(x1, z, y0), c0 = proj(x1, z1, y0), e0 = proj(x, z1, y0);
    const alpha = opt.alpha == null ? 1 : opt.alpha;
    ctx.save();
    ctx.globalAlpha *= alpha;
    const edge = opt.edge || m.edge;
    const lw = opt.lw == null ? 0.65 : opt.lw;
    const stroke = opt.stroke === false ? null : edge;
    // right (+x)
    poly([b, c, c0, b0], opt.right || m.right, stroke, lw);
    // left (+z)
    poly([e, c, c0, e0], opt.left || m.left, stroke, lw);
    // top
    poly([a, b, c, e], opt.top || m.top, stroke, lw);
    if (opt.highlight) {
      ctx.save();
      ctx.globalAlpha *= 0.5;
      const g = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
      g.addColorStop(0, 'rgba(255,255,255,.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      poly([a, b, c, e], g, null, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function prismVisibleFaces(pts) {
    const faces = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.0001) continue;
      const nx = dz / len, nz = -dx / len;
      if (nx + nz <= 0.001) continue;
      faces.push({ a, b, nx, nz });
    }
    return faces;
  }

  function drawPrism(pts, y0, y1, base, opt = {}) {
    if (y1 <= y0 + 0.001) return;
    const faces = prismVisibleFaces(pts);
    const m = opt.mat || matte(base);
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    for (const f of faces) {
      const val = 0.02 + 0.12 * f.nx - 0.08 * f.nz;
      const col = shade(base, clamp(val, -0.22, 0.16));
      const q = [
        proj(f.a[0], f.a[1], y1), proj(f.b[0], f.b[1], y1),
        proj(f.b[0], f.b[1], y0), proj(f.a[0], f.a[1], y0),
      ];
      poly(q, col, opt.stroke === false ? null : shade(base, -0.34), 0.65);
    }
    const top = pts.map((p) => proj(p[0], p[1], y1));
    poly(top, opt.top || m.top, opt.stroke === false ? null : m.edge, 0.65);
    ctx.restore();
  }

  function drawPyramid(cx, cz, w, d, y0, apexY, base, opt = {}) {
    const hw = w / 2, hd = d / 2;
    const A = { x: cx - hw, z: cz - hd }, B = { x: cx + hw, z: cz - hd };
    const Cc = { x: cx + hw, z: cz + hd }, D = { x: cx - hw, z: cz + hd };
    const apex = proj(cx, cz, apexY);
    const corners = [A, B, Cc, D];
    const faces = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const nx = dz / len, nz = -dx / len;
      faces.push({ a, b, nx, nz });
    }
    faces.sort((f, g) => (f.a.x + f.b.x + f.a.z + f.b.z) - (g.a.x + g.b.x + g.a.z + g.b.z));
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    for (const f of faces) {
      const visible = f.nx + f.nz > -0.01;
      const col = shade(base, visible ? 0.02 + 0.12 * f.nx - 0.08 * f.nz : -0.22);
      poly([proj(f.a.x, f.a.z, y0), proj(f.b.x, f.b.z, y0), apex], col, shade(base, -0.35), 0.6, visible ? 1 : 0.65);
    }
    ctx.restore();
  }

  function gableRoofX(x0, z0, x1, z1, yEave, yRidge, base, opt = {}) {
    const zc = (z0 + z1) / 2;
    const m = matte(base, 0.12, 0.02, -0.16);
    const front = [
      proj(x0, z1, yEave), proj(x1, z1, yEave),
      proj(x1, zc, yRidge), proj(x0, zc, yRidge),
    ];
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    if (opt.dy) ctx.translate(0, opt.dy);
    // gable ends
    poly([proj(x0, z0, yEave), proj(x0, z1, yEave), proj(x0, zc, yRidge)], shade(base, -0.24), shade(base, -0.4), 0.6);
    // front slope
    poly(front, base, shade(base, -0.36), 0.7);
    // tile rows
    if (opt.tiles !== false) {
      const n = opt.tileCount || 5;
      ctx.save();
      ctx.globalAlpha *= 0.32;
      ctx.strokeStyle = shade(base, -0.34);
      ctx.lineWidth = 0.55;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const za = lerp(z1, zc, t), ya = lerp(yEave, yRidge, t);
        const p1 = proj(x0, za, ya), p2 = proj(x1, za, ya);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      ctx.restore();
    }
    // eave fascia
    poly([proj(x0, z1, yEave + 0.35), proj(x1, z1, yEave + 0.35), proj(x1, z1, yEave), proj(x0, z1, yEave)], shade(base, -0.3), shade(base, -0.45), 0.6);
    // ridge
    const r1 = proj(x0, zc, yRidge), r2 = proj(x1, zc, yRidge);
    ctx.strokeStyle = shade(base, 0.18); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
    ctx.restore();
  }

  function gableRoofZ(x0, z0, x1, z1, yEave, yRidge, base, opt = {}) {
    const xc = (x0 + x1) / 2;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    if (opt.dy) ctx.translate(0, opt.dy);
    // +x slope visible
    const slope = [
      proj(x1, z0, yEave), proj(x1, z1, yEave),
      proj(xc, z1, yRidge), proj(xc, z0, yRidge),
    ];
    // gable end at z1
    poly([proj(x0, z1, yEave), proj(x1, z1, yEave), proj(xc, z1, yRidge)], shade(base, -0.25), shade(base, -0.4), 0.6);
    poly(slope, base, shade(base, -0.36), 0.7);
    const n = opt.tileCount || 5;
    ctx.save();
    ctx.globalAlpha *= 0.28;
    ctx.strokeStyle = shade(base, -0.34); ctx.lineWidth = 0.55;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const xa = lerp(x1, xc, t), ya = lerp(yEave, yRidge, t);
      const p1 = proj(xa, z0, ya), p2 = proj(xa, z1, ya);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();
    poly([proj(x1, z0, yEave + 0.35), proj(x1, z1, yEave + 0.35), proj(x1, z1, yEave), proj(x1, z0, yEave)], shade(base, -0.3), null, 0);
    // gable end at z0 (back, subtle)
    poly([proj(x0, z0, yEave), proj(xc, z0, yRidge), proj(x1, z0, yEave)], shade(base, -0.16), null, 0, 0.8);
    const r1 = proj(xc, z0, yRidge), r2 = proj(xc, z1, yRidge);
    ctx.strokeStyle = shade(base, 0.18); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
    ctx.restore();
  }

  function chineseRoof(cx, cz, w, d, yEave, base, opt = {}) {
    const hw = w / 2, hd = d / 2;
    const yRidge = yEave + opt.height || yEave + 1.8;
    const ridgeY = yEave + (opt.height || 1.8);
    const zc = cz;
    const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    if (opt.dy) ctx.translate(0, opt.dy);
    // front slope with upturned ends
    const pL = proj(x0, z1, yEave + 0.55);
    const pL2 = proj(x0 - 0.6, z1 - 0.4, yEave + 0.05);
    const pR = proj(x1, z1, yEave + 0.55);
    const pR2 = proj(x1 + 0.6, z1 - 0.4, yEave + 0.05);
    const ridgeL = proj(x0 + 0.8, zc, ridgeY);
    const ridgeR = proj(x1 - 0.8, zc, ridgeY);
    poly([pL2, pL, ridgeL, ridgeR, pR, pR2, proj(x1, z1, yEave - 0.15), proj(x0, z1, yEave - 0.15)], base, shade(base, -0.38), 0.7);
    // curved eave line
    ctx.save();
    ctx.strokeStyle = shade(base, 0.25); ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(pL2.x, pL2.y);
    ctx.quadraticCurveTo((pL2.x + pR2.x) / 2, (pL2.y + pR2.y) / 2 + 2.2 * view.scale * 0.08, pR2.x, pR2.y);
    ctx.stroke();
    ctx.restore();
    // ridge
    ctx.strokeStyle = shade(base, 0.3); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ridgeL.x, ridgeL.y); ctx.lineTo(ridgeR.x, ridgeR.y); ctx.stroke();
    // red underside
    poly([proj(x0, z1, yEave - 0.15), proj(x1, z1, yEave - 0.15), proj(x1, z1, yEave - 0.65), proj(x0, z1, yEave - 0.65)], opt.under || '#8E2A24', shade(opt.under || '#8E2A24', -0.3), 0.5);
    // tiny upturned tips
    for (const p of [pL2, pR2]) {
      poly([p, { x: p.x + (p === pL2 ? -7 : 7), y: p.y - 5 }, { x: p.x + (p === pL2 ? -2 : 2), y: p.y + 1 }], shade(base, 0.18), shade(base, -0.3), 0.4);
    }
    ctx.restore();
  }

  function isoEllipse(x, z, r, fill, stroke, lw) {
    const c = proj(x, z, 0);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * IX * SQRT2 * view.scale, r * IY * SQRT2 * view.scale, 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw == null ? 0.8 : lw; ctx.stroke(); }
    ctx.restore();
  }

  function shadowEllipse(x, z, r, alpha) {
    const c = proj(x, z, 0);
    ctx.save();
    ctx.globalAlpha *= alpha == null ? 1 : alpha;
    const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, r * IX * SQRT2 * view.scale);
    g.addColorStop(0, 'rgba(80,68,46,.22)');
    g.addColorStop(0.6, 'rgba(80,68,46,.10)');
    g.addColorStop(1, 'rgba(80,68,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * IX * SQRT2 * view.scale, r * IY * SQRT2 * view.scale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- wall planes & windows ---------------- */
  function wallQuadZ(z, xa, xb, ya, yb, fill, stroke, alpha) {
    poly([proj(xa, z, ya), proj(xb, z, ya), proj(xb, z, yb), proj(xa, z, yb)], fill, stroke, 0.6, alpha);
  }
  function wallQuadX(x, za, zb, ya, yb, fill, stroke, alpha) {
    poly([proj(x, za, ya), proj(x, zb, ya), proj(x, zb, yb), proj(x, za, yb)], fill, stroke, 0.6, alpha);
  }
  function wallLineZ(z, xa, xb, y, color, lw, alpha) {
    const a = proj(xa, z, y), b = proj(xb, z, y);
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color; ctx.lineWidth = lw || 0.7;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  function wallLineX(x, za, zb, y, color, lw, alpha) {
    const a = proj(x, za, y), b = proj(x, zb, y);
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color; ctx.lineWidth = lw || 0.7;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  function windowZ(z, xa, xb, ya, yb, theme, alpha = 1, kind = 'grid') {
    if (alpha <= 0.01) return;
    const glass = theme.glass;
    ctx.save();
    ctx.globalAlpha *= alpha;
    // frame
    wallQuadZ(z - 0.01, xa - 0.18, xb + 0.18, ya - 0.18, yb + 0.18, shade(theme.trim, -0.12), shade(theme.trim, -0.4), 1);
    wallQuadZ(z - 0.02, xa, xb, ya, yb, glass, null, 1);
    // inner glow
    wallQuadZ(z - 0.03, xa, xb, ya + (yb - ya) * 0.62, yb, shade(glass, 0.14), null, 0.7);
    // mullions
    const mx = (xa + xb) / 2;
    const my = (ya + yb) / 2;
    wallLineZ(z - 0.04, mx, mx, ya, yb, shade(theme.trim, -0.05), 0.75, 0.9);
    if (kind !== 'lancet') wallLineZ(z - 0.04, xa, xb, my, shade(theme.trim, -0.05), 0.7, 0.8);
    // sill + lintel
    wallLineZ(z - 0.05, xa - 0.1, xb + 0.1, ya, shade(theme.stone, 0.18), 1.2, 0.9);
    wallLineZ(z - 0.05, xa - 0.1, xb + 0.1, yb, shade(theme.trim, -0.1), 1.1, 0.9);
    // highlight
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 0.8;
    const h1 = proj(xa + (xb - xa) * 0.16, z - 0.06, ya + (yb - ya) * 0.78);
    const h2 = proj(xa + (xb - xa) * 0.38, z - 0.06, ya + (yb - ya) * 0.22);
    ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
    ctx.restore();
  }

  function windowX(x, za, zb, ya, yb, theme, alpha = 1, kind = 'grid') {
    if (alpha <= 0.01) return;
    const glass = theme.glass;
    ctx.save();
    ctx.globalAlpha *= alpha;
    wallQuadX(x + 0.01, za - 0.18, zb + 0.18, ya - 0.18, yb + 0.18, shade(theme.trim, -0.12), shade(theme.trim, -0.4), 1);
    wallQuadX(x + 0.02, za, zb, ya, yb, glass, null, 1);
    wallQuadX(x + 0.03, za, zb, ya + (yb - ya) * 0.62, yb, shade(glass, 0.14), null, 0.7);
    const mz = (za + zb) / 2, my = (ya + yb) / 2;
    wallLineX(x + 0.04, mz, mz, ya, yb, shade(theme.trim, -0.05), 0.75, 0.9);
    if (kind !== 'lancet') wallLineX(x + 0.04, za, zb, my, shade(theme.trim, -0.05), 0.7, 0.8);
    wallLineX(x + 0.05, za - 0.1, zb + 0.1, ya, shade(theme.stone, 0.18), 1.2, 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 0.75;
    const h1 = proj(x + 0.06, za + (zb - za) * 0.16, ya + (yb - ya) * 0.78);
    const h2 = proj(x + 0.06, za + (zb - za) * 0.38, ya + (yb - ya) * 0.22);
    ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 45° readable sign ---------------- */
  function sign45(cx, cz, yBase, wWorld, hWorld, opt = {}) {
    const bottom = proj(cx, cz, yBase);
    const top = proj(cx, cz, yBase + hWorld);
    const pw = wWorld * SQRT2 * IX * view.scale;
    const ph = hWorld * view.scale;
    const x = bottom.x - pw / 2;
    const y = top.y;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    // side depth
    ctx.fillStyle = opt.side || 'rgba(60,50,38,.18)';
    ctx.fillRect(x + 2.5, y + 2.5, pw, ph);
    // board
    ctx.fillStyle = opt.fill || '#F3ECDD';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = opt.stroke || 'rgba(90,78,58,.42)';
    ctx.lineWidth = opt.lw || 1;
    ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
    if (opt.inner) {
      ctx.strokeStyle = opt.inner;
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x + 4.5, y + 4.5, pw - 9, ph - 9);
    }
    if (opt.posts !== false) {
      ctx.strokeStyle = opt.post || shade(opt.fill || '#F3ECDD', -0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + ph); ctx.lineTo(x + 5, y + ph + 8);
      ctx.moveTo(x + pw - 5, y + ph); ctx.lineTo(x + pw - 5, y + ph + 8);
      ctx.stroke();
    }
    const draw = opt.draw;
    if (draw) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 4, y + 4, pw - 8, ph - 8);
      ctx.clip();
      draw(x, y, pw, ph);
      ctx.restore();
    }
    ctx.restore();
    return { x, y, w: pw, h: ph };
  }

  function wcTotem(ch, alpha) {
    if (alpha <= 0.01) return;
    const x = ch.pav.x + 5.9;
    const z = ch.pav.z + 7.3;
    const yBase = 1.55;
    const base = proj(x, z, 0.1);
    const foot = proj(x, z, yBase);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = '#6F6049';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();
    ctx.fillStyle = '#6F6049';
    ctx.beginPath();
    ctx.ellipse(foot.x, base.y, 5, 2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    sign45(x, z, yBase, 2.5, 1.25, {
      alpha,
      fill: '#F7F2E7',
      stroke: 'rgba(156,27,34,.6)',
      side: 'rgba(90,70,55,.22)',
      posts: false,
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#9C1B22';
        ctx.font = '800 ' + Math.max(8, ph * 0.46) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText('WC', sx + pw / 2, sy + ph * 0.42);
        ctx.fillStyle = 'rgba(70,84,98,.78)';
        ctx.font = '500 ' + Math.max(4, ph * 0.15) + 'px "PingFang SC",sans-serif';
        ctx.fillText('第三空间 · 开放中', sx + pw / 2, sy + ph * 0.73);
      },
    });
  }

  function stele(ch, alpha) {    if (alpha <= 0.01) return;
    const th = ch.theme;
    const x = ch.pav.x - 4.5;
    const z = ch.pav.z + 13.2;
    const yBase = 0.55;
    // plinth
    drawBox(x - 1.4, z - 0.6, 6.6, 1.6, 0, 0.55, matte(th.stone), { alpha });
    const box = sign45(x + 1.9, z, yBase, 5.6, 6.4, {
      alpha,
      fill: shade(th.stone, 0.20),
      stroke: shade(th.stone, -0.30),
      inner: shade(th.stone, -0.16),
      posts: false,
      draw: (sx, sy, pw, ph) => {
        const cx = sx + pw / 2;
        if (logoReady) {
          const lw = Math.min(pw * 0.34, 34);
          ctx.globalAlpha *= 1;
          ctx.drawImage(logo, cx - lw / 2, sy + ph * 0.08, lw, lw);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = th.accent;
        ctx.font = '600 ' + Math.max(5.5, ph * 0.095) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
        if (!logoReady) ctx.fillText('山东大学', cx, sy + ph * 0.18);
        ctx.fillStyle = C.ink;
        ctx.font = '700 ' + Math.max(8, ph * 0.155) + 'px "Songti SC","PingFang SC","Microsoft YaHei",serif';
        ctx.fillText(ch.campus.replace('校区', ''), cx, sy + ph * 0.56);
        ctx.fillStyle = 'rgba(70,86,100,.68)';
        ctx.font = '500 ' + Math.max(4.5, ph * 0.062) + 'px "PingFang SC",sans-serif';
        ctx.fillText(ch.campus.toUpperCase ? 'SHANDONG UNIVERSITY' : 'SHANDONG UNIVERSITY', cx, sy + ph * 0.69);
        ctx.fillStyle = th.accent;
        ctx.beginPath();
        ctx.arc(cx, sy + ph * 0.82, Math.max(3.5, ph * 0.052), 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#F7F2E7';
        ctx.font = '600 ' + Math.max(3.5, ph * 0.045) + 'px "PingFang SC",sans-serif';
        ctx.fillText('1901', cx, sy + ph * 0.825);
        ctx.strokeStyle = 'rgba(90,78,58,.20)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(sx + pw * 0.16, sy + ph * 0.77);
        ctx.lineTo(sx + pw * 0.84, sy + ph * 0.77);
        ctx.stroke();
      },
    });
    // cap
    drawBox(x - 1.4, z - 0.5, 6.6, 1.4, yBase + 6.4, yBase + 6.85, matte(th.stone, 0.14, 0.02, -0.1), { alpha });
    return box;
  }

  /* ---------------- trees, people, props ---------------- */
  function drawTree(o, now, alpha) {
    if (alpha <= 0.01) return;
    const { x, z, s, seed, kind } = o;
    const sway = reduceMotion ? 0 : Math.sin(now * 0.7 + seed) * 0.8 * s;
    const base = proj(x, z, 0);
    ctx.save();
    ctx.globalAlpha *= alpha;
    // shadow
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(base.x + 2 * view.scale * 0.5, base.y + 1, 3.1 * s * IX * view.scale, 1.15 * s * view.scale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    const trunkTop = proj(x + sway * 0.3, z, 2.0 * s);
    ctx.strokeStyle = '#8B7859';
    ctx.lineWidth = Math.max(1, 0.22 * s * view.scale);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(trunkTop.x, trunkTop.y); ctx.stroke();
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) {
        const yy = 2.4 + i * 1.15;
        const w = (2.6 - i * 0.6) * s * view.scale;
        const p = proj(x + sway * 0.4, z, yy * s);
        const p2 = proj(x + sway * 0.4, z, (yy + 1.6) * s);
        poly([{ x: p.x - w, y: p.y }, { x: p.x + w, y: p.y }, { x: p2.x, y: p2.y }], i % 2 ? '#8AA084' : '#97AC8E', '#6F8469', 0.7);
      }
    } else {
      const blobs = [
        { h: 3.1, r: 2.0, dx: -0.5, c: '#9DB397' },
        { h: 4.0, r: 2.4, dx: 0.55, c: '#A8BCA0' },
        { h: 4.9, r: 1.8, dx: -0.2, c: '#B4C5A9' },
      ];
      for (const b of blobs) {
        const p = proj(x + b.dx * s + sway, z, b.h * s);
        const r = b.r * s * view.scale;
        ctx.fillStyle = b.c;
        ctx.strokeStyle = 'rgba(103,124,95,.62)';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      }
      const hi = proj(x - 0.7 * s + sway, z + 0.3 * s, 5.3 * s);
      ctx.fillStyle = 'rgba(220,231,205,.55)';
      ctx.beginPath(); ctx.arc(hi.x, hi.y, 0.7 * s * view.scale, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, z, seed, now, alpha, accent) {
    if (alpha <= 0.01) return;
    const bob = reduceMotion ? 0 : Math.sin(now * 1.1 + seed) * 0.5;
    const base = proj(x, z, 0);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = 'rgba(80,68,46,.16)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 1, 0.55 * view.scale, 0.24 * view.scale, 0, 0, TAU);
    ctx.fill();
    const legY = 0.75 * view.scale;
    const bodyH = 0.9 * view.scale;
    ctx.strokeStyle = '#44515B'; ctx.lineWidth = Math.max(1, 0.11 * view.scale);
    ctx.beginPath();
    ctx.moveTo(base.x - 2, base.y); ctx.lineTo(base.x - 1, base.y - legY);
    ctx.moveTo(base.x + 2, base.y); ctx.lineTo(base.x + 1, base.y - legY);
    ctx.stroke();
    ctx.fillStyle = accent || '#9C1B22';
    const by = base.y - legY - bodyH + bob;
    ctx.beginPath();
    ctx.roundRect(base.x - 4.2, by, 8.4, bodyH, 3);
    ctx.fill();
    ctx.fillStyle = '#E0BE9E';
    ctx.beginPath(); ctx.arc(base.x, by - 3.2, 2.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2E3A44';
    ctx.beginPath(); ctx.arc(base.x, by - 3.6, 2.5, Math.PI, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBench(x, z, alpha) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    drawBox(x, z, 3.4, 1.0, 0.45, 0.75, matte('#C49A6C', 0.12, -0.02, -0.14));
    drawBox(x + 0.2, z - 0.15, 3.0, 0.18, 0.75, 1.65, matte('#B98D60'));
    drawBox(x + 0.2, z + 0.95, 0.18, 0.18, 0, 0.75, matte('#5D5142'));
    drawBox(x + 3.0, z + 0.95, 0.18, 0.18, 0, 0.75, matte('#5D5142'));
    ctx.restore();
  }

  function drawLamp(x, z, alpha) {
    if (alpha <= 0.01) return;
    const base = proj(x, z, 0);
    const top = proj(x, z, 4.6);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.strokeStyle = '#4F5B5A'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.fillStyle = '#F2D39A';
    ctx.beginPath(); ctx.arc(top.x, top.y, 2.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4F5B5A'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(top.x, top.y, 3.4, Math.PI, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawCone(x, z, alpha) {
    const b = proj(x, z, 0);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#C05A3C';
    ctx.beginPath();
    ctx.moveTo(b.x - 4, b.y); ctx.lineTo(b.x, b.y - 12); ctx.lineTo(b.x + 4, b.y); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#F7F2E7'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(b.x - 2.4, b.y - 5); ctx.lineTo(b.x + 2.4, b.y - 5); ctx.stroke();
    ctx.fillStyle = 'rgba(70,58,40,.18)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 1, 5, 1.8, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------------- site / ground ---------------- */
  function drawGrid(now) {
    ctx.save();
    ctx.strokeStyle = 'rgba(146,132,106,.13)';
    ctx.lineWidth = 0.55;
    const step = 8;
    const x0 = -110, x1 = 140, z0 = -120, z1 = 90;
    for (let x = x0; x <= x1; x += step) {
      const a = proj(x, z0, 0), b = proj(x, z1, 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let z = z0; z <= z1; z += step) {
      const a = proj(x0, z, 0), b = proj(x1, z, 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlaza(ch, now) {
    if (ch.envAlpha <= 0.01) return;
    const a = ch.envAlpha;
    const x = ch.pav.x, z = ch.pav.z;
    // lawn halo
    ctx.save(); ctx.globalAlpha *= a * 0.9;
    isoEllipse(x - 7, z + 2, 19, 'rgba(214,224,202,.55)', null, 0);
    isoEllipse(x + 9, z - 8, 14, 'rgba(206,219,194,.42)', null, 0);
    ctx.restore();
    // stone terrace
    const w = ch.pavW + 12, d = ch.pavD + 10;
    const p = [
      { x: x - w / 2 + 2, z: z - d / 2 }, { x: x + w / 2 - 2, z: z - d / 2 },
      { x: x + w / 2, z: z - d / 2 + 2 }, { x: x + w / 2, z: z + d / 2 - 2 },
      { x: x + w / 2 - 2, z: z + d / 2 }, { x: x - w / 2 + 2, z: z + d / 2 },
      { x: x - w / 2, z: z + d / 2 - 2 }, { x: x - w / 2, z: z - d / 2 + 2 },
    ];
    ctx.save(); ctx.globalAlpha *= a;
    poly(p.map((q) => proj(q.x, q.z, 0.06)), 'rgba(240,231,214,.88)', 'rgba(177,161,132,.42)', 0.8);
    // paving joints
    ctx.save();
    ctx.beginPath();
    p.forEach((q, i) => { const pp = proj(q.x, q.z, 0.07); i ? ctx.lineTo(pp.x, pp.y) : ctx.moveTo(pp.x, pp.y); });
    ctx.closePath(); ctx.clip();
    ctx.strokeStyle = 'rgba(177,161,132,.22)'; ctx.lineWidth = 0.6;
    for (let gx = -w / 2; gx <= w / 2; gx += 3) {
      const a1 = proj(x + gx, z - d / 2, 0.07), b1 = proj(x + gx, z + d / 2, 0.07);
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
    }
    for (let gz = -d / 2; gz <= d / 2; gz += 3) {
      const a1 = proj(x - w / 2, z + gz, 0.07), b1 = proj(x + w / 2, z + gz, 0.07);
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
    }
    ctx.restore();
    // dashed site ring
    ctx.strokeStyle = 'rgba(156,27,34,.20)';
    ctx.lineWidth = 0.9;
    ctx.setLineDash([5, 7]);
    const cc = proj(x, z, 0.04);
    ctx.beginPath();
    ctx.ellipse(cc.x, cc.y, 23 * IX * SQRT2 * view.scale, 23 * IY * SQRT2 * view.scale, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ---------------- road ---------------- */
  function ribbonPoly(d0, d1, halfWidth, fill, stroke, alpha, dash) {
    if (d1 <= d0 + 0.01) return;
    const step = 1.1;
    const left = [], right = [];
    for (let d = d0; d <= d1 + 0.001; d += step) {
      const dd = Math.min(d, d1);
      const p = route.at(dd);
      const t = route.tangent(dd);
      const nx = -t.z, nz = t.x;
      left.push(proj(p.x + nx * halfWidth, p.z + nz * halfWidth, 0.08));
      right.push(proj(p.x - nx * halfWidth, p.z - nz * halfWidth, 0.08));
      if (dd >= d1) break;
    }
    const pts = left.concat(right.reverse());
    poly(pts, fill, stroke || null, 0.7, alpha);
  }

  function drawCrosswalk(d, alpha) {
    if (alpha <= 0.01) return;
    for (let i = -3; i <= 3; i++) {
      ribbonPoly(d + i * 1.05 - 0.3, d + i * 1.05 + 0.3, 2.05, 'rgba(255,252,244,.72)', null, alpha);
    }
  }

  function drawRoad(roadD, now) {
    // planned / future route
    const future = Math.min(route.length, roadD + 26);
    if (roadD < route.length - 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(156,27,34,.26)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      for (let d = roadD; d <= future; d += 2) {
        const p = proj(route.at(d).x, route.at(d).z, 0.09);
        if (d === roadD) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // survey stakes
      for (const off of [8, 18]) {
        const dd = Math.min(route.length - 0.5, roadD + off);
        if (dd < roadD + 2) continue;
        const p = route.at(dd);
        const t = route.tangent(dd);
        const nx = -t.z, nz = t.x;
        for (const s of [-1, 1]) {
          const b = proj(p.x + nx * s * 3.2, p.z + nz * s * 3.2, 0);
          const tp = proj(p.x + nx * s * 3.2, p.z + nz * s * 3.2, 1.3);
          ctx.strokeStyle = 'rgba(120,105,80,.45)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
          ctx.fillStyle = 'rgba(156,27,34,.55)';
          ctx.fillRect(tp.x - 1, tp.y - 1, 2, 2);
        }
      }
    }
    // shoulder + surface
    ribbonPoly(0, roadD, 3.5, 'rgba(215,200,171,.92)', null, 1);
    ribbonPoly(0, roadD, 2.85, C.road, 'rgba(205,190,162,.9)', 1);
    // centre dashes
    for (let d = 1.2; d < roadD; d += 5.2) {
      if (Math.floor(d / 5.2) % 2 === 0) ribbonPoly(d, Math.min(roadD, d + 2.1), 0.16, 'rgba(255,253,246,.92)', null, 1);
    }
    // crosswalks at chapter bends
    for (const ch of chapters) {
      if (Math.abs(ch.d - roadD) < 30 || roadD > ch.d) {
        drawCrosswalk(ch.d + (ch.side > 0 ? 3.2 : -3.2), 0.62);
      }
    }
    // spurs
    for (const ch of chapters) {
      if (ch.spurAlpha <= 0.01) continue;
      const a = route.at(ch.d);
      const t = route.tangent(ch.d);
      const nx = -t.z, nz = t.x;
      const from = { x: a.x + nx * ch.side * 2.9, z: a.z + nz * ch.side * 2.9 };
      const to = { x: ch.pav.x, z: ch.pav.z + 7.2 };
      const cx = (from.x + to.x) / 2 + nx * ch.side * 3.5;
      const cz = (from.z + to.z) / 2 + nz * ch.side * 3.5;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const x = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * cx + u * u * to.x;
        const z = (1 - u) * (1 - u) * from.z + 2 * (1 - u) * u * cz + u * u * to.z;
        pts.push(proj(x, z, 0.1));
      }
      ctx.save();
      ctx.globalAlpha *= ch.spurAlpha;
      ctx.strokeStyle = 'rgba(218,203,174,.95)'; ctx.lineWidth = 4.1 * view.scale * 0.35;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,231,214,.95)'; ctx.lineWidth = 2.7 * view.scale * 0.35;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.restore();
    }
    // road head works
    if (roadD < route.length - 2) {
      const p = route.at(roadD);
      const t = route.tangent(roadD);
      const nx = -t.z, nz = t.x;
      for (const s of [-1, 1]) drawCone(p.x + nx * s * 2.3, p.z + nz * s * 2.3, 0.95);
      const poleB = proj(p.x, p.z, 0);
      const poleT = proj(p.x, p.z, 2.4);
      ctx.strokeStyle = 'rgba(100,86,64,.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(poleB.x, poleB.y); ctx.lineTo(poleT.x, poleT.y); ctx.stroke();
      ctx.fillStyle = 'rgba(156,27,34,.72)';
      ctx.beginPath();
      ctx.moveTo(poleT.x, poleT.y);
      ctx.lineTo(poleT.x + 10, poleT.y + 3);
      ctx.lineTo(poleT.x, poleT.y + 7);
      ctx.closePath(); ctx.fill();
    }
  }

  /* ---------------- furniture ---------------- */
  function toilet(x, z, alpha) {
    ctx.save(); ctx.globalAlpha *= alpha;
    drawBox(x - 0.45, z - 1.1, 0.9, 0.38, 0.35, 1.35, matte('#F4F1E9'), { lw: 0.4 });
    const b = proj(x, z - 0.25, 0.72);
    ctx.fillStyle = '#F9F6EE'; ctx.strokeStyle = 'rgba(120,110,92,.35)'; ctx.lineWidth = 0.55;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 0.62 * view.scale, 0.42 * view.scale, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#DDE3DC';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 0.40 * view.scale, 0.25 * view.scale, 0, 0, TAU); ctx.fill();
    drawBox(x - 0.38, z - 0.55, 0.76, 0.62, 0.35, 0.7, matte('#F4F1E9'), { lw: 0.4 });
    ctx.restore();
  }

  function squat(x, z, alpha) {
    ctx.save(); ctx.globalAlpha *= alpha;
    const c = proj(x, z, 0.42);
    ctx.fillStyle = '#F7F4EC'; ctx.strokeStyle = 'rgba(120,110,92,.3)'; ctx.lineWidth = 0.55;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 0.85 * view.scale, 0.45 * view.scale, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#C9D3CF';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 0.02 * view.scale, 0.22 * view.scale, 0.34 * view.scale, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function stall(x, z, w, d, h, theme, open, alpha) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    const m = matte(theme.trim, 0.06, -0.03, -0.16);
    const mDoor = matte(shade(theme.trim, 0.32), 0.12, -0.02, -0.12);
    // partitions
    drawBox(x, z, 0.22, d, 0.3, h, m, { lw: 0.5 });
    drawBox(x + w - 0.22, z, 0.22, d, 0.3, h, m, { lw: 0.5 });
    drawBox(x + 0.22, z, w - 0.44, d, h - 0.22, h, m, { lw: 0.5 });
    // little interior
    toilet(x + w / 2, z + d * 0.45, alpha);
    if (open) {
      // swung door
      const hinge = { x: x + 0.22, z: z + d };
      const ang = -1.05;
      const dx = Math.sin(ang) * (w - 0.44), dz = Math.cos(ang) * (w - 0.44) * 0.25;
      const a = proj(hinge.x, hinge.z, h), b = proj(hinge.x + dx, hinge.z - dz, h);
      const a0 = proj(hinge.x, hinge.z, 0.45), b0 = proj(hinge.x + dx, hinge.z - dz, 0.45);
      poly([a, b, b0, a0], mDoor.left, mDoor.edge, 0.6);
      // lock + handle
      const hd = proj(hinge.x + dx * 0.82, hinge.z - dz * 0.82, h * 0.52);
      ctx.fillStyle = '#D9C9A8'; ctx.beginPath(); ctx.arc(hd.x, hd.y, 1.2, 0, TAU); ctx.fill();
    } else {
      const zf = z + d - 0.05;
      wallQuadZ(zf, x + 0.28, x + w - 0.28, 0.45, h - 0.18, mDoor.right, mDoor.edge, 1);
      const mid = proj(x + w / 2, zf, h * 0.5);
      ctx.fillStyle = '#B9C4B8'; ctx.beginPath(); ctx.arc(mid.x, mid.y, 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#9C1B22'; ctx.beginPath(); ctx.arc(mid.x, mid.y, 0.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function sinkCounter(x, z, alpha, theme) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    drawBox(x, z, 1.9, 3.4, 0.4, 1.75, matte('#E8DFCE'), { lw: 0.5 });
    drawBox(x + 0.15, z + 0.2, 1.6, 3.0, 1.75, 1.9, matte('#F4EEE2'), { lw: 0.45 });
    for (let i = 0; i < 2; i++) {
      const zz = z + 0.95 + i * 1.45;
      const b = proj(x + 1.05, zz, 1.95);
      ctx.fillStyle = '#F8F5EC'; ctx.strokeStyle = 'rgba(120,110,92,.34)'; ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 0.52 * view.scale, 0.33 * view.scale, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#CFD9D2';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 0.33 * view.scale, 0.19 * view.scale, 0, 0, TAU); ctx.fill();
      // faucet
      const f = proj(x + 0.55, zz, 2.15);
      ctx.strokeStyle = '#7B8A8E'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(f.x, f.y + 4); ctx.lineTo(f.x, f.y - 3); ctx.lineTo(f.x + 5, f.y - 2); ctx.stroke();
    }
    // mirror on left wall (wall face is 0.75 units behind the counter)
    const wx = x - 0.77;
    wallQuadX(wx - 0.01, z + 0.4, z + 3.0, 2.25, 3.55, 'rgba(80,96,104,.28)', 'rgba(70,60,45,.3)', 1);
    wallQuadX(wx - 0.02, z + 0.5, z + 2.9, 2.33, 3.47, 'rgba(206,222,220,.55)', null, 1);
    wallLineX(wx - 0.03, z + 0.5, z + 2.9, 2.9, 'rgba(255,255,255,.4)', 1.2, 0.8);
    ctx.restore();
  }

  function plant(x, z, s, alpha, seed) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    const b = proj(x, z, 0);
    ctx.fillStyle = '#C0785B';
    ctx.beginPath();
    ctx.moveTo(b.x - 4.5 * s, b.y); ctx.lineTo(b.x - 3 * s, b.y - 7 * s);
    ctx.lineTo(b.x + 3 * s, b.y - 7 * s); ctx.lineTo(b.x + 4.5 * s, b.y); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#A9614A';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 4.5 * s, 1.4 * s, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * 0.45 + Math.sin(seed + i) * 0.12;
      const len = (7 + (i % 3) * 2.2) * s;
      const ex = b.x + Math.cos(ang) * len;
      const ey = b.y - 7 * s + Math.sin(ang) * len;
      ctx.strokeStyle = i % 2 ? '#8DA88A' : '#7A987A';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 7 * s); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = i % 2 ? '#9CB397' : '#8DA88A';
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.2 * s, 2.1 * s, ang, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function bookshelf(x, z, alpha) {
    ctx.save(); ctx.globalAlpha *= alpha;
    drawBox(x, z, 2.6, 0.5, 0.2, 2.5, matte('#9A7C58'), { lw: 0.5 });
    drawBox(x + 0.08, z + 0.45, 2.44, 0.12, 0.35, 2.35, matte('#C8B08A'), { lw: 0.3 });
    for (let i = 0; i < 8; i++) {
      const bx = x + 0.2 + (i % 4) * 0.55;
      const by = i < 4 ? 0.55 : 1.45;
      ctx.fillStyle = ['#9C1B22', '#3F6273', '#C49A6C', '#7C8A76'][i % 4];
      const p = proj(bx, z + 0.45, by + 0.55);
      ctx.fillRect(p.x - 2, p.y - 7, 3.2, 7);
    }
    ctx.restore();
  }

  function couch(x, z, alpha, theme) {
    ctx.save(); ctx.globalAlpha *= alpha;
    drawBox(x, z, 3.2, 1.2, 0.5, 1.2, matte('#B9C4B8'), { lw: 0.5 });
    drawBox(x + 0.15, z + 0.15, 2.9, 0.9, 1.2, 1.45, matte('#C6D0C3'), { lw: 0.4 });
    drawBox(x, z - 0.35, 3.2, 0.55, 1.2, 2.35, matte('#AEBBAE'), { lw: 0.5 });
    drawBox(x - 0.1, z + 0.1, 0.5, 1.0, 1.2, 2.0, matte('#AEBBAE'), { lw: 0.4 });
    drawBox(x + 2.8, z + 0.1, 0.5, 1.0, 1.2, 2.0, matte('#AEBBAE'), { lw: 0.4 });
    // blanket
    const p = proj(x + 2.1, z + 0.55, 1.5);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(p.x - 7, p.y - 2, 14, 6);
    ctx.restore();
  }

  /* ---------------- pavilion ---------------- */
  function drawPavilion(ch, now) {
    const p = ch.p;
    if (p <= 0.001) return;
    const th = ch.theme;
    const W0 = ch.pavW, D0 = ch.pavD;
    const x = ch.pav.x - W0 / 2, z = ch.pav.z - D0 / 2;
    const x0 = x, x1 = x + W0, z0 = z, z1 = z + D0;
    const zS = z0 + 4.8;
    const H0 = 8.8;
    const UP = 4.6;
    const wallP = smooth(baseScale < 500 ? 0.08 : 0.10, 0.34, p);
    const foundP = smooth(0, 0.14, p);
    const floorP = smooth(0.26, 0.43, p);
    const winP = smooth(0.40, 0.58, p);
    const roofP = smooth(0.55, 0.76, p);
    const furnP = smooth(0.48, 0.92, p);
    const hgt = H0 * easeOut(wallP);
    const lowH = 1.05 * easeOut(wallP);

    // shadow
    ctx.save();
    ctx.globalAlpha *= smooth(0.02, 0.18, p);
    const sc = proj(ch.pav.x + 1.5, ch.pav.z + 1.5, 0);
    const g = ctx.createRadialGradient(sc.x, sc.y, 4, sc.x, sc.y, 19 * view.scale);
    g.addColorStop(0, 'rgba(79,67,46,.18)');
    g.addColorStop(0.65, 'rgba(79,67,46,.07)');
    g.addColorStop(1, 'rgba(79,67,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(sc.x, sc.y, 19 * IX * view.scale, 9.2 * IY * view.scale, 0, 0, TAU); ctx.fill();
    ctx.restore();

    // foundation
    const fp = easeOut(foundP);
    if (fp > 0) {
      const fw = (W0 + 3.0) * (0.72 + 0.28 * fp);
      const fd = (D0 + 3.0) * (0.72 + 0.28 * fp);
      drawBox(ch.pav.x - fw / 2, ch.pav.z - fd / 2, fw, fd, -0.1, 0.55 * fp, matte(shade(th.stone, -0.08)), { alpha: Math.min(1, fp * 1.5) });
      // foundation outline when very early
      if (p < 0.11) {
        ctx.save();
        ctx.globalAlpha *= (0.11 - p) / 0.11 * 0.7;
        const pts = [
          { x: ch.pav.x - (W0 + 3) / 2, z: ch.pav.z - (D0 + 3) / 2 },
          { x: ch.pav.x + (W0 + 3) / 2, z: ch.pav.z - (D0 + 3) / 2 },
          { x: ch.pav.x + (W0 + 3) / 2, z: ch.pav.z + (D0 + 3) / 2 },
          { x: ch.pav.x - (W0 + 3) / 2, z: ch.pav.z + (D0 + 3) / 2 },
        ];
        poly(pts.map((q) => proj(q.x, q.z, 0.1)), null, 'rgba(156,27,34,.55)', 1);
        ctx.restore();
      }
    }

    // floor slab
    if (floorP > 0) {
      const fIn = 0.75 + 0.25 * easeOut(floorP);
      drawBox(x0 + 0.2, z0 + 0.2, (W0 - 0.4) * fIn, (D0 - 0.4) * fIn, 0.55, 0.85, matte(th.floor, 0.10, -0.01, -0.12), { alpha: floorP });
      // floor tile lines only on open courtyard
      if (floorP > 0.7) {
        ctx.save();
        ctx.globalAlpha *= (floorP - 0.7) / 0.3;
        const fy = 0.86;
        ctx.strokeStyle = 'rgba(120,105,84,.18)'; ctx.lineWidth = 0.5;
        for (let xx = x0 + 1.5; xx < x1; xx += 2.1) {
          const a = proj(xx, z0 + 0.2, fy), b = proj(xx, z1 - 0.2, fy);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        for (let zz = z0 + 1.5; zz < z1; zz += 2.1) {
          const a = proj(x0 + 0.2, zz, fy), b = proj(x1 - 0.2, zz, fy);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // tall walls
    const wallM = matte(th.wall, 0.09, -0.015, -0.13);
    const wall2M = matte(th.wall2, 0.08, -0.02, -0.15);
    // back wall (z0)
    drawBox(x0, z0, W0, 0.65, 0.55, Math.max(0.56, hgt), wallM, { alpha: 1 });
    // left wall (x0)
    drawBox(x0, z0 + 0.65, 0.65, D0 - 0.65, 0.55, Math.max(0.56, hgt), wall2M, { alpha: 1 });
    // service core front wall (zS)
    drawBox(x0 + 0.65, zS - 0.3, W0 - 0.65, 0.6, 0.55, Math.max(0.56, UP * easeOut(wallP)), wallM, { alpha: 1 });
    // rear right wall (below mezzanine only)
    drawBox(x1 - 0.65, z0 + 0.65, 0.65, zS - z0 - 0.65, 0.55, Math.max(0.56, UP * easeOut(wallP)), wall2M, { alpha: 1 });
    // low parapet front & right
    drawBox(x0, z1 - 0.55, W0, 0.55, 0.55, 0.55 + lowH, wallM, { alpha: 1 });
    drawBox(x1 - 0.55, zS, 0.55, z1 - zS, 0.55, 0.55 + lowH, wall2M, { alpha: 1 });
    // corner columns supporting roof
    drawBox(x1 - 0.75, zS - 0.75, 0.75, 0.75, 0.55, Math.max(0.56, hgt * 0.98), matte(th.trim, 0.05, -0.02, -0.15), { alpha: 1 });
    drawBox(x0, zS - 0.45, 0.7, 0.7, 0.55, Math.max(0.56, hgt * 0.98), matte(th.trim, 0.05, -0.02, -0.15), { alpha: 1 });

    // facade detail: brick bands / bands / wood
    if (winP > 0.02 && wallP > 0.5) {
      const fa = winP;
      if (th.facade === 'brick') {
        ctx.save(); ctx.globalAlpha *= fa * 0.35;
        for (let yy = 1.4; yy < hgt - 0.5; yy += 0.9) {
          wallLineZ(z0 + 0.66, x0 + 0.7, x1 - 0.7, yy, shade(th.wall, -0.22), 0.4, 1);
          wallLineX(x0 + 0.66, z0 + 0.8, z1 - 0.8, yy, shade(th.wall2, -0.22), 0.4, 1);
        }
        ctx.restore();
      } else if (th.facade === 'band') {
        ctx.save(); ctx.globalAlpha *= fa * 0.5;
        for (let yy = 2.2; yy < hgt; yy += 2.2) {
          wallLineZ(z0 + 0.66, x0 + 0.7, x1 - 0.7, yy, shade(th.trim, 0.05), 1.1, 1);
          wallLineX(x0 + 0.66, z0 + 0.8, z1 - 0.8, yy, shade(th.trim, 0.05), 1.1, 1);
        }
        ctx.restore();
      } else if (th.facade === 'wood') {
        ctx.save(); ctx.globalAlpha *= fa * 0.45;
        for (let yy = 1.0; yy < hgt; yy += 0.55) {
          wallLineX(x0 + 0.66, z0 + 0.9, zS - 0.2, yy, shade(th.trim, 0.16), 0.5, 1);
        }
        ctx.restore();
      }
    }

    // windows
    if (winP > 0) {
      // upper back wall band
      windowZ(z0 + 0.66, x0 + 1.0, x1 - 1.0, 5.45, 7.55, th, winP * 0.95, 'grid');
      // upper left wall feature windows
      windowX(x0 + 0.66, z0 + 1.2, z0 + 3.6, 5.4, 7.6, th, winP * 0.9, 'grid');
      windowX(x0 + 0.66, z0 + 4.2, z0 + 6.6, 5.4, 7.6, th, winP * 0.9, 'grid');
      // service wall lower windows
      windowZ(zS + 0.31, x0 + 1.1, x0 + 3.1, 2.05, 3.35, th, winP * 0.8, 'grid');
      windowZ(zS + 0.31, x1 - 3.4, x1 - 1.2, 2.05, 3.35, th, winP * 0.8, 'grid');
      // feature round window on upper back (theme)
      const round = proj((x0 + x1) / 2, z0 + 0.68, 6.6);
      ctx.save(); ctx.globalAlpha *= winP * 0.9;
      ctx.fillStyle = shade(th.trim, -0.05);
      ctx.beginPath(); ctx.ellipse(round.x, round.y, 1.05 * IX * view.scale, 1.05 * view.scale, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = th.glass;
      ctx.beginPath(); ctx.ellipse(round.x, round.y, 0.78 * IX * view.scale, 0.78 * view.scale, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 0.7;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(round.x - Math.cos(a) * 0.7 * IX * view.scale, round.y - Math.sin(a) * 0.7 * view.scale);
        ctx.lineTo(round.x + Math.cos(a) * 0.7 * IX * view.scale, round.y + Math.sin(a) * 0.7 * view.scale);
        ctx.stroke();
      }
      ctx.restore();
    }

    // upper slab + railing + stairs
    if (floorP > 0) {
      const slide = (1 - easeOut(floorP)) * -8;
      ctx.save();
      ctx.translate(slide * view.scale * 0.6, 0);
      drawBox(x0 + 0.65, z0 + 0.65, W0 - 1.3, zS - z0 - 0.95, UP, UP + 0.42, matte(th.floor, 0.14, 0.0, -0.10), { alpha: floorP });
      // upper deck joints
      ctx.globalAlpha *= floorP * 0.4;
      for (let xx = x0 + 2; xx < x1 - 1; xx += 2.4) {
        wallLineX(x0 + 0.65, 0, 0, 0, 'rgba(0,0,0,0)', 0, 0);
      }
      ctx.restore();
    }
    if (floorP > 0.55) {
      const fa = smooth(0.55, 0.9, floorP);
      // railing along the front edge of the upper deck
      ctx.save(); ctx.globalAlpha *= fa;
      drawBox(x0 + 0.75, zS - 0.5, W0 - 1.5, 0.16, UP + 1.45, UP + 1.62, matte(th.trim, 0.08), { lw: 0.4 });
      for (let xx = x0 + 1.0; xx < x1 - 0.6; xx += 1.4) {
        drawBox(xx, zS - 0.48, 0.1, 0.1, UP + 0.42, UP + 1.45, matte(th.trim, 0.02), { lw: 0.25 });
      }
      ctx.restore();
      // stairs
      const stairP = smooth(0.5, 0.95, floorP);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const sy = 0.55 + (UP - 0.55) * t;
        const sz = z1 - 1.0 - (z1 - zS - 1.2) * t;
        drawBox(x1 - 2.6, sz - 0.55, 2.0, 0.62, sy - 0.38, sy, matte(th.stone, 0.12, -0.02, -0.12), { alpha: stairP, lw: 0.4 });
      }
      // stair rail
      const r1 = proj(x1 - 0.55, z1 - 1.0, 1.7);
      const r2 = proj(x1 - 0.55, zS + 0.2, UP + 1.6);
      ctx.save(); ctx.globalAlpha *= stairP * 0.8;
      ctx.strokeStyle = shade(th.trim, -0.15); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
      ctx.restore();
    }

    // upper lounge
    if (floorP > 0.75) {
      const la = smooth(0.75, 1.0, floorP);
      // rug
      ctx.save(); ctx.globalAlpha *= la * 0.9;
      const rug = proj((x0 + x1) / 2, z0 + 2.3, UP + 0.44);
      ctx.fillStyle = 'rgba(193,164,135,.5)';
      ctx.beginPath(); ctx.ellipse(rug.x, rug.y, 3.6 * IX * view.scale, 1.5 * view.scale, 0, 0, TAU); ctx.fill();
      ctx.restore();
      bookshelf(x0 + 1.0, z0 + 0.85, la);
      couch(x0 + 3.4, z0 + 1.0, la, th);
      // coffee table
      drawBox(x0 + 4.0, z0 + 3.0, 2.0, 1.2, UP + 0.44, UP + 0.95, matte('#B6A080', 0.1), { alpha: la, lw: 0.4 });
      plant(x0 + 6.5, z0 + 2.2, 0.7, la, 3.1);
    }

    // ground furniture
    if (furnP > 0.001) {
      // stalls
      const stallW = 2.35, stallD = 2.0, stallH = 3.05;
      for (let i = 0; i < 3; i++) {
        const t0 = 0.02 + i * 0.12;
        const a = smooth(t0, t0 + 0.2, furnP);
        stall(x0 + 1.1 + i * stallW, zS + 0.15, stallW, stallD, stallH, th, i === 1, a);
      }
      // sinks
      const sinkA = smooth(0.28, 0.52, furnP);
      sinkCounter(x0 + 0.75, z0 + 6.8, sinkA, th);
      // bench + plant + bin
      const benchA = smooth(0.50, 0.74, furnP);
      drawBench(x1 - 4.4, z1 - 2.4, benchA);
      plant(x1 - 1.2, z1 - 1.2, 1.1, smooth(0.36, 0.6, furnP), 1.7);
      plant(x0 + 2.0, z1 - 1.0, 0.8, smooth(0.58, 0.8, furnP), 2.7);
      // hand dryer on service wall
      const hdA = smooth(0.56, 0.8, furnP);
      if (hdA > 0.01) {
        drawBox(x1 - 2.4, zS + 0.28, 0.7, 0.35, 1.7, 2.5, matte('#E9E4D8'), { alpha: hdA, lw: 0.4 });
      }
      // poster on service wall
      if (winP > 0.5) {
        ctx.save(); ctx.globalAlpha *= winP * 0.9;
        wallQuadZ(zS + 0.32, x1 - 5.4, x1 - 3.9, 1.7, 3.2, 'rgba(248,242,230,.95)', 'rgba(120,105,84,.4)', 1);
        wallQuadZ(zS + 0.33, x1 - 5.4, x1 - 3.9, 2.85, 3.1, th.accent, null, 1);
        wallLineZ(zS + 0.34, x1 - 5.2, x1 - 4.1, 2.25, 'rgba(120,105,84,.35)', 0.6, 1);
        wallLineZ(zS + 0.34, x1 - 5.2, x1 - 4.3, 2.05, 'rgba(120,105,84,.28)', 0.5, 1);
        ctx.restore();
      }
    }

    // door on service wall + frame
    if (winP > 0.4) {
      ctx.save(); ctx.globalAlpha *= winP;
      wallQuadZ(zS + 0.32, x0 + 3.7, x0 + 5.7, 0.55, 3.25, shade(th.trim, 0.12), shade(th.trim, -0.4), 1);
      const dh = proj(x0 + 4.7, zS + 0.33, 2.95);
      ctx.fillStyle = 'rgba(230,210,160,.9)';
      ctx.beginPath(); ctx.arc(dh.x, dh.y, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // roof
    if (roofP > 0.001) {
      const drop = (1 - easeOut(roofP)) * 7;
      const ra = smooth(0, 0.12, roofP);
      ctx.save();
      ctx.globalAlpha *= ra;
      ctx.translate(0, -drop * view.scale);
      const ry0 = hgt + 0.2, ryR = hgt + 1.55;
      if (th.roofType === 'gable') {
        gableRoofX(x0 - 0.7, z0 - 0.7, x1 + 0.7, zS + 0.2, ry0, ryR, th.roof, { tileCount: 5 });
      } else if (th.roofType === 'chinese') {
        // rear roof + a small side roof
        chineseRoof((x0 + x1) / 2, (z0 + zS) / 2 - 0.2, W0 + 2.0, zS - z0 + 2.0, ry0, th.roof, { height: 1.65, under: '#8E2A24' });
        chineseRoof((x0 + x1) / 2 - 2.5, zS + 3.2, 9.0, 4.2, 5.7, th.roof2, { height: 1.0, under: '#8E2A24', alpha: 0.9 });
      } else if (th.roofType === 'sail') {
        // shallow white shell over rear block
        const m = matte(th.roof, 0.1, 0, -0.12);
        const a = proj(x0 - 1, z0 - 1, ry0), b = proj(x1 + 1, z0 - 1, ry0 + 0.35);
        const c = proj(x1 + 1, zS + 1, ry0 + 0.7), d = proj(x0 - 1, zS + 1, ry0 + 0.35);
        poly([a, b, c, d], th.roof, shade(th.roof, -0.25), 1);
        poly([d, c, c, c], 'rgba(0,0,0,0)', null, 0);
        // fascia
        poly([proj(x0 - 1, zS + 1, ry0 + 0.7), proj(x1 + 1, zS + 1, ry0 + 0.7), proj(x1 + 1, zS + 1, ry0 + 0.1), proj(x0 - 1, zS + 1, ry0 + 0.1)], shade(th.roof, -0.16), shade(th.roof, -0.3), 0.8);
      } else {
        drawBox(x0 - 0.8, z0 - 0.8, W0 + 1.6, zS - z0 + 1.4, hgt + 0.15, hgt + 0.75, matte(th.roof, 0.12, 0.01, -0.12), { lw: 0.6 });
        drawBox(x0 - 0.9, z0 - 0.9, W0 + 1.8, 0.3, hgt + 0.7, hgt + 1.25, matte(th.roof2, 0.05), { lw: 0.5 });
        // roof deck detail
        drawBox(x1 - 3.2, z0 + 1.4, 1.8, 1.2, hgt + 0.75, hgt + 1.5, matte(th.wall2, 0.04), { lw: 0.4 });
      }
      // courtyard glass canopy
      const ca = smooth(0.25, 0.7, roofP);
      if (ca > 0.01) {
        ctx.globalAlpha *= ca * 0.9;
        const yC = hgt - 0.65;
        const p1 = proj(x0 + 0.3, zS + 0.4, yC), p2 = proj(x1 - 0.3, zS + 0.4, yC);
        const p3 = proj(x1 - 0.3, z1 - 0.25, yC + 0.55), p4 = proj(x0 + 0.3, z1 - 0.25, yC + 0.55);
        poly([p1, p2, p3, p4], 'rgba(195,216,212,.16)', 'rgba(112,130,128,.28)', 0.8);
        ctx.save();
        ctx.globalAlpha *= 0.5;
        ctx.strokeStyle = 'rgba(112,130,128,.6)'; ctx.lineWidth = 0.7;
        for (let i = 0; i <= 4; i++) {
          const u = i / 4;
          const a1 = proj(lerp(x0 + 0.3, x1 - 0.3, u), zS + 0.4, yC);
          const a2 = proj(lerp(x0 + 0.3, x1 - 0.3, u), z1 - 0.25, yC + 0.55);
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
        }
        for (let i = 0; i <= 3; i++) {
          const v = i / 3;
          const a1 = proj(x0 + 0.3, lerp(zS + 0.4, z1 - 0.25, v), yC + 0.55 * v);
          const a2 = proj(x1 - 0.3, lerp(zS + 0.4, z1 - 0.25, v), yC + 0.55 * v);
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
        }
        ctx.restore();
      }
      // roof sign
      if (th.roofType !== 'flat') {
        sign45(ch.pav.x, z0 + 2.6, hgt + 1.9, 4.2, 1.35, {
          alpha: smooth(0.7, 0.95, roofP),
          fill: th.accent,
          stroke: shade(th.accent, -0.35),
          side: 'rgba(60,40,30,.22)',
          draw: (sx, sy, pw, ph) => {
            ctx.fillStyle = '#F6EEDC'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '700 ' + Math.max(6, ph * 0.34) + 'px "PingFang SC",sans-serif';
            ctx.fillText('第三空间', sx + pw / 2, sy + ph * 0.44);
            ctx.fillStyle = 'rgba(246,238,220,.72)';
            ctx.font = '500 ' + Math.max(4, ph * 0.16) + 'px "PingFang SC",sans-serif';
            ctx.fillText('REST ROOM · ' + pad2(ch.index + 1), sx + pw / 2, sy + ph * 0.72);
          },
        });
      }
      ctx.restore();
    }

    // pendants & warm light
    if (roofP > 0.5) {
      const pa = smooth(0.55, 0.9, roofP);
      for (const px of [x0 + 4.0, x1 - 3.6]) {
        const top = proj(px, zS + 2.8, hgt - 0.2);
        const bot = proj(px, zS + 2.8, 5.2);
        ctx.save(); ctx.globalAlpha *= pa * 0.8;
        ctx.strokeStyle = 'rgba(80,70,52,.55)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
        ctx.fillStyle = th.accent;
        ctx.beginPath(); ctx.moveTo(bot.x - 4, bot.y + 3); ctx.lineTo(bot.x + 4, bot.y + 3); ctx.lineTo(bot.x + 2, bot.y); ctx.lineTo(bot.x - 2, bot.y); ctx.closePath(); ctx.fill();
        const gl = ctx.createRadialGradient(bot.x, bot.y + 3, 1, bot.x, bot.y + 3, 24);
        gl.addColorStop(0, 'rgba(246,206,130,.22)'); gl.addColorStop(1, 'rgba(246,206,130,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bot.x, bot.y + 3, 24, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ---------------- landmarks ---------------- */
  function church(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wallP = easeOut(smooth(0.03, 0.44, lp));
    const winP = smooth(0.38, 0.64, lp);
    const roofP = smooth(0.55, 0.9, lp);
    const y0 = 0.4;
    const H = 13;
    // terrace
    drawBox(x - 10.5, z - 13, 21, 26, 0, 0.4, matte(th.stone), { alpha: smooth(0, 0.2, lp) });
    // nave
    const nx0 = x - 5.6, nx1 = x + 5.6, nz0 = z - 11, nz1 = z + 9;
    drawBox(nx0, nz0, 11.2, 20, 0.4, 0.4 + H * wallP, matte(th.wall, 0.08, -0.01, -0.12));
    // side buttresses
    for (let i = 0; i < 5; i++) {
      const zz = nz0 + 2.0 + i * 4.0;
      drawBox(nx1, zz, 1.0, 1.1, 0.4, 0.4 + 9.0 * wallP, matte(th.stone, 0.06, -0.02, -0.16));
      drawPyramid(nx1 + 0.5, zz + 0.55, 1.4, 1.4, 0.4 + 9.0 * wallP, 0.4 + 11.0 * wallP, th.stone, { alpha: wallP });
    }
    // front gable
    const fz = nz1;
    const gableTop = 17.2;
    if (wallP > 0.2) {
      const tri = [
        proj(nx0, fz, 0.4 + H * wallP), proj(nx1, fz, 0.4 + H * wallP),
        proj(x, fz, 0.4 + gableTop * wallP),
      ];
      poly(tri, shade(th.wall, 0.04), shade(th.wall, -0.3), 0.7);
    }
    // portal
    if (winP > 0.2) {
      ctx.save(); ctx.globalAlpha *= winP;
      const px0 = x - 1.9, px1 = x + 1.9;
      poly([proj(px0, fz + 0.02, 0.4), proj(px1, fz + 0.02, 0.4), proj(px1, fz + 0.02, 3.4), proj(x, fz + 0.02, 4.8), proj(px0, fz + 0.02, 3.4)], shade(th.roof2, -0.05), shade(th.roof2, -0.35), 0.8);
      // rose window
      const rc = proj(x, fz + 0.03, 10.4);
      const rx = 2.5 * IX * view.scale, ry = 2.5 * view.scale;
      ctx.fillStyle = shade(th.stone, 0.12);
      ctx.beginPath(); ctx.ellipse(rc.x, rc.y, rx + 4, ry + 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8FB0B4';
      ctx.beginPath(); ctx.ellipse(rc.x, rc.y, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(238,232,216,.65)'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(rc.x, rc.y);
        ctx.lineTo(rc.x + Math.cos(a) * rx, rc.y + Math.sin(a) * ry);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(rc.x, rc.y, rx * 0.48, ry * 0.48, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // towers
    const towerH = 23;
    for (const tx of [x - 6.5, x + 6.5]) {
      const tz = z + 6.6;
      drawBox(tx - 2.5, tz - 2.5, 5.0, 5.0, 0.4, 0.4 + towerH * wallP, matte(th.stone, 0.08, 0.0, -0.12));
      drawBox(tx - 2.1, tz - 2.1, 4.2, 4.2, 0.4 + towerH * wallP, 0.4 + (towerH + 3.2) * wallP, matte(th.stone, 0.12, 0.0, -0.1));
      // lancets on front face
      if (winP > 0.15) {
        for (const lx of [tx - 1.1, tx + 0.25]) {
          windowZ(tz + 2.52, lx, lx + 0.7, 9.0, 18.0, { ...th, glass: '#8FAEB2', trim: th.stone }, winP * 0.8, 'lancet');
        }
        // clock
        const cc = proj(tx, tz + 2.55, 21.4);
        ctx.save(); ctx.globalAlpha *= winP;
        ctx.fillStyle = '#EFE6D2'; ctx.strokeStyle = shade(th.stone, -0.3); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(cc.x, cc.y, 1.0 * IX * view.scale, 1.0 * view.scale, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#4E5A60'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cc.x, cc.y); ctx.lineTo(cc.x, cc.y - 0.55 * view.scale); ctx.moveTo(cc.x, cc.y); ctx.lineTo(cc.x + 0.4 * view.scale, cc.y + 0.15 * view.scale); ctx.stroke();
        ctx.restore();
      }
      // spire
      if (roofP > 0) {
        const apexY = (towerH + 10.5) * wallP + 0.4;
        const bY = (towerH + 3.2) * wallP + 0.4;
        drawPyramid(tx, tz, 4.6, 4.6, bY, apexY, '#4F5A63', { alpha: smooth(0.1, 0.6, roofP) });
        // cross
        ctx.save(); ctx.globalAlpha *= smooth(0.5, 0.9, roofP);
        const ap = proj(tx, tz, apexY);
        ctx.strokeStyle = '#D9C28B'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(ap.x, ap.y - 0.8 * view.scale); ctx.moveTo(ap.x - 3, ap.y - 0.55 * view.scale); ctx.lineTo(ap.x + 3, ap.y - 0.55 * view.scale); ctx.stroke();
        ctx.restore();
      }
    }
    // nave roof
    if (roofP > 0) {
      const eave = 0.4 + 13.4 * wallP;
      const ridge = 0.4 + 17.6 * wallP;
      gableRoofZ(nx0, nz0, nx1, nz1, eave, ridge, th.roof, { alpha: smooth(0.05, 0.6, roofP), tileCount: 6 });
      // fleche
      drawPyramid(x, z - 2, 1.2, 1.2, ridge, ridge + 2.2, '#4F5A63', { alpha: roofP });
    }
    // small red door glow
    if (winP > 0.5) {
      const dp = proj(x, fz + 0.05, 1.0);
      ctx.save(); ctx.globalAlpha *= winP * 0.35;
      const g = ctx.createRadialGradient(dp.x, dp.y, 1, dp.x, dp.y, 26);
      g.addColorStop(0, 'rgba(246,196,120,.5)'); g.addColorStop(1, 'rgba(246,196,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dp.x, dp.y, 26, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function glassTower(x, z, w, d, y0, y1, th, alpha, floors) {
    if (y1 <= y0 + 0.1) return;
    drawBox(x, z, w, d, y0, y1, glassMatte(th.glass), { alpha, lw: 0.6 });
    const n = floors || 8;
    ctx.save(); ctx.globalAlpha *= alpha * 0.6;
    for (let i = 1; i < n; i++) {
      const yy = lerp(y0, y1, i / n);
      wallLineZ(z + d, x + 0.1, x + w - 0.1, yy, shade(th.trim, 0.06), 0.55, 1);
      wallLineX(x + w, z + 0.1, z + d - 0.1, yy, shade(th.trim, 0.06), 0.55, 1);
    }
    // vertical mullions
    for (let i = 1; i < 4; i++) {
      const xx = x + (w * i) / 4;
      const zz = z + (d * i) / 4;
      const a = proj(xx, z + d, y0), b = proj(xx, z + d, y1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = proj(x + w, zz, y0), e = proj(x + w, zz, y1);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    // vertical highlight
    ctx.globalAlpha *= 0.35;
    wallQuadZ(z + d + 0.01, x + w * 0.12, x + w * 0.2, y0 + 0.3, y1 - 0.3, 'rgba(255,255,255,.55)', null, 1);
    ctx.restore();
  }

  function zhixin(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wp = easeOut(smooth(0.02, 0.42, lp));
    const winP = smooth(0.34, 0.58, lp);
    const roofP = smooth(0.55, 0.86, lp);
    // podium
    drawBox(x - 9, z - 8, 18, 16, 0, 5.0 * wp, matte(th.stone), { alpha: smooth(0, 0.15, lp) });
    // podium glass band
    if (winP > 0.1) {
      windowZ(z + 8.01, x - 7.8, x - 5.2, 1.2, 4.3, th, winP, 'grid');
      windowZ(z + 8.01, x + 2.4, x + 7.8, 1.2, 4.3, th, winP, 'grid');
    }
    // towers
    const towers = [
      { x: x - 4.5, z: z - 1.0, w: 7.0, d: 7.0, h: 31, f: 13 },
      { x: x + 3.2, z: z - 5.0, w: 5.6, d: 5.6, h: 25, f: 11 },
      { x: x + 4.2, z: z + 3.0, w: 5.2, d: 5.2, h: 19, f: 8 },
      { x: x - 5.0, z: z + 4.4, w: 4.8, d: 4.8, h: 15, f: 7 },
    ];
    for (const t of towers) {
      const yTop = 5.0 + (t.h - 5.0) * wp;
      glassTower(t.x - t.w / 2, t.z - t.d / 2, t.w, t.d, 5.0, yTop, th, 1, t.f);
      // roof cap
      if (roofP > 0.2) {
        drawBox(t.x - t.w / 2 - 0.2, t.z - t.d / 2 - 0.2, t.w + 0.4, t.d + 0.4, yTop, yTop + 0.7 * roofP, matte(th.roof), { alpha: roofP });
      }
      if (t.h === 31 && roofP > 0.2) {
        // thin red reveal along the front edge only (not a full band)
        const edgeA = proj(t.x - t.w / 2, t.z + t.d / 2 + 0.05, yTop - 2.3);
        const edgeB = proj(t.x + t.w / 2, t.z + t.d / 2 + 0.05, yTop - 2.3);
        ctx.save();
        ctx.globalAlpha *= roofP * 0.9;
        ctx.strokeStyle = th.accent;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(edgeA.x, edgeA.y); ctx.lineTo(edgeB.x, edgeB.y); ctx.stroke();
        ctx.restore();
      }
    }
    if (wp > 0.5) {
      sign45(x - 4.5, z + 2.55, 18.5, 4.8, 1.55, {
        alpha: smooth(0.5, 0.72, wp),
        fill: '#3C5260',
        stroke: 'rgba(28,42,50,.55)',
        side: 'rgba(20,30,36,.3)',
        posts: false,
        draw: (sx, sy, pw, ph) => {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#F3EBDD';
          ctx.font = '700 ' + Math.max(7, ph * 0.4) + 'px "Songti SC","STSong",serif';
          ctx.fillText('知新楼', sx + pw / 2, sy + ph * 0.42);
          ctx.fillStyle = 'rgba(243,235,221,.62)';
          ctx.font = '500 ' + Math.max(4, ph * 0.14) + 'px "PingFang SC",sans-serif';
          ctx.fillText('ZHIXIN TOWER', sx + pw / 2, sy + ph * 0.72);
        },
      });
    }
    // clock tower
    if (roofP > 0) {
      const cw = 4.2, chh = 7.0;
      const cx = x - 4.5, cz = z - 1.0;
      const cb = 5.0 + 26.8 * wp;
      glassTower(cx - cw / 2, cz - cw / 2, cw, cw, cb, cb + chh * roofP, th, 1, 3);
      // clock faces
      const cc = proj(cx, cz + cw / 2 + 0.02, cb + 4.2 * roofP);
      ctx.save(); ctx.globalAlpha *= roofP;
      ctx.fillStyle = '#F3EBD9'; ctx.strokeStyle = shade(th.trim, -0.3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cc.x, cc.y, 1.5 * IX * view.scale, 1.5 * view.scale, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#3F4A50'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(cc.x, cc.y); ctx.lineTo(cc.x, cc.y - 1.0 * view.scale); ctx.moveTo(cc.x, cc.y); ctx.lineTo(cc.x + 0.7 * view.scale, cc.y + 0.25 * view.scale); ctx.stroke();
      ctx.restore();
      // copper cap + spire
      drawPyramid(cx, cz, cw + 0.6, cw + 0.6, cb + chh * roofP, cb + (chh + 2.6) * roofP, '#6C7F73', { alpha: roofP });
      const ap = proj(cx, cz, cb + (chh + 2.6) * roofP);
      ctx.save(); ctx.globalAlpha *= roofP;
      ctx.strokeStyle = '#C8B27A'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(ap.x, ap.y - 20); ctx.stroke();
      ctx.restore();
    }
    // red accent band on podium
    if (winP > 0.4) {
      wallQuadZ(z + 8.02, x - 5.0, x + 2.0, 4.35, 4.6, th.accent, null, winP);
    }
    sign45(x + 1.2, z + 8.4, 4.7, 5.6, 1.5, {
      alpha: winP,
      fill: '#F3EBDD',
      stroke: shade(th.trim, -0.1),
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.font = '700 ' + Math.max(7, ph * 0.36) + 'px "Songti SC","PingFang SC",serif';
        ctx.fillText('知新楼', sx + pw / 2, sy + ph * 0.42);
        ctx.fillStyle = th.accent;
        ctx.font = '500 ' + Math.max(4, ph * 0.15) + 'px "PingFang SC",sans-serif';
        ctx.fillText('ZHIXIN TOWER', sx + pw / 2, sy + ph * 0.72);
      },
    });
  }

  function alumniGate(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wp = easeOut(smooth(0.03, 0.45, lp));
    const roofP = smooth(0.5, 0.85, lp);
    const winP = smooth(0.42, 0.7, lp);
    // stone platform
    drawBox(x - 11, z - 2.6, 22, 5.2, 0, 0.6, matte(th.stone), { alpha: smooth(0, 0.2, lp) });
    // columns
    const cols = [-9.4, -3.2, 3.2, 9.4];
    for (const cx of cols) {
      drawBox(x + cx - 0.65, z - 0.65, 1.3, 1.3, 0.6, 0.6 + 7.2 * wp, matte(th.stone, 0.1, 0.0, -0.14));
      drawBox(x + cx - 0.95, z - 0.95, 1.9, 1.9, 0.6, 1.15, matte(th.stone, 0.14, 0.0, -0.1));
    }
    // beams
    const beamY = 0.6 + 6.9 * wp;
    drawBox(x - 10.2, z - 0.9, 20.4, 1.8, beamY, beamY + 0.85 * roofP, matte(th.trim, 0.08, -0.02, -0.18), { alpha: roofP });
    drawBox(x - 7.6, z - 0.75, 15.2, 1.5, beamY + 1.0 * roofP, beamY + 1.55 * roofP, matte('#6E1C1A', 0.06), { alpha: roofP });
    // side lintels
    for (const cx of [-6.3, 6.3]) {
      drawBox(x + cx - 3.0, z - 0.8, 6.0, 1.6, 0.6 + 5.4 * wp, 0.6 + 6.2 * wp, matte(th.trim, 0.06), { alpha: wp });
    }
    // roofs
    if (roofP > 0) {
      chineseRoof(x, z, 10.0, 5.4, 0.6 + 8.05 * wp, th.roof, { height: 2.0, under: '#7E241F', alpha: roofP });
      chineseRoof(x - 6.6, z + 0.1, 6.6, 4.6, 0.6 + 6.8 * wp, th.roof2, { height: 1.3, under: '#7E241F', alpha: roofP });
      chineseRoof(x + 6.6, z + 0.1, 6.6, 4.6, 0.6 + 6.8 * wp, th.roof2, { height: 1.3, under: '#7E241F', alpha: roofP });
    }
    // plaque
    sign45(x, z + 2.0, beamY + 0.1, 5.2, 1.35, {
      alpha: winP,
      fill: '#6E1C1A',
      stroke: '#C6A25E',
      inner: 'rgba(198,162,94,.7)',
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#E9CF95';
        ctx.font = '700 ' + Math.max(7, ph * 0.42) + 'px "Songti SC","STSong",serif';
        ctx.fillText('山东大学', sx + pw / 2, sy + ph * 0.52);
      },
    });
    // lanterns
    if (winP > 0.2) {
      ctx.save(); ctx.globalAlpha *= winP;
      for (const lx of [x - 3.1, x + 3.1]) {
        const p = proj(lx, z + 1.9, beamY - 0.35);
        ctx.strokeStyle = 'rgba(90,70,45,.5)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y - 2); ctx.stroke();
        ctx.fillStyle = '#A72B27';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 3.2, 4.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#D6B56A';
        ctx.fillRect(p.x - 2, p.y - 4, 4, 1.5);
        ctx.fillRect(p.x - 1.5, p.y + 6, 3, 1.2);
      }
      ctx.restore();
    }
    // stone lions
    if (winP > 0.3) {
      for (const sx of [x - 4.7, x + 4.7]) {
        drawBox(sx - 0.45, z + 3.2, 0.9, 1.1, 0.6, 1.55, matte(th.stone, 0.06), { alpha: winP, lw: 0.4 });
        drawBox(sx - 0.3, z + 3.35, 0.6, 0.5, 1.55, 2.1, matte(th.stone, 0.1), { alpha: winP, lw: 0.4 });
      }
    }
  }

  function mountain(x, z, r, h, color, alpha, seed) {
    if (alpha <= 0.01) return;
    const b = proj(x, z, 0);
    const rp = r * view.scale * 0.78;
    const hp = h * view.scale * 0.6;
    ctx.save(); ctx.globalAlpha *= alpha;
    // base haze
    const grad = ctx.createLinearGradient(b.x, b.y - hp, b.x, b.y + 12);
    grad.addColorStop(0, shade(color, 0.1));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, shade(color, -0.06));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(b.x - rp, b.y + 6);
    ctx.lineTo(b.x - rp * 0.62, b.y - hp * 0.42);
    ctx.lineTo(b.x - rp * 0.36, b.y - hp * 0.28);
    ctx.lineTo(b.x - rp * 0.12, b.y - hp * 0.78);
    ctx.lineTo(b.x + rp * 0.08, b.y - hp * 0.56);
    ctx.lineTo(b.x + rp * 0.3, b.y - hp * 0.9);
    ctx.lineTo(b.x + rp * 0.48, b.y - hp * 0.5);
    ctx.lineTo(b.x + rp * 0.68, b.y - hp * 0.3);
    ctx.lineTo(b.x + rp, b.y + 6);
    ctx.closePath();
    ctx.fill();
    // shaded right face
    ctx.globalAlpha *= 0.38;
    ctx.fillStyle = shade(color, -0.14);
    ctx.beginPath();
    ctx.moveTo(b.x + rp * 0.3, b.y - hp * 0.9);
    ctx.lineTo(b.x + rp, b.y + 6);
    ctx.lineTo(b.x + rp * 0.3, b.y + 6);
    ctx.closePath(); ctx.fill();
    // contour strokes
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = shade(color, -0.18); ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) {
      const yy = b.y - hp * (0.2 + i * 0.16);
      ctx.beginPath();
      ctx.moveTo(b.x - rp * (0.8 - i * 0.12), yy);
      ctx.quadraticCurveTo(b.x, yy - 8, b.x + rp * (0.7 - i * 0.08), yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function hall(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wp = easeOut(smooth(0.03, 0.45, lp));
    const winP = smooth(0.4, 0.64, lp);
    const roofP = smooth(0.56, 0.88, lp);
    const H = 19, w = 23, d = 10;
    drawBox(x - w / 2 - 0.8, z - d / 2 - 0.8, w + 1.6, d + 1.6, 0, 0.7, matte(th.stone), { alpha: smooth(0, 0.2, lp) });
    drawBox(x - w / 2, z - d / 2, w, d, 0.7, 0.7 + H * wp, matte(th.wall, 0.08, -0.01, -0.12));
    // central glass stair tower
    glassTower(x - 2.6, z + d / 2 - 1.6, 5.2, 3.2, 0.7, 0.7 + (H + 3) * wp, th, 1, 8);
    // horizontal window bands
    if (winP > 0) {
      for (let f = 0; f < 6; f++) {
        const yy = 1.6 + f * 2.95;
        windowZ(z + d / 2 + 0.02, x - w / 2 + 1.0, x - 3.3, yy, yy + 1.55, th, winP * (f < 5 ? 1 : 0.5), 'band');
        windowZ(z + d / 2 + 0.02, x + 2.5, x + w / 2 - 1.0, yy, yy + 1.55, th, winP * (f < 5 ? 1 : 0.5), 'band');
      }
      // side windows
      for (let f = 1; f < 5; f++) {
        const yy = 2.2 + f * 3.0;
        windowX(x + w / 2 + 0.02, z - d / 2 + 1.2, z + d / 2 - 1.2, yy, yy + 1.5, th, winP * 0.7, 'band');
      }
    }
    // roof
    if (roofP > 0) {
      drawBox(x - w / 2 - 0.7, z - d / 2 - 0.7, w + 1.4, d + 1.4, 0.7 + H * wp, 0.7 + (H + 0.8) * wp, matte(th.roof, 0.08), { alpha: roofP });
      drawBox(x - w / 2, z - d / 2, w, 0.5, 0.7 + (H + 0.8) * wp, 0.7 + (H + 1.2) * wp, matte(th.roof2), { alpha: roofP });
      // roof equipment
      for (const rx of [-5, 2.5, 7]) {
        drawBox(x + rx, z - 1.2, 2.4, 2.0, 0.7 + (H + 0.8) * wp, 0.7 + (H + 1.7) * wp, matte('#D8D0C0'), { alpha: roofP, lw: 0.4 });
      }
    }
    // AC units
    if (winP > 0.7) {
      for (let i = 0; i < 4; i++) {
        drawBox(x - 9 + i * 5.2, z + d / 2 + 0.15, 1.1, 0.5, 7.0, 7.8, matte('#E6E0D2'), { alpha: winP, lw: 0.3 });
      }
    }
    sign45(x - 6.0, z + d / 2 + 0.6, 4.6, 5.8, 1.5, {
      alpha: winP,
      fill: '#F2EADB',
      stroke: shade(th.trim, -0.1),
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.font = '700 ' + Math.max(7, ph * 0.34) + 'px "Songti SC","PingFang SC",serif';
        ctx.fillText('教学主楼', sx + pw / 2, sy + ph * 0.42);
        ctx.fillStyle = th.accent;
        ctx.font = '500 ' + Math.max(4, ph * 0.14) + 'px "PingFang SC",sans-serif';
        ctx.fillText('QIANFOSHAN CAMPUS', sx + pw / 2, sy + ph * 0.72);
      },
    });
  }

  function triLibrary(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wp = easeOut(smooth(0.03, 0.44, lp));
    const winP = smooth(0.4, 0.64, lp);
    const roofP = smooth(0.55, 0.88, lp);
    const H = 15;
    // terrace
    drawBox(x - 13, z - 9, 26, 22, 0, 0.6, matte(th.stone), { alpha: smooth(0, 0.2, lp) });
    const pts = [[x - 11, z - 7], [x + 11, z - 7], [x, z + 9]];
    drawPrism(pts, 0.6, 0.6 + H * wp, th.wall, { alpha: 1, top: shade(th.wall, 0.12) });
    // floor bands
    if (winP > 0) {
      ctx.save(); ctx.globalAlpha *= winP * 0.7;
      for (let i = 1; i < 5; i++) {
        const yy = 0.6 + (H * wp * i) / 5;
        for (let e = 0; e < 3; e++) {
          const a = pts[e], b = pts[(e + 1) % 3];
          const p1 = proj(a[0], a[1], yy), p2 = proj(b[0], b[1], yy);
          ctx.strokeStyle = shade(th.trim, 0.04); ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
      }
      ctx.restore();
      // glass curtain on front face
      const a = pts[2], b = pts[0], c = pts[1];
      ctx.save(); ctx.globalAlpha *= winP * 0.55;
      poly([proj(a[0], a[1], 0.8), proj(b[0], b[1], 0.8), proj(b[0], b[1], 0.8 + H * wp * 0.5), proj(a[0], a[1], 0.8 + H * wp * 0.5)], 'rgba(180,208,208,.5)', null, 0);
      ctx.restore();
    }
    // central glass atrium
    glassTower(x - 2.2, z + 1.5, 4.4, 3.4, 0.6, 0.6 + (H + 3.2) * wp, th, winP, 6);
    // steps
    if (roofP > 0.1) {
      const st = smooth(0.15, 0.6, roofP);
      for (let i = 0; i < 5; i++) {
        drawBox(x - 7 + i * 0.5, z + 9 + i * 0.85, 14 - i * 1.0, 0.95, 0.6 - i * 0.12, 0.75 - i * 0.12, matte(th.stone, 0.1), { alpha: st, lw: 0.4 });
      }
    }
    // roof
    if (roofP > 0) {
      drawPrism(pts, 0.6 + H * wp, 0.6 + (H + 0.7) * wp, th.roof, { alpha: roofP, top: shade(th.roof, 0.12) });
      // skylight
      drawPrism([[x - 4, z - 2], [x + 4, z - 2], [x, z + 4]], 0.6 + (H + 0.7) * wp, 0.6 + (H + 2.2) * wp, '#B7CFD0', { alpha: roofP * 0.8 });
    }
    sign45(x, z + 10.4, 6.2, 6.2, 1.5, {
      alpha: winP,
      fill: '#F2EADB',
      stroke: shade(th.trim, -0.1),
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.font = '700 ' + Math.max(7, ph * 0.34) + 'px "Songti SC","PingFang SC",serif';
        ctx.fillText('图书馆', sx + pw / 2, sy + ph * 0.42);
        ctx.fillStyle = th.accent;
        ctx.font = '500 ' + Math.max(4, ph * 0.14) + 'px "PingFang SC",sans-serif';
        ctx.fillText('XINGLONGSHAN LIBRARY', sx + pw / 2, sy + ph * 0.72);
      },
    });
  }

  function qingdao(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wp = easeOut(smooth(0.03, 0.42, lp));
    const winP = smooth(0.38, 0.62, lp);
    const roofP = smooth(0.54, 0.88, lp);
    const H = 10;
    drawBox(x - 14, z - 7, 28, 14, 0, 0.7, matte(th.stone), { alpha: smooth(0, 0.2, lp) });
    drawBox(x - 13, z - 5.5, 26, 11, 0.7, 0.7 + H * wp, matte(th.wall, 0.08, -0.01, -0.12));
    // glass front
    if (winP > 0) {
      windowZ(z + 5.52, x - 12, x - 3.0, 1.0, 0.7 + H * wp - 0.6, th, winP, 'grid');
      windowZ(z + 5.52, x + 3.0, x + 12, 1.0, 0.7 + H * wp - 0.6, th, winP, 'grid');
      // central atrium
      glassTower(x - 3.0, z + 2.6, 6.0, 3.0, 0.7, 0.7 + (H + 4.0) * wp, th, 1, 6);
    }
    // sunshade fins
    if (winP > 0.4) {
      ctx.save(); ctx.globalAlpha *= winP * 0.7;
      for (let i = 0; i < 7; i++) {
        const yy = 1.4 + i * 1.25;
        wallLineZ(z + 5.56, x - 12.4, x - 3.2, yy, shade(th.roof, -0.08), 1.8, 1);
        wallLineZ(z + 5.56, x + 3.2, x + 12.4, yy, shade(th.roof, -0.08), 1.8, 1);
      }
      ctx.restore();
    }
    // big white roof sail
    if (roofP > 0) {
      const yb = 0.7 + (H + 0.6) * wp;
      const p1 = proj(x - 15, z - 6.2, yb), p2 = proj(x + 15, z - 6.2, yb + 0.5);
      const p3 = proj(x + 14, z + 6.8, yb + 1.6), p4 = proj(x - 14, z + 6.8, yb + 1.1);
      const mid = proj(x, z + 7.2, yb + 2.6);
      ctx.save(); ctx.globalAlpha *= roofP;
      const m = matte(th.roof, 0.1, 0.01, -0.08);
      poly([p1, p2, p3, mid, p4], th.roof, shade(th.roof, -0.3), 1);
      // curve fascia
      ctx.strokeStyle = shade(th.roof, -0.2); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(p4.x, p4.y); ctx.quadraticCurveTo(mid.x, mid.y + 4, p3.x, p3.y); ctx.stroke();
      // thin columns
      ctx.strokeStyle = 'rgba(80,96,104,.35)'; ctx.lineWidth = 1;
      for (const cx of [x - 12, x + 12]) {
        const b = proj(cx, z + 5.0, 0.7), tp = proj(cx, z + 5.0, yb + 0.9);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
      }
      ctx.restore();
    }
    sign45(x - 9.6, z + 6.2, 6.0, 5.6, 1.5, {
      alpha: winP,
      fill: '#F5EDE0',
      stroke: shade(th.trim, -0.1),
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.font = '700 ' + Math.max(7, ph * 0.32) + 'px "Songti SC","PingFang SC",serif';
        ctx.fillText('青岛校区图书馆', sx + pw / 2, sy + ph * 0.42);
        ctx.fillStyle = th.accent;
        ctx.font = '500 ' + Math.max(4, ph * 0.13) + 'px "PingFang SC",sans-serif';
        ctx.fillText('QINGDAO CAMPUS', sx + pw / 2, sy + ph * 0.72);
      },
    });
  }

  function weihai(ch) {
    const th = ch.theme;
    const x = ch.lx, z = ch.lz;
    const lp = ch.lp;
    if (lp <= 0.001) return;
    const wp = easeOut(smooth(0.03, 0.42, lp));
    const winP = smooth(0.38, 0.62, lp);
    const roofP = smooth(0.54, 0.88, lp);
    const H = 11;
    drawBox(x - 13, z - 7, 26, 14, 0, 0.6, matte(th.stone), { alpha: smooth(0, 0.2, lp) });
    // octagonal-ish white drum
    const pts = [];
    const rx = 11, rz = 6.2;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      pts.push([x + Math.cos(a) * rx, z + Math.sin(a) * rz]);
    }
    drawPrism(pts, 0.6, 0.6 + H * wp, th.wall, { alpha: 1, top: shade(th.wall, 0.12) });
    // glass bands
    if (winP > 0) {
      ctx.save(); ctx.globalAlpha *= winP * 0.65;
      for (let i = 1; i < 5; i++) {
        const yy = 0.6 + (H * wp * i) / 5;
        for (let e = 0; e < pts.length; e++) {
          const a = pts[e], b = pts[(e + 1) % pts.length];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const nx = dz, nz = -dx;
          if (nx + nz <= 0.001) continue;
          const p1 = proj(a[0], a[1], yy), p2 = proj(b[0], b[1], yy);
          ctx.strokeStyle = 'rgba(70,96,104,.35)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
      }
      ctx.restore();
      // big glass front panels
      poly([proj(x - 9, z + 5.0, 0.9), proj(x - 2.5, z + 6.1, 0.9), proj(x - 2.5, z + 6.1, 0.6 + H * wp * 0.8), proj(x - 9, z + 5.0, 0.6 + H * wp * 0.8)], 'rgba(175,205,209,.35)', 'rgba(63,98,115,.3)', 0.8, winP);
      poly([proj(x + 2.5, z + 6.1, 0.9), proj(x + 9, z + 5.0, 0.9), proj(x + 9, z + 5.0, 0.6 + H * wp * 0.8), proj(x + 2.5, z + 6.1, 0.6 + H * wp * 0.8)], 'rgba(175,205,209,.35)', 'rgba(63,98,115,.3)', 0.8, winP);
    }
    // roof: white shell
    if (roofP > 0) {
      const yb = 0.6 + (H + 0.4) * wp;
      drawPrism(pts.map((p) => [x + (p[0] - x) * 1.06, z + (p[1] - z) * 1.06]), yb, yb + 0.65 * roofP, th.roof, { alpha: roofP, top: shade(th.roof, 0.14) });
      // wave canopy
      const a = proj(x - 12, z - 4, yb + 0.6);
      const b = proj(x + 12, z - 4, yb + 1.0);
      const c = proj(x + 10, z + 6.8, yb + 2.1);
      const d = proj(x - 10, z + 6.8, yb + 1.7);
      ctx.save(); ctx.globalAlpha *= roofP;
      poly([a, b, c, d], shade(th.roof, 0.06), shade(th.roof, -0.22), 0.9);
      ctx.strokeStyle = shade(th.roof, -0.12); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo((d.x + c.x) / 2, d.y + 8, c.x, c.y); ctx.stroke();
      ctx.restore();
    }
    sign45(x, z + 8.0, 6.4, 5.4, 1.5, {
      alpha: winP,
      fill: '#F6EEE0',
      stroke: shade(th.trim, -0.1),
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.font = '700 ' + Math.max(7, ph * 0.32) + 'px "Songti SC","PingFang SC",serif';
        ctx.fillText('威海校区图书馆', sx + pw / 2, sy + ph * 0.42);
        ctx.fillStyle = th.accent;
        ctx.font = '500 ' + Math.max(4, ph * 0.13) + 'px "PingFang SC",sans-serif';
        ctx.fillText('WEIHAI CAMPUS', sx + pw / 2, sy + ph * 0.72);
      },
    });
  }

  function drawSea(cx, cz, r, alpha, now) {
    if (alpha <= 0.01) return;
    const c = proj(cx, cz, -0.02);
    const rx = r * IX * SQRT2 * view.scale;
    const ry = r * 0.42 * IY * SQRT2 * view.scale;
    ctx.save();
    ctx.globalAlpha *= alpha;
    // sand rim
    ctx.fillStyle = 'rgba(230,216,188,.55)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y + ry * 0.35, rx * 1.05, ry * 1.2, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(c.x, c.y - ry, c.x, c.y + ry);
    g.addColorStop(0, '#CFE2E0'); g.addColorStop(1, '#B7D2D4');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 9; i++) {
      const yy = c.y - ry + (i / 9) * ry * 2 + Math.sin(now * 0.4 + i) * 2;
      ctx.lineWidth = i % 3 === 0 ? 1.2 : 0.8;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const xx = c.x - rx + (k / 12) * rx * 2;
        const y2 = yy + Math.sin(k * 0.8 + now * 0.6 + i) * 1.6;
        k ? ctx.lineTo(xx, y2) : ctx.moveTo(xx, y2);
      }
      ctx.stroke();
    }
    // sailboat
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= alpha * 0.9;
    const b = proj(cx + 8, cz - 6, 0);
    ctx.fillStyle = 'rgba(90,80,62,.65)';
    ctx.beginPath(); ctx.moveTo(b.x - 7, b.y); ctx.lineTo(b.x + 7, b.y); ctx.lineTo(b.x + 4, b.y + 2.4); ctx.lineTo(b.x - 4, b.y + 2.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(250,247,238,.9)';
    ctx.beginPath(); ctx.moveTo(b.x, b.y - 1); ctx.lineTo(b.x, b.y - 14); ctx.lineTo(b.x + 10, b.y - 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(b.x - 1, b.y - 2); ctx.lineTo(b.x - 1, b.y - 12); ctx.lineTo(b.x - 9, b.y - 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawLandmark(ch) {
    switch (ch.landmark) {
      case 'church': church(ch); break;
      case 'zhixin': zhixin(ch); break;
      case 'gate': alumniGate(ch); break;
      case 'hall': hall(ch); break;
      case 'tri': triLibrary(ch); break;
      case 'qingdao': qingdao(ch); break;
      case 'weihai': weihai(ch); break;
    }
  }

  /* ---------------- scene assembly ---------------- */
  function drawGate(now) {
    const d = 7.0;
    const pass = 1 - smooth(17, 26, cam.d);
    if (pass <= 0.001) return;
    const p = smooth(-6, 2, cam.d);
    if (p <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= pass;
    const q = route.at(d);
    // only meaningful on the straight first segment; use axis-aligned gate
    const gx = q.x, gz = q.z;
    const wp = easeOut(smooth(0.02, 0.5, p));
    const beamP = smooth(0.26, 0.62, p);
    const roofP = smooth(0.44, 0.82, p);
    const signP = smooth(0.64, 1, p);
    const stone = matte('#DDD0BC', 0.08, -0.01, -0.12);
    const stoneDark = matte('#CBBBA3', 0.1, -0.02, -0.16);
    const red = matte('#8E2A24', 0.08, -0.01, -0.16);
    const tile = matte('#4C5C55', 0.07, -0.02, -0.15);
    const tileDark = matte('#3F4C47', 0.06, -0.02, -0.12);
    // four stone columns: three bays
    for (const zz of [gz - 7.2, gz - 2.8, gz + 2.8, gz + 7.2]) {
      drawBox(gx - 0.9, zz - 0.9, 1.8, 1.8, 0, 0.55, stoneDark, { alpha: 1 });
      drawBox(gx - 0.55, zz - 0.55, 1.1, 1.1, 0.55, 0.55 + 5.7 * wp, stone, { alpha: 1 });
    }
    // main red lintel
    drawBox(gx - 0.48, gz - 7.6, 0.96, 15.2, 0.55 + 5.05 * wp, 0.55 + 5.95 * wp, red, { alpha: beamP });
    // red collars tie the stone columns to the lintel
    if (beamP > 0.05) {
      for (const zz of [gz - 7.2, gz - 2.8, gz + 2.8, gz + 7.2]) {
        drawBox(gx - 0.62, zz - 0.62, 1.24, 1.24, 0.55 + 4.6 * wp, 0.55 + 5.25 * wp, red, { alpha: beamP });
      }
    }
    // tiled roofs: two lower side bays + one taller centre bay, pitched
    if (roofP > 0.01) {
      gableRoofZ(gx - 2.35, gz - 8.8, gx + 2.35, gz - 3.3, 5.95, 6.9, '#4C5C55', { alpha: roofP, tiles: true, tileCount: 4 });
      gableRoofZ(gx - 2.35, gz + 3.3, gx + 2.35, gz + 8.8, 5.95, 6.9, '#4C5C55', { alpha: roofP, tiles: true, tileCount: 4 });
      // red fascia along the side eaves
      drawBox(gx + 2.0, gz - 8.8, 0.35, 5.5, 5.9, 6.08, red, { alpha: roofP });
      drawBox(gx + 2.0, gz + 3.3, 0.35, 5.5, 5.9, 6.08, red, { alpha: roofP });
      gableRoofZ(gx - 2.7, gz - 4.6, gx + 2.7, gz + 4.6, 6.25, 7.65, '#4C5C55', { alpha: roofP, tiles: true, tileCount: 5 });
      // red fascia under the centre eave
      drawBox(gx + 2.35, gz - 4.7, 0.4, 9.4, 6.2, 6.42, red, { alpha: roofP });
      // upturned eave tips
      ctx.save(); ctx.globalAlpha *= roofP * 0.9;
      for (const zz of [gz - 8.8, gz + 8.8]) {
        const a = proj(gx + 2.35, zz, 6.02), b = proj(gx + 3.15, zz + (zz < gz ? -0.7 : 0.7), 6.28), c = proj(gx + 2.35, zz, 5.8);
        poly([a, b, c], shade('#4C5C55', -0.08), shade('#3F4C47', -0.1), 0.5);
      }
      ctx.restore();
    }
    // stone lions on the flanks
    if (signP > 0.25) {
      for (const zz of [gz - 8.3, gz + 8.3]) {
        drawBox(gx + 0.4, zz - 0.45, 1.1, 0.9, 0, 0.7, stoneDark, { alpha: signP });
        drawBox(gx + 0.55, zz - 0.32, 0.8, 0.55, 0.7, 1.55, stone, { alpha: signP });
      }
    }
    // plaque
    sign45(gx + 2.2, gz, 5.78, 7.0, 1.2, {
      alpha: signP,
      fill: '#8E2A24',
      stroke: 'rgba(238,214,168,.78)',
      inner: 'rgba(247,233,210,.35)',
      draw: (sx, sy, pw, ph) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#F7E9D2';
        ctx.font = '700 ' + Math.max(9, ph * 0.38) + 'px "Songti SC","STSong",serif';
        ctx.fillText('山东大学', sx + pw / 2, sy + ph * 0.44);
        ctx.fillStyle = 'rgba(247,233,210,.72)';
        ctx.font = '500 ' + Math.max(4.5, ph * 0.12) + 'px "PingFang SC",sans-serif';
        ctx.fillText('SHANDONG UNIVERSITY · 1901', sx + pw / 2, sy + ph * 0.74);
      },
    });
    // warm light under beam
    ctx.save(); ctx.globalAlpha *= signP * 0.25;
    const lp = proj(gx, gz, 3.0);
    const g = ctx.createRadialGradient(lp.x, lp.y, 1, lp.x, lp.y, 34);
    g.addColorStop(0, 'rgba(246,205,130,.35)'); g.addColorStop(1, 'rgba(246,205,130,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lp.x, lp.y, 34, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  /* ---------------- camera / scroll ---------------- */
  const scrollState = {
    t: 0,
    targetD: 0,
    camD: 0,
    camScale: baseScale,
    screenX: 0.5,
    screenY: 0.44,
    targetScreenX: 0.5,
    targetScreenY: 0.44,
    jumpUntil: 0,
    initialized: false,
    lastScroll: 0,
  };
  const cam = { d: 0 };

  function scrollMetrics() {
    const vh = window.innerHeight;
    const track = document.getElementById('track');
    const top = track.offsetTop;
    const end = top + track.offsetHeight - vh;
    const start = Math.max(1, vh * 0.55);
    return { vh, top, end, start };
  }

  function computeTarget() {
    const m = scrollMetrics();
    const y = window.scrollY;
    const t = clamp((y - m.start) / Math.max(1, m.end - m.start), 0, 1);
    scrollState.t = t;
    scrollState.targetD = Math.min(cameraMaxD, t * JOURNEY_LEN);
    scrollState.scrollY = y;
    scrollState.trackEnd = m.end;
  }

  function chapterWeights(d) {
    let wsum = 0, wx = 0, wz = 0, wy = 0, zoom = 0, tx = 0, side = 0;
    for (const ch of chapters) {
      const dist = Math.abs(d - ch.d);
      let w = 1 - dist / 20;
      if (w <= 0) continue;
      w = w * w * (3 - 2 * w);
      wsum += w;
      wx += (ch.pav.x - 0) * w;
      wz += (ch.pav.z - 0) * w;
      wy += (ch.focusY || 9.0) * w;
      zoom += (ch.zoom - 1) * w;
      tx += (ch.tx || 0) * w;
      side += (ch.cardSide === 'left' ? 1 : -1) * w;
    }
    if (wsum <= 0) return { blend: 0, x: 0, z: 0, y: 0, zoom: 0, tx: 0, side: 0 };
    return { blend: Math.min(1, wsum), x: wx / wsum, z: wz / wsum, y: wy / wsum, zoom: zoom / wsum, tx: tx / wsum, side: side / wsum };
  }

  function cameraTargetFor(d) {
    const p = route.at(d);
    const w = chapterWeights(d);
    const b = w.blend;
    const fx = lerp(p.x, w.x, b);
    const fz = lerp(p.z, w.z, b);
    const fy = lerp(6.0, w.y, b);
    const prelude = 1 - smooth(2, 22, d);
    const mob = W < 760;
    const cardShift = (Math.min(408, W * 0.38) + 44) / (2 * W);
    const sx = lerp(mob ? 0.46 : 0.5 + w.side * cardShift + w.tx * b, 0.55, prelude);
    const sy = lerp(mob ? 0.34 : 0.44, mob ? 0.66 : 0.63, prelude);
    const zoom = (1 + 0.035 * b) * (1 + w.zoom * b);
    const scale = baseScale * zoom * lerp(mob ? 0.78 : 1, mob ? 1.0 : 0.92, prelude);
    return { fx, fz, fy, sx, sy, scale, w, prelude };
  }

  function updateCamera(dt) {
    const target = cameraTargetFor(scrollState.targetD);
    const k = scrollState.initialized ? 1 - Math.exp(-dt * 7.5) : 1;
    const kd = scrollState.initialized ? 1 - Math.exp(-dt * 8.5) : 1;
    scrollState.camD = lerp(scrollState.camD, scrollState.targetD, kd);
    if (Math.abs(scrollState.camD - scrollState.targetD) < 0.004) scrollState.camD = scrollState.targetD;
    cam.d = scrollState.camD;
    const t2 = cameraTargetFor(scrollState.camD);
    // framing point follows the smoothed camera distance; scale & screen target ease
    scrollState.camScale = scrollState.initialized ? lerp(scrollState.camScale, t2.scale, k) : t2.scale;
    scrollState.screenX = scrollState.initialized ? lerp(scrollState.screenX, t2.sx, k) : t2.sx;
    scrollState.screenY = scrollState.initialized ? lerp(scrollState.screenY, t2.sy, k) : t2.sy;
    scrollState.initialized = true;
    // set view (raw projection must not include the previous view offset)
    view.scale = scrollState.camScale;
    const rawX = (t2.fx - t2.fz) * IX * view.scale;
    const rawY = (t2.fx + t2.fz) * IY * view.scale - t2.fy * view.scale;
    view.x = scrollState.screenX * W - rawX;
    view.y = scrollState.screenY * H - rawY;
    // expose target for build progress
    scrollState.focus = t2;
  }

  /* ---------------- per-frame progress ---------------- */
  function updateProgress(now) {
    for (const ch of chapters) {
      ch.p = smooth(ch.buildStart, ch.buildEnd, scrollState.camD);
      ch.lp = smooth(ch.landmarkStart, ch.landmarkEnd, scrollState.camD);
      const env = smooth(ch.d - 44, ch.d - 26, scrollState.camD);
      const fade = 1 - smooth(ch.d + 22, ch.d + 38, scrollState.camD);
      ch.envAlpha = env * fade;
      ch.presence = smooth(ch.d - 24, ch.d - 8, scrollState.camD) *
        (1 - smooth(ch.d + 9, ch.d + 21, scrollState.camD));
      ch.spurAlpha = smooth(ch.d - 15, ch.d - 6, scrollState.camD) * fade;
      ch.labelAlpha = smooth(ch.d - 16, ch.d - 5, scrollState.camD) * (1 - smooth(ch.d + 3, ch.d + 13, scrollState.camD));
    }
  }

  function chapterVisible(ch) {
    return Math.abs(scrollState.camD - ch.d) < 78;
  }

  /* ---------------- trees / props data ---------------- */
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const trees = [];
  const props = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const rnd = seeded(1000 + ci * 77);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * TAU + rnd() * 0.5;
      const rad = 16 + rnd() * 9;
      const x = ch.pav.x + Math.cos(ang) * rad;
      const z = ch.pav.z + Math.sin(ang) * rad * 0.7;
      // avoid pavilion footprint and stele
      if (Math.abs(x - ch.pav.x) < 10 && Math.abs(z - ch.pav.z) < 8) continue;
      if (Math.hypot(x - (ch.pav.x - 4.5), z - (ch.pav.z + 13.2)) < 5) continue;
      const near = route.closest(x, z).dist;
      if (near < 6) continue;
      trees.push({
        ch, x, z, s: 0.75 + rnd() * 0.7, seed: rnd() * 10,
        kind: rnd() > 0.82 ? 'pine' : 'round',
        grow: smooth(ch.d - 38, ch.d - 24, 1),
      });
    }
    // props
    const side = ch.side;
    props.push({ type: 'lamp', ch, x: ch.pav.x + side * 13.5, z: ch.pav.z + 8.5 });
    props.push({ type: 'lamp', ch, x: ch.pav.x - side * 11.0, z: ch.pav.z + 9.0 });
    props.push({ type: 'bench', ch, x: ch.pav.x + side * 10.5, z: ch.pav.z - 3.0, small: true });
  }

  function updateTreeAlpha() {
    for (const o of trees) {
      o.alpha = smooth(o.ch.d - 40, o.ch.d - 24, scrollState.camD) * (1 - smooth(o.ch.d + 24, o.ch.d + 40, scrollState.camD));
    }
    for (const o of props) {
      o.alpha = smooth(o.ch.d - 32, o.ch.d - 18, scrollState.camD) * (1 - smooth(o.ch.d + 22, o.ch.d + 36, scrollState.camD));
    }
  }

  /* ---------------- annotations ---------------- */
  function drawAnnotation(ch) {
    if (ch.labelAlpha <= 0.02) return;
    const a = proj(ch.lx, ch.lz, ch.landmark === 'church' ? 17 : ch.landmark === 'zhixin' ? 24 : 10);
    const off = ch.labelOff;
    const x = a.x + off[0] * (W < 760 ? 0.7 : 1);
    const y = a.y + off[1] * (W < 760 ? 0.7 : 1);
    ctx.save();
    ctx.globalAlpha *= ch.labelAlpha;
    ctx.strokeStyle = 'rgba(80,68,48,.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(x + (off[0] > 0 ? -6 : 6), y + 8);
    ctx.stroke();
    ctx.fillStyle = ch.theme.accent;
    ctx.beginPath(); ctx.arc(a.x, a.y, 2.1, 0, TAU); ctx.fill();
    const scale = W < 760 ? 0.82 : 1;
    const label = ch.label[0];
    const sub = W < 760 ? '' : ch.label[1];
    ctx.font = '600 ' + 9.5 * scale + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.font = '500 ' + 6.5 * scale + 'px "PingFang SC",sans-serif';
    const sw = sub ? ctx.measureText(sub).width : 0;
    const boxW = Math.max(tw, sw) + 12 * scale;
    const boxH = sub ? 30 * scale : 18 * scale;
    const bx = off[0] > 0 ? x : x - boxW;
    const by = y - boxH / 2;
    ctx.fillStyle = 'rgba(247,242,231,.82)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = 'rgba(150,136,110,.35)'; ctx.lineWidth = 0.6;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink;
    ctx.font = '600 ' + 9.5 * scale + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(label, bx + 6 * scale, by + (sub ? 11 * scale : boxH / 2));
    if (sub) {
      ctx.fillStyle = 'rgba(90,105,118,.7)';
      ctx.font = '500 ' + 6.2 * scale + 'px "PingFang SC",sans-serif';
      ctx.fillText(sub, bx + 6 * scale, by + 21.5 * scale);
    }
    ctx.restore();
  }

  /* ---------------- render ---------------- */
  function render(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);
    if (location.search.indexOf('flat=1') >= 0) return;

    if (debugEl) {
      const on = document.querySelector('.card.on');
      const rc = on ? on.getBoundingClientRect() : null;
      debugEl.textContent = 'vw ' + innerWidth + '×' + innerHeight + '  dpr ' + DPR +
        '\nscale ' + view.scale.toFixed(2) + '  camD ' + scrollState.camD.toFixed(1) +
        '\nbase ' + baseScale.toFixed(2) + '  W ' + W + '  H ' + H +
        (chapters[0] ? '\nch1 p ' + chapters[0].p.toFixed(2) + ' lp ' + chapters[0].lp.toFixed(2) + ' pres ' + chapters[0].presence.toFixed(2) : '') +
        (rc ? '\ncard ' + Math.round(rc.left) + ',' + Math.round(rc.top) + ' ' + Math.round(rc.width) + '×' + Math.round(rc.height) + ' bottom ' + Math.round(rc.bottom) : '\ncard none');
    }
    // ground
    if (!skip('nogrid')) drawGrid(now);

    // far scenery per chapter (mountains / sea)
    for (const ch of chapters) {
      if (!chapterVisible(ch)) continue;
      const near = smooth(ch.d - 18, ch.d - 6, scrollState.camD) * (1 - smooth(ch.d + 4, ch.d + 14, scrollState.camD));
      if (near <= 0.01) continue;
      if (ch.landmark === 'hall') {
        mountain(ch.lx - 26, ch.lz - 24, 30, 18, '#D6DED2', near * 0.95, 1);
        mountain(ch.lx + 2, ch.lz - 31, 40, 24, '#C8D4CA', near * 0.85, 2);
        mountain(ch.lx + 30, ch.lz - 22, 26, 15, '#DCE3D9', near * 0.8, 3);
        // tiny pagoda on the ridge
        ctx.save(); ctx.globalAlpha *= near * 0.75;
        const pg = proj(ch.lx + 2, ch.lz - 31, 0);
        ctx.fillStyle = '#8E4B3A';
        ctx.fillRect(pg.x - 3, pg.y - 18 * view.scale * 0.62, 6, 6);
        ctx.restore();
      } else if (ch.landmark === 'tri') {
        mountain(ch.lx - 58, ch.lz - 4, 34, 16, '#D6DED2', near * 0.42, 4);
      } else if (ch.landmark === 'qingdao') {
        drawSea(ch.lx + 42, ch.lz + 8, 42, near * 0.95, now);
        mountain(ch.lx - 48, ch.lz - 32, 24, 16, '#D9E1DA', near * 0.6, 6);
      } else if (ch.landmark === 'weihai') {
        drawSea(ch.lx + 26, ch.lz - 16, 44, near * 0.95, now);
        mountain(ch.lx - 26, ch.lz - 34, 34, 22, '#CBD7CE', near * 0.8, 7);
      } else if (ch.landmark === 'church') {
        // distant city silhouette
        ctx.save(); ctx.globalAlpha *= near * 0.28;
        ctx.fillStyle = '#D9D0BE';
        for (let i = 0; i < 8; i++) {
          const bx = ch.lx - 44 + i * 12;
          const bh = 8 + ((i * 7) % 13);
          const p = proj(bx, ch.lz - 26, 0);
          ctx.fillRect(p.x - 8, p.y - bh * view.scale * 0.55, 16, bh * view.scale * 0.55);
        }
        ctx.restore();
      }
    }

    // plazas, spurs and road
    if (!skip('noplaza')) {
      for (const ch of chapters) {
        if (!chapterVisible(ch)) continue;
        drawPlaza(ch, now);
      }
    }
    const roadD = Math.min(route.length, scrollState.t * JOURNEY_LEN + 12 + 14 * smooth(0, 0.4, scrollState.t));
    if (!skip('noroad')) drawRoad(roadD, now);

    // shadows first (all visible objects)
    if (!skip('noshadow')) {
      for (const ch of chapters) {
        if (!chapterVisible(ch) || ch.p <= 0.01) continue;
        shadowEllipse(ch.pav.x, ch.pav.z, 8.5, 0.42 * smooth(0, 0.18, ch.p));
      }
      for (const o of trees) {
        if (o.alpha > 0.05) shadowEllipse(o.x, o.z, 2.8 * o.s, o.alpha * 0.5);
      }
    }

    // render queue
    const queue = [];
    for (const ch of chapters) {
      if (!chapterVisible(ch)) continue;
      const dPav = ch.pav.x + ch.pav.z;
      if (!skip('noland') && ch.lp > 0.001) queue.push({ d: ch.lx + ch.lz, draw: () => withAlpha(ch.presence, () => drawLandmark(ch)) });
      if (!skip('nopav') && ch.p > 0.001) queue.push({ d: dPav, draw: () => withAlpha(ch.presence, () => drawPavilion(ch, now)) });
      if (!skip('nopav') && ch.p > 0.55) queue.push({ d: dPav + 7.4, draw: () => withAlpha(ch.presence, () => wcTotem(ch, smooth(0.55, 0.78, ch.p))) });
      if (!skip('nostele') && ch.p > 0.05) queue.push({ d: ch.pav.x + ch.pav.z + 13.4, draw: () => withAlpha(ch.presence, () => stele(ch, smooth(0.15, 0.5, ch.p))) });
    }
    for (const o of trees) {
      if (!skip('notrees') && o.alpha > 0.01) queue.push({ d: o.x + o.z, draw: () => drawTree(o, now, o.alpha) });
    }
    for (const o of props) {
      if (o.alpha <= 0.01) continue;
      queue.push({
        d: o.x + o.z,
        draw: () => {
          if (o.type === 'lamp') drawLamp(o.x, o.z, o.alpha);
          else if (o.type === 'bench') drawBench(o.x, o.z, o.alpha);
        },
      });
    }
    // people
    for (const ch of chapters) {
      if (!chapterVisible(ch) || ch.envAlpha < 0.2) continue;
      const side = ch.side;
      queue.push({ d: ch.pav.x + ch.pav.z + 8.2, draw: () => drawPerson(ch.pav.x + side * 5.0, ch.pav.z + 8.4, ch.index * 2.1, now, ch.envAlpha * 0.9, '#3F6273') });
      queue.push({ d: ch.pav.x + ch.pav.z - 2.5, draw: () => drawPerson(ch.pav.x - side * 7.4, ch.pav.z + 2.5, ch.index * 1.4, now, ch.envAlpha * 0.8, ch.theme.accent) });
    }
    // gate (world object near start)
    if (scrollState.camD < 30) {
      const q = route.at(7);
      queue.push({ d: q.x + q.z, draw: () => drawGate(now) });
    }
    queue.sort((a, b) => a.d - b.d);
    if (!skip('noqueue')) for (const q of queue) q.draw();

    // screen-space diagram annotations always sit above the scene
    for (const ch of chapters) {
      if (chapterVisible(ch)) drawAnnotation(ch);
    }

    // air: gulls over sea chapters
    for (const ch of chapters) {
      if (!['qingdao', 'weihai'].includes(ch.landmark)) continue;
      const a = smooth(ch.d - 34, ch.d - 18, scrollState.camD) * (1 - smooth(ch.d + 20, ch.d + 34, scrollState.camD));
      if (a <= 0.01) continue;
      ctx.save(); ctx.globalAlpha *= a * 0.55;
      ctx.strokeStyle = '#5E6F78'; ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const t = now * 0.12 + i * 2.1;
        const bx = W * 0.5 + Math.cos(t) * 70 + i * 38;
        const by = H * 0.22 + Math.sin(t * 1.3) * 8 + i * 14;
        ctx.beginPath();
        ctx.moveTo(bx - 5, by); ctx.quadraticCurveTo(bx - 2, by - 3, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 3, bx + 5, by); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ---------------- UI ---------------- */
  const el = {
    hud: document.getElementById('hud'),
    statusTitle: document.getElementById('status-title'),
    statusFill: document.getElementById('status-fill'),
    statusKicker: document.getElementById('status-kicker'),
    progressFill: document.getElementById('progress-fill'),
    progressDot: document.getElementById('progress-dot'),
    progressNum: document.getElementById('progress-num'),
    cards: Array.from(document.querySelectorAll('.card')),
    rail: Array.from(document.querySelectorAll('.rail a')),
  };
  let activeCard = -1;
  let lastStatus = '';

  function updateUI() {
    const y = window.scrollY;
    const m = scrollMetrics();
    const inOutro = y > m.end - m.vh * 0.08;
    const hudOn = y > m.vh * 0.45 && !inOutro;
    if (el.hud) el.hud.classList.toggle('on', hudOn);

    // active card
    let nextActive = -1;
    if (hudOn && !scrollState.jumping) {
      let best = 99;
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (scrollState.camD > ch.d - 5.2 && scrollState.camD < ch.d + 16.5) {
          const dist = Math.abs(scrollState.camD - ch.d);
          if (dist < best) { best = dist; nextActive = i; }
        }
      }
    }
    if (nextActive !== activeCard) {
      activeCard = nextActive;
      el.cards.forEach((c, i) => {
        c.classList.toggle('on', i === activeCard);
        c.setAttribute('aria-hidden', i === activeCard ? 'false' : 'true');
      });
    }
    // rail
    let nearest = 0, nd = 1e9;
    for (let i = 0; i < chapters.length; i++) {
      const dd = Math.abs(scrollState.camD - chapters[i].d);
      if (dd < nd) { nd = dd; nearest = i; }
    }
    el.rail.forEach((r, i) => r.classList.toggle('on', i === nearest && hudOn));

    // progress
    const pct = Math.round(scrollState.t * 100);
    if (el.progressFill) el.progressFill.style.width = pct + '%';
    if (el.progressDot) el.progressDot.style.left = pct + '%';
    if (el.progressNum) el.progressNum.textContent = String(pct).padStart(3, '0') + '%';

    // status
    const ch = chapters[nearest];
    const stage = ch.p < 0.12 ? '正在放线' : ch.p < 0.3 ? '正在砌墙' : ch.p < 0.46 ? '正在铺楼板' : ch.p < 0.62 ? '正在装窗' : ch.p < 0.78 ? '正在上屋顶' : ch.p < 0.97 ? '正在摆家具' : '已经开放';
    let title = '沿路前行 · ' + ch.campus;
    if (Math.abs(scrollState.camD - ch.d) < 19) title = pad2(ch.index + 1) + ' ' + ch.short + ' · ' + stage;
    if (scrollState.camD < 2) title = '正在放线 · 校园选址';
    if (title !== lastStatus) {
      lastStatus = title;
      if (el.statusTitle) el.statusTitle.textContent = title;
      if (el.statusKicker) el.statusKicker.textContent = ch.p < 0.97 && Math.abs(scrollState.camD - ch.d) < 22 ? 'BUILDING ON SCROLL' : 'CAMPUS IN PROGRESS';
    }
    if (el.statusFill) el.statusFill.style.width = Math.round(ch.p * 100) + '%';
  }

  /* ---------------- interaction ---------------- */
  function scrollToT(t, smoothScroll = true) {
    const m = scrollMetrics();
    const y = clamp(m.start + t * (m.end - m.start), 0, document.documentElement.scrollHeight - window.innerHeight);
    if (!smoothScroll || reduceMotion) {
      window.scrollTo(0, y);
      scrollState.jumping = false;
      return;
    }
    scrollState.jumping = true;
    scrollState.jumpUntil = performance.now() + 1200;
    const from = window.scrollY;
    const start = performance.now();
    const dur = 900;
    function step(now) {
      const u = clamp((now - start) / dur, 0, 1);
      const e = easeInOut(u);
      window.scrollTo(0, from + (y - from) * e);
      if (u < 1) requestAnimationFrame(step);
      else { scrollState.jumping = false; }
    }
    requestAnimationFrame(step);
  }

  document.querySelectorAll('[data-goto]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const i = parseInt(a.getAttribute('data-goto'), 10);
      if (!isNaN(i) && chapters[i]) scrollToT(chapters[i].d / JOURNEY_LEN);
    });
  });
  document.querySelectorAll('[data-top]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToT(0);
    });
  });

  // cancel jump if user wheels
  window.addEventListener('wheel', () => { scrollState.jumping = false; }, { passive: true });
  window.addEventListener('touchstart', () => { scrollState.jumping = false; }, { passive: true });

  /* ---------------- loop ---------------- */
  let last = performance.now();
  let raf = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    computeTarget();
    updateCamera(dt);
    updateProgress(now / 1000);
    updateTreeAlpha();
    updateUI();
    render(now / 1000);
    raf = requestAnimationFrame(loop);
  }

  function boot() {
    const params = new URLSearchParams(location.search);
    if (params.get('bare') === '1') document.body.classList.add('bare');
    resize();
    computeTarget();
    // deep link ?p=0..100 (journey percentage)
    if (params.has('p')) {
      const p = clamp(parseFloat(params.get('p')) / 100, 0, 1);
      const m = scrollMetrics();
      window.scrollTo(0, m.start + p * (m.end - m.start));
    }
    computeTarget();
    scrollState.camD = scrollState.targetD;
    scrollState.camScale = cameraTargetFor(scrollState.targetD).scale;
    scrollState.screenX = cameraTargetFor(scrollState.targetD).sx;
    scrollState.screenY = cameraTargetFor(scrollState.targetD).sy;
    scrollState.initialized = true;
    if (params.get('bottom') === '1') {
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 350);
    }
    if (params.get('debug') === '1') {
      const dbg = document.createElement('div');
      dbg.id = 'dbg';
      dbg.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;padding:6px 9px;background:#17293D;color:#F7F2E7;font:11px/1.5 monospace;pointer-events:none;white-space:pre';
      document.body.appendChild(dbg);
      debugEl = dbg;
    }
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  // expose a small debug handle for visual QA
  window.__SDU = {
    scrollTo: (p) => scrollToT(clamp(p, 0, 1), false),
    chapters,
    route,
    state: scrollState,
  };
})();
