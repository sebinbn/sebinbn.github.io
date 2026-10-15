/* Shared policy reader and calculations. No scores leave the browser. */
(function () {
  'use strict';
  const EPS = 1e-8;
  function parsePolicy(text) {
    const sections = new Map();
    let section;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const heading = line.match(/^\[([a-z_]+)\]$/);
      if (heading) {
        section = heading[1];
        if (!['course', 'weights', 'grade_cutoffs'].includes(section) || sections.has(section)) {
          throw new Error('Unknown or duplicate policy section: ' + section);
        }
        sections.set(section, new Map());
        continue;
      }
      const pair = line.match(/^([^=]+?)\s*=\s*(.+)$/);
      if (!section || !pair) throw new Error('Invalid policy line: ' + line);
      const key = pair[1].trim(), value = pair[2].trim();
      if (sections.get(section).has(key)) throw new Error('Duplicate setting: ' + key);
      sections.get(section).set(key, value);
    }
    if (sections.size !== 3) throw new Error('Policy needs course, weights, and grade_cutoffs sections.');
    const course = Object.fromEntries(sections.get('course'));
    if (Object.keys(course).some(key => !['code', 'term', 'policy_status'].includes(key)) ||
        !course.code || !course.term || !['draft', 'ready'].includes(course.policy_status)) {
      throw new Error('Course settings require code, term, and policy_status (draft or ready).');
    }
    const percentage = value => {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('Percentages must be numeric.');
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('Percentages must be from 0 to 100.');
      return number;
    };
    const weights = [...sections.get('weights')].map(([key, value]) => {
      if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('Component keys must use lowercase letters, numbers, and underscores.');
      return { key, weight: percentage(value) };
    });
    if (Math.abs(weights.reduce((sum, item) => sum + item.weight, 0) - 100) > EPS) {
      throw new Error('Component weights must total 100%.');
    }
    if (!weights.some(item => item.key === 'exam1') || !weights.some(item => item.key === 'exam2')) {
      throw new Error('Include exam1 and exam2 weights (zero is allowed).');
    }
    const cutoffs = [...sections.get('grade_cutoffs')].map(([label, value]) => ({ label, minimum: percentage(value) }));
    if (!cutoffs.length || cutoffs[cutoffs.length - 1].minimum !== 0 ||
        cutoffs.some((item, i) => i && item.minimum >= cutoffs[i - 1].minimum)) {
      throw new Error('Grade cutoffs must descend strictly and end at 0.');
    }
    return { course, weights, cutoffs };
  }
  function letter(score, policy) {
    return policy.cutoffs.find(item => score >= item.minimum).label;
  }
  function calculate(rows, target) {
    let earned = 0, completed = 0, projected = 0, projectionComplete = true;
    let fixedPoints = 0, adjustable = 0, remaining = 0;
    for (const row of rows) {
      for (const value of [row.weight, row.completion, row.average, row.future]) {
        if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error('Enter percentages from 0 to 100.');
      }
      if (row.completion === null) throw new Error('Enter a completion percentage for every category.');
      if (row.completion > 0 && row.average === null) throw new Error('Enter a current average for each category with completed work.');
      const done = row.weight * row.completion / 100;
      const left = row.weight - done;
      const points = done * (row.average ?? 0) / 100;
      completed += done;
      earned += points;
      remaining += left;
      if (left > EPS && row.future === null) projectionComplete = false;
      projected += points + left * (row.future ?? 0) / 100;
      if (left > EPS && row.fixed) {
        if (row.future === null) throw new Error('Enter a future score for each assumption fixed in the target planner.');
        fixedPoints += left * row.future / 100;
      } else adjustable += left;
    }
    const needed = target - earned - fixedPoints;
    let targetState, required = null;
    if (earned >= target - EPS) targetState = 'secured';
    else if (needed <= EPS) targetState = 'met-with-fixed';
    else if (adjustable <= EPS) targetState = 'no-adjustable';
    else {
      required = needed / adjustable * 100;
      targetState = required > 100 + EPS ? 'impossible' : 'required';
    }
    return { earned, completed, remaining, current: completed > EPS ? earned / completed * 100 : null,
      projected: projectionComplete ? projected : null, adjustable, required, targetState };
  }
  // Expose pure functions for lightweight checks without a test framework.
  const api = { parsePolicy, letter, calculate };
  if (typeof document === 'undefined') return api;

  function node(tag, text, parent, className) {
    const element = document.createElement(tag);
    if (text !== null) element.textContent = text;
    if (className) element.className = className;
    if (parent) parent.append(element);
    return element;
  }
  const labelFor = key => ({ exam1: 'Exam 1', exam2: 'Exam 2', participation: 'Class participation' }[key] ||
    key.replace(/_/g, ' ').replace(/^./, ch => ch.toUpperCase()));
  const fmt = value => value.toFixed(2) + '%';
  function policyTable(parent, caption, headers, rows) {
    const wrapper = node('div', null, parent, 'grade-table-wrap');
    const table = node('table', null, wrapper, 'table');
    node('caption', caption, table);
    const heading = node('tr', null, node('thead', null, table));
    headers.forEach(text => node('th', text, heading).scope = 'col');
    const body = node('tbody', null, table);
    rows.forEach(values => {
      const row = node('tr', null, body);
      values.forEach((value, i) => {
        const cell = node(i ? 'td' : 'th', value, row);
        if (!i) cell.scope = 'row';
      });
    });
  }
  async function mount(root) {
    const status = root.querySelector('.policy-status');
    let policy;
    try {
      const response = await fetch(root.dataset.policy, { cache: 'no-store' });
      if (!response.ok) throw new Error('The course policy file could not be loaded.');
      policy = parsePolicy(await response.text());
      if (policy.course.code !== root.dataset.course || policy.course.term !== root.dataset.term) {
        throw new Error('The policy does not match this course and term.');
      }
    } catch (error) {
      status.textContent = 'Calculator unavailable: ' + error.message + ' Please contact the instructor.';
      status.classList.add('grade-notice');
      return;
    }
    if (policy.course.policy_status === 'draft') {
      status.textContent = 'Calculator not yet available. This course policy contains placeholder values and is awaiting instructor verification. Refer to the syllabus for grading details.';
      status.classList.add('grade-notice');
      return;
    }
    status.textContent = 'Grading policy loaded for ' + policy.course.code + ' · ' + policy.course.term + '.';
    node('h2', 'Grading overview', root);
    const tables = node('div', null, root, 'grade-policy-tables');
    policyTable(tables, 'Course component weights', ['Component', 'Weight'], policy.weights.map(item => [labelFor(item.key), item.weight + '%']));
    policyTable(tables, 'Letter-grade minimums', ['Letter grade', 'Minimum score'], policy.cutoffs.map(item => [item.label, item.minimum + '%']));
    node('p', 'Enter all scores as percentages (0–100). Letter grades use unrounded scores; displayed percentages use two decimal places. This calculator uses weighted averages only, without dropped scores, extra credit, or exam replacement rules.', root);
    const form = node('form', null, root);
    form.addEventListener('submit', event => event.preventDefault());
    node('h2', 'Scores and future assumptions', form);
    node('p', 'For each category, enter the average on graded work and how much of that category’s grading weight is completed. For example, two of five equally weighted homeworks means 40% completed. With unequal point totals, use graded points possible divided by total category points possible. An average alone does not indicate completion.', form);
    node('p', 'Leave an ungraded exam blank; enter 0 for a recorded zero. Future scores are assumptions for your projected final grade. In the target planner, check “Fix for target” only for assumptions you want to hold constant; unchecked future scores are solved together as one required average.', form);
    const controls = [];
    function input(parent, caption, id, value = '') {
      const label = node('label', caption, parent);
      label.htmlFor = id;
      const element = node('input', null, parent);
      Object.assign(element, { id, type: 'number', min: '0', max: '100', step: 'any', value, inputMode: 'decimal' });
      element.defaultValue = value;
      return element;
    }
    for (const item of policy.weights.filter(item => item.weight > 0)) {
      const fieldset = node('fieldset', null, form, 'grade-component');
      node('legend', labelFor(item.key) + ' · ' + item.weight + '% of course', fieldset);
      const grid = node('div', null, fieldset, 'grade-fields');
      const exam = ['exam1', 'exam2'].includes(item.key);
      const average = input(node('div', null, grid), exam ? 'Recorded exam score (%)' : 'Current average (%)', item.key + '-average');
      const completion = exam ? null : input(node('div', null, grid), 'Category completed (%)', item.key + '-completion', '0');
      const future = input(node('div', null, grid), exam ? 'Assumed future exam score (%)' : 'Assumed average on remaining work (%)', item.key + '-future');
      const fixedLabel = node('label', null, fieldset, 'grade-fix');
      const fixed = node('input', null, fixedLabel);
      fixed.type = 'checkbox';
      fixedLabel.append(document.createTextNode(' Fix for target: ' + labelFor(item.key)));
      controls.push({ ...item, average, completion, future, fixed, exam });
    }
    node('h2', 'Your results', form);
    const gradePanel = node('section', null, form, 'grade-result');
    node('h3', 'Grade estimate', gradePanel);
    const current = node('p', null, gradePanel), projection = node('p', null, gradePanel);
    const targetPanel = node('section', null, form, 'grade-result');
    node('h3', 'Target-grade planner', targetPanel);
    node('label', 'Desired letter grade', targetPanel).htmlFor = 'target-grade';
    const select = node('select', null, targetPanel);
    select.id = 'target-grade';
    policy.cutoffs.forEach(item => {
      const option = node('option', item.label + ' (at least ' + item.minimum + '%)', select);
      option.value = item.minimum;
    });
    const targetResult = node('p', null, targetPanel);
    const error = node('p', null, form, 'grade-error');
    error.setAttribute('role', 'alert');
    // A short announcement avoids reading the entire form on every keystroke.
    const announcement = node('p', null, form, 'visually-hidden');
    announcement.setAttribute('role', 'status');
    const reset = node('button', 'Reset all scores', form, 'btn btn-outline-secondary');
    reset.type = 'reset';
    let timer;
    function update() {
      clearTimeout(timer);
      try {
        const read = el => el.value === '' ? null : Number(el.value);
        const rows = controls.map(item => {
          const average = read(item.average);
          const completion = item.exam ? (average === null ? 0 : 100) : read(item.completion);
          const left = completion !== null && completion < 100;
          item.future.disabled = !left;
          item.fixed.disabled = !left;
          return { weight: item.weight, average, completion, future: left ? read(item.future) : null, fixed: left && item.fixed.checked };
        });
        if (controls.some(item => [item.average, item.completion, item.future].some(el => el && !el.disabled && !el.validity.valid))) {
          throw new Error('Enter valid percentages from 0 to 100.');
        }
        const result = calculate(rows, Number(select.value));
        error.textContent = '';
        current.textContent = result.current === null ? 'Current grade: no completed work entered.' :
          'Current grade on completed work: ' + fmt(result.current) + ' (' + letter(result.current, policy) + '). Completed course weight: ' + fmt(result.completed) + '.';
        projection.textContent = result.projected === null ? 'Projected final grade: enter assumed scores for all remaining work.' :
          'Projected final grade: ' + fmt(result.projected) + ' (' + letter(result.projected, policy) + ').';
        const messages = {
          secured: 'This target is already secured by the completed scores, even with zero on remaining work.',
          'met-with-fixed': 'Your fixed future assumptions meet this target, even with zero on other remaining work. This depends on achieving those assumed scores.',
          'no-adjustable': result.remaining <= EPS ? 'All work is completed; this target was not reached.' : 'The fixed assumptions do not reach this target. Uncheck a remaining component or increase its assumed score.',
          impossible: 'This target would require more than 100% on the remaining adjustable work. Change the target or fixed assumptions.',
          required: 'Required average on remaining adjustable work: ' + (result.required === null ? '' : fmt(Math.min(100, result.required))) +
            '. This covers ' + fmt(result.adjustable) + ' of the course and assumes any fixed future scores are achieved.'
        };
        targetResult.textContent = messages[result.targetState];
        timer = setTimeout(() => { announcement.textContent = [current.textContent, projection.textContent, targetResult.textContent].join(' '); }, 400);
      } catch (problem) {
        error.textContent = problem.message;
        current.textContent = 'Current grade: resolve the input errors to calculate.';
        projection.textContent = 'Projected final grade: unavailable until inputs are valid.';
        targetResult.textContent = 'Resolve the input errors to calculate your target.';
        announcement.textContent = '';
      }
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('reset', () => setTimeout(update, 0));
    update();
  }
  document.querySelectorAll('.grade-calculator').forEach(mount);
})();
