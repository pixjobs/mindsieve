'use client';

import React, { memo, useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ======================================================================
// STARFIELD & CURVED PERSPECTIVE GRID (WITH METEORS & PERFECT SEAMLESS LOOP)
// ======================================================================

type Star = { x: number; y: number; z: number; size: number; alpha: number };
type Meteor = { x: number; y: number; len: number; angle: number; speed: number; alpha: number };

const StarfieldGrid = memo(function StarfieldGrid({
  dim,
}: {
  dim: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let vw = 0, vh = 0;
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let gridOffset = 0;

    const fit = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      ctx.scale(dpr, dpr);
    };

    const buildStars = () => {
      stars = [];
      const starCount = Math.floor((vw * vh) / 2500);
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * vw,
          y: Math.random() * vh,
          z: Math.random(), // 0 = distant, 1 = close
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.5 + 0.2,
        });
      }
    };

    // --- Drawing Functions ---
    const drawGrid = (elapsed: number) => {
      const GRID_COLOR = 'rgba(100, 120, 150, 0.18)';
      const HORIZON_Y = vh * 0.45;
      const VANISHING_POINT_X = vw / 2;
      const CELL_BASE_HEIGHT = 50; // This is now our loop height
      const MAX_CURVATURE = vh * 0.1;

      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;

      // --- Seamless Infinite Scroll Logic ---
      // The offset increases slowly. When it exceeds the height of one cell,
      // it wraps around, creating a perfect loop.
      gridOffset = (gridOffset + (elapsed / 1000) * 2.0) % CELL_BASE_HEIGHT;

      // --- Horizontal Curved Lines ---
      // We draw enough lines to fill the screen plus one extra for the seamless scroll.
      for (let i = 0; i < 15; i++) {
        // The perspective is created by making each subsequent line's height increase quadratically.
        const y_perspective = (i * i * CELL_BASE_HEIGHT) / 10;
        
        // We draw two sets of lines. One is offset by the loop height.
        // This is the key to the seamless effect.
        const y1 = HORIZON_Y + y_perspective + gridOffset;
        const y2 = HORIZON_Y + y_perspective + gridOffset - CELL_BASE_HEIGHT;

        [y1, y2].forEach(y => {
          if (y < HORIZON_Y || y > vh) return; // Don't draw lines off-screen

          // Calculate curvature based on how far the line is from the horizon.
          // Lines closer to the viewer (bottom) are less curved.
          const perspectiveFactor = (y - HORIZON_Y) / (vh - HORIZON_Y);
          const curvature = MAX_CURVATURE * perspectiveFactor;

          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.quadraticCurveTo(VANISHING_POINT_X, y - curvature, vw, y);
          ctx.stroke();
        });
      }

      // --- Vertical Perspective Lines ---
      const numVerticalLines = 20;
      for (let i = -numVerticalLines; i <= numVerticalLines; i++) {
        const perspectiveFactor = Math.abs(i) / numVerticalLines;
        const x1 = VANISHING_POINT_X + i * 10 * (1 + perspectiveFactor * 0.5);
        const x2 = VANISHING_POINT_X + i * 300;

        ctx.beginPath();
        ctx.moveTo(x1, HORIZON_Y);
        ctx.lineTo(x2, vh);
        ctx.stroke();
      }
    };

    const drawStars = (elapsed: number) => {
      ctx.fillStyle = '#FFF';
      for (const star of stars) {
        star.y += (elapsed / 1000) * (star.z * 2 + 0.5); // Very slow parallax
        if (star.y > vh) {
          star.y = 0;
          star.x = Math.random() * vw;
        }
        ctx.globalAlpha = star.alpha;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * star.z, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawMeteors = (elapsed: number) => {
      if (Math.random() > 0.995 && meteors.length < 3) {
        meteors.push({
          x: Math.random() * vw,
          y: -20,
          len: Math.random() * 150 + 50,
          angle: Math.PI / 4 + (Math.random() - 0.5) * 0.2,
          speed: Math.random() * 200 + 100,
          alpha: 1.0,
        });
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;

      for (let i = meteors.length - 1; i >= 0; i--) {
        const meteor = meteors[i];
        const dt = elapsed / 1000;
        meteor.x += Math.cos(meteor.angle) * meteor.speed * dt;
        meteor.y += Math.sin(meteor.angle) * meteor.speed * dt;
        meteor.alpha -= dt * 0.8;

        if (meteor.alpha <= 0) {
          meteors.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = meteor.alpha;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(meteor.x - Math.cos(meteor.angle) * meteor.len, meteor.y - Math.sin(meteor.angle) * meteor.len);
        ctx.stroke();
      }
    };

    let lastTime = 0;
    const render = (tms: number) => {
      if (!lastTime) lastTime = tms;
      const elapsed = tms - lastTime;
      lastTime = tms;

      ctx.clearRect(0, 0, vw, vh);
      const bg = ctx.createLinearGradient(vw / 2, 0, vw / 2, vh);
      bg.addColorStop(0, '#0a0f1a');
      bg.addColorStop(1, '#030406');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, vw, vh);

      ctx.save();
      ctx.globalAlpha = dim ? 0 : 1;
      
      drawGrid(elapsed);
      drawStars(elapsed);
      drawMeteors(elapsed);
      
      ctx.restore();

      rafRef.current = requestAnimationFrame(render);
    };

    const onResize = () => { fit(); buildStars(); };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        lastTime = 0;
        rafRef.current = requestAnimationFrame(render);
      }
    };

    fit();
    buildStars();
    rafRef.current = requestAnimationFrame(render);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [dim]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none bg-black"
      aria-hidden
    />
  );
});

export default StarfieldGrid;