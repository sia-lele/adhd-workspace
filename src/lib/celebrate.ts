// 完成任务的庆祝事件发射器：被勾选的组件在「完成」瞬间发射点击坐标，
// 由 <CelebrateLayer /> 接收并在该位置浮出「+1 ⭐」。

export interface CelebratePayload {
  x: number; // 视口坐标 clientX
  y: number; // 视口坐标 clientY
  amount: number; // 本次加的分（默认 1）
}

type Listener = (p: CelebratePayload) => void;
const listeners = new Set<Listener>();

/** 在指定坐标触发一次庆祝（默认 +1） */
export function emitCelebrate(x: number, y: number, amount = 1): void {
  const payload: CelebratePayload = { x, y, amount };
  listeners.forEach((l) => l(payload));
}

/** 订阅庆祝事件，返回取消订阅函数 */
export function onCelebrate(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
