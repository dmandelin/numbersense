let dotsFramesValue = 3;
const preBlankFrames = () => Math.floor(randNorm(60, 6));
const postBlankFrames = preBlankFrames;
const dotsFrames = () => dotsFramesValue;
const W = document.querySelector('canvas').width;
const H = document.querySelector('canvas').height;
function sum(ns) {
    let s = 0;
    for (let i in ns) {
        s += ns[i];
    }
    return s;
}
function randInt(n) {
    return Math.floor(Math.random() * n);
}
function randStdNorm() {
    let u = 0, v = 0;
    while (u === 0)
        u = Math.random();
    while (v === 0)
        v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function randNorm(μ, σ) {
    return μ + σ * randStdNorm();
}
class Dot {
    x;
    y;
    static radius = 10;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    overlaps(othr) {
        const dx = this.x - othr.x;
        const dy = this.y - othr.y;
        return dx * dx + dy * dy <= 16 * Dot.radius * Dot.radius;
    }
    static generate() {
        const margin = 0.2;
        const x0 = Math.floor(margin * W);
        const y0 = Math.floor(margin * H);
        const xm = W - x0;
        const ym = H - y0;
        const count = randInt(9) + 1;
        const dots = [];
        while (dots.length < count) {
            const x = x0 + randInt(xm - x0);
            const y = y0 + randInt(ym - y0);
            const dot = new Dot(x, y);
            let ok = true;
            for (const otr of dots) {
                if (dot.overlaps(otr)) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                dots.push(dot);
            }
        }
        return dots;
    }
}
class State {
    onEnter() { }
    onKeyDown(event) {
        return this;
    }
    onTouchStart(event) {
        return this;
    }
}
class WaitingForUserReady extends State {
    onEnter() {
        app.setInstruction('Press a key or touch when ready');
    }
    onKeyDown(event) {
        if (event.altKey || event.ctrlKey) {
            return this;
        }
        return this.flash();
    }
    onTouchStart(event) {
        return this.flash();
    }
    flash() {
        return new Flashing(Dot.generate());
    }
}
class Start extends WaitingForUserReady {
}
class ShowScore extends WaitingForUserReady {
    dots;
    guess;
    constructor(dots, guess) {
        super();
        this.dots = dots;
        this.guess = guess;
    }
    onEnter() {
        app.tallyScore(this.dots, this.guess);
        super.onEnter();
    }
}
class WaitingForUserGuess extends State {
    dots;
    constructor(dots) {
        super();
        this.dots = dots;
    }
    onEnter() {
        app.setInstruction('How many dots did you see?');
    }
    onKeyDown(event) {
        const n = Number(event.key);
        if (1 <= n && n <= 9) {
            return new ShowScore(this.dots, n);
        }
        return super.onKeyDown(event);
    }
}
class Flashing extends State {
    dots;
    sequence = [
        { frames: preBlankFrames(), draw: () => { } },
        { frames: dotsFrames(), draw: () => app.drawDots(this.dots) },
        { frames: postBlankFrames(), draw: () => { } },
    ];
    constructor(dots) {
        super();
        this.dots = dots;
    }
    onEnter() {
        app.setInstruction('');
        this.clearEmpties();
        app.animate(this);
    }
    tick() {
        const ctx = app.ctx;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, W, H);
        if (this.sequence.length === 0) {
            return new WaitingForUserGuess(this.dots);
        }
        this.sequence[0].draw();
        --this.sequence[0].frames;
        this.clearEmpties();
        return this;
    }
    clearEmpties() {
        while (this.sequence.length && this.sequence[0].frames === 0) {
            this.sequence.shift();
        }
    }
}
class Score {
    correctOn = [];
    triedOn = [];
    constructor() {
        for (let i = 1; i <= 9; ++i) {
            this.correctOn[i] = 0;
            this.triedOn[i] = 0;
        }
    }
    get correct() { return sum(this.correctOn); }
    get tried() { return sum(this.triedOn); }
    percentageOn(dots) {
        return this.triedOn[dots]
            ? `${Math.floor(100 * this.correctOn[dots] / this.triedOn[dots])}%`
            : '-';
    }
    percentage() {
        return this.tried
            ? `${Math.floor(100 * this.correct / this.tried)}%`
            : '-';
    }
    tally(dots, correct) {
        ++this.triedOn[dots];
        if (correct) {
            ++this.correctOn[dots];
        }
    }
}
const qs = (s) => document.querySelector(s);
const unhide = (s) => qs(s).className = '';
function ae(parent, tagName, className = '', innerHTML = '') {
    const e = document.createElement(tagName);
    e.className = className;
    e.innerHTML = innerHTML;
    const p = typeof parent === 'string' ? qs(parent) : parent;
    p.appendChild(e);
    return e;
}
class ScoreRow {
    correctBar;
    textOverlay;
    constructor(correctBar, textOverlay) {
        this.correctBar = correctBar;
        this.textOverlay = textOverlay;
    }
}
class App {
    canvas = document.querySelector('canvas');
    ctx = this.canvas.getContext('2d');
    state = new Start();
    score = new Score();
    scoreRows = [];
    totalScoreRow;
    barLength;
    constructor() {
        document.addEventListener('keydown', event => {
            this.setState(this.state.onKeyDown(event));
        });
        document.addEventListener('touchstart', event => {
            this.setState(this.state.onTouchStart(event));
        });
        this.buildScorePanel();
        this.updateTimePanel();
        qs('#shorter').addEventListener('click', () => this.bumpBlinkFrames(-1));
        qs('#longer').addEventListener('click', () => this.bumpBlinkFrames(1));
    }
    buildScorePanel() {
        const relSpace = 0.5;
        const rowHeight = H / (10 + 9 * relSpace);
        const itemWidth = W / 4;
        const wpx = `${itemWidth}px`;
        const hpx = `${rowHeight}px`;
        const buildScoreRow = (label) => {
            const row = ae('#score-panel', 'div', 'score-row');
            const num = ae(row, 'div', 'score-number', String(label));
            const textOverlay = ae(row, 'div', 'score-text');
            const barBacking = ae(row, 'div', 'score-bar-backing');
            barBacking.style.width = wpx;
            barBacking.style.height = hpx;
            const bar = ae(barBacking, 'div', 'score-bar');
            bar.style.width = '0';
            bar.style.height = hpx;
            return new ScoreRow(bar, textOverlay);
        };
        this.barLength = itemWidth;
        for (let i = 1; i <= 9; ++i) {
            this.scoreRows[i] = buildScoreRow(i);
        }
        this.totalScoreRow = buildScoreRow('*');
    }
    updateTimePanel() {
        const dt = 1000 / (60 / dotsFramesValue);
        qs('#time-data').innerHTML = `${Math.round(dt)} ms`;
    }
    bumpBlinkFrames(incr) {
        const newBlinkFrames = dotsFramesValue + incr;
        if (newBlinkFrames > 0) {
            dotsFramesValue = newBlinkFrames;
            this.updateTimePanel();
        }
    }
    start() {
        this.state.onEnter();
    }
    setState(nextState) {
        if (nextState !== this.state) {
            this.state = nextState;
            this.state.onEnter();
            return true;
        }
        return false;
    }
    animate(a) {
        this.animationTick(a);
    }
    animationTick(a) {
        if (!this.setState(a.tick())) {
            requestAnimationFrame((t) => this.animationTick(a));
        }
    }
    drawDots(dots) {
        this.ctx.fillStyle = 'black';
        for (const d of dots) {
            this.ctx.beginPath();
            this.ctx.arc(d.x, d.y, Dot.radius, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }
    setInstruction(html) {
        qs('#instruction-panel').innerHTML = html;
    }
    tallyScore(dots, guess) {
        this.score.tally(dots.length, dots.length === guess);
        this.showScore(dots, guess);
    }
    showScore(dots, guess) {
        this.drawDots(dots);
        qs('#item-data-guess').innerHTML = String(guess);
        qs('#item-data-actual').innerHTML = String(dots.length);
        unhide('#item-panel');
        for (let count in this.scoreRows) {
            const sr = this.scoreRows[count];
            sr.correctBar.style.width =
                `${this.barLength * this.score.correctOn[count] / this.score.triedOn[count]}px`;
            sr.textOverlay.innerHTML = String(this.score.percentageOn(Number(count)));
        }
        this.totalScoreRow.correctBar.style.width =
            `${this.barLength * this.score.correct / this.score.tried}px`;
        this.totalScoreRow.textOverlay.innerHTML = String(this.score.percentage());
        unhide('#score-panel');
    }
}
const app = new App();
app.start();
