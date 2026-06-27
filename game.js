/* ============================================================
   game.js — Main game controller & loop
   ============================================================ */

/* roundRect polyfill for older browsers */
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
        if (!Array.isArray(radii)) radii = [radii || 0];
        const tl = radii[0] || 0, tr = radii[1] !== undefined ? radii[1] : tl;
        const br = radii[2] !== undefined ? radii[2] : tl, bl = radii[3] !== undefined ? radii[3] : tr;
        this.moveTo(x + tl, y);
        this.lineTo(x + w - tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + tr);
        this.lineTo(x + w, y + h - br);
        this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        this.lineTo(x + bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - bl);
        this.lineTo(x, y + tl);
        this.quadraticCurveTo(x, y, x + tl, y);
        this.closePath();
        return this;
    };
}

const Game = (() => {
    /* ---- Canvas setup ---- */
    let canvas, ctx;
    let W, H, scale;

    /* ---- Game state ---- */
    const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, SHOP: 3, PAUSED: 4 };
    let state = STATE.MENU;
    let score = 0;
    let lastTime = 0;
    let cameraX = 0;
    let slowMotionTimer = 0;
    let coinBoostActive = false;
    let coinBoostTimer = 0;
    let screenShakeTimer = 0;
    let screenShakeIntensity = 0;

    /* ---- Bottle ---- */
    let bottle = null;
    const BOTTLE_W = 30;
    const BOTTLE_H = 70;

    /* ---- Platforms ---- */
    let platforms = [];
    const PLATFORM_POOL = [];
    const PLAT_MIN_W = 70;
    const PLAT_MAX_W = 140;
    const PLAT_H = 18;
    const PLAT_GAP_MIN = 60;
    const PLAT_GAP_MAX = 130;
    const PLAT_Y_BASE = 420;

    /* ---- Power-ups ---- */
    let powerUps = [];
    const POWERUP_SIZE = 24;
    const POWERUP_TYPES = ['slowmo', 'coinboost'];

    /* ---- Trail ---- */
    let trail = [];
    const TRAIL_MAX = 18;

    /* ---- Particles ---- */
    let particles = [];

    /* ---- Bottle skins catalog ---- */
    const BOTTLE_SKINS = [
        { id: 0, name: 'Classic', price: 0, bodyColor: '#3498db', capColor: '#2980b9', accent: '#85c1e9' },
        { id: 1, name: 'Red', price: 100, bodyColor: '#e74c3c', capColor: '#c0392b', accent: '#f1948a' },
        { id: 2, name: 'Neon', price: 200, bodyColor: '#2ecc71', capColor: '#27ae60', accent: '#abebc6' },
        { id: 3, name: 'Glass', price: 300, bodyColor: 'rgba(200,220,240,0.55)', capColor: '#bdc3c7', accent: 'rgba(255,255,255,0.6)' },
        { id: 4, name: 'Rocket', price: 500, bodyColor: '#e67e22', capColor: '#d35400', accent: '#f39c12' }
    ];

    /* ---- Platform types ---- */
    const PLAT_TYPES = ['normal', 'moving', 'small', 'fast_moving', 'fake'];

    /* ---- Sound synthesizer ---- */
    let audioCtx = null;
    function initAudio() {
        if (audioCtx) return;
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { }
    }
    function playTone(freq, dur, type, vol) {
        if (!audioCtx || StorageManager.isMuted()) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(); osc.stop(audioCtx.currentTime + dur);
        } catch { }
    }
    const Sound = {
        flip() { playTone(520, 0.12, 'sine', 0.18); playTone(780, 0.08, 'sine', 0.1); },
        land() { playTone(180, 0.15, 'triangle', 0.25); playTone(120, 0.1, 'square', 0.08); },
        coin() { playTone(880, 0.08, 'sine', 0.12); playTone(1100, 0.12, 'sine', 0.1); },
        gameover() { playTone(300, 0.2, 'sawtooth', 0.15); playTone(200, 0.3, 'sawtooth', 0.12); playTone(120, 0.5, 'sawtooth', 0.1); },
        powerup() { playTone(660, 0.06, 'sine', 0.12); playTone(880, 0.06, 'sine', 0.12); playTone(1100, 0.1, 'sine', 0.12); },
        buy() { playTone(440, 0.08, 'sine', 0.15); playTone(660, 0.08, 'sine', 0.15); playTone(880, 0.15, 'sine', 0.15); }
    };

    /* ============ Platform helpers ============ */
    function getPlatform() {
        return PLATFORM_POOL.length > 0 ? PLATFORM_POOL.pop() : {};
    }
    function releasePlatform(p) {
        if (PLATFORM_POOL.length < 40) PLATFORM_POOL.push(p);
    }

    function spawnPlatform(startX) {
        const p = getPlatform();
        const typeRoll = Math.random();
        let type;
        if (typeRoll < 0.45) type = 'normal';
        else if (typeRoll < 0.60) type = 'moving';
        else if (typeRoll < 0.75) type = 'small';
        else if (typeRoll < 0.88) type = 'fast_moving';
        else type = 'fake';

        const w = type === 'small' ? PLAT_MIN_W * 0.7 : PLAT_MIN_W + Math.random() * (PLAT_MAX_W - PLAT_MIN_W);
        const gap = PLAT_GAP_MIN + Math.random() * (PLAT_GAP_MAX - PLAT_GAP_MIN);
        const yVariation = (Math.random() - 0.5) * 24;

        p.x = startX + gap;
        p.y = PLAT_Y_BASE + yVariation;
        p.w = w;
        p.h = PLAT_H;
        p.type = type;
        p.originY = p.y;
        p.originX = p.x;
        p.moveTimer = Math.random() * Math.PI * 2;
        p.falling = false;
        p.fallVel = 0;
        p.opacity = 1;
        p.touched = false;

        // Maybe add power-up
        p.powerUp = null;
        if (Math.random() < 0.12 && type === 'normal') {
            p.powerUp = {
                type: POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)],
                collected: false
            };
        }

        return p;
    }

    function initPlatforms() {
        platforms = [];
        // Starting platform
        const start = getPlatform();
        start.x = 50; start.y = PLAT_Y_BASE; start.w = 120; start.h = PLAT_H;
        start.type = 'normal'; start.originY = start.y; start.originX = start.x;
        start.moveTimer = 0; start.falling = false; start.fallVel = 0;
        start.opacity = 1; start.touched = false; start.powerUp = null;
        platforms.push(start);

        let lastX = start.x + start.w;
        for (let i = 0; i < 8; i++) {
            const p = spawnPlatform(lastX);
            platforms.push(p);
            lastX = p.x + p.w;
        }
    }

    function updatePlatforms(dt) {
        for (let i = platforms.length - 1; i >= 0; i--) {
            const p = platforms[i];

            // Moving platforms — track prevY so we can move bottle with it
            if (p.type === 'moving' || p.type === 'fast_moving') {
                const prevY = p.y;
                const speed = p.type === 'fast_moving' ? 3.5 : 1.8;
                const amp = p.type === 'fast_moving' ? 45 : 30;
                p.moveTimer += dt * speed;
                p.y = p.originY + Math.sin(p.moveTimer) * amp;

                // Drag bottle if it's standing on this platform
                if (bottle && bottle.grounded) {
                    const bBottom = bottle.y + BOTTLE_H;
                    const bCenterX = bottle.x + BOTTLE_W / 2;
                    const onPlat = bCenterX >= p.x && bCenterX <= p.x + p.w
                        && Math.abs(bBottom - prevY) < 4;
                    if (onPlat) {
                        bottle.y += p.y - prevY;   // ride the platform
                    }
                }
            }

            // Fake platforms
            if (p.type === 'fake' && p.falling) {
                const prevY = p.y;
                p.fallVel += 900 * dt;
                p.y += p.fallVel * dt;
                p.opacity -= dt * 1.8;

                // If bottle is grounded on THIS falling platform, drag it down too
                if (bottle && bottle.grounded) {
                    const bBottom = bottle.y + BOTTLE_H;
                    const bCenterX = bottle.x + BOTTLE_W / 2;
                    const onPlat = bCenterX >= p.x && bCenterX <= p.x + p.w
                        && Math.abs(bBottom - prevY) < 4;
                    if (onPlat) {
                        bottle.y += p.y - prevY;  // drag bottle with platform
                        bottle.vy = p.fallVel;     // match fall velocity
                        // Unground after a short drop so physics takes over
                        if (p.fallVel > 120) {
                            bottle.grounded = false;
                            bottle.flipping = false;
                        }
                    }
                }
            }

            // Remove far-left platforms and spawn new
            if (p.x + p.w < cameraX - 100) {
                releasePlatform(platforms.splice(i, 1)[0]);
            }
        }

        // Keep platforms ahead
        const rightMost = platforms.reduce((m, p) => Math.max(m, p.x + p.w), 0);
        if (rightMost < cameraX + W * 1.5) {
            platforms.push(spawnPlatform(rightMost));
        }
    }

    /* ============ Particles ============ */
    function spawnLandingParticles(x, y) {
        const skin = BOTTLE_SKINS[StorageManager.getSelectedBottle()];
        for (let i = 0; i < 12; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 200,
                vy: -Math.random() * 180 - 40,
                life: 0.5 + Math.random() * 0.3,
                maxLife: 0.5 + Math.random() * 0.3,
                size: 2 + Math.random() * 4,
                color: skin.bodyColor
            });
        }
    }

    function spawnPowerUpParticles(x, y, color) {
        for (let i = 0; i < 8; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 150,
                vy: -Math.random() * 150,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.4 + Math.random() * 0.3,
                size: 3 + Math.random() * 3,
                color
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.vy += 400 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    /* ============ Drawing helpers ============ */
    function drawBottle(cx, cy, angle, skinId) {
        const skin = BOTTLE_SKINS[skinId] || BOTTLE_SKINS[0];
        const bw = BOTTLE_W * scale;
        const bh = BOTTLE_H * scale;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // Body
        const bodyGrad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
        bodyGrad.addColorStop(0, skin.accent);
        bodyGrad.addColorStop(1, skin.bodyColor);

        // Bottle body (rounded rect)
        const radius = bw * 0.25;
        ctx.beginPath();
        ctx.moveTo(-bw / 2 + radius, -bh / 2 + bh * 0.2);
        ctx.lineTo(bw / 2 - radius, -bh / 2 + bh * 0.2);
        ctx.quadraticCurveTo(bw / 2, -bh / 2 + bh * 0.2, bw / 2, -bh / 2 + bh * 0.2 + radius);
        ctx.lineTo(bw / 2, bh / 2 - radius);
        ctx.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - radius, bh / 2);
        ctx.lineTo(-bw / 2 + radius, bh / 2);
        ctx.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - radius);
        ctx.lineTo(-bw / 2, -bh / 2 + bh * 0.2 + radius);
        ctx.quadraticCurveTo(-bw / 2, -bh / 2 + bh * 0.2, -bw / 2 + radius, -bh / 2 + bh * 0.2);
        ctx.closePath();
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Neck
        const neckW = bw * 0.45;
        ctx.beginPath();
        ctx.moveTo(-neckW / 2, -bh / 2 + bh * 0.2);
        ctx.lineTo(-neckW / 2, -bh / 2 + bh * 0.06);
        ctx.lineTo(neckW / 2, -bh / 2 + bh * 0.06);
        ctx.lineTo(neckW / 2, -bh / 2 + bh * 0.2);
        ctx.closePath();
        ctx.fillStyle = skin.bodyColor;
        ctx.fill();
        ctx.stroke();

        // Cap
        const capW = neckW * 1.1;
        ctx.fillStyle = skin.capColor;
        ctx.beginPath();
        ctx.roundRect(-capW / 2, -bh / 2 - 2, capW, bh * 0.08 + 2, [3, 3, 0, 0]);
        ctx.fill();
        ctx.stroke();

        // Label band
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(-bw / 2 + 3, bh * 0.05, bw - 6, bh * 0.12);

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(-bw * 0.15, -bh * 0.05, bw * 0.08, bh * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rocket flame for rocket skin
        if (skinId === 4 && !bottle.grounded) {
            const flameH = bh * 0.3 + Math.random() * bh * 0.1;
            const grad = ctx.createLinearGradient(0, bh / 2, 0, bh / 2 + flameH);
            grad.addColorStop(0, '#f39c12');
            grad.addColorStop(0.5, '#e74c3c');
            grad.addColorStop(1, 'rgba(231,76,60,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-bw * 0.25, bh / 2);
            ctx.quadraticCurveTo(0, bh / 2 + flameH, bw * 0.25, bh / 2);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    function drawPlatform(p) {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        const px = (p.x - cameraX) * scale;
        const py = p.y * scale;
        const pw = p.w * scale;
        const ph = p.h * scale;
        const r = Math.min(6 * scale, ph / 2);

        // Platform colors by type
        let color1, color2, shadow;
        switch (p.type) {
            case 'moving': color1 = '#a569bd'; color2 = '#7d3c98'; shadow = '#6c3483'; break;
            case 'small': color1 = '#f0a500'; color2 = '#c87700'; shadow = '#a86200'; break;
            case 'fast_moving': color1 = '#e74c3c'; color2 = '#b03a2e'; shadow = '#922b21'; break;
            case 'fake': color1 = '#aab7b8'; color2 = '#7f8c8d'; shadow = '#626567'; break;
            default: color1 = '#2ecc71'; color2 = '#1a9950'; shadow = '#17834a';
        }

        // Shadow strip (makes it look like a 3D block)
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.moveTo(px + r, py + ph);
        ctx.lineTo(px + pw - r, py + ph);
        ctx.quadraticCurveTo(px + pw, py + ph, px + pw, py + ph - r);
        ctx.lineTo(px + pw, py + r);
        ctx.quadraticCurveTo(px + pw, py, px + pw - r, py);
        ctx.lineTo(px + r, py);
        ctx.quadraticCurveTo(px, py, px, py + r);
        ctx.lineTo(px, py + ph - r);
        ctx.quadraticCurveTo(px, py + ph, px + r, py + ph);
        ctx.closePath();
        ctx.fill();

        // Main body with gradient
        const grad = ctx.createLinearGradient(px, py, px, py + ph * 0.85);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + pw - r, py);
        ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
        ctx.lineTo(px + pw, py + ph - 4);
        ctx.lineTo(px, py + ph - 4);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();

        // Top shine
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(px + r, py + 2, pw - r * 2, Math.max(2, ph * 0.2));

        // Power-up above platform
        if (p.powerUp && !p.powerUp.collected) {
            const pupX = px + pw / 2;
            const pupY = py - POWERUP_SIZE * scale * 1.2;
            const pupS = POWERUP_SIZE * scale;
            drawPowerUp(pupX, pupY, pupS, p.powerUp.type);
        }

        ctx.restore();
    }


    function drawPowerUp(x, y, size, type) {
        ctx.save();
        const bob = Math.sin(Date.now() * 0.005) * 4 * scale;
        ctx.translate(x, y + bob);

        // Glow
        ctx.shadowColor = type === 'shield' ? '#3498db' : type === 'slowmo' ? '#9b59b6' : '#f1c40f';
        ctx.shadowBlur = 12;

        // Circle bg
        ctx.fillStyle = type === 'shield' ? '#3498db' : type === 'slowmo' ? '#9b59b6' : '#f1c40f';
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${size * 0.55}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon = type === 'shield' ? '🛡' : type === 'slowmo' ? '⏱' : '💰';
        ctx.fillText(icon, 0, 1);

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawBackground() {
        // Gradient sky
        const grad = ctx.createLinearGradient(0, 0, 0, H * scale);
        grad.addColorStop(0, '#0f0c29');
        grad.addColorStop(0.5, '#302b63');
        grad.addColorStop(1, '#24243e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Stars
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const seed = 42;
        for (let i = 0; i < 60; i++) {
            const sx = ((seed * (i + 1) * 7919) % canvas.width);
            const sy = ((seed * (i + 1) * 6271) % (canvas.height * 0.6));
            const ss = ((i * 3) % 3) + 1;
            ctx.fillRect(sx, sy, ss, ss);
        }

        // Ground line
        const gy = (PLAT_Y_BASE + 80) * scale;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, gy, canvas.width, canvas.height - gy);
    }

    function drawTrail() {
        if (trail.length < 2) return;
        const skin = BOTTLE_SKINS[StorageManager.getSelectedBottle()];
        for (let i = 0; i < trail.length; i++) {
            const t = trail[i];
            const alpha = (i / trail.length) * 0.35;
            const size = (i / trail.length) * 5 * scale;
            ctx.fillStyle = skin.bodyColor;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc((t.x - cameraX + BOTTLE_W / 2) * scale, (t.y + BOTTLE_H / 2) * scale, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc((p.x - cameraX) * scale, p.y * scale, p.size * scale, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        ctx.save();
        // Score
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${28 * scale}px 'Segoe UI', Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(score, canvas.width / 2, 50 * scale);

        // Active power-ups
        let badgeX = 10 * scale;
        const badgeY = 80 * scale;
        if (slowMotionTimer > 0) {
            ctx.fillStyle = 'rgba(155,89,182,0.6)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, 80 * scale, 24 * scale, 12 * scale);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `${12 * scale}px Arial`;
            ctx.textAlign = 'left';
            ctx.fillText('⏱ Slow ' + slowMotionTimer.toFixed(1), badgeX + 6 * scale, badgeY + 16 * scale);
            badgeX += 88 * scale;
        }
        if (coinBoostTimer > 0) {
            ctx.fillStyle = 'rgba(241,196,15,0.6)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, 80 * scale, 24 * scale, 12 * scale);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `${12 * scale}px Arial`;
            ctx.textAlign = 'left';
            ctx.fillText('💰 x2 ' + coinBoostTimer.toFixed(1), badgeX + 6 * scale, badgeY + 16 * scale);
        }
        ctx.restore();
    }

    /* ============ Game logic ============ */
    function startGame() {
        initAudio();
        score = 0;
        cameraX = 0;
        slowMotionTimer = 0;
        shieldActive = false;
        coinBoostActive = false;
        coinBoostTimer = 0;
        screenShakeTimer = 0;
        trail = [];
        particles = [];

        bottle = Physics.createBody(100, PLAT_Y_BASE - BOTTLE_H, BOTTLE_W, BOTTLE_H);
        initPlatforms();
        state = STATE.PLAYING;
        UI.showScreen('game');
    }

    function gameOver() {
        state = STATE.GAMEOVER;
        Sound.gameover();
        screenShakeTimer = 0.4;
        screenShakeIntensity = 8;

        // Calculate coins
        let coins = score;
        if (coinBoostActive) coins *= 2;
        StorageManager.setBestScore(score);
        StorageManager.addCoins(coins);

        UI.showGameOver(score, coins, StorageManager.getBestScore());
    }

    let pressStart = 0;
    let isCharging = false;
    const MAX_CHARGE_MS = 600; // full charge at 600ms hold

    function handlePressStart() {
        if (state !== STATE.PLAYING) return;
        if (!bottle.grounded) return;
        pressStart = performance.now();
        isCharging = true;
    }

    function handlePressEnd() {
        if (!isCharging) return;
        isCharging = false;
        if (state !== STATE.PLAYING) return;
        if (!bottle.grounded) return;
        const held = performance.now() - pressStart;
        const charge = Math.min(held / MAX_CHARGE_MS, 1.0);
        const flipped = Physics.chargedFlip(bottle, charge);
        if (flipped) Sound.flip();
    }


    function checkPowerUpCollection() {
        for (const p of platforms) {
            if (!p.powerUp || p.powerUp.collected) continue;
            const pupX = p.x + p.w / 2;
            const pupY = p.y - POWERUP_SIZE * 1.2;
            const bCX = bottle.x + BOTTLE_W / 2;
            const bCY = bottle.y + BOTTLE_H / 2;
            const dist = Math.hypot(bCX - pupX, bCY - pupY);
            if (dist < POWERUP_SIZE + BOTTLE_W / 2) {
                p.powerUp.collected = true;
                Sound.powerup();
                switch (p.powerUp.type) {
                    case 'slowmo':
                        slowMotionTimer = 3;
                        spawnPowerUpParticles(pupX, pupY, '#9b59b6');
                        break;
                    case 'coinboost':
                        coinBoostActive = true;
                        coinBoostTimer = 5;
                        spawnPowerUpParticles(pupX, pupY, '#f1c40f');
                        break;
                }
            }
        }
    }

    function update(dt) {
        if (state !== STATE.PLAYING) return;

        // Slow motion
        let gameDt = dt;
        if (slowMotionTimer > 0) {
            slowMotionTimer -= dt;
            gameDt = dt * 0.4;
            if (slowMotionTimer <= 0) slowMotionTimer = 0;
        }

        // Coin boost timer
        if (coinBoostTimer > 0) {
            coinBoostTimer -= dt;
            if (coinBoostTimer <= 0) {
                coinBoostTimer = 0;
                coinBoostActive = false;
            }
        }

        // Screen shake
        if (screenShakeTimer > 0) {
            screenShakeTimer -= dt;
        }

        // Physics
        Physics.update(bottle, gameDt);

        // Trail
        if (!bottle.grounded) {
            trail.push({ x: bottle.x, y: bottle.y });
            if (trail.length > TRAIL_MAX) trail.shift();
        }

        // Platform updates
        updatePlatforms(gameDt);

        // Collision check
        if (!bottle.grounded) {
            for (const p of platforms) {
                if (p.falling && p.opacity < 0.3) continue;
                const hit = Physics.checkPlatformCollision(bottle, p);
                if (hit) {
                    if (Physics.isLandedUpright(bottle)) {
                        Physics.land(bottle, hit.platY);
                        score++;
                        Sound.land();
                        spawnLandingParticles(bottle.x + BOTTLE_W / 2, hit.platY);
                        trail = [];

                        // Fake platform?
                        if (p.type === 'fake' && !p.touched) {
                            p.touched = true;
                            setTimeout(() => { p.falling = true; }, 300);
                        }
                    } else {
                        // Bad landing
                        gameOver();
                        return;
                    }
                    break;
                }
            }
        }

        // Off-screen fall
        if (bottle.y > PLAT_Y_BASE + 250) {
            gameOver();
            return;
        }

        // Power-up collection
        checkPowerUpCollection();

        // Camera
        const targetCam = bottle.x - W * 0.3;
        cameraX += (targetCam - cameraX) * 0.08;

        // Particles
        updateParticles(gameDt);
    }

    function render() {
        ctx.save();

        // Screen shake
        if (screenShakeTimer > 0) {
            const sx = (Math.random() - 0.5) * screenShakeIntensity * scale;
            const sy = (Math.random() - 0.5) * screenShakeIntensity * scale;
            ctx.translate(sx, sy);
        }

        drawBackground();

        // Platforms
        for (const p of platforms) {
            drawPlatform(p);
        }

        // Trail
        drawTrail();

        if (bottle) {
            const bx = (bottle.x - cameraX + BOTTLE_W / 2) * scale;
            // Center Y: bottle.y is top of body, draw center at top + half height
            const by = (bottle.y + BOTTLE_H / 2) * scale;
            drawBottle(bx, by, bottle.angle, StorageManager.getSelectedBottle());
        }

        // Particles
        drawParticles();

        // HUD
        if (state === STATE.PLAYING) drawHUD();

        // Charge bar — show while holding down
        if (isCharging && bottle && bottle.grounded) {
            const charge = Math.min((performance.now() - pressStart) / MAX_CHARGE_MS, 1.0);
            const barW = 80 * scale;
            const barH = 10 * scale;
            const bx = (bottle.x - cameraX + BOTTLE_W / 2) * scale;
            const by = (bottle.y + BOTTLE_H + 14) * scale;

            // Background track
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.roundRect(bx - barW / 2, by, barW, barH, barH / 2);
            ctx.fill();

            // Fill — green → yellow → orange based on charge
            const hue = 120 - charge * 80;  // 120 green → 40 orange
            ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
            ctx.beginPath();
            ctx.roundRect(bx - barW / 2, by, barW * charge, barH, barH / 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /* ============ Main loop ============ */
    function loop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        // Clamp dt to avoid spiral of death
        if (dt > 0.05) dt = 0.05;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (state === STATE.PLAYING || state === STATE.GAMEOVER) {
            update(dt);
            render();
        } else if (state === STATE.MENU) {
            drawBackground();
        }

        requestAnimationFrame(loop);
    }

    /* ============ Init ============ */
    function init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');

        resize();
        window.addEventListener('resize', resize);

        // Long press charge — press to charge, release to flip
        const isBtn = e => e.target.tagName === 'BUTTON' || e.target.closest('button');

        document.addEventListener('touchstart', (e) => {
            if (isBtn(e)) return;
            e.preventDefault();
            handlePressStart();
        }, { passive: false });
        document.addEventListener('touchend', (e) => {
            if (isBtn(e)) return;
            e.preventDefault();
            handlePressEnd();
        }, { passive: false });

        document.addEventListener('mousedown', (e) => { if (!isBtn(e)) handlePressStart(); });
        document.addEventListener('mouseup', (e) => { if (!isBtn(e)) handlePressEnd(); });

        state = STATE.MENU;
        UI.showScreen('menu');
        requestAnimationFrame(loop);
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        W = 360;
        H = 640;

        // Fit to viewport while maintaining aspect ratio
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const aspect = W / H;
        let cw, ch;
        if (vw / vh < aspect) {
            cw = vw;
            ch = vw / aspect;
        } else {
            ch = vh;
            cw = vh * aspect;
        }

        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;

        scale = (cw * dpr) / W;
    }

    return {
        init, startGame,
        get state() { return state; },
        set state(s) { state = s; },
        STATE, BOTTLE_SKINS, Sound, resize,
        get canvas() { return canvas; },
        get scale() { return scale; }
    };
})();
