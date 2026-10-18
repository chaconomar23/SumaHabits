/**
 * Pure business logic for SUMA+ HABITS
 * Scoring, calculations, penalties, and time utilities.
 */

export interface TimelineBlock {
  id: string;
  habitId: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  status: 'planned' | 'completed' | 'failed';
  isCritical?: boolean; // Eat the frog
  notes?: string;
}

export interface Habit {
  id: string;
  name: string;
  category: string;
  format: 'block' | 'micro';
  color: string;
  icon: string;
  points: number;
}

export interface ScreenLogItem {
  id: string;
  app: string;
  minutes: number;
}

export interface DayLog {
  blocks: TimelineBlock[];
  microHabitsCompleted: string[];
  routines?: {
    morning?: boolean[];
    night?: boolean[];
  };
  screenLogs: ScreenLogItem[];
  aiAudit?: string | null;
}

export interface Settings {
  screenBudgetMinutes: number;
  morningRoutineItems: string[];
  nightRoutineItems: string[];
  geminiApiKey?: string;
}

export function timeToMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(1439, totalMinutes));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function calculateScreenPenalty(totalScreenMinutes: number, budgetMinutes: number): number {
  if (totalScreenMinutes <= budgetMinutes) return 0;
  const excess = totalScreenMinutes - budgetMinutes;
  return Math.floor(excess / 15) * 5;
}

export function calculateEffectiveness(blocks: TimelineBlock[]): number {
  if (!blocks || blocks.length === 0) return 0;
  const completed = blocks.filter(b => b.status === 'completed').length;
  return Math.round((completed / blocks.length) * 100);
}

export function calculateFocusMinutes(blocks: TimelineBlock[]): number {
  if (!blocks) return 0;
  return blocks
    .filter(b => b.status === 'completed')
    .reduce((acc, b) => {
      const start = timeToMinutes(b.startTime);
      const end = timeToMinutes(b.endTime);
      const dur = end >= start ? end - start : 0;
      return acc + dur;
    }, 0);
}

export function calculateDailyScore(
  dayLog: DayLog,
  habitsMap: Record<string, Habit>,
  settings: Settings
): {
  totalScore: number;
  blockPoints: number;
  microPoints: number;
  routineBonus: number;
  screenPenalty: number;
  totalScreenMinutes: number;
  criticalTaskCompleted: boolean;
} {
  let blockPoints = 0;
  let criticalTaskCompleted = false;

  // 1. Blocks calculation: only 'completed' gives points; isCritical doubles points!
  (dayLog.blocks || []).forEach(b => {
    if (b.status === 'completed') {
      const habit = habitsMap[b.habitId];
      const basePoints = habit ? (habit.points || 10) : 10;
      if (b.isCritical) {
        criticalTaskCompleted = true;
        blockPoints += basePoints * 2;
      } else {
        blockPoints += basePoints;
      }
    }
  });

  // 2. Micro-habits calculation
  let microPoints = 0;
  (dayLog.microHabitsCompleted || []).forEach(id => {
    const habit = habitsMap[id];
    if (habit) {
      microPoints += (habit.points || 5);
    }
  });

  // 3. Routines bonus: +15 if 100% completed
  let routineBonus = 0;
  const morningList = settings.morningRoutineItems || [];
  const morningChecks = dayLog.routines?.morning || [];
  if (morningList.length > 0 && morningChecks.length >= morningList.length && morningChecks.every(Boolean)) {
    routineBonus += 15;
  }

  const nightList = settings.nightRoutineItems || [];
  const nightChecks = dayLog.routines?.night || [];
  if (nightList.length > 0 && nightChecks.length >= nightList.length && nightChecks.every(Boolean)) {
    routineBonus += 15;
  }

  // 4. Screen penalty
  const totalScreenMinutes = (dayLog.screenLogs || []).reduce((acc, l) => acc + (l.minutes || 0), 0);
  const screenPenalty = calculateScreenPenalty(totalScreenMinutes, settings.screenBudgetMinutes || 120);

  const totalScore = Math.max(0, blockPoints + microPoints + routineBonus - screenPenalty);

  return {
    totalScore,
    blockPoints,
    microPoints,
    routineBonus,
    screenPenalty,
    totalScreenMinutes,
    criticalTaskCompleted,
  };
}

export function hasBlockOverlap(
  newStart: string,
  newEnd: string,
  existingBlocks: TimelineBlock[],
  ignoreBlockId?: string
): boolean {
  const nStart = timeToMinutes(newStart);
  const nEnd = timeToMinutes(newEnd);
  if (nEnd <= nStart) return true; // Invalid range

  return existingBlocks.some(b => {
    if (ignoreBlockId && b.id === ignoreBlockId) return false;
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);
    // Two intervals [A, B) and [C, D) overlap if A < D and C < B
    return nStart < bEnd && bStart < nEnd;
  });
}
