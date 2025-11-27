import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  volume: number; // 0 to 1
  mode: 'listening' | 'speaking' | 'idle';
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, volume, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const render = () => {
      time += 0.05;
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = 80;

      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        // Idle state: Subtle breathing pulse
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#334155'; // Slate 700
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }

      // Active state
      // Dynamic radius based on volume
      const dynamicRadius = baseRadius + (volume * 100); 
      
      // Color based on mode
      const color = mode === 'listening' ? '#FACC15' : '#38BDF8'; // Gold (User) vs Sky Blue (AI)
      
      // Create glow effect
      const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, dynamicRadius * 1.5);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, dynamicRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inner solid circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A'; // Back to bg color
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Ripples
      for (let i = 0; i < 3; i++) {
        const rippleRadius = baseRadius + ((time * 20 + i * 30) % 100);
        const opacity = 1 - ((rippleRadius - baseRadius) / 100);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, volume, mode]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={400} 
      className="w-full max-w-[400px] h-auto mx-auto"
    />
  );
};

export default Visualizer;
