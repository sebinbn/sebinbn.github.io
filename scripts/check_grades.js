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
exams = 50
[exam_weights]
exam1 = 25
exam2 = 25
[assignment_counts]
homework = 10
quizzes = 8
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
  assert(p.weights.length === 5 && p.exams.length === 2, 'Combined Exam category and two individual weights parsed');
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
  const changed = api.parsePolicy(policyText.replace('A = 93', 'A = 95').replace('exam1 = 25', 'exam1 = 35').replace('exams = 50', 'exams = 60').replace('homework = 20', 'homework = 10'));
  assert(api.letter(94, changed) === 'A-', 'Edited cutoff changes the grade');
  const changedRows = [...changed.weights.filter(item => item.key !== 'exams'), ...changed.exams].map(item => row(item.weight, 100, item.key === 'exam1' ? 100 : 0));
  close(api.calculate(changedRows, 90).projected, 35, 'Edited weights change calculations');
  const extra = api.parsePolicy(policyText.replace('homework = 20', 'homework = 10\nlab_work = 10'));
  assert(extra.weights.some(item => item.key === 'lab_work' && item.weight === 10), 'Additional category supported');
  const disabled = api.parsePolicy(policyText.replace('participation = 5', 'participation = 0').replace('homework = 20', 'homework = 25'));
  assert(disabled.weights.some(item => item.key === 'participation' && item.weight === 0), 'Zero weight supported');
  assert(api.componentLabel('homework', p) === 'Homework (10 homework)', 'Homework heading includes explicit assignment count');
  assert(api.componentLabel('quizzes', p) === 'Quizzes (8 quizzes)', 'Quiz heading includes explicit assignment count');
  assert(api.componentLabel('exams', p) === 'Exam', 'Single overview Exam label');
  const overview = api.visibleWeights(disabled);
  assert(!overview.some(item => item.key === 'participation'), 'Zero-weight component hidden in overview and inputs');
  assert(overview.filter(item => item.key === 'exams').length === 1 && !overview.some(item => item.key === 'exam1'), 'One combined exam row');
  close(api.countCompletion(0, 10), 0, 'No completed homework');
  close(api.countCompletion(3, 10), 30, 'Partial homework completion');
  close(api.countCompletion(8, 8), 100, 'All quizzes completed');
  close(api.countCompletion(3, 12), 25, 'Updated total changes completion');
  for (const completed of [-1, 11, 1.5, null, NaN]) {
    rejects(() => api.countCompletion(completed, 10), 'Reject invalid completed count: ' + completed);
  }
  rejects(() => api.countCompletion(0, 0), 'Draft zero total cannot be used for calculations');
  rejects(() => api.countCompletion(1, 2.5), 'Reject noninteger total');
  const counted = api.calculate([row(20, api.countCompletion(3, 10), 80, 90), row(80, 0, null, 100)], 90);
  close(counted.completed, 6, 'Count completion converted to completed course weight');
  close(counted.projected, 97.4, 'Count-based projection');
  const ungraded = api.examRow(25, 80, false, false);
  assert(ungraded.completion === 0 && ungraded.average === null && ungraded.future === 80, 'Ungraded score is future assumption');
  const graded = api.examRow(25, 80, true, true);
  assert(graded.completion === 100 && graded.average === 80 && graded.future === null && !graded.fixed, 'Graded score no longer a fixed future assumption');
  assert(api.examRow(25, 0, true, false).average === 0, 'Graded zero retained');
  assert(api.examRow(25, null, false, false).future === null, 'Blank future exam remains unknown');
  rejects(() => api.examRow(25, null, true, false), 'Blank graded exam rejected');
  const twoExams = [api.examRow(40, 80, true, false), api.examRow(60, 90, false, false)];
  const examResult = api.calculate(twoExams, 90);
  close(examResult.current, 80, 'Only graded exam contributes to current grade');
  close(examResult.completed, 40, 'Unequal exam weight contributes independently');
  close(examResult.projected, 86, 'Single-box exam assumption contributes to projection');
  close(examResult.required, 96.66666666666667, 'Target planner uses remaining exam weight');
  assert(api.calculate([api.examRow(40, 80, true, false), api.examRow(60, 90, false, true)], 90).targetState === 'no-adjustable', 'Fixed future exam used for target');
  const readyText = policyText.replace('policy_status = draft', 'policy_status = ready');
  const placeholders = policyText.replace('homework = 10', 'homework = 0').replace('quizzes = 8', 'quizzes = 0');
  assert(api.parsePolicy(placeholders).counts.homework === 0, 'Draft policies allow zero placeholder totals');
  rejects(() => api.parsePolicy(placeholders.replace('policy_status = draft', 'policy_status = ready')), 'Ready policies reject placeholders');
  for (const [before, after] of [
    ['homework = 10', 'homework = -1'],
    ['quizzes = 8', 'quizzes = 1.5'],
    ['quizzes = 8', 'quizzes = many'],
    ['homework = 10', 'homework = 9007199254740992'],
    ['quizzes = 8', 'labs = 8'],
    ['[assignment_counts]', '[missing_counts]'],
    ['exam2 = 25', 'exam2 = 24'],
    ['exam2 = 25', 'exam3 = 25'],
    ['exams = 50', 'exam1 = 50'],
    ['[exam_weights]', '[missing_exam_weights]']
  ]) rejects(() => api.parsePolicy(readyText.replace(before, after)), 'Reject invalid counts or exam config: ' + after);
  const changedCountPolicy = api.parsePolicy(readyText.replace('homework = 10', 'homework = 12'));
  assert(api.componentLabel('homework', changedCountPolicy) === 'Homework (12 homework)', 'Policy edit changes heading');
  const noHomework = readyText.replace('homework = 20', 'homework = 0').replace('participation = 5', 'participation = 25').replace('homework = 10', 'homework = 0');
  assert(!api.visibleWeights(api.parsePolicy(noHomework)).some(item => item.key === 'homework'), 'Zero-weight homework may have zero count and stays hidden');
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
