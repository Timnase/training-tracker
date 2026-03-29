// ===== STORAGE & DATA =====
const STORAGE_KEY = 'training_tracker_v1';
const CURRENT_WO_KEY = 'training_tracker_current_v1';

function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { plans: [], activePlanId: null, workouts: [] };
  } catch { return { plans: [], activePlanId: null, workouts: [] }; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getCurrentWorkout() {
  try {
    const raw = localStorage.getItem(CURRENT_WO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCurrentWorkout(wo) {
  if (wo) localStorage.setItem(CURRENT_WO_KEY, JSON.stringify(wo));
  else localStorage.removeItem(CURRENT_WO_KEY);
}

// ===== UTILITIES =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(str) {
  if (!str && str !== 0) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function today() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getActivePlan() {
  const data = getData();
  return data.plans.find(p => p.id === data.activePlanId) || null;
}

function getLastWorkout(planId) {
  const { workouts } = getData();
  const filtered = planId ? workouts.filter(w => w.planId === planId) : workouts;
  return filtered.sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

function getLastExerciseLog(exerciseId) {
  const { workouts } = getData();
  const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const wo of sorted) {
    const ex = wo.exercises.find(e => e.exerciseId === exerciseId);
    if (ex && ex.sets.length > 0) return { workout: wo, exLog: ex };
  }
  return null;
}

function formatLastPerf(exLog) {
  if (!exLog) return 'No previous data';
  const sets = exLog.sets;
  if (!sets.length) return 'No previous data';
  const parts = sets.map((s, i) => {
    let str = `S${i + 1}: `;
    if (s.weight !== null && s.weight !== '') str += `${s.weight}kg × `;
    str += `${s.reps || '?'} reps`;
    if (s.difficulty) str += ` (${s.difficulty})`;
    return str;
  });
  return parts.join(' · ');
}

function groupExercises(exercises) {
  // Returns array of groups: {type: 'single'|'superset', exercises: [...]}
  const groups = [];
  const seen = new Set();
  for (const ex of exercises) {
    if (seen.has(ex.id)) continue;
    seen.add(ex.id);
    if (ex.supersetGroupId) {
      const partners = exercises.filter(e => e.supersetGroupId === ex.supersetGroupId);
      partners.forEach(p => seen.add(p.id));
      groups.push({ type: 'superset', exercises: partners });
    } else {
      groups.push({ type: 'single', exercises: [ex] });
    }
  }
  return groups;
}

// ===== STATE =====
let currentPage = 'dashboard';
let pageParams = {};

// ===== ROUTER =====
function navigate(page, params = {}) {
  currentPage = page;
  pageParams = params;
  const navPages = ['dashboard', 'plans', 'log', 'history', 'settings'];
  document.querySelectorAll('#bottom-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  render();
}

// ===== RENDER =====
function render() {
  const content = document.getElementById('content');
  const title = document.getElementById('page-title');
  const backBtn = document.getElementById('header-back-btn');
  const actionBtn = document.getElementById('header-action-btn');
  backBtn.classList.add('hidden');
  actionBtn.classList.add('hidden');
  actionBtn.innerHTML = '';
  actionBtn.onclick = null;

  const pages = {
    dashboard: () => { title.textContent = 'Training Tracker'; renderDashboard(content); },
    plans: () => {
      title.textContent = 'My Plans';
      actionBtn.classList.remove('hidden');
      actionBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      actionBtn.onclick = () => showNewPlanModal();
      renderPlans(content);
    },
    'plan-edit': () => {
      const plan = getData().plans.find(p => p.id === pageParams.planId);
      title.textContent = plan ? plan.name : 'Edit Plan';
      backBtn.classList.remove('hidden');
      backBtn.onclick = () => navigate('plans');
      actionBtn.classList.remove('hidden');
      actionBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      actionBtn.onclick = () => showAddExerciseModal(pageParams.planId);
      renderPlanEdit(content, pageParams.planId);
    },
    log: () => { title.textContent = 'Log Workout'; renderLog(content); },
    history: () => { title.textContent = 'History'; renderHistory(content); },
    settings: () => { title.textContent = 'Settings'; renderSettings(content); },
  };

  content.innerHTML = '';
  content.className = 'page-enter';
  (pages[currentPage] || pages.dashboard)();
}

// ===== DASHBOARD =====
function renderDashboard(content) {
  const activePlan = getActivePlan();
  const lastWo = getLastWorkout(null);
  const { workouts } = getData();

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekCount = workouts.filter(w => new Date(w.date) >= weekStart).length;
  const monthCount = workouts.filter(w => new Date(w.date) >= monthStart).length;

  let html = `<div class="dash-greeting"><h2>Hey, ready to train? 💪</h2><p>${today()}</p></div>`;

  if (activePlan) {
    html += `
    <div class="page-section" style="padding-top:0">
      <div class="card active-plan-card">
        <div class="card-label">Active Plan</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <div style="font-size:17px;font-weight:800;color:var(--text)">${esc(activePlan.name)}</div>
            <div style="font-size:13px;color:var(--text-3);margin-top:2px">${activePlan.exercises.length} exercise${activePlan.exercises.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <button class="start-workout-btn" onclick="navigate('log')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Start Workout
        </button>
      </div>
    </div>`;
  } else {
    html += `
    <div class="page-section" style="padding-top:0">
      <div class="card no-plan-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <h3>No active plan</h3>
        <p>Create a workout plan to get started</p>
        <button class="btn btn-primary btn-full" onclick="navigate('plans')">Create a Plan</button>
      </div>
    </div>`;
  }

  html += `
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${weekCount}</div><div class="stat-label">This Week</div></div>
    <div class="stat-card"><div class="stat-num">${monthCount}</div><div class="stat-label">This Month</div></div>
  </div>`;

  if (lastWo) {
    const feelingLabel = { tired: '😴 Tired', normal: '😐 Normal', energized: '⚡ Energized' };
    const exSummary = lastWo.exercises.slice(0, 3).map(e => {
      const best = e.sets[0];
      let s = `<div class="lw-ex"><span>${esc(e.exerciseName)}</span>`;
      if (best) {
        if (best.weight) s += ` · ${best.weight}kg × ${best.reps || '?'}`;
        else if (best.reps) s += ` · ${best.reps} reps`;
      }
      s += `</div>`;
      return s;
    }).join('');

    html += `
    <div class="page-section" style="padding-top:0">
      <div class="card last-workout-card">
        <div class="card-label">Last Workout</div>
        <div class="lw-row">
          <div>
            <div class="lw-date">${formatDate(lastWo.date)}</div>
            <div class="lw-plan">${esc(lastWo.planName)}</div>
          </div>
          ${lastWo.feeling ? `<div class="feeling-tag ${lastWo.feeling}">${feelingLabel[lastWo.feeling] || lastWo.feeling}</div>` : ''}
        </div>
        ${lastWo.cardio ? `<div style="font-size:13px;color:var(--text-2);margin-top:6px">🏃 ${esc(lastWo.cardio.type)} · ${lastWo.cardio.duration} min</div>` : ''}
        <div class="lw-exercises">${exSummary}</div>
        ${lastWo.exercises.length > 3 ? `<div style="font-size:12px;color:var(--text-3);margin-top:4px">+${lastWo.exercises.length - 3} more exercises</div>` : ''}
      </div>
    </div>`;
  }

  content.innerHTML = html;
}

// ===== PLANS PAGE =====
function renderPlans(content) {
  const { plans, activePlanId } = getData();
  if (!plans.length) {
    content.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <h3>No plans yet</h3>
      <p>Tap the + button to create your first workout plan</p>
      <button class="btn btn-primary" onclick="showNewPlanModal()">Create Plan</button>
    </div>`;
    return;
  }

  const html = plans.map(p => {
    const isActive = p.id === activePlanId;
    const exCount = p.exercises.length;
    return `
    <div class="plan-card">
      ${isActive ? '<div class="active-dot"></div>' : '<div style="width:8px"></div>'}
      <div class="plan-card-info" onclick="navigate('plan-edit', {planId:'${p.id}'})" style="cursor:pointer">
        <div class="plan-card-name">${esc(p.name)}</div>
        <div class="plan-card-meta">${exCount} exercise${exCount !== 1 ? 's' : ''}${isActive ? ' · Active' : ''}</div>
      </div>
      <div class="plan-card-actions">
        <button class="set-active-btn ${isActive ? 'is-active' : ''}" onclick="setActivePlan('${p.id}')">${isActive ? '✓ Active' : 'Set Active'}</button>
        <button class="icon-btn" onclick="navigate('plan-edit', {planId:'${p.id}'})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="plans-list">${html}</div>`;
}

function setActivePlan(planId) {
  const data = getData();
  data.activePlanId = planId;
  saveData(data);
  render();
}

function showNewPlanModal() {
  openModal('New Plan', `
    <div class="form-group">
      <label class="form-label">Plan Name</label>
      <input class="form-input" id="new-plan-name" placeholder="e.g. Plan A – Lower Body" autofocus>
    </div>
    <button class="btn btn-primary btn-full mt-8" onclick="createPlan()">Create Plan</button>
  `);
  setTimeout(() => document.getElementById('new-plan-name')?.focus(), 100);
}

function createPlan() {
  const name = document.getElementById('new-plan-name')?.value.trim();
  if (!name) { alert('Please enter a plan name'); return; }
  const data = getData();
  const plan = { id: uid(), name, exercises: [] };
  data.plans.push(plan);
  if (!data.activePlanId) data.activePlanId = plan.id;
  saveData(data);
  closeModal();
  navigate('plan-edit', { planId: plan.id });
}

// ===== PLAN EDITOR =====
function renderPlanEdit(content, planId) {
  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  if (!plan) { navigate('plans'); return; }

  const groups = groupExercises(plan.exercises);

  let html = `<div class="plan-editor">`;

  // Rename
  html += `
  <div class="card mb-8" style="margin-bottom:12px">
    <div class="card-label">Plan Name</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="form-input" id="plan-name-input" value="${esc(plan.name)}" style="flex:1">
      <button class="btn btn-ghost btn-sm" onclick="renamePlan('${planId}')">Save</button>
    </div>
  </div>`;

  if (!plan.exercises.length) {
    html += `
    <div style="text-align:center;padding:32px 0">
      <div style="font-size:36px;margin-bottom:10px">🏋️</div>
      <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">No exercises yet</div>
      <div style="font-size:14px;color:var(--text-2);margin-bottom:16px">Tap + to add your first exercise</div>
      <button class="btn btn-primary" onclick="showAddExerciseModal('${planId}')">Add Exercise</button>
    </div>`;
  } else {
    html += `<div class="section-title" style="margin-bottom:10px">Exercises</div>`;
    html += `<div id="exercise-list">`;
    groups.forEach(g => {
      if (g.type === 'superset') {
        html += `
        <div style="border:1.5px solid var(--primary);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:8px">
          <div style="background:var(--primary-light);padding:6px 12px;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--primary)">⚡ Superset</span>
          </div>`;
        g.exercises.forEach(ex => {
          html += renderExItem(ex, planId, plan.exercises);
        });
        html += `</div>`;
      } else {
        html += renderExItem(g.exercises[0], planId, plan.exercises);
      }
    });
    html += `</div>`;
  }

  html += `
  <div style="margin-top:16px">
    <button class="btn btn-outline btn-full" onclick="showAddExerciseModal('${planId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Exercise
    </button>
  </div>
  <div style="margin-top:10px">
    <button class="btn btn-danger btn-full btn-sm" onclick="deletePlan('${planId}')">Delete Plan</button>
  </div>
  </div>`;

  content.innerHTML = html;
}

function renderExItem(ex, planId, allExercises) {
  const hasSupersetPartner = !!ex.supersetGroupId;
  return `
  <div class="ex-item" style="border-radius:0;border:none;border-bottom:1px solid var(--border);last-child:border-bottom:0">
    <div class="ex-item-info">
      <div class="ex-item-name">${esc(ex.name)}</div>
      <div class="ex-item-meta">${ex.defaultSets || 3} sets · ${ex.defaultReps || '8-12'} reps</div>
    </div>
    <div class="ex-item-actions">
      <button class="icon-btn" onclick="showEditExerciseModal('${planId}','${ex.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn" onclick="deleteExercise('${planId}','${ex.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>
    </div>
  </div>`;
}

function renamePlan(planId) {
  const name = document.getElementById('plan-name-input')?.value.trim();
  if (!name) return;
  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  if (plan) { plan.name = name; saveData(data); render(); }
}

function showAddExerciseModal(planId) {
  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  if (!plan) return;

  const supersetOptions = plan.exercises
    .filter(e => !e.supersetGroupId)
    .map(e => `<option value="${e.id}">${esc(e.name)}</option>`)
    .join('');

  openModal('Add Exercise', `
    <div class="form-group">
      <label class="form-label">Exercise Name</label>
      <input class="form-input" id="ex-name" placeholder="e.g. Hip Thrust" autofocus>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" class="form-group">
      <div>
        <label class="form-label">Default Sets</label>
        <input class="form-input" id="ex-sets" type="number" placeholder="3" min="1">
      </div>
      <div>
        <label class="form-label">Default Reps</label>
        <input class="form-input" id="ex-reps" placeholder="8-12">
      </div>
    </div>
    ${supersetOptions ? `
    <div class="form-group">
      <label class="form-label">Superset with (optional)</label>
      <select class="form-input" id="ex-superset">
        <option value="">None – standalone exercise</option>
        ${supersetOptions}
      </select>
    </div>` : ''}
    <button class="btn btn-primary btn-full" onclick="addExercise('${planId}')">Add Exercise</button>
  `);
  setTimeout(() => document.getElementById('ex-name')?.focus(), 100);
}

function showEditExerciseModal(planId, exId) {
  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  const ex = plan?.exercises.find(e => e.id === exId);
  if (!ex) return;

  openModal('Edit Exercise', `
    <div class="form-group">
      <label class="form-label">Exercise Name</label>
      <input class="form-input" id="ex-name" value="${esc(ex.name)}" autofocus>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" class="form-group">
      <div>
        <label class="form-label">Default Sets</label>
        <input class="form-input" id="ex-sets" type="number" value="${ex.defaultSets || 3}" min="1">
      </div>
      <div>
        <label class="form-label">Default Reps</label>
        <input class="form-input" id="ex-reps" value="${ex.defaultReps || '8-12'}">
      </div>
    </div>
    <button class="btn btn-primary btn-full mt-8" onclick="updateExercise('${planId}','${exId}')">Save Changes</button>
    <button class="btn btn-danger btn-full mt-8 btn-sm" onclick="deleteExercise('${planId}','${exId}',true)">Delete Exercise</button>
  `);
}

function addExercise(planId) {
  const name = document.getElementById('ex-name')?.value.trim();
  if (!name) { alert('Please enter an exercise name'); return; }
  const sets = parseInt(document.getElementById('ex-sets')?.value) || 3;
  const reps = document.getElementById('ex-reps')?.value.trim() || '8-12';
  const supersetWith = document.getElementById('ex-superset')?.value || '';

  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  if (!plan) return;

  let supersetGroupId = null;
  if (supersetWith) {
    const partner = plan.exercises.find(e => e.id === supersetWith);
    if (partner) {
      supersetGroupId = partner.supersetGroupId || uid();
      partner.supersetGroupId = supersetGroupId;
    }
  }

  plan.exercises.push({ id: uid(), name, defaultSets: sets, defaultReps: reps, supersetGroupId });
  saveData(data);
  closeModal();
  navigate('plan-edit', { planId });
}

function updateExercise(planId, exId) {
  const name = document.getElementById('ex-name')?.value.trim();
  if (!name) { alert('Please enter a name'); return; }
  const sets = parseInt(document.getElementById('ex-sets')?.value) || 3;
  const reps = document.getElementById('ex-reps')?.value.trim() || '8-12';

  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  const ex = plan?.exercises.find(e => e.id === exId);
  if (!ex) return;
  ex.name = name; ex.defaultSets = sets; ex.defaultReps = reps;
  saveData(data);
  closeModal();
  navigate('plan-edit', { planId });
}

function deleteExercise(planId, exId, fromModal = false) {
  if (!confirm('Delete this exercise?')) return;
  const data = getData();
  const plan = data.plans.find(p => p.id === planId);
  if (!plan) return;
  const ex = plan.exercises.find(e => e.id === exId);
  // If it was in a superset, check if partner should lose supersetGroupId
  if (ex?.supersetGroupId) {
    const remaining = plan.exercises.filter(e => e.id !== exId && e.supersetGroupId === ex.supersetGroupId);
    if (remaining.length === 1) remaining[0].supersetGroupId = null;
  }
  plan.exercises = plan.exercises.filter(e => e.id !== exId);
  saveData(data);
  if (fromModal) closeModal();
  navigate('plan-edit', { planId });
}

function deletePlan(planId) {
  if (!confirm('Delete this entire plan? This cannot be undone.')) return;
  const data = getData();
  data.plans = data.plans.filter(p => p.id !== planId);
  if (data.activePlanId === planId) data.activePlanId = data.plans[0]?.id || null;
  saveData(data);
  navigate('plans');
}

// ===== LOG WORKOUT =====
let currentWorkout = null;

function renderLog(content) {
  const activePlan = getActivePlan();
  if (!activePlan) {
    content.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <h3>No active plan</h3>
      <p>Go to Plans and create or activate a plan first</p>
      <button class="btn btn-primary" onclick="navigate('plans')">Go to Plans</button>
    </div>`;
    return;
  }

  // Init or restore current workout
  if (!currentWorkout || currentWorkout.planId !== activePlan.id) {
    const saved = getCurrentWorkout();
    if (saved && saved.planId === activePlan.id) {
      currentWorkout = saved;
    } else {
      currentWorkout = initWorkout(activePlan);
      saveCurrentWorkout(currentWorkout);
    }
  }

  const groups = groupExercises(activePlan.exercises);
  let html = `<div class="log-page">`;

  // Feeling
  html += `
  <div style="margin-bottom:16px">
    <div class="log-section-title">How do you feel today?</div>
    <div class="feeling-row">
      <button class="feeling-btn ${currentWorkout.feeling === 'tired' ? 'active' : ''}" data-feeling="tired" onclick="setFeeling('tired')">
        <span class="feeling-emoji">😴</span><span>Tired</span>
      </button>
      <button class="feeling-btn ${currentWorkout.feeling === 'normal' ? 'active' : ''}" data-feeling="normal" onclick="setFeeling('normal')">
        <span class="feeling-emoji">😐</span><span>Normal</span>
      </button>
      <button class="feeling-btn ${currentWorkout.feeling === 'energized' ? 'active' : ''}" data-feeling="energized" onclick="setFeeling('energized')">
        <span class="feeling-emoji">⚡</span><span>Energized</span>
      </button>
    </div>
  </div>`;

  // Cardio
  const hasCardio = currentWorkout.cardio !== null;
  html += `
  <div style="margin-bottom:16px">
    <div class="log-section-title">Cardio</div>
    <div class="cardio-toggle">
      <label for="cardio-toggle">Include cardio warmup</label>
      <label class="toggle-switch">
        <input type="checkbox" id="cardio-toggle" ${hasCardio ? 'checked' : ''} onchange="toggleCardio(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div id="cardio-inputs" style="${hasCardio ? '' : 'display:none'}">
      <div class="cardio-inputs">
        <div>
          <label class="form-label">Type</label>
          <input class="form-input" id="cardio-type" placeholder="Stairs, Treadmill..." value="${esc(currentWorkout.cardio?.type || '')}">
        </div>
        <div>
          <label class="form-label">Duration (min)</label>
          <input class="form-input" id="cardio-duration" type="number" placeholder="20" value="${currentWorkout.cardio?.duration || ''}">
        </div>
      </div>
    </div>
  </div>`;

  // Exercises
  html += `<div class="log-section-title">Exercises</div>`;

  groups.forEach(g => {
    if (g.type === 'superset') {
      html += `<div class="superset-block">
        <div class="superset-block-header">
          <span class="superset-block-title">⚡ Superset</span>
        </div>
        <div class="superset-exercises">`;
      g.exercises.forEach(ex => {
        html += renderLogExercise(ex, true);
      });
      html += `</div></div>`;
    } else {
      html += `<div class="exercise-block">${renderLogExercise(g.exercises[0], false)}</div>`;
    }
  });

  // Overall notes
  html += `
  <div style="margin-top:8px;margin-bottom:16px">
    <div class="log-section-title">Workout Notes</div>
    <textarea class="form-input" id="workout-notes" placeholder="General notes about today's session..." rows="2" onchange="updateWorkoutNotes(this.value)">${esc(currentWorkout.notes || '')}</textarea>
  </div>`;

  // Finish button
  html += `
  <button class="btn btn-primary btn-full" style="margin-bottom:16px;padding:16px;font-size:17px" onclick="finishWorkout()">
    ✓ Finish Workout
  </button>
  <button class="btn btn-ghost btn-full btn-sm" onclick="discardWorkout()">Discard Workout</button>
  </div>`;

  content.innerHTML = html;
}

function renderLogExercise(ex, inSuperset) {
  const lastData = getLastExerciseLog(ex.id);
  const lastWoDate = lastData ? `Last: ${formatDateShort(lastData.workout.date)}` : '';
  const lastPerf = lastData ? formatLastPerf(lastData.exLog) : 'First time — go for it!';

  // Get sets for this exercise in currentWorkout
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === ex.id);
  const sets = exLog ? exLog.sets : [];

  const setsHtml = sets.map((s, i) => renderSetRow(ex.id, i, s)).join('');

  const style = inSuperset ? 'padding:12px 16px;' : 'padding:12px 16px;';

  return `
  <div style="${style}">
    <div style="margin-bottom:8px">
      <div style="font-size:15px;font-weight:700;color:var(--text)">${esc(ex.name)}</div>
      ${lastWoDate ? `<div style="font-size:12px;color:var(--text-3);margin-top:2px">📅 ${lastWoDate} · ${lastPerf}</div>` : `<div style="font-size:12px;color:var(--text-3);margin-top:2px">${lastPerf}</div>`}
    </div>
    <div class="set-labels">
      <div class="set-label"></div>
      <div class="set-label">kg</div>
      <div class="set-label">reps</div>
      <div class="set-label">feel</div>
      <div class="set-label"></div>
    </div>
    <div id="sets-${ex.id}">${setsHtml}</div>
    <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px" onclick="addSet('${ex.id}')">
      + Add Set
    </button>
    <div style="margin-top:8px">
      <input class="form-input" style="font-size:13px;padding:8px 12px" placeholder="Notes for next time..."
        value="${esc(exLog?.note || '')}"
        onchange="updateExNote('${ex.id}', this.value)">
    </div>
  </div>
  ${inSuperset ? '<div class="superset-divider"></div>' : ''}`;
}

function renderSetRow(exId, index, set) {
  const diffButtons = ['easy', 'moderate', 'hard'].map(d =>
    `<button class="diff-btn ${set.difficulty === d ? 'active-' + d : ''}" onclick="setDifficulty('${exId}',${index},'${d}')">${d === 'easy' ? 'E' : d === 'moderate' ? 'M' : 'H'}</button>`
  ).join('');

  return `
  <div class="set-row" id="set-row-${exId}-${index}">
    <div class="set-num">${index + 1}</div>
    <input class="set-input" type="number" inputmode="decimal" placeholder="${getLastWeightForEx(exId, index) || '—'}"
      value="${set.weight !== null && set.weight !== undefined ? set.weight : ''}"
      onchange="updateSet('${exId}',${index},'weight',this.value)">
    <input class="set-input" type="number" inputmode="numeric" placeholder="${getLastRepsForEx(exId, index) || '—'}"
      value="${set.reps !== null && set.reps !== undefined ? set.reps : ''}"
      onchange="updateSet('${exId}',${index},'reps',this.value)">
    <div class="diff-row">${diffButtons}</div>
    <button class="set-delete-btn" onclick="removeSet('${exId}',${index})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>`;
}

function getLastWeightForEx(exId, setIndex) {
  const lastData = getLastExerciseLog(exId);
  if (!lastData) return null;
  const s = lastData.exLog.sets[setIndex];
  return s?.weight || null;
}

function getLastRepsForEx(exId, setIndex) {
  const lastData = getLastExerciseLog(exId);
  if (!lastData) return null;
  const s = lastData.exLog.sets[setIndex];
  return s?.reps || null;
}

function initWorkout(plan) {
  return {
    id: uid(),
    planId: plan.id,
    planName: plan.name,
    date: new Date().toISOString(),
    feeling: null,
    cardio: null,
    exercises: plan.exercises.map(ex => ({
      exerciseId: ex.id,
      exerciseName: ex.name,
      sets: Array.from({ length: ex.defaultSets || 3 }, () => ({ weight: null, reps: null, difficulty: null, note: '' })),
      note: ''
    })),
    notes: ''
  };
}

function setFeeling(feeling) {
  currentWorkout.feeling = feeling;
  saveCurrentWorkout(currentWorkout);
  document.querySelectorAll('.feeling-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.feeling === feeling);
  });
}

function toggleCardio(checked) {
  const inputs = document.getElementById('cardio-inputs');
  if (checked) {
    currentWorkout.cardio = { type: '', duration: null };
    inputs.style.display = '';
  } else {
    currentWorkout.cardio = null;
    inputs.style.display = 'none';
  }
  saveCurrentWorkout(currentWorkout);
}

function addSet(exId) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog) return;

  // Pre-fill from last performance
  const lastData = getLastExerciseLog(exId);
  const lastSet = lastData?.exLog.sets[exLog.sets.length] || null;
  exLog.sets.push({
    weight: lastSet?.weight ?? null,
    reps: lastSet?.reps ?? null,
    difficulty: null,
    note: ''
  });
  saveCurrentWorkout(currentWorkout);

  const container = document.getElementById(`sets-${exId}`);
  if (container) {
    const idx = exLog.sets.length - 1;
    const div = document.createElement('div');
    div.innerHTML = renderSetRow(exId, idx, exLog.sets[idx]);
    container.appendChild(div.firstElementChild);
  }
}

function removeSet(exId, index) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog || exLog.sets.length <= 1) return;
  exLog.sets.splice(index, 1);
  saveCurrentWorkout(currentWorkout);
  // Re-render sets
  const container = document.getElementById(`sets-${exId}`);
  if (container) {
    container.innerHTML = exLog.sets.map((s, i) => renderSetRow(exId, i, s)).join('');
  }
}

function updateSet(exId, index, field, value) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog || !exLog.sets[index]) return;
  exLog.sets[index][field] = field === 'weight' || field === 'reps' ? (value === '' ? null : parseFloat(value)) : value;
  saveCurrentWorkout(currentWorkout);
}

function setDifficulty(exId, index, difficulty) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog || !exLog.sets[index]) return;
  exLog.sets[index].difficulty = difficulty;
  saveCurrentWorkout(currentWorkout);
  const row = document.getElementById(`set-row-${exId}-${index}`);
  if (row) {
    row.querySelectorAll('.diff-btn').forEach(btn => {
      btn.className = 'diff-btn';
      const d = btn.textContent.trim();
      const map = { E: 'easy', M: 'moderate', H: 'hard' };
      if (map[d] === difficulty) btn.classList.add('active-' + difficulty);
    });
  }
}

function updateExNote(exId, note) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (exLog) exLog.note = note;
  saveCurrentWorkout(currentWorkout);
}

function updateWorkoutNotes(notes) {
  currentWorkout.notes = notes;
  saveCurrentWorkout(currentWorkout);
}

function syncCardioFromInputs() {
  if (currentWorkout.cardio !== null) {
    const type = document.getElementById('cardio-type')?.value.trim();
    const duration = parseFloat(document.getElementById('cardio-duration')?.value) || null;
    if (type || duration) currentWorkout.cardio = { type, duration };
  }
}

function finishWorkout() {
  syncCardioFromInputs();
  // Sync all text inputs
  document.querySelectorAll('#content input[onchange]').forEach(input => {
    input.dispatchEvent(new Event('change'));
  });
  document.querySelectorAll('#content textarea').forEach(ta => {
    ta.dispatchEvent(new Event('change'));
  });

  // Validate: at least one set with data
  const hasData = currentWorkout.exercises.some(e => e.sets.some(s => s.weight || s.reps));
  if (!hasData && !confirm('No sets logged yet. Save workout anyway?')) return;

  currentWorkout.date = new Date().toISOString();
  const data = getData();
  data.workouts.push(currentWorkout);
  saveData(data);
  saveCurrentWorkout(null);
  currentWorkout = null;
  navigate('dashboard');
}

function discardWorkout() {
  if (!confirm('Discard this workout? All logged data will be lost.')) return;
  saveCurrentWorkout(null);
  currentWorkout = null;
  navigate('dashboard');
}

// ===== HISTORY =====
function renderHistory(content) {
  const { workouts } = getData();
  if (!workouts.length) {
    content.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <h3>No workouts yet</h3>
      <p>Your completed workouts will appear here</p>
    </div>`;
    return;
  }

  const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const feelingLabel = { tired: '😴 Tired', normal: '😐 Normal', energized: '⚡ Energized' };

  const html = sorted.map((wo, idx) => {
    const exRows = wo.exercises.map(e => {
      const setsHtml = e.sets.map((s, si) => {
        let str = `Set ${si + 1}: `;
        if (s.weight) str += `${s.weight}kg × `;
        str += `${s.reps || '?'} reps`;
        return `<div class="hw-set">
          ${str}
          ${s.difficulty ? `<span class="hw-set-diff ${s.difficulty}">${s.difficulty}</span>` : ''}
        </div>`;
      }).join('');
      return `
      <div class="hw-detail-section">
        <div class="hw-ex-name">${esc(e.exerciseName)}</div>
        ${setsHtml}
        ${e.note ? `<div class="hw-note">💡 ${esc(e.note)}</div>` : ''}
      </div>`;
    }).join('');

    return `
    <div class="history-card">
      <div class="history-card-header" onclick="toggleHistoryCard(${idx})">
        <div class="hc-date">
          <div class="hc-date-main">${formatDate(wo.date)}</div>
          <div class="hc-date-sub">${esc(wo.planName)} · ${wo.exercises.length} exercises${wo.feeling ? ' · ' + (feelingLabel[wo.feeling] || wo.feeling) : ''}</div>
        </div>
        <div class="hc-chevron" id="chevron-${idx}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
      <div class="history-card-body" id="hc-body-${idx}">
        ${wo.cardio ? `<div style="font-size:13px;color:var(--text-2);margin-bottom:12px;padding:8px 12px;background:var(--surface-2);border-radius:8px">🏃 <strong>${esc(wo.cardio.type)}</strong> · ${wo.cardio.duration} min</div>` : ''}
        ${exRows}
        ${wo.notes ? `<div style="margin-top:8px;padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px;color:var(--text-2)">📝 ${esc(wo.notes)}</div>` : ''}
        <button class="btn btn-danger btn-sm btn-full" style="margin-top:12px" onclick="deleteWorkout('${wo.id}')">Delete Workout</button>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="history-list">${html}</div>`;
}

function toggleHistoryCard(idx) {
  const body = document.getElementById(`hc-body-${idx}`);
  const chevron = document.getElementById(`chevron-${idx}`);
  const isOpen = body.classList.toggle('open');
  chevron.classList.toggle('open', isOpen);
}

function deleteWorkout(woId) {
  if (!confirm('Delete this workout? This cannot be undone.')) return;
  const data = getData();
  data.workouts = data.workouts.filter(w => w.id !== woId);
  saveData(data);
  navigate('history');
}

// ===== SETTINGS =====
function renderSettings(content) {
  const { plans, activePlanId, workouts } = getData();
  const activeOptions = plans.map(p => `<option value="${p.id}" ${p.id === activePlanId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  content.innerHTML = `
  <div class="settings-page">
    <div class="settings-section-label">Active Plan</div>
    <div class="settings-section">
      <div class="settings-item">
        <div class="settings-item-icon purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title">Current Plan</div>
          <div class="settings-item-sub">Used when starting a workout</div>
        </div>
        <div class="settings-item-action">
          ${plans.length ? `<select class="form-input" style="padding:6px 10px;font-size:13px" onchange="setActivePlan(this.value)">${activeOptions}</select>` : `<span style="font-size:13px;color:var(--text-3)">No plans</span>`}
        </div>
      </div>
    </div>

    <div class="settings-section-label">Data</div>
    <div class="settings-section">
      <div class="settings-item" onclick="exportData()" style="cursor:pointer">
        <div class="settings-item-icon green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title">Export Data</div>
          <div class="settings-item-sub">${workouts.length} workouts saved · Download JSON backup</div>
        </div>
        <div class="settings-item-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--text-3)"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
      <div class="settings-item" style="cursor:pointer">
        <div class="settings-item-icon blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title">Import Data</div>
          <div class="settings-item-sub">Restore from a JSON backup</div>
        </div>
        <div class="settings-item-action">
          <label style="cursor:pointer">
            <input type="file" accept=".json" style="display:none" onchange="importData(event)">
            <span style="font-size:13px;font-weight:600;color:var(--primary)">Choose file</span>
          </label>
        </div>
      </div>
    </div>

    <div class="settings-section-label">Danger Zone</div>
    <div class="settings-section">
      <div class="settings-item" onclick="clearAllData()" style="cursor:pointer">
        <div class="settings-item-icon red">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title" style="color:var(--hard)">Clear All Data</div>
          <div class="settings-item-sub">Delete all workouts, plans, and settings</div>
        </div>
      </div>
    </div>
  </div>`;
}

function exportData() {
  const data = getData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.workouts || !data.plans) throw new Error('Invalid format');
      if (!confirm(`Import data? This will replace your current data (${data.workouts.length} workouts, ${data.plans.length} plans).`)) return;
      saveData(data);
      navigate('settings');
      alert('Data imported successfully!');
    } catch { alert('Invalid backup file. Please use a file exported from this app.'); }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Are you sure? This will permanently delete ALL your workout data and plans.')) return;
  if (!confirm('This cannot be undone. Delete everything?')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CURRENT_WO_KEY);
  currentWorkout = null;
  navigate('dashboard');
}

// ===== MODAL =====
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function closeModalOnOverlay(event) {
  if (event.target === document.getElementById('modal-overlay')) closeModal();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Bottom nav
  document.querySelectorAll('#bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Back button
  document.getElementById('header-back-btn').addEventListener('click', () => {
    if (currentPage === 'plan-edit') navigate('plans');
    else navigate('dashboard');
  });

  // Restore current workout if exists
  const saved = getCurrentWorkout();
  if (saved) currentWorkout = saved;

  // Initial render
  navigate('dashboard');
});
