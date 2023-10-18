const preBlankFrames = () => Math.floor(randNorm(60, 6));
const postBlankFrames = preBlankFrames;
const dotsFrames = () => 3;

const W = document.querySelector('canvas').width;
const H = document.querySelector('canvas').height;

function sum(ns: readonly number[]): number {
    let s = 0;
    for (let i in ns) {
        s += ns[i];
    }
    return s;
}

function randInt(n: number) {
    return Math.floor(Math.random() * n);
}

function randStdNorm(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randNorm(μ: number, σ: number): number {
    return μ + σ * randStdNorm();
}

class Dot {
    static readonly radius = 10;

    constructor(public readonly x: number, public readonly y: number) {}

    overlaps(othr: Dot) {
        const dx = this.x - othr.x;
        const dy = this.y - othr.y;
        return dx * dx + dy * dy <= 16 * Dot.radius * Dot.radius;
    }

    static generate(): Dot[] {
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
    onEnter() {}

    onKeyDown(event: KeyboardEvent): State {
        return this;
    }

    onTouchStart(event: TouchEvent): State {
        return this;
    }
}

class WaitingForUserReady extends State {
    onEnter() {
        app.setInstruction('Press a key or touch when ready');
    }

    onKeyDown(event: KeyboardEvent): State {
        if (event.altKey || event.ctrlKey) {
            return this;
        }
        
        return this.flash();
    }

    onTouchStart(event: TouchEvent): State {
        return this.flash();
    }

    protected flash(): State {
        return new Flashing(Dot.generate());
    }
}

class Start extends WaitingForUserReady {
}

class ShowScore extends WaitingForUserReady {
    constructor(protected readonly dots: readonly Dot[], protected readonly guess: number) {
        super();
    }

    onEnter() {
        app.tallyScore(this.dots, this.guess);
        super.onEnter();
    }
}

class WaitingForUserGuess extends State {
    constructor(protected readonly dots: readonly Dot[]) {
        super();
    }

    onEnter() {
        app.setInstruction('How many dots did you see?')
    }

    onKeyDown(event: KeyboardEvent): State {
        const n = Number(event.key);
        if (1 <= n && n <= 9) {
            return new ShowScore(this.dots, n);
        }

        return super.onKeyDown(event);
    }
}

class Flashing extends State {
    protected readonly sequence = [
        {frames: preBlankFrames(), draw: () => {} },
        {frames: dotsFrames(), draw: () => app.drawDots(this.dots) },
        {frames: postBlankFrames(), draw: () => {} },
    ];

    constructor(protected readonly dots: readonly Dot[]) {
        super();
    }

    onEnter() {
        app.setInstruction('');

        this.clearEmpties();
        app.animate(this);
    }

    tick(): State {
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

interface AnimatedState {
    tick(): State;
}

class Score {
    readonly correctOn: number[] = [];
    readonly triedOn: number[] = [];

    constructor() {
        for (let i = 1; i <= 9; ++i) {
            this.correctOn[i] = 0;
            this.triedOn[i] = 0;
        }
    }

    get correct() { return sum(this.correctOn); }
    get tried() { return sum(this.triedOn); }

    percentageOn(dots: number) {
        return this.triedOn[dots]
             ? `${Math.floor(100 * this.correctOn[dots] / this.triedOn[dots])}%`
             : '-';
    }

    percentage() {
        return this.tried
             ? `${Math.floor(100 * this.correct / this.tried)}%`
             : '-';
    }

    tally(dots: number, correct: boolean) {
        ++this.triedOn[dots];
        if (correct) {
            ++this.correctOn[dots];
        }
    }
}

const qs = (s: string) => document.querySelector(s);

const unhide = (s: string) => qs(s).className = '';

function ae(parent: string|HTMLElement, tagName: string, className: string = '', innerHTML: string = '') {
    const e = document.createElement(tagName);
    e.className = className;
    e.innerHTML = innerHTML;
    const p = typeof parent === 'string' ? qs(parent): parent;
    p.appendChild(e);
    return e;
}

class ScoreRow {
    constructor(
        readonly correctBar: HTMLElement,
        readonly textOverlay: HTMLElement) {}
}

class App {
    protected readonly canvas: HTMLCanvasElement = document.querySelector('canvas');
    readonly ctx: CanvasRenderingContext2D = this.canvas.getContext('2d');

    protected state: State = new Start();
    protected score = new Score();
    protected readonly scoreRows: ScoreRow[] = [];
    protected totalScoreRow: ScoreRow;
    protected barLength: number;

    constructor() {
        document.addEventListener('keydown', event => {
            this.setState(this.state.onKeyDown(event as KeyboardEvent));
        });
        document.addEventListener('touchstart', event => {
            this.setState(this.state.onTouchStart(event as TouchEvent));
        });

        this.buildScorePanel();
    }

    protected buildScorePanel() {
        const relSpace = 0.5;
        const rowHeight = H / (10 + 9 * relSpace);
        const itemWidth = W / 4;
        const wpx = `${itemWidth}px`;
        const hpx = `${rowHeight}px`;

        const buildScoreRow = (label: any) => {
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

    start() {
        this.state.onEnter();
    }

    protected setState(nextState: State): boolean {
        if (nextState !== this.state) {
            this.state = nextState;
            this.state.onEnter();
            return true;
        }
        return false;
    }

    animate(a: AnimatedState) {
        this.animationTick(a);
    }

    protected animationTick(a: AnimatedState) {
        if (!this.setState(a.tick())) {
            requestAnimationFrame((t: DOMHighResTimeStamp) => this.animationTick(a));
        }
    }

    drawDots(dots: readonly Dot[]) {
        this.ctx.fillStyle = '#222';
        for (const d of dots) {
            this.ctx.beginPath();
            this.ctx.arc(d.x, d.y, Dot.radius, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    setInstruction(html: string) {
        qs('#instruction-panel').innerHTML = html;
    }

    tallyScore(dots: readonly Dot[], guess: number) {
        this.score.tally(dots.length, dots.length === guess);
        this.showScore(dots, guess);
    }

    showScore(dots: readonly Dot[], guess: number) {
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
