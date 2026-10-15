/* Optional standalone checks: node scripts/check_grades.js. No dependencies. */
function checkGrades(api, policyText) {
  let checks = 0;
  function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
  }
  function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-8, message + ': ' + actual);
  }
  function rejects(action, message) {
    let rejected = false;
    try { action(); } catch (_) { rejected = true; }
    assert(rejected, message);
  }
  // Validate the real course file, then use a stable fixture for regression cases.
  api.parsePolicy(policyText);
  checks++;
  policyText = `[course]
code = ECON TEST
term = Test term
policy_status = draft
[weights]
homework = 20
quizzes = 10
projects = 15
participation = 5
exam1 = 25
exam2 = 25
[grade_cutoffs]
A = 93
A- = 90
B+ = 87
B = 83
B- = 80
C+ = 77
C = 73
C- = 70
D = 60
F = 0
`;
  const p = api.parsePolicy(policyText);
  assert(p.course.policy_status === 'draft', 'Example policy must stay draft');
  assert(p.weights.length === 6, 'All six components parsed');
  assert(api.parsePolicy(policyText.replace('policy_status = draft', 'policy_status = ready')).course.policy_status === 'ready', 'Ready policy supported');
  assert(api.letter(93, p) === 'A', 'Inclusive cutoff');
  assert(api.letter(92.9999, p) === 'A-', 'Cutoffs must not round up');
  assert(api.letter(0, p) === 'F', 'Lowest cutoff');
  assert(api.letter(100, p) === 'A', 'Maximum grade');
  const row = (weight, completion, average, future = null, fixed = false) => ({ weight, completion, average, future, fixed });
  const empty = api.calculate([row(100, 0, null)], 90);
  assert(empty.current === null && empty.projected === null, 'Blank work is not a zero');
  close(empty.required, 90, 'Target before any work');
  const partial = api.calculate([row(40, 50, 80, 90), row(30, 100, 90), row(30, 0, null, 100)], 90);
  close(partial.current, 86, 'Current grade normalizes completed weight');
  close(partial.completed, 50, 'Completion uses category weight');
  close(partial.projected, 91, 'Projected weighted grade');
  close(partial.required, 94, 'Required average ignores unchecked assumptions');
  const fixed = api.calculate([row(40, 50, 80, 90, true), row(30, 100, 90), row(30, 0, null, 100)], 90);
  close(fixed.required, 96.66666666666667, 'Fixed assumption reduces remaining adjustable weight');
  const zero = api.calculate([row(50, 100, 0), row(50, 0, null)], 90);
  close(zero.current, 0, 'Recorded zero counts as completed');
  assert(zero.targetState === 'impossible', 'Unreachable target');
  assert(api.calculate([row(100, 100, 80)], 80).targetState === 'secured', 'Completed target secured');
  assert(api.calculate([row(100, 100, 80)], 90).targetState === 'no-adjustable', 'All complete below target');
  assert(api.calculate([row(100, 0, null, 90, true)], 90).targetState === 'met-with-fixed', 'Conditional target met');
  assert(api.calculate([row(100, 0, null, 80, true)], 90).targetState === 'no-adjustable', 'All future scores fixed below target');
  close(api.calculate([row(100, 100, 80)], 90).projected, 80, 'Final grade when all work complete');
  assert(api.calculate([row(100, 50, 80, 0)], 40).targetState === 'secured', 'Secured with remaining zeros');
  close(api.calculate([row(100, 0, null)], 100).required, 100, 'Exactly 100 is feasible');
  rejects(() => api.calculate([row(100, 50, null)], 90), 'Missing average');
  rejects(() => api.calculate([row(100, null, 80)], 90), 'Missing completion');
  rejects(() => api.calculate([row(100, 0, null, null, true)], 90), 'Missing fixed assumption');
  rejects(() => api.calculate([row(100, 100, 101)], 90), 'Score above 100');
  rejects(() => api.calculate([row(100, 100, -1)], 90), 'Negative score');
  rejects(() => api.calculate([row(100, 100, NaN)], 90), 'Nonnumeric score');
  const invalid = [
    ['homework = 20', 'homework = 21'],
    ['homework = 20', 'homework = twenty'],
    ['homework = 20', 'homework = -20'],
    ['A- = 90', 'A- = 93'],
    ['F = 0', 'F = 1'],
    ['exam1 = 25', 'exam_1 = 25'],
    ['policy_status = draft', 'policy_status = published'],
    ['homework = 20', 'homework = 20\nhomework = 20'],
    ['[weights]', '[unknown]'],
    ['[weights]', '[course]'],
    ['[weights]', 'rounding = nearest\n[weights]']
  ];
  invalid.forEach(([before, after]) => rejects(() => api.parsePolicy(policyText.replace(before, after)), 'Reject malformed policy: ' + after));
  const changed = api.parsePolicy(policyText.replace('A = 93', 'A = 95').replace('exam1 = 25', 'exam1 = 35').replace('homework = 20', 'homework = 10'));
  assert(api.letter(94, changed) === 'A-', 'Edited cutoff changes the grade');
  const changedRows = changed.weights.map(item => row(item.weight, 100, item.key === 'exam1' ? 100 : 0));
  close(api.calculate(changedRows, 90).projected, 35, 'Edited weights change calculations');
  const extra = api.parsePolicy(policyText.replace('homework = 20', 'homework = 10\nlab_work = 10'));
  assert(extra.weights.some(item => item.key === 'lab_work' && item.weight === 10), 'Additional category supported');
  const disabled = api.parsePolicy(policyText.replace('participation = 5', 'participation = 0').replace('homework = 20', 'homework = 25'));
  assert(disabled.weights.some(item => item.key === 'participation' && item.weight === 0), 'Zero weight supported');
  return checks;
}
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const root = path.resolve(__dirname, '..');
  const api = vm.runInNewContext(fs.readFileSync(path.join(root, 'teaching/grade-calculator/calculator.js'), 'utf8'));
  let total = 0;
  for (const code of ['4325', '3320']) {
    total += checkGrades(api, fs.readFileSync(path.join(root, 'teaching/grade-policies/fall-2026/econ-' + code + '.txt'), 'utf8'));
  }
  console.log('Passed ' + total + ' grade policy and calculation checks.');
}
