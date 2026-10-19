// ============================================================
// 数据模型定义 —— ADHD 外部执行大脑
// 严格对应需求文档第十八章的结构设计
// ============================================================

export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | null;

/** 任务难度（决定完成可得积分）：简单 1 分 / 中等 3 分 / 困难 5 分 */
export type TaskDifficulty = 'easy' | 'medium' | 'hard';

/** 循环规则：决定哪些日期应该出现任务 */
export type RecurrenceRule =
  | { type: 'once'; date: string } // 本地日期 YYYY-MM-DD
  | { type: 'daily' }
  | { type: 'weekly'; daysOfWeek: number[] } // 0=周日 ... 6=周六
  | {
      type: 'monthly';
      dayOfMonth?: number; // 每月几号
      weekOfMonth?: number; // 第几个星期（1-4 表示第1-4周，5/last 表示最后一周）
      weekday?: number; // 配合 weekOfMonth 使用
      lastWeek?: boolean; // 每月最后一个指定星期几
      skipIfNotExists?: boolean; // 该月不存在该日（如31日）时跳过
    }
  | {
      type: 'custom';
      interval: number; // 每 N
      unit: 'day' | 'week' | 'month';
      anchorDate: string; // 锚定日期 YYYY-MM-DD
    };

/** SOP 生效类型 */
export type SopType = 'weekdays' | 'weekends' | 'daily' | 'custom' | 'monthly';

export interface Sop {
  id: string;
  name: string;
  description?: string;
  type: SopType;
  daysOfWeek: number[]; // custom 类型使用，0=周日...6=周六
  monthlyRule?: {
    dayOfMonth?: number;
    weekOfMonth?: number;
    weekday?: number;
    lastWeek?: boolean;
  };
  enabled: boolean;
  sortOrder?: number; // 排序（长按拖动调整，越小越靠前）
  createdAt: number;
  updatedAt: number;
}

/** 任务模板（重复任务定义），对应 18.2 */
export interface TaskTemplate {
  id: string;
  sopId: string | null; // 不属于任何 SOP 时为 null（如快速添加）
  title: string;
  recurrence: RecurrenceRule;
  scheduledTime: string | null; // "HH:mm"
  timeOfDay: TimeOfDay;
  durationMinutes: number | null;
  firstStep: string | null;
  notes: string | null;
  pinned: boolean; // 置顶 / 今天优先做
  lowEnergyPreferred: boolean; // 低能量模式优先显示
  difficulty?: TaskDifficulty; // 难度（决定完成可得积分，缺省视为简单）
  sortOrder: number;
  enabled: boolean;
  crossScope?: boolean; // 跨框架：工作日/周末 SOP 的任务勾选后，同时在另一套框架（周末/工作日）出现
  pausedDates?: string[]; // 被用户清空的日期，这些天不再自动生成（未来其他天仍按规则生成）
  createdAt: number;
  updatedAt: number;
}

export type TaskStatus = 'todo' | 'done' | 'skipped';

/** 每日任务实例，对应 18.3 —— 完成状态只属于具体日期的实例 */
export interface TaskInstance {
  id: string;
  templateId: string | null; // 单次任务（快速添加）为 null
  localDate: string; // YYYY-MM-DD
  title: string;
  scheduledTime: string | null;
  timeOfDay: TimeOfDay;
  durationMinutes: number | null;
  status: TaskStatus;
  completedAt: number | null;
  skippedAt: number | null;
  isException: boolean; // 用户单独修改过此实例
  firstStep: string | null;
  notes: string | null;
  pinned: boolean;
  lowEnergyPreferred: boolean;
  difficulty?: TaskDifficulty; // 难度（决定完成可得积分，缺省视为简单）
  awardedPoints?: number; // 本次完成实际发放的分数（撤销时按此原额扣回）
  awardedHard?: number; // 本次完成实际发放的「困难分」部分（撤销时按此原额扣回）
  crossScope?: boolean; // 跨框架（显示用，生成时以模板为准）：工作日/周末都出现
  sortOrder: number;
  sopName: string | null;
  recurrenceType: RecurrenceType;
  createdAt: number;
  updatedAt: number;
}

/** 用户偏好，对应 18.4 */
export interface UserPreferences {
  id: 'prefs'; // 单例
  timezone: string;
  weekStartsOn: number; // 0=周日...6=周六，默认 1（周一）
  theme: 'light';
  reducedMotion: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  lowEnergyDefaultOff: boolean; // 第二天默认恢复正常视图
}

/** 低能量模式状态，对应 18.5 —— 不覆盖/删除原始任务 */
export interface LowEnergyState {
  id: string; // = localDate
  localDate: string;
  enabled: boolean;
  shownTaskIds: string[]; // 当天展示的任务（精选）
  manualReplacedIds: string[]; // 用户手动替换的任务
}

/** 奖品（积分池条目） */
export interface Prize {
  id: string;
  title: string;
  cost: number; // 兑换所需积分
  emoji: string; // 展示用图标，默认 🎁
  note: string | null;
  tier?: 'normal' | 'milestone'; // 普通奖励 / 里程碑（大目标，可设困难分门槛）
  hardRatioRequired?: number; // 里程碑专属：兑换时「困难分占比」需达到的最低比例（0–1）
  createdAt: number;
}

/** 积分流水事件 */
export interface PointEvent {
  id: string;
  type: 'earn' | 'redeem';
  amount: number; // earn：+N / 撤销 -N；redeem：-cost
  reason: string;
  at: number;
  hard?: number; // earn 事件中来自「中等/困难」任务的分数（用于里程碑门槛统计）
}

/** 积分状态（单例 id='main'） */
export interface PointsState {
  id: 'main';
  total: number; // 当前可用积分
  earned: number; // 累计获得（含已兑换消耗前的总 earned）
  hardEarned?: number; // 累计来自中等/困难任务的分数（里程碑门槛统计用）
  targetPrizeId?: string | null; // 当前正在攒的目标奖品（里程碑）
  prizes: Prize[];
  history: PointEvent[];
}

/** 应用整体持久化数据结构 */
export interface AppData {
  sops: Sop[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
  prefs: UserPreferences;
  lowEnergy: LowEnergyState[];
  points: PointsState;
  onboarded: boolean;
}
