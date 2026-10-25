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
  areAllObjectivesCompleted,
  syncBlockStatusWithObjectives,
  validateAppRegistrationQuota,
  calculateCustomRoutinesBonus,
  DEFAULT_CATALOG_APPS,
} from './scoring.ts';
import type {
  Habit,
  DayLog,
  Settings,
  TimelineBlock,
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
  assert.equal(calculateScreenPenalty(134, 120), 0);
  assert.equal(calculateScreenPenalty(135, 120), 5);
  assert.equal(calculateScreenPenalty(150, 120), 10);
  assert.equal(calculateScreenPenalty(180, 120), 20);
});

test('calculateEffectiveness calculates percentage of completed blocks (requiring all objectives checked)', () => {
  assert.equal(calculateEffectiveness([]), 0);
  const blocks: TimelineBlock[] = [
    {
      id: '1',
      habitId: 'h1',
      startTime: '08:00',
      endTime: '09:00',
      status: 'completed',
      objectives: [
        { id: 'o1', text: 'Objetivo 1', completed: true },
        { id: 'o2', text: 'Objetivo 2', completed: true },
      ],
    },
    {
      id: '2',
      habitId: 'h2',
      startTime: '09:00',
      endTime: '10:00',
      status: 'completed',
      objectives: [
        { id: 'o3', text: 'Objetivo A', completed: true },
        { id: 'o4', text: 'Objetivo B', completed: false }, // Incomplete objective prevents completion!
      ],
    },
    { id: '3', habitId: 'h3', startTime: '10:00', endTime: '11:00', status: 'failed' },
    { id: '4', habitId: 'h4', startTime: '11:00', endTime: '12:00', status: 'completed' },
  ];
  assert.equal(calculateEffectiveness(blocks), 50);
});

test('syncBlockStatusWithObjectives requires all sub-objectives checked to complete a block', () => {
  const blockPartial: TimelineBlock = {
    id: 'b1',
    habitId: 'h1',
    startTime: '10:00',
    endTime: '11:00',
    status: 'planned',
    objectives: [
      { id: 'o1', text: 'Leer capítulo 1', completed: true },
      { id: 'o2', text: 'Tomar notas', completed: false },
    ],
  };

  assert.equal(areAllObjectivesCompleted(blockPartial.objectives), false);
  assert.equal(syncBlockStatusWithObjectives(blockPartial).status, 'planned');

  const blockAllChecked: TimelineBlock = {
    ...blockPartial,
    objectives: [
      { id: 'o1', text: 'Leer capítulo 1', completed: true },
      { id: 'o2', text: 'Tomar notas', completed: true },
    ],
  };

  assert.equal(areAllObjectivesCompleted(blockAllChecked.objectives), true);
  assert.equal(syncBlockStatusWithObjectives(blockAllChecked).status, 'completed');
});

test('calculateCustomRoutinesBonus awards +15 pts per completed user-created routine', () => {
  const routines = [
    { id: 'r_manana', name: 'Rutina de Mañana', items: ['Agua', 'Estiramiento'] },
    { id: 'r_cierre', name: 'Cierre Nocturno', items: ['Planear día', 'Modo avión'] },
  ];

  assert.equal(calculateCustomRoutinesBonus(routines, { r_manana: [true, true], r_cierre: [true, false] }), 15);
  assert.equal(calculateCustomRoutinesBonus(routines, { r_manana: [true, true], r_cierre: [true, true] }), 30);
});

test('validateAppRegistrationQuota enforces minimum 5 and maximum 10 apps', () => {
  assert.equal(DEFAULT_CATALOG_APPS.length, 13);
  assert.ok(DEFAULT_CATALOG_APPS.includes('TikTok'));
  assert.ok(DEFAULT_CATALOG_APPS.includes('NuBank'));
  assert.ok(DEFAULT_CATALOG_APPS.includes('Calendario'));
  assert.ok(DEFAULT_CATALOG_APPS.includes('Teléfono'));

  const q3 = validateAppRegistrationQuota(3);
  assert.equal(q3.isValidQuota, false);
  assert.equal(q3.remainingForMin, 2);
  assert.equal(q3.canAddMore, true);

  const q5 = validateAppRegistrationQuota(5);
  assert.equal(q5.isValidQuota, true);
  assert.equal(q5.remainingForMin, 0);
  assert.equal(q5.canAddMore, true);

  const q10 = validateAppRegistrationQuota(10);
  assert.equal(q10.isValidQuota, true);
  assert.equal(q10.canAddMore, false);
  assert.equal(q10.maxReached, true);
});

test('calculateFocusMinutes aggregates duration of completed blocks only', () => {
  const blocks: TimelineBlock[] = [
    { id: '1', habitId: 'h1', startTime: '08:00', endTime: '09:30', status: 'completed' }, // 90 min
    { id: '2', habitId: 'h2', startTime: '10:00', endTime: '11:00', status: 'planned' },   // 0 (planned)
    { id: '3', habitId: 'h3', startTime: '12:00', endTime: '13:15', status: 'completed' }, // 75 min
  ];
  assert.equal(calculateFocusMinutes(blocks), 165);
});

test('calculateDailyScore calculates points, Prioridad x2, micro-habits, custom routine bonus and screen penalty', () => {
  const habitsMap: Record<string, Habit> = {
    h1: { id: 'h1', name: 'Trabajo Profundo', category: 'estudio', format: 'block', color: '#6366f1', points: 20 },
    h2: { id: 'h2', name: 'Gimnasio', category: 'salud', format: 'block', color: '#10b981', points: 30 },
    m1: { id: 'm1', name: 'Tomar 500ml agua', category: 'salud', format: 'micro', color: '#38bdf8', points: 5 },
  };

  const dayLog: DayLog = {
    blocks: [
      { id: 'b1', habitId: 'h1', startTime: '08:00', endTime: '10:00', status: 'completed', isCritical: true }, // 20 * 2 = 40 pts
      { id: 'b2', habitId: 'h2', startTime: '17:00', endTime: '18:00', status: 'planned' }, // 0 pts
    ],
    microHabitsCompleted: ['m1'], // +5 pts
    customRoutineChecks: {
      r1: [true, true], // +15 pts
      r2: [true, false], // 0 pts
    },
    screenLogs: [
      { id: 's1', app: 'Instagram', minutes: 90 },
      { id: 's2', app: 'TikTok', minutes: 60 }, // Total = 150 min (30 min over 120 -> -10 pts)
    ],
  };

  const settings: Settings = {
    screenBudgetMinutes: 120,
    customRoutines: [
      { id: 'r1', name: 'Rutina Matutina', items: ['Agua', 'Sol'] },
      { id: 'r2', name: 'Rutina Nocturna', items: ['Sin pantallas', 'Lectura'] },
    ],
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
  const existing: TimelineBlock[] = [
    { id: 'b1', habitId: 'h1', startTime: '08:00', endTime: '10:00', status: 'planned' },
  ];

  assert.equal(hasBlockOverlap('07:30', '08:30', existing), true);
  assert.equal(hasBlockOverlap('09:00', '10:30', existing), true);
  assert.equal(hasBlockOverlap('08:30', '09:30', existing), true);
  assert.equal(hasBlockOverlap('07:00', '11:00', existing), true);

  assert.equal(hasBlockOverlap('07:00', '08:00', existing), false);
  assert.equal(hasBlockOverlap('10:00', '11:00', existing), false);
  assert.equal(hasBlockOverlap('08:00', '10:30', existing, 'b1'), false);
});

test('DARK_THEMES presets are all strictly dark mode and fallback works', async () => {
  const { DARK_THEMES, isDarkHexColor, getDarkThemeById } = await import('./scoring.ts');
  assert.equal(DARK_THEMES.length, 6);
  for (const theme of DARK_THEMES) {
    assert.equal(isDarkHexColor(theme.bgBody), true, `Theme ${theme.id} must have a dark background`);
  }
  assert.equal(getDarkThemeById('titanium_emerald').name, 'Esmeralda Titanio');
  assert.equal(getDarkThemeById('non_existent').id, 'obsidian_indigo');
});

