/* ============================================================
   shop.js — Bottle shop & skin selection
   ============================================================ */

const Shop = (() => {
    function open() {
        Game.state = Game.STATE.SHOP;
        render();
        UI.showScreen('shop');
    }

    function close() {
        Game.state = Game.STATE.MENU;
        UI.showScreen('menu');
    }

    function render() {
        const container = document.getElementById('shopItems');
        const coinDisplay = document.getElementById('shopCoins');
        container.innerHTML = '';
        coinDisplay.textContent = '🪙 ' + StorageManager.getCoins();

        const selected = StorageManager.getSelectedBottle();

        Game.BOTTLE_SKINS.forEach(skin => {
            const unlocked = StorageManager.isBottleUnlocked(skin.id);
            const isSelected = skin.id === selected;

            const card = document.createElement('div');
            card.className = 'shop-card' + (isSelected ? ' selected' : '');

            // Bottle preview
            const preview = document.createElement('canvas');
            preview.width = 80;
            preview.height = 120;
            preview.className = 'shop-bottle-preview';
            drawShopBottle(preview, skin);

            // Info
            const name = document.createElement('div');
            name.className = 'shop-name';
            name.textContent = skin.name;

            const btn = document.createElement('button');
            btn.className = 'shop-btn';

            if (isSelected) {
                btn.textContent = '✅ Selected';
                btn.disabled = true;
                btn.classList.add('btn-selected');
            } else if (unlocked) {
                btn.textContent = 'Select';
                btn.classList.add('btn-select');
                btn.addEventListener('click', () => {
                    StorageManager.setSelectedBottle(skin.id);
                    Game.Sound.buy();
                    render();
                });
            } else {
                btn.textContent = '🪙 ' + skin.price;
                btn.classList.add('btn-buy');
                if (StorageManager.getCoins() < skin.price) {
                    btn.classList.add('btn-disabled');
                }
                btn.addEventListener('click', () => {
                    if (StorageManager.spendCoins(skin.price)) {
                        StorageManager.unlockBottle(skin.id);
                        StorageManager.setSelectedBottle(skin.id);
                        Game.Sound.buy();
                        render();
                    }
                });
            }

            card.appendChild(preview);
            card.appendChild(name);
            card.appendChild(btn);
            container.appendChild(card);
        });
    }

    function drawShopBottle(canvas, skin) {
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const bw = 36;
        const bh = 72;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Body gradient
        const bodyGrad = ctx.createLinearGradient(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2);
        bodyGrad.addColorStop(0, skin.accent);
        bodyGrad.addColorStop(1, skin.bodyColor);

        // Body
        const radius = bw * 0.25;
        const top = cy - bh / 2 + bh * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2 + radius, top);
        ctx.lineTo(cx + bw / 2 - radius, top);
        ctx.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + radius);
        ctx.lineTo(cx + bw / 2, cy + bh / 2 - radius);
        ctx.quadraticCurveTo(cx + bw / 2, cy + bh / 2, cx + bw / 2 - radius, cy + bh / 2);
        ctx.lineTo(cx - bw / 2 + radius, cy + bh / 2);
        ctx.quadraticCurveTo(cx - bw / 2, cy + bh / 2, cx - bw / 2, cy + bh / 2 - radius);
        ctx.lineTo(cx - bw / 2, top + radius);
        ctx.quadraticCurveTo(cx - bw / 2, top, cx - bw / 2 + radius, top);
        ctx.closePath();
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Neck
        const neckW = bw * 0.45;
        ctx.beginPath();
        ctx.rect(cx - neckW / 2, cy - bh / 2 + bh * 0.06, neckW, bh * 0.14);
        ctx.fillStyle = skin.bodyColor;
        ctx.fill();
        ctx.stroke();

        // Cap
        const capW = neckW * 1.1;
        ctx.fillStyle = skin.capColor;
        ctx.beginPath();
        ctx.roundRect(cx - capW / 2, cy - bh / 2 - 2, capW, bh * 0.08 + 2, [3, 3, 0, 0]);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(cx - bw / 2 + 4, cy + bh * 0.05, bw - 8, bh * 0.12);

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx - bw * 0.15, cy - bh * 0.05, bw * 0.08, bh * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glow for special skins
        if (skin.id >= 2) {
            ctx.shadowColor = skin.bodyColor;
            ctx.shadowBlur = 15;
            ctx.strokeStyle = skin.bodyColor;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    return { open, close, render };
})();
