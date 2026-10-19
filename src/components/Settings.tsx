import { useState } from 'react';
import { useApp } from '../store/AppContext';

interface Props {
  onClose: () => void;
}

export default function Settings({ onClose }: Props) {
  const app = useApp();
  const [msg, setMsg] = useState('');

  const handleExport = async () => {
    const json = await app.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adhd-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('已导出备份文件。');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await app.importData(text);
      setMsg('导入成功，数据已恢复。');
    } catch (err) {
      setMsg('导入失败：文件格式不正确。');
    }
  };

  const handleWipe = async () => {
    if (!confirm('确定清空全部数据吗？此操作不可恢复。建议先导出备份。')) return;
    localStorage.clear();
    indexedDB.deleteDatabase('adhd-executive-workspace');
    location.reload();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-canvas rounded-2xl shadow-soft w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-canvas z-10">
          <h2 className="text-lg font-semibold text-ink">设置</h2>
          <button onClick={onClose} className="text-ink-faint text-2xl leading-none px-2">×</button>
        </div>

        <div className="px-5 pb-6 space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-ink-soft">偏好</h3>
            <div className="flex items-center justify-between">
              <span className="text-ink-soft text-sm">减少动态效果</span>
              <button
                onClick={() => app.updatePrefs({ reducedMotion: !app.prefs.reducedMotion })}
                className={`w-12 h-7 rounded-full transition ${app.prefs.reducedMotion ? 'bg-teal' : 'bg-stroke'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white transition ${app.prefs.reducedMotion ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-soft text-sm">提示音</span>
              <button
                onClick={() => app.updatePrefs({ soundEnabled: !app.prefs.soundEnabled })}
                className={`w-12 h-7 rounded-full transition ${app.prefs.soundEnabled ? 'bg-teal' : 'bg-stroke'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white transition ${app.prefs.soundEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-soft text-sm">每周起始日</span>
              <select
                className="input-base !w-32"
                value={app.prefs.weekStartsOn}
                onChange={(e) => app.updatePrefs({ weekStartsOn: Number(e.target.value) })}
              >
                <option value={1}>周一</option>
                <option value={0}>周日</option>
              </select>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-ink-soft">数据备份（本地）</h3>
            <div className="rounded-xl bg-[#fff7ed] border border-[#f3d9c4] p-3 text-xs text-[#9a5a3c] leading-relaxed">
              ⚠️ 数据只存在你打开它的那个浏览器本地（IndexedDB），<b>没有云端同步</b>。
              特别注意：iPhone 上「添加到主屏幕」生成的是<b>独立的 PWA，和 Safari/App 内浏览器是两套互不连通的存储</b>——
              两边数据不互通，来回切换会显示「全没了」。请<b>只用同一个入口</b>，并在改完重要数据后立刻导出备份。
            </div>
            <div className="flex gap-2">
              <button onClick={handleExport} className="btn-primary flex-1">导出 JSON</button>
              <label className="btn-ghost flex-1 text-center cursor-pointer">
                导入 JSON
                <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
              </label>
            </div>
            {msg && <p className="text-xs text-teal-deep">{msg}</p>}
          </section>

          <section className="pt-2 border-t border-[#efeae1]">
            <button onClick={handleWipe} className="text-sm text-[#b07a6e] underline-offset-2 hover:underline">
              清空全部数据
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
