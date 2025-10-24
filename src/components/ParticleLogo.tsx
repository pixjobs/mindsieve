'use client';

import { memo, useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import { gsap } from 'gsap';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ======================================================================
// ENHANCED PARTICLE LOGO WITH SOLID TEXT + HALO
// ======================================================================
const ParticleLogo = memo(function ParticleLogo({
  startIntro,
}: {
  startIntro: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<any[]>([]);
  const animationState = useRef<'intro' | 'idle' | 'streaming'>('intro');
  const visualState = useRef({ particleAlpha: 1, textAlpha: 0, haloSize: 0 });
  const rafRef = useRef<number>(0);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // The main guard clause. If this fails, none of the subsequent code runs.
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const isSmall = width < 480;
    const particleCount = isSmall ? 800 : 1600;
    const colors = ['#cbd5e1', '#94a3b8', '#64748b', '#475569'];

    const fontSize = Math.max(32, Math.min(height * 0.7, 72));
    const text = 'Mindsieve';
    const font = `bold ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    let textWidth = 0;
    let textX = 0;
    let textY = 0;

    class Particle {
      x: number; y: number; originX: number; originY: number;
      vx: number; vy: number; size: number; color: string;
      friction: number; ease: number;

      constructor(x: number, y: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.originX = x; this.originY = y;
        this.vx = 0; this.vy = 0;
        this.size = Math.random() * 1.4 + 0.4;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.friction = 0.92;
        this.ease = 0.06 + Math.random() * 0.04;
      }
      update() {
        this.vx += (this.originX - this.x) * this.ease;
        this.vy += (this.originY - this.y) * this.ease;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx;
        this.y += this.vy;

        if (animationState.current === 'idle') {
          const idleForceX = Math.sin(Date.now() * 0.0008 + this.originY * 0.05) * 0.05;
          const idleForceY = Math.cos(Date.now() * 0.0008 + this.originX * 0.05) * 0.05;
          this.x += idleForceX;
          this.y += idleForceY;
        } else if (animationState.current === 'streaming') {
          this.x += (Math.random() - 0.5) * 0.7;
          this.y += (Math.random() - 0.5) * 0.7;
        }
      }
      // FIXED: The draw method now accepts the context as an argument.
      draw(context: CanvasRenderingContext2D) {
        context.fillStyle = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
      }
    }

    const init = () => {
      const tempCtx = document.createElement('canvas').getContext('2d');
      if (!tempCtx) return;
      tempCtx.canvas.width = width;
      tempCtx.canvas.height = height;
      
      tempCtx.font = font;
      textWidth = tempCtx.measureText(text).width;
      textX = (width - textWidth) / 2;
      textY = (height + fontSize * 0.35) / 2;

      tempCtx.fillStyle = 'black';
      tempCtx.fillText(text, textX, textY);
      
      const imageData = tempCtx.getImageData(0, 0, width, height).data;
      const pts: { x: number; y: number }[] = [];
      const step = isSmall ? 3 : 2;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          if (imageData[(y * width + x) * 4 + 3] > 128) pts.push({ x, y });
        }
      }
      particles.current = Array.from({ length: particleCount }, (_, i) => {
        const p = pts[i % pts.length];
        return new Particle(p.x, p.y);
      });
    };

    const loop = () => {
      // This function now uses the non-null `ctx` from the outer scope.
      ctx.clearRect(0, 0, width, height);

      if (visualState.current.textAlpha > 0) {
        ctx.globalAlpha = visualState.current.textAlpha;
        ctx.font = font;
        
        ctx.shadowColor = 'rgba(165, 180, 252, 0.7)';
        if (animationState.current === 'idle' || animationState.current === 'streaming') {
          ctx.shadowBlur = visualState.current.haloSize + Math.sin(Date.now() * 0.0025) * 3;
        } else {
          ctx.shadowBlur = visualState.current.haloSize;
        }
        
        ctx.fillStyle = '#e0e7ff';
        ctx.fillText(text, textX, textY);

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      if (visualState.current.particleAlpha > 0) {
        ctx.globalAlpha = visualState.current.particleAlpha;
        for (const p of particles.current) {
          p.update();
          // FIXED: We now pass the guaranteed non-null context to the draw method.
          p.draw(ctx);
        }
      }
      
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(loop);
    };

    init();
    rafRef.current = requestAnimationFrame(loop);

    const handleStreamStart = () => { animationState.current = 'streaming'; };
    const handleStreamEnd = () => { animationState.current = 'idle'; };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current);
      else rafRef.current = requestAnimationFrame(loop);
    };

    window.addEventListener('llm-stream-start', handleStreamStart);
    window.addEventListener('llm-stream-end', handleStreamEnd);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('llm-stream-start', handleStreamStart);
      window.removeEventListener('llm-stream-end', handleStreamEnd);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!startIntro || !particles.current.length) return;
    
    const particleIn = gsap.fromTo(
      particles.current,
      {
        x: () => (Math.random() < 0.5 ? -50 : canvasRef.current!.clientWidth + 50),
        y: () => (Math.random() < 0.5 ? -50 : canvasRef.current!.clientHeight + 50),
      },
      {
        x: (i, p) => p.originX,
        y: (i, p) => p.originY,
        ease: 'power3.out',
        duration: 2.0,
        stagger: { each: 0.003, from: 'random' },
      }
    );

    gsap.timeline({ delay: 1.6 })
      .to(visualState.current, {
        particleAlpha: 0,
        duration: 0.8,
        ease: 'power2.inOut',
      })
      .to(visualState.current, {
        textAlpha: 1,
        haloSize: 20,
        duration: 1.2,
        ease: 'power3.out',
        onComplete: () => {
          animationState.current = 'idle';
        },
      }, '-=0.6');

    return () => {
      particleIn.kill();
    };
  }, [startIntro]);

  return <canvas ref={canvasRef} className="w-full h-12 md:h-16" aria-hidden />;
});

export default ParticleLogo;