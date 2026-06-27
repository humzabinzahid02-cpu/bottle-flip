/* ============================================================
   physics.js — Physics engine for bottle flipping
   ============================================================ */

const Physics = (() => {
    const GRAVITY = 1300;    // px/s²
    const FLIP_FORCE_X = 190;
    const LANDING_ANGLE_TOLERANCE = 0.82; // ~47° — wide enough for all charges
    const TERMINAL_VY = 1200;
    const DAMPING = 0.88;

    function createBody(x, y, w, h) {
        return {
            x, y, w, h,
            vx: 0, vy: 0,
            angle: 0,
            angularVel: 0,
            grounded: true,
            flipping: false
        };
    }

    /*
     * chargedFlip — charge 0.0 (quick tap) → 1.0 (full press)
     *
     * Key insight: angularVel is computed from the actual vy so the bottle
     * always completes EXACTLY one full rotation in air regardless of charge.
     *   airTime = 2 * |vy| / gravity
     *   angVel  = 2π / airTime
     */
    function chargedFlip(body, charge) {
        if (!body.grounded) return false;

        const minFY = -440;   // short tap
        const maxFY = -820;   // full press

        body.vy = minFY + (maxFY - minFY) * charge;
        body.vx = FLIP_FORCE_X * (0.55 + 0.45 * charge);

        // Dynamically match angular velocity to predicted air time
        const airTime = (2 * Math.abs(body.vy)) / GRAVITY;
        body.angularVel = (Math.PI * 2) / airTime;  // exactly 1 rotation

        body.grounded = false;
        body.flipping = true;
        return true;
    }

    /* Convenience: full-charge instant flip */
    function flip(body) { return chargedFlip(body, 1.0); }

    function update(body, dt) {
        if (body.grounded) return;

        body.vy += GRAVITY * dt;
        if (body.vy > TERMINAL_VY) body.vy = TERMINAL_VY;

        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angle += body.angularVel * dt;
    }

    function checkPlatformCollision(body, plat) {
        const bBottom = body.y + body.h;
        const bCenterX = body.x + body.w / 2;
        if (body.vy < 0) return null;
        if (bCenterX < plat.x || bCenterX > plat.x + plat.w) return null;
        if (bBottom >= plat.y && bBottom <= plat.y + plat.h + body.vy * 0.02) {
            return { platY: plat.y };
        }
        return null;
    }

    function isLandedUpright(body) {
        let a = body.angle % (Math.PI * 2);
        if (a < 0) a += Math.PI * 2;
        return (a <= LANDING_ANGLE_TOLERANCE || a >= (Math.PI * 2 - LANDING_ANGLE_TOLERANCE));
    }

    function land(body, surfaceY) {
        body.y = surfaceY - body.h;
        body.vy = 0;
        body.vx *= DAMPING;
        body.angularVel = 0;
        body.angle = Math.round(body.angle / (Math.PI * 2)) * (Math.PI * 2);
        body.grounded = true;
        body.flipping = false;
    }

    return {
        GRAVITY, FLIP_FORCE_X, LANDING_ANGLE_TOLERANCE,
        createBody, flip, chargedFlip, update,
        checkPlatformCollision, isLandedUpright, land
    };
})();
