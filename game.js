/* Minimal V0: green theme, 10x10 grid, buy/sell loop, timer, audio */
const GRID = { cols: 10, rows: 10, cell: 56 }; // ~560x560 board
const START_CASH = 30000;
const ROUND_SECONDS = 120;

let state = {
  cash: START_CASH,
  prices: [], // per-cell price
  owned: new Set(),
  timeLeft: ROUND_SECONDS,
  muted: false,
  mansionPrice: 80000, // win condition (editable)
};

function $id(id){ return document.getElementById(id); }

$id("theme").onclick = () => {
  const b = document.body;
  b.dataset.theme = (b.dataset.theme === "blue" ? "green" : "blue");
};
$id("support").onclick = () => window.open("https://itch.io", "_blank");
$id("mute").onclick = e => { state.muted = !state.muted; e.target.textContent = state.muted ? "Unmute" : "Mute"; };

$id("start").onclick = () => { if (window._scene) window._scene.startRun(); };

class PlayScene extends Phaser.Scene {
  constructor(){ super("play"); }

  preload() {
    // Load from manifest
    for (const a of window.ASSET_MANIFEST.images) this.load.image(a.key, a.path);
    for (const a of window.ASSET_MANIFEST.audio)  this.load.audio(a.key, a.path);
  }

  create() {
    window._scene = this; // for start button
    this.soundBgm = this.sound.add("bgm", { loop:true, volume:0.35 });
    this.tickSfx  = this.sound.add("tick", { volume:0.8 });
    this.clickSfx = this.sound.add("click", { volume:0.7 });

    this.board = this.add.container(0,0);
    const size = { w: GRID.cols*GRID.cell, h: GRID.rows*GRID.cell };
    const cx = this.scale.width/2, cy = this.scale.height/2;
    this.board.setPosition(cx - size.w/2, cy - size.h/2);

    // prices & sprites
    state.prices = Array.from({length:GRID.cols*GRID.rows}, () => Phaser.Math.Between(400, 2000));
    this.tiles = [];

    for (let r=0; r<GRID.rows; r++){
      for (let c=0; c<GRID.cols; c++){
        const i = r*GRID.cols + c;
        const x = c*GRID.cell + GRID.cell/2;
        const y = r*GRID.cell + GRID.cell/2;

        const tile = this.add.rectangle(x, y, GRID.cell-2, GRID.cell-2, 0x113a2b, .95)
          .setStrokeStyle(1, 0x1b7f52).setInteractive();
        const priceText = this.add.text(x- (GRID.cell/2-6), y- (GRID.cell/2-4), "$"+state.prices[i],
                         { fontSize:"12px", color:"#cfeee2" });

        tile.on("pointerdown", () => this.handleTile(i, tile, priceText));
        this.board.add([tile, priceText]);
        this.tiles.push({ tile, priceText });
      }
    }

    // logo & mansion badge (visual targets)
    this.add.image(60, 40, "logo").setScale(0.4).setScrollFactor(0);
    this.mansionIcon = this.add.image(this.scale.width-60, 40, "mansion").setScale(0.35).setScrollFactor(0);

    // timer loop
    this.timeEvent = this.time.addEvent({
      delay: 1000, loop:true,
      callback: () => {
        if (state.timeLeft <= 0) return this.endRun(false);
        state.timeLeft -= 1;
        $id("timer").textContent = mmss(state.timeLeft);
        if (state.timeLeft <= 60 && !state.muted) this.tickSfx.play();
        // market drift
        this.driftMarket();
        this.refreshHUD();
      }
    });

    // start
    this.startRun();
    this.scale.on("resize", () => this.scene.restart()); // simple responsive reset
  }

  startRun(){
    // reset state
    state.cash = START_CASH; state.owned.clear(); state.timeLeft = ROUND_SECONDS;
    $id("cash").textContent = START_CASH.toLocaleString();
    if (!state.muted && !this.soundBgm.isPlaying) this.soundBgm.play();
  }

  driftMarket(){
    // random walk with small chance of boom/bust
    const boom = Math.random() < 0.04, bust = !boom && Math.random() < 0.04;
    for (let i=0; i<state.prices.length; i++){
      let p = state.prices[i];
      const delta = Phaser.Math.Between(-120, 120);
      p = Math.max(50, p + delta);
      if (boom) p *= 1.06;
      if (bust) p *= 0.94;
      state.prices[i] = Math.round(p);
      const t = this.tiles[i];
      t.priceText.setText("$"+state.prices[i]);
      t.priceText.setColor(boom ? "#7fffd4" : bust ? "#ffb3b3" : "#cfeee2");
    }

    // mansion “in demand”: climbs slowly
    state.mansionPrice = Math.round(state.mansionPrice * 1.002);
    this.mansionIcon.setTint(state.cash >= state.mansionPrice ? 0x2ec27e : 0x777777);
    this.mansionIcon.setInteractive();
    this.mansionIcon.removeAllListeners();
    this.mansionIcon.on("pointerdown", () => {
      if (state.cash >= state.mansionPrice) this.endRun(true);
    });
  }

  handleTile(i, rect, priceText){
    const price = state.prices[i];
    const has = state.owned.has(i);

    if (!has) {
      if (state.cash < price) return;
      state.cash -= price;
      state.owned.add(i);
      rect.setFillStyle(0x1b7f52, .98);
    } else {
      state.cash += price;
      state.owned.delete(i);
      rect.setFillStyle(0x113a2b, .95);
    }
    if (!state.muted) this.clickSfx.play();
    this.refreshHUD();
  }

  refreshHUD(){ $id("cash").textContent = Math.round(state.cash).toLocaleString(); }

  endRun(won){
    this.timeEvent.paused = true;
    if (!state.muted) this.soundBgm.stop();
    const msg = won
      ? `You bought the mansion for $${state.mansionPrice.toLocaleString()} with ${mmss(state.timeLeft)} left.`
      : `Time’s up. Net cash: $${Math.round(state.cash).toLocaleString()}`;
    alert(msg);
    this.scene.restart();
  }
}

function mmss(s){ const m=Math.floor(s/60), x=(s%60).toString().padStart(2,"0"); return `${m}:${x}`; }

const config = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0e1a15",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 720 },
  scene: [PlayScene]
};
new Phaser.Game(config);
