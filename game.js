"use strict";

(() => {
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const scoreElement = document.querySelector("#score");
  const bestScoreElement = document.querySelector("#best-score");
  const overlay = document.querySelector("#game-overlay");
  const overlayIcon = document.querySelector("#overlay-icon");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const startButton = document.querySelector("#start-button");
  const pauseButton = document.querySelector("#pause-button");
  const pauseButtonIcon = document.querySelector("#pause-button-icon");
  const shieldButton = document.querySelector("#shield-button");
  const shieldButtonLabel = document.querySelector("#shield-button-label");
  const pauseIndicator = document.querySelector("#pause-indicator");
  const storageNote = document.querySelector("#storage-note");
  const jumpButton = document.querySelector("#jump-button");
  const duckButton = document.querySelector("#duck-button");

  const INITIAL_SPEED = 330;
  const MAX_SPEED = 870;
  const GRAVITY = 1900;
  const JUMP_VELOCITIES = [-710, -620, -540];
  const GROUND_OFFSET = 48;
  const MAX_JUMPS = 3;
  const SHIELD_DURATION = 2;
  const SHIELD_COOLDOWN = 7;
  const BEST_SCORE_KEY = "wilderness-dash-best";
  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  let width = 0;
  let height = 0;
  let groundY = 0;
  let dpr = 1;
  let state = "ready";
  let lastFrameTime = 0;
  let elapsedTime = 0;
  let distance = 0;
  let score = 0;
  let bestScore = loadBestScore();
  let speed = INITIAL_SPEED;
  let spawnDistance = 400;
  let groundScroll = 0;
  let cloudScroll = 0;
  let duckHeld = false;
  let jumpQueued = false;
  let shieldTime = 0;
  let shieldCooldown = 0;
  let previousScore = 0;
  let flashTime = 0;
  let animationId = 0;

  const player = {
    x: 72,
    y: 0,
    width: 40,
    height: 48,
    standingHeight: 48,
    duckingHeight: 27,
    velocityY: 0,
    onGround: true,
    ducking: false,
    legPhase: 0,
    jumpCount: 0
  };
  const obstacles = [];
  const clouds = [
    { x: 0.13, y: 0.19, scale: 0.8 },
    { x: 0.43, y: 0.1, scale: 0.58 },
    { x: 0.74, y: 0.22, scale: 0.72 },
    { x: 0.94, y: 0.115, scale: 0.46 }
  ];

  function loadBestScore() {
    try {
      const stored = Number(window.localStorage.getItem(BEST_SCORE_KEY));
      return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    } catch (error) {
      storageNote.textContent = "瀏覽器未允許儲存最高分";
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      window.localStorage.setItem(BEST_SCORE_KEY, String(value));
      storageNote.textContent = "你的最高分會自動儲存";
    } catch (error) {
      storageNote.textContent = "無法儲存最高分，請檢查瀏覽器設定";
    }
  }

  function formatScore(value) {
    return String(value).padStart(5, "0");
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const previousScale = height / 360;
    const altitude = player.onGround ? 0 : Math.max(0, groundY - player.height - player.y);
    width = bounds.width;
    height = bounds.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = height / 360;
    groundY = height - GROUND_OFFSET * scale;
    player.x = clamp(width * 0.075, 30 * scale, 82 * scale);
    player.width = 40 * scale;
    player.height = player.ducking && player.onGround
      ? player.duckingHeight * scale
      : player.standingHeight * scale;
    player.y = player.onGround
      ? groundY - player.height
      : groundY - player.height - altitude * (previousScale ? scale / previousScale : 1);
    draw();
  }

  function setOverlay(mode) {
    overlay.classList.remove("is-hidden");
    if (mode === "ready") {
      overlayIcon.textContent = "↗";
      overlayKicker.textContent = "荒野正在等你";
      overlayTitle.textContent = "開始奔跑吧！";
      overlayCopy.textContent = "跳躍最多連跳三次；飛鳥會俯衝，按 X 啟動防護技能。";
      startButton.innerHTML = '開始遊戲 <span aria-hidden="true">→</span>';
    } else {
      overlayIcon.textContent = "↻";
      overlayKicker.textContent = "這趟旅程結束了";
      overlayTitle.textContent = "跑得真不錯！";
      overlayCopy.textContent = `本次得分 ${formatScore(score)}${score >= bestScore && score > 0 ? "，新紀錄！" : "，再來挑戰一次？"}`;
      startButton.innerHTML = '再跑一次 <span aria-hidden="true">→</span>';
    }
  }

  function startGame() {
    elapsedTime = 0;
    distance = 0;
    score = 0;
    previousScore = 0;
    speed = INITIAL_SPEED;
    spawnDistance = random(360, 500);
    groundScroll = 0;
    obstacles.length = 0;
    player.height = player.standingHeight;
    player.y = groundY - player.height;
    player.velocityY = 0;
    player.onGround = true;
    player.ducking = false;
    player.jumpCount = 0;
    duckHeld = false;
    jumpQueued = false;
    shieldTime = 0;
    shieldCooldown = 0;
    state = "running";
    scoreElement.textContent = formatScore(score);
    overlay.classList.add("is-hidden");
    pauseIndicator.hidden = true;
    pauseButton.disabled = false;
    updateShieldButton();
    pauseButtonIcon.textContent = "Ⅱ";
    pauseButton.setAttribute("aria-label", "暫停遊戲");
    lastFrameTime = performance.now();
    if (!animationId) animationId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    state = "gameover";
    flashTime = 0.18;
    pauseButton.disabled = true;
    updateShieldButton();
    pauseIndicator.hidden = true;
    if (score > bestScore) {
      bestScore = score;
      bestScoreElement.textContent = formatScore(bestScore);
      saveBestScore(bestScore);
    }
    setOverlay("gameover");
  }

  function togglePause() {
    if (state === "running") {
      state = "paused";
      pauseIndicator.hidden = false;
      pauseButtonIcon.textContent = "▶";
      pauseButton.setAttribute("aria-label", "繼續遊戲");
      duckHeld = false;
      updateShieldButton();
      draw();
      return;
    }
    if (state === "paused") {
      state = "running";
      pauseIndicator.hidden = true;
      pauseButtonIcon.textContent = "Ⅱ";
      pauseButton.setAttribute("aria-label", "暫停遊戲");
      lastFrameTime = performance.now();
      updateShieldButton();
      if (!animationId) animationId = requestAnimationFrame(gameLoop);
    }
  }

  function queueJump() {
    if (state === "ready" || state === "gameover") {
      startGame();
      return;
    }
    if (state === "paused") {
      togglePause();
      return;
    }
    jumpQueued = true;
  }

  function activateShield() {
    if (state !== "running" || shieldTime > 0 || shieldCooldown > 0) return;
    shieldTime = SHIELD_DURATION;
    shieldCooldown = SHIELD_COOLDOWN;
    updateShieldButton();
    draw();
  }

  function updateShieldButton() {
    if (shieldTime > 0) {
      shieldButtonLabel.textContent = `防護中 ${shieldTime.toFixed(1)}s`;
    } else if (shieldCooldown > 0) {
      shieldButtonLabel.textContent = `冷卻 ${shieldCooldown.toFixed(1)}s`;
    } else {
      shieldButtonLabel.textContent = "防護";
    }
    shieldButton.disabled = state !== "running" || (shieldTime <= 0 && shieldCooldown > 0);
    shieldButton.setAttribute("aria-label", shieldTime > 0
      ? `防護啟動中，剩餘 ${shieldTime.toFixed(1)} 秒`
      : shieldCooldown > 0
        ? `防護冷卻中，剩餘 ${shieldCooldown.toFixed(1)} 秒`
        : "啟動防護技能");
  }

  function makeObstacle() {
    const birdChance = Math.min(0.62, 0.3 + elapsedTime * 0.008);
    if (elapsedTime > 4 && Math.random() < birdChance) {
      const birdHeight = 24 * (height / 360);
      const birdY = groundY - random(43, 76) * (height / 360);
      return {
        type: "bird",
        x: width + 15 * (height / 360),
        y: birdY,
        width: 43 * (height / 360),
        height: birdHeight,
        phase: random(0, Math.PI * 2),
        attacking: false,
        attackTargetY: birdY
      };
    }

    const scale = height / 360;
    const pitChance = Math.min(0.32, 0.14 + elapsedTime * 0.004);
    if (elapsedTime > 7 && Math.random() < pitChance) {
      return {
        type: "pit",
        x: width + 15 * scale,
        y: groundY - 5 * scale,
        width: random(54, 76) * scale,
        height: 23 * scale
      };
    }

    const doubleCactusChance = Math.min(0.52, 0.32 + elapsedTime * 0.004);
    const count = elapsedTime > 10 && Math.random() < doubleCactusChance ? 2 : 1;
    const cactusWidth = count === 1 ? random(19, 25) : random(37, 46);
    const cactusHeight = random(35, 54) * scale;
    return {
      type: "cactus",
      x: width + 15 * scale,
      y: groundY - cactusHeight,
      width: cactusWidth * scale,
      height: cactusHeight,
      count
    };
  }

  function rectanglesOverlap(a, b) {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }

  function getPlayerRect() {
    const scale = height / 360;
    return {
      x: player.x + 5 * scale,
      y: player.y + 3 * scale,
      width: player.width - 9 * scale,
      height: player.height - 5 * scale
    };
  }

  function update(delta) {
    elapsedTime += delta;
    shieldTime = Math.max(0, shieldTime - delta);
    shieldCooldown = Math.max(0, shieldCooldown - delta);
    updateShieldButton();
    const lateAcceleration = Math.max(0, elapsedTime - 18);
    speed = Math.min(MAX_SPEED, INITIAL_SPEED + elapsedTime * 12 + lateAcceleration * lateAcceleration * 3.5);
    distance += speed * delta;
    score = Math.floor(distance / 10);
    scoreElement.textContent = formatScore(score);

    if (score > previousScore && score > 0 && score % 100 === 0) {
      flashTime = 0.13;
    }
    previousScore = score;
    flashTime = Math.max(0, flashTime - delta);

    const scale = height / 360;
    player.ducking = duckHeld && player.onGround;
    const nextHeight = player.ducking ? player.duckingHeight * scale : player.standingHeight * scale;
    if (player.onGround) {
      player.height = nextHeight;
      player.y = groundY - player.height;
    }

    if (jumpQueued && player.jumpCount < MAX_JUMPS) {
      player.velocityY = JUMP_VELOCITIES[player.jumpCount] * scale;
      player.onGround = false;
      player.ducking = false;
      player.height = player.standingHeight * scale;
      player.y = groundY - player.height;
      player.jumpCount += 1;
    }
    jumpQueued = false;

    if (!player.onGround) {
      player.velocityY += GRAVITY * scale * delta;
      player.y += player.velocityY * delta;
      if (player.y + player.height >= groundY) {
        player.y = groundY - player.height;
        player.velocityY = 0;
        player.onGround = true;
        player.jumpCount = 0;
      }
    }

    player.legPhase += delta * (speed / 28);
    groundScroll = (groundScroll + speed * delta) % (48 * scale);
    cloudScroll = (cloudScroll + speed * delta * 0.075) % (width + 120);

    spawnDistance -= speed * delta;
    if (spawnDistance <= 0) {
      obstacles.push(makeObstacle());
      const difficulty = clamp(elapsedTime / 45, 0, 0.25);
      spawnDistance = Math.max(random(340, 550) * (1 - difficulty), speed * 0.82);
    }

    for (let index = obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = obstacles[index];
      obstacle.x -= speed * delta;
      if (obstacle.type === "bird") {
        obstacle.phase += delta * 10;
        const attackRange = Math.max(175 * scale, speed * 0.42);
        if (!obstacle.attacking && obstacle.x < player.x + player.width + attackRange) {
          obstacle.attacking = true;
          obstacle.attackTargetY = clamp(
            player.y + player.height / 2 - obstacle.height / 2,
            groundY - 112 * scale,
            groundY - obstacle.height
          );
        }
        if (obstacle.attacking) {
          const diveSpeed = 220 * scale * delta;
          obstacle.y += Math.sign(obstacle.attackTargetY - obstacle.y) *
            Math.min(Math.abs(obstacle.attackTargetY - obstacle.y), diveSpeed);
        }
      }
      const hit = obstacle.type === "pit"
        ? player.onGround && player.x + player.width - 4 * scale > obstacle.x &&
          player.x + 5 * scale < obstacle.x + obstacle.width
        : rectanglesOverlap(getPlayerRect(), obstacle);
      if (hit) {
        if (shieldTime > 0) {
          shieldTime = 0;
          obstacles.splice(index, 1);
          updateShieldButton();
        } else {
          endGame();
          return;
        }
      }
    }

    for (let index = obstacles.length - 1; index >= 0; index -= 1) {
      if (obstacles[index].x + obstacles[index].width < -10) obstacles.splice(index, 1);
    }
  }

  function drawBackground() {
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#eef2e8");
    sky.addColorStop(1, "#f7f5eb");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    const scale = height / 360;
    context.fillStyle = "rgba(255, 255, 255, 0.48)";
    for (const cloud of clouds) {
      const cloudX = ((cloud.x * width - cloudScroll * cloud.scale + width + 110) % (width + 110)) - 55;
      drawCloud(cloudX, cloud.y * height, cloud.scale * scale);
    }

    context.fillStyle = "#e7ecdf";
    context.beginPath();
    context.moveTo(0, groundY - 43 * scale);
    context.quadraticCurveTo(width * 0.2, groundY - 82 * scale, width * 0.43, groundY - 42 * scale);
    context.quadraticCurveTo(width * 0.68, groundY - 87 * scale, width, groundY - 46 * scale);
    context.lineTo(width, groundY);
    context.lineTo(0, groundY);
    context.closePath();
    context.fill();

    context.strokeStyle = "#819276";
    context.lineWidth = Math.max(1, 1.5 * scale);
    context.beginPath();
    context.moveTo(0, groundY);
    context.lineTo(width, groundY);
    context.stroke();

    context.fillStyle = "#b2bc9e";
    for (let x = -groundScroll; x < width; x += 48 * scale) {
      const dashY = groundY + 10 * scale + ((Math.round(x / (48 * scale)) % 3) * 4 * scale);
      context.fillRect(x, dashY, 8 * scale, 1.5 * scale);
      context.fillRect(x + 21 * scale, groundY + 20 * scale, 3 * scale, 1.5 * scale);
    }

    for (const obstacle of obstacles) {
      if (obstacle.type === "pit") drawPit(obstacle);
    }
  }

  function drawPit(obstacle) {
    const scale = height / 360;
    context.fillStyle = "#f7f5eb";
    context.fillRect(obstacle.x, groundY - 2 * scale, obstacle.width, GROUND_OFFSET * scale + 4 * scale);

    context.fillStyle = "#819276";
    context.fillRect(obstacle.x - 1 * scale, groundY - 2 * scale, 3 * scale, 5 * scale);
    context.fillRect(obstacle.x + obstacle.width - 2 * scale, groundY - 2 * scale, 3 * scale, 5 * scale);

    context.fillStyle = "#b38b62";
    context.beginPath();
    context.moveTo(obstacle.x + 2 * scale, groundY + 3 * scale);
    context.lineTo(obstacle.x + obstacle.width * 0.28, groundY + obstacle.height);
    context.lineTo(obstacle.x + obstacle.width * 0.72, groundY + obstacle.height);
    context.lineTo(obstacle.x + obstacle.width - 2 * scale, groundY + 3 * scale);
    context.closePath();
    context.fill();

    context.strokeStyle = "#936e4e";
    context.lineWidth = Math.max(1, scale);
    context.beginPath();
    context.moveTo(obstacle.x + obstacle.width * 0.28, groundY + obstacle.height);
    context.lineTo(obstacle.x + obstacle.width * 0.72, groundY + obstacle.height);
    context.stroke();
  }

  function drawCloud(x, y, scale) {
    context.beginPath();
    context.ellipse(x, y, 22 * scale, 6 * scale, 0, 0, Math.PI * 2);
    context.ellipse(x - 11 * scale, y - 2 * scale, 9 * scale, 6 * scale, 0, 0, Math.PI * 2);
    context.ellipse(x + 2 * scale, y - 5 * scale, 12 * scale, 9 * scale, 0, 0, Math.PI * 2);
    context.ellipse(x + 13 * scale, y - 1 * scale, 10 * scale, 6 * scale, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer() {
    const scale = height / 360;
    const x = player.x;
    const y = player.y;
    const w = player.width;
    const h = player.height;
    const color = "#526e49";
    const legSwing = player.onGround && state === "running" ? Math.sin(player.legPhase) * 3 * scale : 0;

    context.fillStyle = color;
    if (player.ducking) {
      roundedRect(x, y + 3 * scale, w, h - 4 * scale, 8 * scale);
      context.fill();
      roundedRect(x + w - 13 * scale, y, 15 * scale, 15 * scale, 5 * scale);
      context.fill();
      context.fillStyle = "#f4f3e8";
      context.fillRect(x + w - 3 * scale, y + 5 * scale, 2.5 * scale, 2.5 * scale);
      context.fillStyle = color;
      roundedRect(x + 8 * scale, y + h - 6 * scale, 9 * scale, 7 * scale, 2 * scale);
      roundedRect(x + 25 * scale, y + h - 6 * scale, 9 * scale, 7 * scale, 2 * scale);
      return;
    }

    roundedRect(x + 4 * scale, y + 13 * scale, 31 * scale, 29 * scale, 7 * scale);
    context.fill();
    roundedRect(x + 19 * scale, y + 2 * scale, 21 * scale, 22 * scale, 6 * scale);
    context.fill();
    roundedRect(x + 26 * scale, y - 3 * scale, 6 * scale, 9 * scale, 2 * scale);
    context.fill();
    context.fillStyle = "#f4f3e8";
    context.fillRect(x + 33 * scale, y + 8 * scale, 3 * scale, 3 * scale);
    context.fillStyle = color;
    roundedRect(x - 3 * scale, y + 18 * scale, 12 * scale, 7 * scale, 3 * scale);
    context.fill();
    roundedRect(x + 4 * scale, y + 37 * scale + legSwing, 9 * scale, 11 * scale, 2 * scale);
    context.fill();
    roundedRect(x + 25 * scale, y + 37 * scale - legSwing, 9 * scale, 11 * scale, 2 * scale);
    context.fill();
  }

  function drawShield() {
    if (shieldTime <= 0) return;
    const scale = height / 360;
    const pulse = 0.88 + Math.sin(elapsedTime * 12) * 0.12;
    context.save();
    context.globalAlpha = pulse;
    context.strokeStyle = "#6bb6ae";
    context.lineWidth = 2.5 * scale;
    context.shadowColor = "#8cd6c8";
    context.shadowBlur = 12 * scale;
    context.beginPath();
    context.ellipse(
      player.x + player.width / 2,
      player.y + player.height / 2,
      (player.width / 2 + 8 * scale),
      (player.height / 2 + 8 * scale),
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
    context.restore();
  }

  function drawCactus(obstacle) {
    const scale = height / 360;
    const x = obstacle.x;
    const y = obstacle.y;
    const w = obstacle.width;
    const h = obstacle.height;
    const color = "#6e8d5d";

    context.fillStyle = color;
    roundedRect(x + w * 0.34, y, w * 0.36, h, 5 * scale);
    context.fill();
    if (obstacle.count === 1) {
      roundedRect(x, groundY - 19 * scale, w * 0.28, 19 * scale, 4 * scale);
      context.fill();
      context.fillRect(x + w * 0.19, groundY - 19 * scale, 5 * scale, 9 * scale);
      roundedRect(x + w * 0.69, groundY - 25 * scale, w * 0.27, 25 * scale, 4 * scale);
      context.fill();
      context.fillRect(x + w * 0.69, groundY - 25 * scale, 5 * scale, 12 * scale);
    } else {
      roundedRect(x + w * 0.04, groundY - h * 0.62, w * 0.26, h * 0.62, 4 * scale);
      context.fill();
      roundedRect(x + w * 0.72, groundY - h * 0.72, w * 0.25, h * 0.72, 4 * scale);
      context.fill();
    }
    context.fillStyle = "rgba(239, 244, 229, 0.65)";
    context.fillRect(x + w * 0.48, y + 7 * scale, 1.6 * scale, Math.min(11 * scale, h * 0.35));
  }

  function drawBird(obstacle) {
    const scale = height / 360;
    const flap = Math.sin(obstacle.phase) * 5 * scale;
    const x = obstacle.x;
    const y = obstacle.y;
    const w = obstacle.width;
    const h = obstacle.height;
    context.fillStyle = obstacle.attacking ? "#bd654a" : "#a17b55";
    roundedRect(x + 5 * scale, y + 8 * scale, w - 12 * scale, h * 0.55, 7 * scale);
    context.fill();
    context.beginPath();
    context.moveTo(x + 20 * scale, y + 11 * scale);
    context.quadraticCurveTo(x + 15 * scale, y + flap, x + 7 * scale, y + 6 * scale);
    context.quadraticCurveTo(x + 14 * scale, y + 9 * scale, x + 19 * scale, y + 14 * scale);
    context.fill();
    context.beginPath();
    context.moveTo(x + 23 * scale, y + 12 * scale);
    context.quadraticCurveTo(x + 30 * scale, y + 2 * scale - flap, x + 35 * scale, y + 12 * scale);
    context.quadraticCurveTo(x + 29 * scale, y + 9 * scale, x + 24 * scale, y + 16 * scale);
    context.fill();
    context.fillStyle = "#f8f3e8";
    context.fillRect(x + w - 12 * scale, y + 10 * scale, 2.5 * scale, 2.5 * scale);
    context.fillStyle = "#a17b55";
    context.beginPath();
    context.moveTo(x + w - 4 * scale, y + 14 * scale);
    context.lineTo(x + w + 2 * scale, y + 17 * scale);
    context.lineTo(x + w - 4 * scale, y + 18 * scale);
    context.fill();
    if (obstacle.attacking) {
      context.fillStyle = "#bd654a";
      context.font = `700 ${12 * scale}px sans-serif`;
      context.fillText("!", x + w * 0.45, y - 4 * scale);
    }
  }

  function roundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function draw() {
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    drawBackground();
    for (const obstacle of obstacles) {
      if (obstacle.type === "cactus") drawCactus(obstacle);
      else if (obstacle.type === "bird") drawBird(obstacle);
    }
    drawPlayer();
    drawShield();

    if (flashTime > 0 && state === "running") {
      context.fillStyle = `rgba(255, 255, 255, ${flashTime * 0.45})`;
      context.fillRect(0, 0, width, height);
    }
  }

  function gameLoop(timestamp) {
    animationId = 0;
    if (state !== "running") return;
    const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
    lastFrameTime = timestamp;
    update(delta);
    draw();
    if (state === "running") animationId = requestAnimationFrame(gameLoop);
  }

  startButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", togglePause);
  shieldButton.addEventListener("click", activateShield);
  jumpButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    queueJump();
  });
  duckButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    duckHeld = true;
    if (duckButton.setPointerCapture) duckButton.setPointerCapture(event.pointerId);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    duckButton.addEventListener(eventName, () => {
      duckHeld = false;
    });
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || state !== "running") queueJump();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.code;
    if (["Space", "ArrowUp", "ArrowDown"].includes(key)) event.preventDefault();
    if (key === "KeyP" || key === "Escape") {
      togglePause();
      return;
    }
    if (key === "Space" || key === "ArrowUp" || key === "KeyW") {
      if (!event.repeat) queueJump();
      return;
    }
    if (key === "KeyX" && !event.repeat) {
      activateShield();
      return;
    }
    if (key === "ArrowDown" || key === "KeyS") duckHeld = true;
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowDown" || event.code === "KeyS") duckHeld = false;
  });
  window.addEventListener("blur", () => {
    duckHeld = false;
    if (state === "running") togglePause();
  });
  window.addEventListener("resize", resizeCanvas);

  bestScoreElement.textContent = formatScore(bestScore);
  resizeCanvas();
  setOverlay("ready");
})();
