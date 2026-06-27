/* ============================================================
   storage.js — Persistent data manager (localStorage)
   ============================================================ */

const StorageManager = (() => {
    const KEYS = {
        BEST_SCORE:  'fbr_bestScore',
        COINS:       'fbr_coins',
        UNLOCKED:    'fbr_unlocked',
        SELECTED:    'fbr_selected',
        MUTED:       'fbr_muted'
    };

    function _get(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v !== null ? JSON.parse(v) : fallback;
        } catch { return fallback; }
    }
    function _set(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }

    return {
        /* Score */
        getBestScore()        { return _get(KEYS.BEST_SCORE, 0); },
        setBestScore(s)       { if (s > this.getBestScore()) _set(KEYS.BEST_SCORE, s); },

        /* Coins */
        getCoins()            { return _get(KEYS.COINS, 0); },
        addCoins(n)           { _set(KEYS.COINS, this.getCoins() + n); },
        spendCoins(n) {
            const cur = this.getCoins();
            if (cur < n) return false;
            _set(KEYS.COINS, cur - n);
            return true;
        },

        /* Bottle unlocks — stored as array of IDs */
        getUnlockedBottles()  { return _get(KEYS.UNLOCKED, [0]); },   // bottle 0 free
        unlockBottle(id) {
            const arr = this.getUnlockedBottles();
            if (!arr.includes(id)) { arr.push(id); _set(KEYS.UNLOCKED, arr); }
        },
        isBottleUnlocked(id)  { return this.getUnlockedBottles().includes(id); },

        /* Selected bottle */
        getSelectedBottle()   { return _get(KEYS.SELECTED, 0); },
        setSelectedBottle(id) { _set(KEYS.SELECTED, id); },

        /* Sound */
        isMuted()             { return _get(KEYS.MUTED, false); },
        setMuted(m)           { _set(KEYS.MUTED, !!m); }
    };
})();
