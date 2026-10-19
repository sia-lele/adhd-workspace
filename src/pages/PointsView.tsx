// ============================================================
// 积分页：每完成一项任务 +1 分；积分池可自行添加奖品并兑换
// ============================================================

import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { Prize } from '../types';
import { DIFFICULTY_ORDER, DIFFICULTY_LABEL, DIFFICULTY_POINTS } from '../lib/difficulty';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PointsView() {
  const app = useApp();
  const pts = app.points;

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [emoji, setEmoji] = useState('');
  const [tier, setTier] = useState<'normal' | 'milestone'>('normal');
  const [hardRatio, setHardRatio] = useState('60');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // 编辑奖品（预填表单，保存即生效）
  const [editing, setEditing] = useState<Prize | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eCost, setECost] = useState('');
  const [eEmoji, setEEmoji] = useState('');
  const [eTier, setETier] = useState<'normal' | 'milestone'>('normal');
  const [eHardRatio, setEHardRatio] = useState('60');

  const openEdit = (p: Prize) => {
    setEditing(p);
    setETitle(p.title);
    setECost(String(p.cost));
    setEEmoji(p.emoji || '');
    setETier(p.tier ?? 'normal');
    setEHardRatio(String(Math.round((p.hardRatioRequired ?? 0.6) * 100)));
  };

  const canEditSubmit = eTitle.trim().length > 0 && /^\d+$/.test(eCost.trim()) && parseInt(eCost, 10) >= 1;

  const saveEdit = async () => {
    if (!editing || !canEditSubmit) return;
    const ratio = eTier === 'milestone' ? Math.min(100, Math.max(0, parseInt(eHardRatio, 10) || 0)) / 100 : undefined;
    await app.updatePrize(editing.id, {
      title: eTitle,
      cost: parseInt(eCost, 10),
      emoji: eEmoji,
      tier: eTier,
      hardRatioRequired: ratio,
    });
    setFlash('已保存修改 ✨');
    window.setTimeout(() => setFlash(null), 2200);
    setEditing(null);
  };

  // 奖品按所需积分从低到高排，容易够到的排前面（减少启动决策）
  const prizes = useMemo(() => [...pts.prizes].sort((a, b) => a.cost - b.cost), [pts.prizes]);
  const milestones = useMemo(() => prizes.filter((p) => p.tier === 'milestone'), [prizes]);
  const target = useMemo(() => prizes.find((p) => p.id === pts.targetPrizeId) || null, [prizes, pts.targetPrizeId]);
  const hardEarned = pts.hardEarned ?? 0;
  const hardRatioNow = pts.earned > 0 ? hardEarned / pts.earned : 0;

  const canSubmit = title.trim().length > 0 && /^\d+$/.test(cost.trim()) && parseInt(cost, 10) >= 1;

  const submit = async () => {
    if (!canSubmit) return;
    const ratio = tier === 'milestone' ? Math.min(100, Math.max(0, parseInt(hardRatio, 10) || 0)) / 100 : undefined;
    await app.addPrize({ title, cost: parseInt(cost, 10), emoji, tier, hardRatioRequired: ratio });
    setTitle('');
    setCost('');
    setEmoji('');
    setTier('normal');
    setHardRatio('60');
    setAdding(false);
  };

  const redeem = async (prize: Prize) => {
    const res = await app.redeemPrize(prize.id);
    if (res.ok) {
      setFlash(`🎉 已兑换「${prize.title}」！好好享受～`);
    } else {
      setFlash(`还不能换哦：${res.reason ?? ''}`);
    }
    window.setTimeout(() => setFlash(null), 2800);
  };

  // 里程碑门槛：困难分占比未达标时返回原因，否则 null
  const prizeLockReason = (p: Prize): string | null => {
    if (p.tier === 'milestone' && p.hardRatioRequired != null) {
      const r = pts.earned > 0 ? hardEarned / pts.earned : 0;
      if (r < p.hardRatioRequired) {
        return `困难分需 ≥${Math.round(p.hardRatioRequired * 100)}%（当前${Math.round(r * 100)}%）`;
      }
    }
    return null;
  };

  const withdraw = async (eventId: string) => {
    await app.withdrawEvent(eventId);
    setFlash('已撤回这条加分 ✨');
    window.setTimeout(() => setFlash(null), 2200);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* 当前积分 */}
      <div className="card p-5 flex items-center gap-4 relative overflow-hidden">
        <img src="/icon.svg" alt="" className="w-16 h-16 rounded-2xl flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl leading-none font-bold text-teal-deep">{pts.total}</span>
            <span className="text-sm text-ink-soft">分</span>
          </div>
          <p className="text-xs text-ink-faint mt-1.5">
            完成得 1–5 分 · 越困难分越多 · 累计获得 {pts.earned} 分
          </p>
        </div>
        <span className="text-3xl flex-shrink-0" aria-hidden>⭐</span>
      </div>

      {/* 难度 → 积分 对照（困难的事值得多给一点，才好启动） */}
      <div className="card p-3.5">
        <p className="text-xs text-ink-soft mb-2.5">
          按难度加权：越困难的事多给一点，让它更容易被开始。
        </p>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTY_ORDER.map((d) => (
            <div
              key={d}
              className={`rounded-xl px-2 py-2 text-center ${
                d === 'easy' ? 'bg-sage-soft/50' : d === 'medium' ? 'bg-lilac-soft/60' : 'bg-[#f7eae3]'
              }`}
            >
              <div className="text-sm font-medium text-ink">{DIFFICULTY_LABEL[d]}</div>
              <div className="text-xs text-ink-soft mt-0.5">+{DIFFICULTY_POINTS[d]} 分</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint mt-2">
          在任务详情里可以改单个任务的难度；新建 SOP 时也能直接选。
        </p>
      </div>

      {/* 我的目标 / 里程碑进度 */}
      <div className="card p-4">
        <h2 className="text-[15px] font-semibold text-ink flex items-center gap-1.5 mb-3">
          🎯 我的目标
          <span className="text-xs font-normal text-ink-faint">（攒着一个大奖励，更有劲）</span>
        </h2>
        {target ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-3xl leading-none">{target.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{target.title}</p>
                <p className="text-xs text-ink-faint">
                  🪙 {target.cost} 分{target.tier === 'milestone' ? ' · 里程碑' : ''}
                </p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-ink-soft mb-1">
                <span>已攒 {pts.total} / {target.cost} 分</span>
                <span>{Math.min(100, Math.round((pts.total / target.cost) * 100))}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-canvas overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-deep transition-all"
                  style={{ width: `${Math.min(100, (pts.total / target.cost) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-ink-faint mt-1.5">
                {pts.total >= target.cost ? '🎉 分够了，可以去兑换啦！' : `还差 ${target.cost - pts.total} 分就到～`}
              </p>
            </div>
            {target.tier === 'milestone' && target.hardRatioRequired != null && (
              <div>
                <div className="flex justify-between text-xs text-ink-soft mb-1">
                  <span>困难分占比（需 ≥{Math.round(target.hardRatioRequired * 100)}%）</span>
                  <span>{Math.round(hardRatioNow * 100)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-canvas overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${hardRatioNow >= target.hardRatioRequired ? 'bg-lilac-deep' : 'bg-[#e3b9a6]'}`}
                    style={{ width: `${Math.min(100, (hardRatioNow / (target.hardRatioRequired || 1)) * 100)}%` }}
                  />
                </div>
                {hardRatioNow < target.hardRatioRequired && (
                  <p className="text-xs text-[#b07a6e] mt-1.5">再多做一些中等/困难的任务，就能解锁这个大奖 ✨</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <label className="text-xs text-ink-faint flex-shrink-0">换个目标</label>
              <select
                className="input-base !py-1.5 text-sm flex-1"
                value={target.id}
                onChange={(e) => app.setTargetPrize(e.target.value || null)}
              >
                {milestones.map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.title}</option>
                ))}
              </select>
              <button
                onClick={() => app.setTargetPrize(null)}
                className="text-xs text-ink-faint border border-[#efeae1] rounded-full px-2.5 py-1.5 flex-shrink-0"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-sm text-ink-soft">
              {milestones.length > 0
                ? '选一个正在攒的大奖励，看着进度一点点涨，超有成就感 🎯'
                : '把最想要的大奖励（比如出去旅游）加成「里程碑」，再选它当目标，每天都有奔头～'}
            </p>
            {milestones.length > 0 && (
              <select
                className="input-base text-sm"
                value=""
                onChange={(e) => {
                  if (e.target.value) app.setTargetPrize(e.target.value);
                }}
              >
                <option value="">— 选择里程碑当目标 —</option>
                {milestones.map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.title}（{p.cost}分）</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* 积分池标题 + 添加 */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[15px] font-semibold text-ink flex items-center gap-1.5">
          🎁 积分池
          <span className="text-xs font-normal text-ink-faint">（攒够了就来换）</span>
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className={`text-sm px-3.5 py-1.5 rounded-full transition ${
            adding ? 'text-ink-soft border border-stroke bg-white' : 'bg-teal-soft text-teal-deep hover:bg-teal hover:text-white'
          }`}
        >
          {adding ? '收起' : '＋ 添加奖品'}
        </button>
      </div>

      {/* 添加奖品表单 */}
      {adding && (
        <div className="card p-4 space-y-2.5">
          <input
            className="input-base"
            placeholder="奖品名称，例如：看一集喜欢的剧"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={30}
          />
          <div className="flex gap-2">
            <input
              className="input-base w-28"
              placeholder="所需积分"
              inputMode="numeric"
              value={cost}
              onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))}
            />
            <input
              className="input-base w-24"
              placeholder="🎁 图标"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={4}
            />
          </div>
          <div className="flex rounded-full border border-[#efeae1] overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setTier('normal')}
              className={`flex-1 py-1.5 transition ${tier === 'normal' ? 'bg-teal text-white' : 'text-ink-soft'}`}
            >
              🎁 普通
            </button>
            <button
              type="button"
              onClick={() => setTier('milestone')}
              className={`flex-1 py-1.5 transition ${tier === 'milestone' ? 'bg-lilac-deep text-white' : 'text-ink-soft'}`}
            >
              🏆 里程碑
            </button>
          </div>
          {tier === 'milestone' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft flex-shrink-0">困难分最低占比</span>
              <input
                className="input-base w-20"
                inputMode="numeric"
                placeholder="60"
                value={hardRatio}
                onChange={(e) => setHardRatio(e.target.value.replace(/[^\d]/g, ''))}
              />
              <span className="text-xs text-ink-faint">%（兑换时需达标）</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-ink-faint">设一个小奖励，动力会悄悄变多 ✨</p>
            <div className="flex gap-2 flex-shrink-0">
              <button className="btn-ghost !py-2 !px-4 text-sm" onClick={() => setAdding(false)}>取消</button>
              <button className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50" onClick={submit} disabled={!canSubmit}>
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑奖品表单 */}
      {editing && (
        <div className="card p-4 space-y-2.5 border-2 border-teal-soft">
          <p className="text-sm font-medium text-ink flex items-center gap-1.5">
            ✎ 编辑奖品
            <span className="text-xs font-normal text-ink-faint">改完点「保存修改」即可</span>
          </p>
          <input
            className="input-base"
            placeholder="奖品名称"
            value={eTitle}
            onChange={(e) => setETitle(e.target.value)}
            maxLength={30}
          />
          <div className="flex gap-2">
            <input
              className="input-base w-28"
              placeholder="所需积分"
              inputMode="numeric"
              value={eCost}
              onChange={(e) => setECost(e.target.value.replace(/[^\d]/g, ''))}
            />
            <input
              className="input-base w-24"
              placeholder="🎁 图标"
              value={eEmoji}
              onChange={(e) => setEEmoji(e.target.value)}
              maxLength={4}
            />
          </div>
          <div className="flex rounded-full border border-[#efeae1] overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setETier('normal')}
              className={`flex-1 py-1.5 transition ${eTier === 'normal' ? 'bg-teal text-white' : 'text-ink-soft'}`}
            >
              🎁 普通
            </button>
            <button
              type="button"
              onClick={() => setETier('milestone')}
              className={`flex-1 py-1.5 transition ${eTier === 'milestone' ? 'bg-lilac-deep text-white' : 'text-ink-soft'}`}
            >
              🏆 里程碑
            </button>
          </div>
          {eTier === 'milestone' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft flex-shrink-0">困难分最低占比</span>
              <input
                className="input-base w-20"
                inputMode="numeric"
                placeholder="60"
                value={eHardRatio}
                onChange={(e) => setEHardRatio(e.target.value.replace(/[^\d]/g, ''))}
              />
              <span className="text-xs text-ink-faint">%（兑换时需达标）</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-ink-faint">改一改，让奖励更合心意 ✨</p>
            <div className="flex gap-2 flex-shrink-0">
              <button className="btn-ghost !py-2 !px-4 text-sm" onClick={() => setEditing(null)}>取消</button>
              <button
                className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50"
                onClick={saveEdit}
                disabled={!canEditSubmit}
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 奖品网格 */}
      {prizes.length === 0 && !adding ? (
        <div className="card p-8 text-center">
          <p className="text-3xl mb-2">🎁</p>
          <p className="text-sm text-ink-soft">积分池还是空的</p>
          <p className="text-xs text-ink-faint mt-1">加一个想要的小奖励，完成任务攒分来换～</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {prizes.map((p) => {
            const affordable = pts.total >= p.cost;
            const lock = prizeLockReason(p);
            const canRedeem = affordable && !lock;
            return (
              <div key={p.id} className="card p-4 flex flex-col items-center text-center relative">
                <button
                  onClick={() => {
                    if (confirmDel === p.id) {
                      app.removePrize(p.id);
                      setConfirmDel(null);
                    } else {
                      setConfirmDel(p.id);
                      window.setTimeout(() => setConfirmDel((c) => (c === p.id ? null : c)), 2500);
                    }
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-ink-faint hover:text-[#b07a6e] hover:bg-canvas transition text-sm leading-none"
                  aria-label="删除奖品"
                  title={confirmDel === p.id ? '再点一次确认删除' : '删除奖品'}
                >
                  {confirmDel === p.id ? '?' : '×'}
                </button>
                <button
                  onClick={() => openEdit(p)}
                  className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full text-ink-faint hover:text-teal-deep hover:bg-canvas transition text-xs leading-none flex items-center justify-center"
                  aria-label="编辑奖品"
                  title="编辑这个奖品"
                >
                  ✎
                </button>
                <span className="text-3xl leading-none mt-1" aria-hidden>{p.emoji}</span>
                <p className="text-sm text-ink mt-2 leading-snug px-1">{p.title}</p>
                {p.tier === 'milestone' && (
                  <span className="text-[11px] text-lilac-deep bg-lilac-soft/60 rounded-full px-2 py-0.5 mt-1">🏆 里程碑</span>
                )}
                <span className="text-xs text-ink-faint mt-0.5">🪙 {p.cost} 分</span>
                <button
                  onClick={() => redeem(p)}
                  disabled={!canRedeem}
                  title={lock ?? undefined}
                  className={`mt-2.5 w-full rounded-full text-xs py-1.5 transition ${
                    canRedeem
                      ? 'bg-teal text-white hover:bg-teal-deep active:scale-95'
                      : 'bg-canvas text-ink-faint border border-[#efeae1] cursor-default'
                  }`}
                >
                  {canRedeem ? '兑换' : !affordable ? `还差 ${p.cost - pts.total} 分` : '🔒 困难分不足'}
                </button>
                {lock && (
                  <p className="text-[11px] text-[#b07a6e] mt-1 px-1 leading-tight">{lock}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 积分记录（全部渲染，随页面自然滚动查看） */}
      {pts.history.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-ink">积分记录</h3>
            <span className="text-xs text-ink-faint">共 {pts.history.length} 条</span>
          </div>
          <ul className="space-y-1.5">
            {pts.history.map((e) => {
              const isEarn = e.amount > 0;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm py-0.5">
                  <span className="text-ink-soft truncate min-w-0">
                    {e.reason}
                    <span className="text-ink-faint text-xs ml-2">{fmtTime(e.at)}</span>
                  </span>
                  <span className={`flex-shrink-0 font-medium ${isEarn ? 'text-sage-deep' : 'text-[#b07a6e]'}`}>
                    {isEarn ? `+${e.amount}` : e.amount}
                  </span>
                  {isEarn && (
                    <button
                      onClick={() => withdraw(e.id)}
                      className="flex-shrink-0 text-xs text-ink-faint border border-[#efeae1] rounded-full px-2 py-0.5 hover:text-[#b07a6e] hover:border-[#f0d9d0] transition"
                      title="撤回这次加分"
                    >
                      撤回
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 兑换成功提示 */}
      {flash && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 bg-ink text-white text-sm px-4 py-2.5 rounded-full shadow-soft whitespace-nowrap">
          {flash}
        </div>
      )}
    </div>
  );
}
