import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timeToMinutes,
  minutesToTime,
  calculateScreenPenalty,
  calculateEffectiveness,
  calculateFocusMinutes,
  calculateDailyScore,
  hasBlockOverlap,
} from './scoring.ts';
import type {
  Habit,
  DayLog,
  Settings,
} from './scoring.ts';

test('timeToMinutes and minutesToTime conversions', () => {
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('08:30'), 510);
  assert.equal(timeToMinutes('23:59'), 1439);

  assert.equal(minutesToTime(510), '08:30');
  assert.equal(minutesToTime(0), '00:00');
});

test('calculateScreenPenalty awards -5 points for every 15 min over budget', () => {
  assert.equal(calculateScreenPenalty(120, 120), 0);
  assert.equal(calculateScreenPenalty(110, 120), 0);
  assert.equal(calculateScreenPenalty(134, 120), 0); // 14 min over -> 0 penalty
  assert.equal(calculateScreenPenalty(135, 120), 5); // 15 min over -> 5 penalty
  assert.equal(calculateScreenPenalty(150, 120), 10); // 30 min over -> 10 penalty
  assert.equal(calculateScreenPenalty(180, 120), 20); // 60 min over -> 20 penalty
});

test('calculateEffectiveness calculates percentage of completed blocks', () => {
  assert.equal(calculateEffectiveness([]), 0);
  const blocks = [
    { id: '1', habitId: 'h1', startTime: '08:00', endTime: '09:00', status: 'completed' as const },
    { id: '2', habitId: 'h2', startTime: '09:00', endTime: '10:00', status: 'planned' as const },
    { id: '3', habitId: 'h3', startTime: '10:00', endTime: '11:00', status: 'failed' as const },
    { id: '4', habitId: 'h4', startTime: '11:00', endTime: '12:00', status: 'completed' as const },
  ];
  assert.equal(calculateEffectiveness(blocks), 50);
});

test('calculateFocusMinutes aggregates duration of completed blocks only', () => {
  const blocks = [
    { id: '1', habitId: 'h1', startTime: '08:00', endTime: '09:30', status: 'completed' as const }, // 90 min
    { id: '2', habitId: 'h2', startTime: '10:00', endTime: '11:00', status: 'planned' as const },   // 0 (planned)
    { id: '3', habitId: 'h3', startTime: '12:00', endTime: '13:15', status: 'completed' as const }, // 75 min
  ];
  assert.equal(calculateFocusMinutes(blocks), 165);
});

test('calculateDailyScore calculates points, Eat the Frog x2, micro-habits, routine bonus and screen penalty', () => {
  const habitsMap: Record<string, Habit> = {
    h1: { id: 'h1', name: 'Deep Work', category: 'estudio', format: 'block', color: '#6366f1', icon: '💻', points: 20 },
    h2: { id: 'h2', name: 'Gimnasio', category: 'salud', format: 'block', color: '#10b981', icon: '🏋️', points: 30 },
    m1: { id: 'm1', name: 'Tomar 500ml agua', category: 'salud', format: 'micro', color: '#38bdf8', icon: '💧', points: 5 },
  };

  const dayLog: DayLog = {
    blocks: [
      { id: 'b1', habitId: 'h1', startTime: '08:00', endTime: '10:00', status: 'completed', isCritical: true }, // 20 * 2 = 40 pts
      { id: 'b2', habitId: 'h2', startTime: '17:00', endTime: '18:00', status: 'planned' }, // 0 pts
    ],
    microHabitsCompleted: ['m1'], // +5 pts
    routines: {
      morning: [true, true], // 100% complete -> +15 pts
      night: [true, false],  // not 100% -> 0 pts
    },
    screenLogs: [
      { id: 's1', app: 'Instagram', minutes: 90 },
      { id: 's2', app: 'TikTok', minutes: 60 }, // Total = 150 min (30 min over 120 -> -10 pts)
    ],
  };

  const settings: Settings = {
    screenBudgetMinutes: 120,
    morningRoutineItems: ['Agua', 'Sol'],
    nightRoutineItems: ['Sin pantallas', 'Lectura'],
  };

  const result = calculateDailyScore(dayLog, habitsMap, settings);

  assert.equal(result.blockPoints, 40);
  assert.equal(result.microPoints, 5);
  assert.equal(result.routineBonus, 15);
  assert.equal(result.screenPenalty, 10);
  assert.equal(result.totalScore, 40 + 5 + 15 - 10); // 50 pts
  assert.equal(result.criticalTaskCompleted, true);
});

test('hasBlockOverlap correctly identifies colliding times', () => {
  const existing = [
    { id: 'b1', habitId: 'h1', startTime: '08:00', endTime: '10:00', status: 'planned' as const },
  ];

  // Overlaps
  assert.equal(hasBlockOverlap('07:30', '08:30', existing), true);
  assert.equal(hasBlockOverlap('09:00', '10:30', existing), true);
  assert.equal(hasBlockOverlap('08:30', '09:30', existing), true);
  assert.equal(hasBlockOverlap('07:00', '11:00', existing), true);

  // Non-overlapping (adjacent is permitted)
  assert.equal(hasBlockOverlap('07:00', '08:00', existing), false);
  assert.equal(hasBlockOverlap('10:00', '11:00', existing), false);

  // Ignore self on edit
  assert.equal(hasBlockOverlap('08:00', '10:30', existing, 'b1'), false);
});
