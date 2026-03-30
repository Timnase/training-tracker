// ===== SUPABASE =====
const SUPABASE_URL = 'https://nocyrpfxccjvwsarwcav.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vY3lycGZ4Y2NqdndzYXJ3Y2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTY2NjksImV4cCI6MjA5MDM3MjY2OX0.zSAQdPyZvbKalq725oFa6oK8hcCjmnoVsogDQdcDvhY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CURRENT_WO_KEY = 'tt_current_v2';

// ===== CACHE =====
let _cache = { plans: null, workouts: null, activePlanId: undefined };

function invalidate(key = 'all') {
  if (key === 'all') { _cache = { plans: null, workouts: null, activePlanId: undefined }; return; }
  _cache[key] = key === 'activePlanId' ? undefined : null;
}

// ===== DB FUNCTIONS =====
async function dbGetPlans() {
  const { data, error } = await sb.from('plans').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}

async function dbUpsertPlan(plan) {
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('plans').upsert({
    id: plan.id, user_id: user.id, name: plan.name, workouts: plan.workouts
  });
  if (error) throw error;
}

async function dbDeletePlan(planId) {
  const { error } = await sb.from('plans').delete().eq('id', planId);
  if (error) throw error;
}

async function dbGetWorkouts() {
  const { data, error } = await sb.from('workouts').select('*').order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function dbInsertWorkout(wo) {
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('workouts').insert({
    id: wo.id, user_id: user.id,
    plan_id: wo.planId, plan_name: wo.planName,
    workout_template_id: wo.workoutTemplateId,
    workout_template_name: wo.workoutTemplateName,
    date: wo.date, feeling: wo.feeling,
    cardio: wo.cardio, exercises: wo.exercises, notes: wo.notes
  });
  if (error) throw error;
}

async function dbDeleteWorkout(woId) {
  const { error } = await sb.from('workouts').delete().eq('id', woId);
  if (error) throw error;
}

async function dbGetActivePlanId() {
  const { data } = await sb.from('user_settings').select('active_plan_id').maybeSingle();
  return data?.active_plan_id || null;
}

async function dbSetActivePlanId(planId) {
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('user_settings').upsert({
    user_id: user.id, active_plan_id: planId, updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

// ===== CACHED GETTERS =====
async function getPlans() {
  if (_cache.plans) return _cache.plans;
  _cache.plans = await dbGetPlans();
  return _cache.plans;
}

async function getWorkouts() {
  if (_cache.workouts) return _cache.workouts;
  _cache.workouts = await dbGetWorkouts();
  return _cache.workouts;
}

async function getActivePlanId() {
  if (_cache.activePlanId !== undefined) return _cache.activePlanId;
  _cache.activePlanId = await dbGetActivePlanId();
  return _cache.activePlanId;
}

async function getActivePlan() {
  const planId = await getActivePlanId();
  if (!planId) return null;
  const plans = await getPlans();
  return plans.find(p => p.id === planId) || null;
}

// ===== UTILITIES =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function esc(str) {
  if (!str && str !== 0) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

function today() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function groupExercises(exercises) {
  const groups = [], seen = new Set();
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

function getLastExerciseLog(exerciseId, workouts) {
  for (const wo of workouts) {
    const ex = wo.exercises?.find(e => e.exerciseId === exerciseId);
    if (ex && ex.sets?.length > 0) return { workout: wo, exLog: ex };
  }
  return null;
}

function formatLastPerf(exLog) {
  if (!exLog) return 'First time — go for it!';
  return exLog.sets.map((s, i) => {
    let str = `S${i + 1}: `;
    if (s.weight) str += `${s.weight}kg × `;
    str += `${s.reps || '?'} reps`;
    if (s.difficulty) str += ` (${s.difficulty})`;
    return str;
  }).join(' · ');
}

function showSpinner() {
  document.getElementById('content').innerHTML = `
  <div style="display:flex;justify-content:center;align-items:center;height:50vh">
    <div class="spinner"></div>
  </div>`;
}

// ===== AUTH =====
let authMode = 'login';

function showAuth() {
  document.getElementById('bottom-nav').style.display = 'none';
  document.getElementById('top-header').style.display = 'none';
  document.getElementById('content').style.paddingBottom = '0';
  document.getElementById('content').innerHTML = `
  <div style="min-height:100dvh;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:var(--bg)">
    <div style="width:100%;max-width:360px">
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:52px;margin-bottom:12px">💪</div>
        <h1 style="font-size:26px;font-weight:800;color:var(--text)">Training Tracker</h1>
        <p style="font-size:14px;color:var(--text-2);margin-top:6px">Your personal workout companion</p>
      </div>
      <div class="card" style="padding:22px">
        <div id="auth-error" class="hidden" style="background:var(--hard-bg);color:var(--hard);border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:14px"></div>
        <h2 style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px" id="auth-title">Welcome back</h2>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="auth-email" type="email" placeholder="your@email.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" id="auth-password" type="password" placeholder="••••••••" autocomplete="current-password"
            onkeydown="if(event.key==='Enter') submitAuth()">
        </div>
        <button class="btn btn-primary btn-full" id="auth-btn" onclick="submitAuth()">Log In</button>
        <div style="text-align:center;margin-top:14px">
          <button style="font-size:13px;color:var(--primary);font-weight:600" onclick="toggleAuthMode()">
            <span id="auth-toggle-text">No account yet? Sign up</span>
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('auth-title').textContent = authMode === 'login' ? 'Welcome back' : 'Create your account';
  document.getElementById('auth-btn').textContent = authMode === 'login' ? 'Log In' : 'Sign Up';
  document.getElementById('auth-toggle-text').textContent = authMode === 'login' ? 'No account yet? Sign up' : 'Already have an account? Log in';
  document.getElementById('auth-error').classList.add('hidden');
}

async function submitAuth() {
  const email = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  if (!email || !password) return;

  const btn = document.getElementById('auth-btn');
  btn.textContent = '...';
  btn.disabled = true;

  const fn = authMode === 'login'
    ? sb.auth.signInWithPassword({ email, password })
    : sb.auth.signUp({ email, password });

  const { error } = await fn;
  if (error) {
    const errEl = document.getElementById('auth-error');
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    btn.textContent = authMode === 'login' ? 'Log In' : 'Sign Up';
    btn.disabled = false;
  }
  // onAuthStateChange handles the rest
}

// ===== STATE =====
let currentPage = 'dashboard';
let pageParams = {};

// ===== ROUTER =====
function updateNav() {
  document.querySelectorAll('#bottom-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === currentPage);
  });
}

async function navigate(page, params = {}) {
  currentPage = page;
  pageParams = params;
  updateNav();
  await render();
}

// ===== RENDER =====
async function render() {
  const content = document.getElementById('content');
  const title = document.getElementById('page-title');
  const backBtn = document.getElementById('header-back-btn');
  const actionBtn = document.getElementById('header-action-btn');

  backBtn.classList.add('hidden');
  backBtn.onclick = null;
  actionBtn.classList.add('hidden');
  actionBtn.innerHTML = '';
  actionBtn.onclick = null;

  const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  switch (currentPage) {
    case 'dashboard':
      title.textContent = 'Training Tracker';
      showSpinner();
      await renderDashboard(content);
      break;

    case 'plans':
      title.textContent = 'My Plans';
      actionBtn.classList.remove('hidden');
      actionBtn.innerHTML = plusIcon;
      actionBtn.onclick = () => showNewPlanModal();
      showSpinner();
      await renderPlans(content);
      break;

    case 'plan-edit': {
      const plans = await getPlans();
      const plan = plans.find(p => p.id === pageParams.planId);
      title.textContent = plan?.name || 'Plan';
      backBtn.classList.remove('hidden');
      backBtn.onclick = () => navigate('plans');
      actionBtn.classList.remove('hidden');
      actionBtn.innerHTML = plusIcon;
      actionBtn.onclick = () => showNewWorkoutModal(pageParams.planId);
      await renderPlanEdit(content, pageParams.planId);
      break;
    }

    case 'workout-edit': {
      const plans = await getPlans();
      const plan = plans.find(p => p.id === pageParams.planId);
      const wt = plan?.workouts?.find(w => w.id === pageParams.workoutId);
      title.textContent = wt?.name || 'Workout';
      backBtn.classList.remove('hidden');
      backBtn.onclick = () => navigate('plan-edit', { planId: pageParams.planId });
      actionBtn.classList.remove('hidden');
      actionBtn.innerHTML = plusIcon;
      actionBtn.onclick = () => showAddExerciseModal(pageParams.planId, pageParams.workoutId);
      await renderWorkoutEdit(content, pageParams.planId, pageParams.workoutId);
      break;
    }

    case 'log':
      title.textContent = 'Log Workout';
      showSpinner();
      await renderLog(content);
      break;

    case 'history':
      title.textContent = 'History';
      showSpinner();
      await renderHistory(content);
      break;

    case 'settings':
      title.textContent = 'Settings';
      await renderSettings(content);
      break;
  }

  content.className = 'page-enter';
}

// ===== DASHBOARD =====
async function renderDashboard(content) {
  const [plans, workouts, activePlanId] = await Promise.all([getPlans(), getWorkouts(), getActivePlanId()]);
  const activePlan = plans.find(p => p.id === activePlanId) || null;

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekCount = workouts.filter(w => new Date(w.date) >= weekStart).length;
  const monthCount = workouts.filter(w => new Date(w.date) >= monthStart).length;

  let html = `<div class="dash-greeting"><h2>Hey, ready to train? 💪</h2><p>${today()}</p></div>`;

  // Active plan card
  html += `<div class="page-section" style="padding-top:0">`;
  if (activePlan) {
    // Figure out next suggested workout
    const planWorkouts = workouts.filter(w => w.plan_id === activePlanId);
    const lastDone = planWorkouts[0];
    const templates = activePlan.workouts || [];
    let nextWorkout = templates[0];
    let nextLabel = '';

    if (lastDone && templates.length > 1) {
      const lastIdx = templates.findIndex(t => t.id === lastDone.workout_template_id);
      const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % templates.length;
      nextWorkout = templates[nextIdx];
      nextLabel = `Last: ${lastDone.workout_template_name} (${daysAgo(lastDone.date)})`;
    }

    html += `<div class="card">
      <div class="card-label">Active Plan</div>
      <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:4px">${esc(activePlan.name)}</div>
      ${nextLabel ? `<div style="font-size:12px;color:var(--text-3);margin-bottom:10px">${esc(nextLabel)}</div>` : `<div style="margin-bottom:10px"></div>`}
      ${nextWorkout ? `
        <div style="background:var(--primary-light);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--primary)">Next up</div>
            <div style="font-size:14px;font-weight:700;color:var(--primary-dark)">${esc(nextWorkout.name)}</div>
          </div>
        </div>` : ''}
      <button class="start-workout-btn" onclick="navigate('log')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Workout
      </button>
    </div>`;
  } else {
    html += `<div class="card no-plan-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <h3>No active plan</h3>
      <p>Create a workout plan to get started</p>
      <button class="btn btn-primary btn-full" onclick="navigate('plans')">Create a Plan</button>
    </div>`;
  }
  html += `</div>`;

  // Stats
  html += `<div class="stats-row">
    <div class="stat-card"><div class="stat-num">${weekCount}</div><div class="stat-label">This Week</div></div>
    <div class="stat-card"><div class="stat-num">${monthCount}</div><div class="stat-label">This Month</div></div>
  </div>`;

  // Last workout
  const lastWo = workouts[0];
  if (lastWo) {
    const feelingLabel = { tired: '😴 Tired', normal: '😐 Normal', energized: '⚡ Energized' };
    const exSummary = (lastWo.exercises || []).slice(0, 3).map(e => {
      const s = e.sets?.[0];
      let str = `<div class="lw-ex"><span>${esc(e.exerciseName)}</span>`;
      if (s?.weight) str += ` · ${s.weight}kg × ${s.reps || '?'}`;
      else if (s?.reps) str += ` · ${s.reps} reps`;
      return str + `</div>`;
    }).join('');

    html += `<div class="page-section" style="padding-top:0">
      <div class="card last-workout-card">
        <div class="card-label">Last Workout</div>
        <div class="lw-row">
          <div>
            <div class="lw-date">${formatDate(lastWo.date)}</div>
            <div class="lw-plan">${esc(lastWo.workout_template_name || lastWo.plan_name)}</div>
          </div>
          ${lastWo.feeling ? `<div class="feeling-tag ${lastWo.feeling}">${feelingLabel[lastWo.feeling] || ''}</div>` : ''}
        </div>
        ${lastWo.cardio?.type ? `<div style="font-size:13px;color:var(--text-2);margin-top:6px">🏃 ${esc(lastWo.cardio.type)} · ${lastWo.cardio.duration} min</div>` : ''}
        <div class="lw-exercises">${exSummary}</div>
        ${(lastWo.exercises?.length || 0) > 3 ? `<div style="font-size:12px;color:var(--text-3);margin-top:4px">+${lastWo.exercises.length - 3} more</div>` : ''}
      </div>
    </div>`;
  }

  content.innerHTML = html;
}

// ===== PLANS PAGE =====
async function renderPlans(content) {
  const [plans, activePlanId] = await Promise.all([getPlans(), getActivePlanId()]);

  if (!plans.length) {
    content.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <h3>No plans yet</h3>
      <p>Tap + to create your first workout plan</p>
      <button class="btn btn-primary" onclick="showNewPlanModal()">Create Plan</button>
    </div>`;
    return;
  }

  const html = plans.map(p => {
    const isActive = p.id === activePlanId;
    const wtCount = (p.workouts || []).length;
    return `<div class="plan-card">
      ${isActive ? '<div class="active-dot"></div>' : '<div style="width:8px"></div>'}
      <div class="plan-card-info" onclick="navigate('plan-edit',{planId:'${p.id}'})" style="cursor:pointer">
        <div class="plan-card-name">${esc(p.name)}</div>
        <div class="plan-card-meta">${wtCount} workout${wtCount !== 1 ? 's' : ''}${isActive ? ' · Active' : ''}</div>
      </div>
      <div class="plan-card-actions">
        <button class="set-active-btn ${isActive ? 'is-active' : ''}" onclick="setActivePlan('${p.id}')">${isActive ? '✓ Active' : 'Set Active'}</button>
        <button class="icon-btn" onclick="navigate('plan-edit',{planId:'${p.id}'})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="plans-list">${html}</div>`;
}

async function setActivePlan(planId) {
  await dbSetActivePlanId(planId);
  invalidate('activePlanId');
  await render();
}

function showNewPlanModal() {
  openModal('New Plan', `
    <div class="form-group">
      <label class="form-label">Plan Name</label>
      <input class="form-input" id="new-plan-name" placeholder="e.g. 3 Month Strength Program" autofocus>
    </div>
    <button class="btn btn-primary btn-full" onclick="createPlan()">Create Plan</button>
  `);
  setTimeout(() => document.getElementById('new-plan-name')?.focus(), 100);
}

async function createPlan() {
  const name = document.getElementById('new-plan-name')?.value.trim();
  if (!name) { alert('Please enter a plan name'); return; }
  const plan = { id: uid(), name, workouts: [] };
  await dbUpsertPlan(plan);
  invalidate('plans');
  const plans = await getPlans();
  if (plans.length === 1) { await dbSetActivePlanId(plan.id); invalidate('activePlanId'); }
  closeModal();
  navigate('plan-edit', { planId: plan.id });
}

// ===== PLAN EDIT (workout list) =====
async function renderPlanEdit(content, planId) {
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) { navigate('plans'); return; }

  const workouts = plan.workouts || [];
  let html = `<div class="plan-editor">
    <div class="card" style="margin-bottom:14px">
      <div class="card-label">Plan Name</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="form-input" id="plan-name-input" value="${esc(plan.name)}" style="flex:1">
        <button class="btn btn-ghost btn-sm" onclick="renamePlan('${planId}')">Save</button>
      </div>
    </div>`;

  if (!workouts.length) {
    html += `<div style="text-align:center;padding:32px 0">
      <div style="font-size:36px;margin-bottom:10px">🏋️</div>
      <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">No workouts yet</div>
      <div style="font-size:14px;color:var(--text-2);margin-bottom:16px">Add your first workout (e.g. Workout A)</div>
      <button class="btn btn-primary" onclick="showNewWorkoutModal('${planId}')">Add Workout</button>
    </div>`;
  } else {
    html += `<div class="section-title" style="margin-bottom:10px">Workouts in this plan</div>`;
    html += workouts.map(wt => `
      <div class="plan-card" style="margin-bottom:8px;cursor:pointer" onclick="navigate('workout-edit',{planId:'${planId}',workoutId:'${wt.id}'})">
        <div class="plan-card-info">
          <div class="plan-card-name">${esc(wt.name)}</div>
          <div class="plan-card-meta">${(wt.exercises || []).length} exercise${(wt.exercises || []).length !== 1 ? 's' : ''}</div>
        </div>
        <div class="plan-card-actions">
          <button class="icon-btn" onclick="event.stopPropagation();deleteWorkoutTemplate('${planId}','${wt.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
          <button class="icon-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`).join('');
    html += `<button class="btn btn-outline btn-full" style="margin-top:8px" onclick="showNewWorkoutModal('${planId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Workout
    </button>`;
  }

  html += `<button class="btn btn-danger btn-full btn-sm" style="margin-top:12px" onclick="deletePlan('${planId}')">Delete Plan</button>
  </div>`;

  content.innerHTML = html;
}

function showNewWorkoutModal(planId) {
  openModal('Add Workout', `
    <div class="form-group">
      <label class="form-label">Workout Name</label>
      <input class="form-input" id="new-wt-name" placeholder="e.g. Workout A – Lower Body" autofocus>
    </div>
    <button class="btn btn-primary btn-full" onclick="createWorkoutTemplate('${planId}')">Add Workout</button>
  `);
  setTimeout(() => document.getElementById('new-wt-name')?.focus(), 100);
}

async function createWorkoutTemplate(planId) {
  const name = document.getElementById('new-wt-name')?.value.trim();
  if (!name) { alert('Please enter a name'); return; }
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;
  plan.workouts = plan.workouts || [];
  plan.workouts.push({ id: uid(), name, exercises: [] });
  await dbUpsertPlan(plan);
  invalidate('plans');
  closeModal();
  navigate('plan-edit', { planId });
}

async function deleteWorkoutTemplate(planId, workoutId) {
  if (!confirm('Delete this workout from the plan?')) return;
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;
  plan.workouts = (plan.workouts || []).filter(w => w.id !== workoutId);
  await dbUpsertPlan(plan);
  invalidate('plans');
  navigate('plan-edit', { planId });
}

async function renamePlan(planId) {
  const name = document.getElementById('plan-name-input')?.value.trim();
  if (!name) return;
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;
  plan.name = name;
  await dbUpsertPlan(plan);
  invalidate('plans');
  document.getElementById('page-title').textContent = name;
}

async function deletePlan(planId) {
  if (!confirm('Delete this entire plan? This cannot be undone.')) return;
  await dbDeletePlan(planId);
  invalidate('plans');
  const activePlanId = await getActivePlanId();
  if (activePlanId === planId) {
    const plans = await getPlans();
    await dbSetActivePlanId(plans[0]?.id || null);
    invalidate('activePlanId');
  }
  navigate('plans');
}

// ===== WORKOUT EDIT (exercise list) =====
async function renderWorkoutEdit(content, planId, workoutId) {
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  const wt = plan?.workouts?.find(w => w.id === workoutId);
  if (!wt) { navigate('plan-edit', { planId }); return; }

  const groups = groupExercises(wt.exercises || []);
  let html = `<div class="plan-editor">
    <div class="card" style="margin-bottom:14px">
      <div class="card-label">Workout Name</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="form-input" id="wt-name-input" value="${esc(wt.name)}" style="flex:1">
        <button class="btn btn-ghost btn-sm" onclick="renameWorkoutTemplate('${planId}','${workoutId}')">Save</button>
      </div>
    </div>`;

  if (!wt.exercises?.length) {
    html += `<div style="text-align:center;padding:32px 0">
      <div style="font-size:36px;margin-bottom:10px">🏋️</div>
      <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">No exercises yet</div>
      <button class="btn btn-primary" onclick="showAddExerciseModal('${planId}','${workoutId}')">Add Exercise</button>
    </div>`;
  } else {
    html += `<div class="section-title" style="margin-bottom:10px">Exercises</div>`;
    groups.forEach(g => {
      if (g.type === 'superset') {
        html += `<div style="border:1.5px solid var(--primary);border-radius:var(--radius-sm);overflow:hidden;margin-bottom:8px">
          <div style="background:var(--primary-light);padding:6px 12px">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--primary)">⚡ Superset</span>
          </div>`;
        g.exercises.forEach(ex => { html += renderExItem(ex, planId, workoutId); });
        html += `</div>`;
      } else {
        html += `<div style="border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;overflow:hidden">
          ${renderExItem(g.exercises[0], planId, workoutId)}
        </div>`;
      }
    });
    html += `<button class="btn btn-outline btn-full" style="margin-top:8px" onclick="showAddExerciseModal('${planId}','${workoutId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Exercise
    </button>`;
  }

  html += `</div>`;
  content.innerHTML = html;
}

function renderExItem(ex, planId, workoutId) {
  return `<div class="ex-item" style="border-radius:0;border:none;border-bottom:1px solid var(--border)">
    <div class="ex-item-info">
      <div class="ex-item-name">${esc(ex.name)}</div>
      <div class="ex-item-meta">${ex.defaultSets || 3} sets · ${ex.defaultReps || '8-12'} reps</div>
    </div>
    <div class="ex-item-actions">
      <button class="icon-btn" onclick="showEditExerciseModal('${planId}','${workoutId}','${ex.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn" onclick="deleteExercise('${planId}','${workoutId}','${ex.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>
    </div>
  </div>`;
}

async function renameWorkoutTemplate(planId, workoutId) {
  const name = document.getElementById('wt-name-input')?.value.trim();
  if (!name) return;
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  const wt = plan?.workouts?.find(w => w.id === workoutId);
  if (!wt) return;
  wt.name = name;
  await dbUpsertPlan(plan);
  invalidate('plans');
  document.getElementById('page-title').textContent = name;
}

function showAddExerciseModal(planId, workoutId) {
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
    <div class="form-group" id="superset-group"></div>
    <button class="btn btn-primary btn-full" onclick="addExercise('${planId}','${workoutId}')">Add Exercise</button>
  `);
  setTimeout(async () => {
    document.getElementById('ex-name')?.focus();
    const plans = await getPlans();
    const plan = plans.find(p => p.id === planId);
    const wt = plan?.workouts?.find(w => w.id === workoutId);
    const existing = (wt?.exercises || []).filter(e => !e.supersetGroupId);
    if (existing.length) {
      const opts = existing.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
      document.getElementById('superset-group').innerHTML = `
        <label class="form-label">Superset with (optional)</label>
        <select class="form-input" id="ex-superset">
          <option value="">None</option>${opts}
        </select>`;
    }
  }, 100);
}

function showEditExerciseModal(planId, workoutId, exId) {
  openModal('Edit Exercise', `
    <div class="form-group">
      <label class="form-label">Exercise Name</label>
      <input class="form-input" id="ex-name" autofocus>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" class="form-group">
      <div><label class="form-label">Sets</label><input class="form-input" id="ex-sets" type="number" min="1"></div>
      <div><label class="form-label">Reps</label><input class="form-input" id="ex-reps"></div>
    </div>
    <button class="btn btn-primary btn-full mt-8" onclick="updateExercise('${planId}','${workoutId}','${exId}')">Save</button>
    <button class="btn btn-danger btn-full mt-8 btn-sm" onclick="deleteExercise('${planId}','${workoutId}','${exId}',true)">Delete</button>
  `);
  setTimeout(async () => {
    const plans = await getPlans();
    const plan = plans.find(p => p.id === planId);
    const wt = plan?.workouts?.find(w => w.id === workoutId);
    const ex = wt?.exercises?.find(e => e.id === exId);
    if (ex) {
      document.getElementById('ex-name').value = ex.name;
      document.getElementById('ex-sets').value = ex.defaultSets || 3;
      document.getElementById('ex-reps').value = ex.defaultReps || '8-12';
    }
  }, 50);
}

async function addExercise(planId, workoutId) {
  const name = document.getElementById('ex-name')?.value.trim();
  if (!name) { alert('Please enter a name'); return; }
  const sets = parseInt(document.getElementById('ex-sets')?.value) || 3;
  const reps = document.getElementById('ex-reps')?.value.trim() || '8-12';
  const supersetWith = document.getElementById('ex-superset')?.value || '';

  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  const wt = plan?.workouts?.find(w => w.id === workoutId);
  if (!wt) return;

  wt.exercises = wt.exercises || [];
  let supersetGroupId = null;
  if (supersetWith) {
    const partner = wt.exercises.find(e => e.id === supersetWith);
    if (partner) { supersetGroupId = partner.supersetGroupId || uid(); partner.supersetGroupId = supersetGroupId; }
  }

  wt.exercises.push({ id: uid(), name, defaultSets: sets, defaultReps: reps, supersetGroupId });
  await dbUpsertPlan(plan);
  invalidate('plans');
  closeModal();
  navigate('workout-edit', { planId, workoutId });
}

async function updateExercise(planId, workoutId, exId) {
  const name = document.getElementById('ex-name')?.value.trim();
  if (!name) { alert('Please enter a name'); return; }
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  const wt = plan?.workouts?.find(w => w.id === workoutId);
  const ex = wt?.exercises?.find(e => e.id === exId);
  if (!ex) return;
  ex.name = name;
  ex.defaultSets = parseInt(document.getElementById('ex-sets')?.value) || 3;
  ex.defaultReps = document.getElementById('ex-reps')?.value.trim() || '8-12';
  await dbUpsertPlan(plan);
  invalidate('plans');
  closeModal();
  navigate('workout-edit', { planId, workoutId });
}

async function deleteExercise(planId, workoutId, exId, fromModal = false) {
  if (!confirm('Delete this exercise?')) return;
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  const wt = plan?.workouts?.find(w => w.id === workoutId);
  if (!wt) return;
  const ex = wt.exercises.find(e => e.id === exId);
  if (ex?.supersetGroupId) {
    const remaining = wt.exercises.filter(e => e.id !== exId && e.supersetGroupId === ex.supersetGroupId);
    if (remaining.length === 1) remaining[0].supersetGroupId = null;
  }
  wt.exercises = wt.exercises.filter(e => e.id !== exId);
  await dbUpsertPlan(plan);
  invalidate('plans');
  if (fromModal) closeModal();
  navigate('workout-edit', { planId, workoutId });
}

// ===== LOG WORKOUT =====
let currentWorkout = null;

async function renderLog(content) {
  const activePlan = await getActivePlan();
  if (!activePlan) {
    content.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <h3>No active plan</h3>
      <p>Go to Plans and create or activate a plan first</p>
      <button class="btn btn-primary" onclick="navigate('plans')">Go to Plans</button>
    </div>`;
    return;
  }

  const templates = activePlan.workouts || [];
  if (!templates.length) {
    content.innerHTML = `<div class="empty-state">
      <h3>Plan has no workouts</h3>
      <p>Add workouts to your plan first</p>
      <button class="btn btn-primary" onclick="navigate('plan-edit',{planId:'${activePlan.id}'})">Edit Plan</button>
    </div>`;
    return;
  }

  // If there's a current in-progress workout for this plan, show it
  const saved = getCurrentWorkout();
  if (saved && saved.planId === activePlan.id) {
    currentWorkout = saved;
    await renderLogSession(content, activePlan);
    return;
  }

  // Otherwise: workout picker
  const workouts = await getWorkouts();
  const planWorkouts = workouts.filter(w => w.plan_id === activePlan.id);

  const templateCards = templates.map(wt => {
    const lastDone = planWorkouts.find(w => w.workout_template_id === wt.id);
    const lastLabel = lastDone ? daysAgo(lastDone.date) : 'Never done';
    const exCount = (wt.exercises || []).length;
    return `<div class="plan-card" style="cursor:pointer;margin-bottom:10px" onclick="startWorkout('${activePlan.id}','${wt.id}')">
      <div class="plan-card-info">
        <div class="plan-card-name">${esc(wt.name)}</div>
        <div class="plan-card-meta">${exCount} exercise${exCount !== 1 ? 's' : ''} · Last: ${lastLabel}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();startWorkout('${activePlan.id}','${wt.id}')">Start</button>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="log-page">
    <div style="margin-bottom:16px">
      <div class="log-section-title">Active Plan</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:2px">${esc(activePlan.name)}</div>
    </div>
    <div class="log-section-title">Choose today's workout</div>
    ${templateCards}
  </div>`;
}

async function startWorkout(planId, workoutTemplateId) {
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  const wt = plan?.workouts?.find(w => w.id === workoutTemplateId);
  if (!wt) return;

  currentWorkout = {
    id: uid(),
    planId: plan.id,
    planName: plan.name,
    workoutTemplateId: wt.id,
    workoutTemplateName: wt.name,
    date: new Date().toISOString(),
    feeling: null,
    cardio: null,
    exercises: (wt.exercises || []).map(ex => ({
      exerciseId: ex.id,
      exerciseName: ex.name,
      sets: Array.from({ length: ex.defaultSets || 3 }, () => ({ weight: null, reps: null, difficulty: null })),
      note: ''
    })),
    notes: ''
  };
  saveCurrentWorkout(currentWorkout);

  const content = document.getElementById('content');
  await renderLogSession(content, plan);
}

async function renderLogSession(content, plan) {
  const workouts = await getWorkouts();
  const wt = plan.workouts?.find(w => w.id === currentWorkout.workoutTemplateId);
  if (!wt) return;

  const groups = groupExercises(wt.exercises || []);
  let html = `<div class="log-page">
    <div style="margin-bottom:4px">
      <div style="font-size:12px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">${esc(plan.name)}</div>
      <div style="font-size:18px;font-weight:800;color:var(--text)">${esc(wt.name)}</div>
    </div>
    <div class="divider"></div>`;

  // Feeling
  html += `<div style="margin-bottom:16px">
    <div class="log-section-title">How do you feel today?</div>
    <div class="feeling-row">
      ${['tired','normal','energized'].map(f => `
        <button class="feeling-btn ${currentWorkout.feeling === f ? 'active' : ''}" data-feeling="${f}" onclick="setFeeling('${f}')">
          <span class="feeling-emoji">${f === 'tired' ? '😴' : f === 'normal' ? '😐' : '⚡'}</span>
          <span>${f.charAt(0).toUpperCase() + f.slice(1)}</span>
        </button>`).join('')}
    </div>
  </div>`;

  // Cardio
  const hasCardio = currentWorkout.cardio !== null;
  html += `<div style="margin-bottom:16px">
    <div class="log-section-title">Cardio</div>
    <div class="cardio-toggle">
      <label for="cardio-toggle">Include cardio warmup</label>
      <label class="toggle-switch">
        <input type="checkbox" id="cardio-toggle" ${hasCardio ? 'checked' : ''} onchange="toggleCardio(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div id="cardio-inputs" ${hasCardio ? '' : 'style="display:none"'}>
      <div class="cardio-inputs">
        <div><label class="form-label">Type</label>
          <input class="form-input" id="cardio-type" placeholder="Stairs, Treadmill..." value="${esc(currentWorkout.cardio?.type || '')}">
        </div>
        <div><label class="form-label">Duration (min)</label>
          <input class="form-input" id="cardio-duration" type="number" placeholder="20" value="${currentWorkout.cardio?.duration || ''}">
        </div>
      </div>
    </div>
  </div>`;

  // Exercises
  html += `<div class="log-section-title">Exercises</div>`;
  groups.forEach(g => {
    if (g.type === 'superset') {
      html += `<div class="superset-block"><div class="superset-block-header"><span class="superset-block-title">⚡ Superset</span></div><div class="superset-exercises">`;
      g.exercises.forEach(ex => { html += renderLogExercise(ex, true, workouts); });
      html += `</div></div>`;
    } else {
      html += `<div class="exercise-block">${renderLogExercise(g.exercises[0], false, workouts)}</div>`;
    }
  });

  // Notes + finish
  html += `<div style="margin-top:8px;margin-bottom:16px">
    <div class="log-section-title">Workout Notes</div>
    <textarea class="form-input" id="workout-notes" placeholder="General notes..." rows="2" onchange="updateWorkoutNotes(this.value)">${esc(currentWorkout.notes || '')}</textarea>
  </div>
  <button class="btn btn-primary btn-full" style="margin-bottom:10px;padding:16px;font-size:17px" onclick="finishWorkout()">✓ Finish Workout</button>
  <button class="btn btn-ghost btn-full btn-sm" onclick="discardWorkout()">Discard Workout</button>
  </div>`;

  content.innerHTML = html;
}

function renderLogExercise(ex, inSuperset, workouts) {
  const lastData = getLastExerciseLog(ex.id, workouts);
  const lastPerf = lastData ? formatLastPerf(lastData.exLog) : 'First time — go for it!';
  const lastDate = lastData ? `📅 ${daysAgo(lastData.workout.date)} · ` : '';
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === ex.id);
  const sets = exLog?.sets || [];
  const setsHtml = sets.map((s, i) => renderSetRow(ex.id, i, s, workouts)).join('');

  return `<div style="padding:12px 16px">
    <div style="margin-bottom:8px">
      <div style="font-size:15px;font-weight:700;color:var(--text)">${esc(ex.name)}</div>
      <div style="font-size:12px;color:var(--text-3);margin-top:2px;line-height:1.4">${lastDate}${lastPerf}</div>
    </div>
    <div class="set-labels">
      <div class="set-label"></div><div class="set-label">kg</div><div class="set-label">reps</div><div class="set-label">feel</div><div class="set-label"></div>
    </div>
    <div id="sets-${ex.id}">${setsHtml}</div>
    <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px" onclick="addSet('${ex.id}')">+ Add Set</button>
    <div style="margin-top:8px">
      <input class="form-input" style="font-size:13px;padding:8px 12px" placeholder="Notes for next time..."
        value="${esc(exLog?.note || '')}" onchange="updateExNote('${ex.id}',this.value)">
    </div>
  </div>${inSuperset ? '<div class="superset-divider"></div>' : ''}`;
}

function renderSetRow(exId, index, set, workouts) {
  const lastData = getLastExerciseLog(exId, workouts);
  const lastSet = lastData?.exLog.sets[index];
  const diffBtns = ['easy','moderate','hard'].map(d =>
    `<button class="diff-btn ${set.difficulty === d ? 'active-'+d : ''}" onclick="setDifficulty('${exId}',${index},'${d}')">${d[0].toUpperCase()}</button>`
  ).join('');
  return `<div class="set-row" id="set-row-${exId}-${index}">
    <div class="set-num">${index + 1}</div>
    <input class="set-input" type="number" inputmode="decimal" placeholder="${lastSet?.weight || '—'}"
      value="${set.weight ?? ''}" onchange="updateSet('${exId}',${index},'weight',this.value)">
    <input class="set-input" type="number" inputmode="numeric" placeholder="${lastSet?.reps || '—'}"
      value="${set.reps ?? ''}" onchange="updateSet('${exId}',${index},'reps',this.value)">
    <div class="diff-row">${diffBtns}</div>
    <button class="set-delete-btn" onclick="removeSet('${exId}',${index})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>`;
}

function getCurrentWorkout() {
  try { return JSON.parse(localStorage.getItem(CURRENT_WO_KEY)); } catch { return null; }
}
function saveCurrentWorkout(wo) {
  if (wo) localStorage.setItem(CURRENT_WO_KEY, JSON.stringify(wo));
  else localStorage.removeItem(CURRENT_WO_KEY);
}

function setFeeling(feeling) {
  currentWorkout.feeling = feeling;
  saveCurrentWorkout(currentWorkout);
  document.querySelectorAll('.feeling-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.feeling === feeling));
}

function toggleCardio(checked) {
  currentWorkout.cardio = checked ? { type: '', duration: null } : null;
  saveCurrentWorkout(currentWorkout);
  document.getElementById('cardio-inputs').style.display = checked ? '' : 'none';
}

async function addSet(exId) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog) return;
  const workouts = await getWorkouts();
  const lastData = getLastExerciseLog(exId, workouts);
  const lastSet = lastData?.exLog.sets[exLog.sets.length] || null;
  exLog.sets.push({ weight: lastSet?.weight ?? null, reps: lastSet?.reps ?? null, difficulty: null });
  saveCurrentWorkout(currentWorkout);
  const container = document.getElementById(`sets-${exId}`);
  if (container) {
    const idx = exLog.sets.length - 1;
    const div = document.createElement('div');
    div.innerHTML = renderSetRow(exId, idx, exLog.sets[idx], workouts);
    container.appendChild(div.firstElementChild);
  }
}

function removeSet(exId, index) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog || exLog.sets.length <= 1) return;
  exLog.sets.splice(index, 1);
  saveCurrentWorkout(currentWorkout);
  const container = document.getElementById(`sets-${exId}`);
  if (container) container.innerHTML = exLog.sets.map((s, i) => renderSetRow(exId, i, s, [])).join('');
}

function updateSet(exId, index, field, value) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog?.sets[index]) return;
  exLog.sets[index][field] = (field === 'weight' || field === 'reps') ? (value === '' ? null : parseFloat(value)) : value;
  saveCurrentWorkout(currentWorkout);
}

function setDifficulty(exId, index, difficulty) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (!exLog?.sets[index]) return;
  exLog.sets[index].difficulty = difficulty;
  saveCurrentWorkout(currentWorkout);
  const row = document.getElementById(`set-row-${exId}-${index}`);
  if (row) row.querySelectorAll('.diff-btn').forEach(btn => {
    btn.className = 'diff-btn';
    const map = { E: 'easy', M: 'moderate', H: 'hard' };
    if (map[btn.textContent.trim()] === difficulty) btn.classList.add('active-' + difficulty);
  });
}

function updateExNote(exId, note) {
  const exLog = currentWorkout.exercises.find(e => e.exerciseId === exId);
  if (exLog) { exLog.note = note; saveCurrentWorkout(currentWorkout); }
}

function updateWorkoutNotes(notes) {
  currentWorkout.notes = notes;
  saveCurrentWorkout(currentWorkout);
}

async function finishWorkout() {
  if (currentWorkout.cardio) {
    currentWorkout.cardio.type = document.getElementById('cardio-type')?.value.trim() || '';
    currentWorkout.cardio.duration = parseFloat(document.getElementById('cardio-duration')?.value) || null;
  }
  const hasData = currentWorkout.exercises.some(e => e.sets.some(s => s.weight || s.reps));
  if (!hasData && !confirm('No sets logged yet. Save anyway?')) return;

  currentWorkout.date = new Date().toISOString();
  try {
    await dbInsertWorkout(currentWorkout);
    invalidate('workouts');
    saveCurrentWorkout(null);
    currentWorkout = null;
    navigate('dashboard');
  } catch (e) {
    alert('Failed to save workout. Please try again.');
    console.error(e);
  }
}

function discardWorkout() {
  if (!confirm('Discard this workout?')) return;
  saveCurrentWorkout(null);
  currentWorkout = null;
  navigate('log');
}

// ===== HISTORY =====
async function renderHistory(content) {
  const workouts = await getWorkouts();
  if (!workouts.length) {
    content.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <h3>No workouts yet</h3>
      <p>Your completed workouts will appear here</p>
    </div>`;
    return;
  }

  const feelingLabel = { tired: '😴 Tired', normal: '😐 Normal', energized: '⚡ Energized' };
  const html = workouts.map((wo, idx) => {
    const exRows = (wo.exercises || []).map(e => {
      const setsHtml = (e.sets || []).map((s, si) => `
        <div class="hw-set">Set ${si + 1}: ${s.weight ? s.weight + 'kg × ' : ''}${s.reps || '?'} reps
          ${s.difficulty ? `<span class="hw-set-diff ${s.difficulty}">${s.difficulty}</span>` : ''}
        </div>`).join('');
      return `<div class="hw-detail-section">
        <div class="hw-ex-name">${esc(e.exerciseName)}</div>
        ${setsHtml}
        ${e.note ? `<div class="hw-note">💡 ${esc(e.note)}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="history-card">
      <div class="history-card-header" onclick="toggleHistoryCard(${idx})">
        <div class="hc-date">
          <div class="hc-date-main">${formatDate(wo.date)}</div>
          <div class="hc-date-sub">${esc(wo.workout_template_name || wo.plan_name)} · ${(wo.exercises || []).length} exercises${wo.feeling ? ' · ' + (feelingLabel[wo.feeling] || '') : ''}</div>
        </div>
        <div class="hc-chevron" id="chevron-${idx}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
      <div class="history-card-body" id="hc-body-${idx}">
        ${wo.cardio?.type ? `<div style="font-size:13px;color:var(--text-2);margin-bottom:12px;padding:8px 12px;background:var(--surface-2);border-radius:8px">🏃 <strong>${esc(wo.cardio.type)}</strong> · ${wo.cardio.duration} min</div>` : ''}
        ${exRows}
        ${wo.notes ? `<div style="margin-top:8px;padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px;color:var(--text-2)">📝 ${esc(wo.notes)}</div>` : ''}
        <button class="btn btn-danger btn-sm btn-full" style="margin-top:12px" onclick="deleteWorkout('${wo.id}')">Delete Workout</button>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="history-list">${html}</div>`;
}

function toggleHistoryCard(idx) {
  document.getElementById(`hc-body-${idx}`)?.classList.toggle('open');
  document.getElementById(`chevron-${idx}`)?.classList.toggle('open');
}

async function deleteWorkout(woId) {
  if (!confirm('Delete this workout?')) return;
  await dbDeleteWorkout(woId);
  invalidate('workouts');
  navigate('history');
}

// ===== SETTINGS =====
async function renderSettings(content) {
  const [plans, activePlanId, workouts] = await Promise.all([getPlans(), getActivePlanId(), getWorkouts()]);
  const { data: { user } } = await sb.auth.getUser();

  const planOptions = plans.map(p => `<option value="${p.id}" ${p.id === activePlanId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const hasLocalData = !!localStorage.getItem('training_tracker_v1');

  content.innerHTML = `<div class="settings-page">
    <div style="background:var(--primary-light);border-radius:var(--radius);padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <div style="width:36px;height:36px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;flex-shrink:0">
        ${(user?.email?.[0] || '?').toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(user?.email || '')}</div>
        <div style="font-size:12px;color:var(--text-3)">${workouts.length} workouts saved</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="handleLogout()">Log out</button>
    </div>

    <div class="settings-section-label">Active Plan</div>
    <div class="settings-section">
      <div class="settings-item">
        <div class="settings-item-icon purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title">Current Plan</div>
        </div>
        <div class="settings-item-action">
          ${plans.length ? `<select class="form-input" style="padding:6px 10px;font-size:13px" onchange="setActivePlan(this.value)">${planOptions}</select>` : `<span style="font-size:13px;color:var(--text-3)">No plans</span>`}
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
          <div class="settings-item-title">Export Backup</div>
          <div class="settings-item-sub">Download all data as JSON</div>
        </div>
      </div>
      <div class="settings-item" style="cursor:pointer">
        <div class="settings-item-icon blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title">Import Backup</div>
          <div class="settings-item-sub">Restore from JSON file</div>
        </div>
        <div class="settings-item-action">
          <label style="cursor:pointer">
            <input type="file" accept=".json" style="display:none" onchange="importData(event)">
            <span style="font-size:13px;font-weight:600;color:var(--primary)">Choose file</span>
          </label>
        </div>
      </div>
      ${hasLocalData ? `
      <div class="settings-item" onclick="migrateLocalData()" style="cursor:pointer">
        <div class="settings-item-icon" style="background:#fef3c7;color:#d97706">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
        </div>
        <div class="settings-item-info">
          <div class="settings-item-title">Migrate Local Data</div>
          <div class="settings-item-sub">Import data saved before the backend was added</div>
        </div>
      </div>` : ''}
    </div>
  </div>`;
}

async function handleLogout() {
  if (!confirm('Log out?')) return;
  await sb.auth.signOut();
  invalidate();
  currentWorkout = null;
}

async function exportData() {
  const [plans, workouts] = await Promise.all([getPlans(), getWorkouts()]);
  const blob = new Blob([JSON.stringify({ plans, workouts }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.workouts || !data.plans) throw new Error('Invalid format');
      if (!confirm(`Import ${data.workouts.length} workouts and ${data.plans.length} plans?`)) return;
      for (const plan of data.plans) await dbUpsertPlan(plan);
      for (const wo of data.workouts) {
        try { await dbInsertWorkout(wo); } catch {}
      }
      invalidate();
      alert('Import complete!');
      navigate('settings');
    } catch { alert('Invalid backup file.'); }
  };
  reader.readAsText(file);
}

async function migrateLocalData() {
  try {
    const raw = localStorage.getItem('training_tracker_v1');
    if (!raw) { alert('No local data found.'); return; }
    const data = JSON.parse(raw);
    if (!confirm(`Migrate ${data.workouts?.length || 0} workouts and ${data.plans?.length || 0} plans to Supabase?`)) return;
    for (const plan of (data.plans || [])) {
      // Convert old format (flat exercises) to new format (workouts array)
      const converted = {
        id: plan.id, name: plan.name,
        workouts: plan.exercises?.length ? [{ id: uid(), name: 'Workout A', exercises: plan.exercises }] : []
      };
      await dbUpsertPlan(converted);
    }
    for (const wo of (data.workouts || [])) {
      try { await dbInsertWorkout({ ...wo, workoutTemplateId: null, workoutTemplateName: null }); } catch {}
    }
    localStorage.removeItem('training_tracker_v1');
    invalidate();
    alert('Migration complete!');
    navigate('settings');
  } catch (err) { alert('Migration failed: ' + err.message); }
}

// ===== MODAL =====
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
function closeModalOnOverlay(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  sb.auth.onAuthStateChange((event, session) => {
    if (session) {
      document.getElementById('bottom-nav').style.display = '';
      document.getElementById('top-header').style.display = '';
      document.getElementById('content').style.paddingBottom = '';
      invalidate();
      const saved = getCurrentWorkout();
      if (saved) currentWorkout = saved;
      navigate('dashboard');
    } else {
      invalidate();
      currentWorkout = null;
      showAuth();
    }
  });
});
