/* ============================================================
   ui.js — Screen management, overlays, and HUD
   ============================================================ */

const UI = (() => {
    const screens = {};

    function init() {
        screens.menu = document.getElementById('menuScreen');
        screens.game = document.getElementById('gameScreen');
        screens.gameover = document.getElementById('gameOverScreen');
        screens.shop = document.getElementById('shopScreen');

        // Menu
        document.getElementById('btnPlay').addEventListener('click', () => {
            Game.startGame();
        });
        document.getElementById('btnShop').addEventListener('click', () => {
            Shop.open();
        });

        // Game Over
        document.getElementById('btnRestart').addEventListener('click', () => {
            Game.startGame();
        });
        document.getElementById('btnMenu').addEventListener('click', () => {
            Game.state = Game.STATE.MENU;
            showScreen('menu');
        });

        // Shop
        document.getElementById('btnShopBack').addEventListener('click', () => {
            Shop.close();
        });

        // Pause
        document.getElementById('btnPause').addEventListener('click', () => {
            if (Game.state === Game.STATE.PLAYING) {
                Game.state = Game.STATE.PAUSED;
                document.getElementById('pauseOverlay').classList.add('visible');
            }
        });
        document.getElementById('btnResume').addEventListener('click', () => {
            Game.state = Game.STATE.PLAYING;
            document.getElementById('pauseOverlay').classList.remove('visible');
        });
        document.getElementById('btnPauseRestart').addEventListener('click', () => {
            document.getElementById('pauseOverlay').classList.remove('visible');
            Game.startGame();
        });

        // Sound toggle
        document.getElementById('btnSound').addEventListener('click', () => {
            const muted = !StorageManager.isMuted();
            StorageManager.setMuted(muted);
            updateSoundBtn();
        });

        updateBestScore();
        updateSoundBtn();
    }

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        if (screens[name]) screens[name].classList.add('active');

        if (name === 'menu') {
            updateBestScore();
            updateMenuCoins();
        }
    }

    function updateBestScore() {
        const el = document.getElementById('bestScore');
        if (el) el.textContent = '🏆 Best: ' + StorageManager.getBestScore();
    }

    function updateMenuCoins() {
        const el = document.getElementById('menuCoins');
        if (el) el.textContent = '🪙 ' + StorageManager.getCoins();
    }

    function updateSoundBtn() {
        const btn = document.getElementById('btnSound');
        if (btn) btn.textContent = StorageManager.isMuted() ? '🔇' : '🔊';
    }

    function showGameOver(score, coins, best) {
        document.getElementById('goScore').textContent = 'Score: ' + score;
        document.getElementById('goCoins').textContent = 'Coins Earned: +' + coins;
        document.getElementById('goBest').textContent = '🏆 Best: ' + best;
        showScreen('gameover');
    }

    return { init, showScreen, showGameOver, updateMenuCoins };
})();
