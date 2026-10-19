import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { onCelebrate, type CelebratePayload } from '../lib/celebrate';

interface Badge extends CelebratePayload {
  id: number;
}

/**
 * 全局庆祝浮层：订阅 celebrate 事件，在触发坐标处浮出一个「+1 ⭐」。
 * 遵循「减少动态效果」偏好：开启时仅做轻微上浮与淡出。
 */
export default function CelebrateLayer() {
  const app = useApp();
  const reduced = !!app.prefs.reducedMotion;
  const [badges, setBadges] = useState<Badge[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    return onCelebrate((p) => {
      const id = ++idRef.current;
      setBadges((b) => [...b, { ...p, id }]);
      window.setTimeout(() => {
        setBadges((b) => b.filter((x) => x.id !== id));
      }, reduced ? 650 : 1000);
    });
  }, [reduced]);

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden" aria-hidden>
      {badges.map((b) => (
        <CelebrateBadge key={b.id} x={b.x} y={b.y} amount={b.amount} reduced={reduced} />
      ))}
    </div>
  );
}

function CelebrateBadge({ x, y, amount, reduced }: { x: number; y: number; amount: number; reduced: boolean }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOut(true)));
    return () => cancelAnimationFrame(r);
  }, []);

  const ty = reduced ? -12 : -54; // 上浮距离
  const rise = reduced ? 420 : 880; // 动画时长 ms

  return (
    <div
      data-testid="celebrate"
      className="absolute font-bold leading-none select-none"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) translateY(${out ? ty : 0}px) scale(${out ? 1.12 : 0.8})`,
        opacity: out ? 0 : 1,
        transition: `transform ${rise}ms cubic-bezier(.2,.7,.3,1), opacity ${rise}ms ease`,
        fontSize: 19,
        color: '#e0a23c',
        textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 0 1px rgba(255,255,255,0.9)',
        whiteSpace: 'nowrap',
      }}
    >
      +{amount} ⭐
    </div>
  );
}
