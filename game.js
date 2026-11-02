(function () {

  // ─── Canvas ──────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('pong');
  const ctx    = canvas.getContext('2d');
  const W = 858, H = 525;
  canvas.width  = W;
  canvas.height = H;

  // ─── Audio ───────────────────────────────────────────────────────────────────
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function beep(freq, dur, type = 'square', vol = 0.15) {
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur);
  }
  const sndPaddle = () => beep(480, 0.05);
  const sndWall   = () => beep(240, 0.05);
  const sndScore  = () => beep(110, 0.4, 'sawtooth', 0.2);
  const sndSelect = () => beep(600, 0.07);
  const sndStart  = () => beep(880, 0.12);

  // ─── Constants ───────────────────────────────────────────────────────────────
  const PADDLE_W        = 14;
  const PADDLE_H        = 84;
  const PADDLE_GAP      = 42;
  const BALL_SIZE       = 14;
  const WIN_SCORE       = 11;
  const BALL_SPEED_INIT = 6.5;
  const BALL_SPEED_MAX  = 14;
  const SPEED_INC       = 0.35;

  // Bot tuning
  const BOT_SPEED          = 5.8;   // slightly beatable
  const BOT_ERROR_RANGE    = 28;    // px of random aim offset
  const BOT_REACT_INTERVAL = 18;    // frames between re-targeting

  // ─── State ───────────────────────────────────────────────────────────────────
  let state          = 'attract';
  let vsBot          = false;
  let menuSel        = 0;       // 0 = 1 PLAYER, 1 = 2 PLAYERS
  let countdownVal   = 3;
  let countdownTimer = 0;
  let scoredTimer    = 0;
  let lastTime       = 0;

  const score = { left: 0, right: 0 };

  const leftPaddle  = { x: PADDLE_GAP,               y: H/2 - PADDLE_H/2, dy: 0, speed: 7.5 };
  const rightPaddle = { x: W - PADDLE_GAP - PADDLE_W, y: H/2 - PADDLE_H/2, dy: 0, speed: 7.5 };
  const ball        = { x: W/2, y: H/2, vx: 0, vy: 0, size: BALL_SIZE };

  let botTargetY    = H / 2;
  let botReactTimer = 0;

  // ─── Input ───────────────────────────────────────────────────────────────────
  const keys    = {};
  const justDown = {};
  window.addEventListener('keydown', e => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!keys[e.key]) justDown[e.key] = true;
    keys[e.key] = true;
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  function consumeJustDown() {
    const copy = { ...justDown };
    for (const k in justDown) delete justDown[k];
    return copy;
  }

  // ─── Game Logic ──────────────────────────────────────────────────────────────
  function startGame() {
    score.left = 0; score.right = 0;
    leftPaddle.y  = H/2 - PADDLE_H/2;
    rightPaddle.y = H/2 - PADDLE_H/2;
    serveBall(Math.random() < 0.5 ? 1 : -1);
    state = 'countdown'; countdownVal = 3; countdownTimer = 0;
  }

  function serveBall(dirX) {
    ball.x = W/2; ball.y = H/2;
    const angle = (Math.random() * 70 - 35) * (Math.PI / 180);
    ball.vx = dirX * BALL_SPEED_INIT * Math.cos(angle);
    ball.vy = BALL_SPEED_INIT * Math.sin(angle);
    botTargetY    = H / 2;
    botReactTimer = BOT_REACT_INTERVAL;
  }

  function clampPaddle(p) {
    if (p.y < 0)            p.y = 0;
    if (p.y + PADDLE_H > H) p.y = H - PADDLE_H;
  }

  function updateBot() {
    botReactTimer--;
    if (botReactTimer <= 0) {
      botReactTimer = BOT_REACT_INTERVAL;
      if (ball.vx > 0) {
        // predict where ball crosses the right paddle's x
        const dist  = rightPaddle.x - ball.x;
        const t     = dist / Math.abs(ball.vx);
        let predY   = ball.y + ball.vy * t;
        // simulate wall bounces
        const span  = H * 2;
        predY = ((predY % span) + span) % span;
        if (predY > H) predY = span - predY;
        botTargetY = predY + (Math.random() * BOT_ERROR_RANGE * 2 - BOT_ERROR_RANGE);
      } else {
        botTargetY = H / 2; // drift to centre when ball going away
      }
    }

    const mid  = rightPaddle.y + PADDLE_H / 2;
    const diff = botTargetY - mid;
    if (Math.abs(diff) > 2)
      rightPaddle.y += Math.sign(diff) * Math.min(BOT_SPEED, Math.abs(diff));
    clampPaddle(rightPaddle);
  }

  function updatePaddles() {
    // Player 1 – W / S
    leftPaddle.dy = 0;
    if (keys['w'] || keys['W']) leftPaddle.dy = -leftPaddle.speed;
    if (keys['s'] || keys['S']) leftPaddle.dy =  leftPaddle.speed;
    leftPaddle.y += leftPaddle.dy;
    clampPaddle(leftPaddle);

    if (vsBot) {
      updateBot();
    } else {
      rightPaddle.dy = 0;
      if (keys['ArrowUp'])   rightPaddle.dy = -rightPaddle.speed;
      if (keys['ArrowDown']) rightPaddle.dy =  rightPaddle.speed;
      rightPaddle.y += rightPaddle.dy;
      clampPaddle(rightPaddle);
    }
  }

  function speedUp() {
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd < BALL_SPEED_MAX) {
      const f = (spd + SPEED_INC) / spd;
      ball.vx *= f; ball.vy *= f;
    }
  }

  function updateBall() {
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - ball.size/2 <= 0) {
      ball.y = ball.size/2; ball.vy = Math.abs(ball.vy); sndWall();
    }
    if (ball.y + ball.size/2 >= H) {
      ball.y = H - ball.size/2; ball.vy = -Math.abs(ball.vy); sndWall();
    }

    // Left paddle
    if (
      ball.vx < 0 &&
      ball.x - ball.size/2 <= leftPaddle.x + PADDLE_W &&
      ball.x + ball.size/2 >= leftPaddle.x &&
      ball.y + ball.size/2 >= leftPaddle.y &&
      ball.y - ball.size/2 <= leftPaddle.y + PADDLE_H
    ) {
      ball.x = leftPaddle.x + PADDLE_W + ball.size/2;
      const rel = (ball.y - (leftPaddle.y + PADDLE_H/2)) / (PADDLE_H/2);
      const a   = rel * 60 * (Math.PI / 180);
      const spd = Math.hypot(ball.vx, ball.vy);
      ball.vx =  Math.abs(spd * Math.cos(a));
      ball.vy =  spd * Math.sin(a);
      speedUp(); sndPaddle();
    }

    // Right paddle
    if (
      ball.vx > 0 &&
      ball.x + ball.size/2 >= rightPaddle.x &&
      ball.x - ball.size/2 <= rightPaddle.x + PADDLE_W &&
      ball.y + ball.size/2 >= rightPaddle.y &&
      ball.y - ball.size/2 <= rightPaddle.y + PADDLE_H
    ) {
      ball.x = rightPaddle.x - ball.size/2;
      const rel = (ball.y - (rightPaddle.y + PADDLE_H/2)) / (PADDLE_H/2);
      const a   = rel * 60 * (Math.PI / 180);
      const spd = Math.hypot(ball.vx, ball.vy);
      ball.vx = -Math.abs(spd * Math.cos(a));
      ball.vy =  spd * Math.sin(a);
      speedUp(); sndPaddle();
    }

    if (ball.x < 0) { score.right++; sndScore(); endRound(); }
    if (ball.x > W) { score.left++;  sndScore(); endRound(); }
  }

  function endRound() {
    if (score.left >= WIN_SCORE || score.right >= WIN_SCORE) {
      state = 'gameover';
    } else {
      state = 'scored'; scoredTimer = 0;
    }
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────────
  function rect(x, y, w, h, c = '#fff') {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function centerLine() {
    const dH = 18, dG = 18;
    ctx.fillStyle = '#fff';
    for (let y = dG/2; y < H; y += dH + dG)
      ctx.fillRect(W/2 - 2, Math.round(y), 4, dH);
  }

  function drawScoreDigits() {
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 80px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(score.left,  W/2 - 55, 100);
    ctx.textAlign = 'left';
    ctx.fillText(score.right, W/2 + 55, 100);
  }

  function txt(str, x, y, size = 24, color = '#fff') {
    ctx.fillStyle = color;
    ctx.font      = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(str, x, y);
  }

  function drawField() {
    ctx.clearRect(0, 0, W, H);
    centerLine();
    drawScoreDigits();
    rect(leftPaddle.x,  leftPaddle.y,  PADDLE_W, PADDLE_H);
    rect(rightPaddle.x, rightPaddle.y, PADDLE_W, PADDLE_H);
  }

  // ─── Screens ─────────────────────────────────────────────────────────────────
  function drawAttract(jd) {
    // Handle menu navigation
    if (jd['ArrowUp'] || jd['ArrowDown'] || jd['w'] || jd['W'] || jd['s'] || jd['S']) {
      menuSel = (menuSel + 1) % 2; sndSelect();
    }
    if (jd[' '] || jd['Enter']) {
      vsBot = (menuSel === 0);
      sndStart();
      startGame();
      return;
    }

    ctx.clearRect(0, 0, W, H);
    centerLine();

    // Show 00 scores on attract
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 80px "Courier New", monospace';
    ctx.textAlign = 'right'; ctx.fillText('0', W/2 - 55, 100);
    ctx.textAlign = 'left';  ctx.fillText('0', W/2 + 55, 100);

    rect(leftPaddle.x,  H/2 - PADDLE_H/2, PADDLE_W, PADDLE_H);
    rect(rightPaddle.x, H/2 - PADDLE_H/2, PADDLE_W, PADDLE_H);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 100px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PONG', W/2, H/2 - 62);

    // Mode options
    const opts = ['1 PLAYER', '2 PLAYERS'];
    const blink = Math.floor(Date.now() / 400) % 2 === 0;
    opts.forEach((label, i) => {
      const y = H/2 + 26 + i * 52;
      if (menuSel === i) {
        txt(`> ${label} <`, W/2, y, 28, blink ? '#fff' : '#aaa');
      } else {
        txt(label, W/2, y, 24, '#555');
      }
    });

    txt('W/S  or  ↑/↓  to select     SPACE / ENTER  to start', W/2, H - 28, 13, '#444');

    document.getElementById('info').textContent =
      'Use W/S or arrow keys to choose mode, then SPACE or ENTER to start';
  }

  function drawCountdown() {
    drawField();
    if (countdownVal > 0) txt(String(countdownVal), W/2, H/2 + 30, 100);
  }

  function drawPlaying() {
    drawField();
    rect(ball.x - ball.size/2, ball.y - ball.size/2, ball.size, ball.size);
  }

  function drawGameover(jd) {
    if (jd[' '] || jd['Enter']) {
      state = 'attract'; menuSel = 0; return;
    }

    drawField();
    rect(ball.x - ball.size/2, ball.y - ball.size/2, ball.size, ball.size);

    const winner = score.left >= WIN_SCORE
      ? (vsBot ? 'YOU WIN!' : 'PLAYER 1 WINS!')
      : (vsBot ? 'BOT WINS!'  : 'PLAYER 2 WINS!');

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W/2 - 295, H/2 - 58, 590, 115);

    txt(winner, W/2, H/2 + 6, 48);
    if (Math.floor(Date.now() / 600) % 2 === 0)
      txt('SPACE / ENTER  TO PLAY AGAIN', W/2, H/2 + 58, 17, '#aaa');

    document.getElementById('info').textContent =
      'Press SPACE or ENTER to return to the menu';
  }

  // ─── Main Loop ───────────────────────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 16.67, 3);
    lastTime = ts;
    const jd = consumeJustDown();

    switch (state) {
      case 'attract':
        drawAttract(jd);
        break;

      case 'countdown':
        countdownTimer += dt;
        if (countdownTimer >= 60) {
          countdownTimer = 0;
          countdownVal--;
          if (countdownVal <= 0) state = 'playing';
        }
        drawCountdown();
        if (state === 'playing') {
          document.getElementById('info').textContent = vsBot
            ? 'W / S to move   •   first to 11 wins'
            : 'W / S  |  ↑ / ↓   •   first to 11 wins';
        }
        break;

      case 'playing':
        updatePaddles();
        updateBall();
        drawPlaying();
        break;

      case 'scored':
        scoredTimer += dt;
        if (scoredTimer >= 90) {
          const lastScorer = score.left > score.right ? 1 : -1;
          serveBall(-lastScorer);
          state = 'countdown'; countdownVal = 3; countdownTimer = 0;
        }
        drawField();
        break;

      case 'gameover':
        drawGameover(jd);
        break;
    }

    requestAnimationFrame(loop);
  }

  // Boot
  requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });

})();
