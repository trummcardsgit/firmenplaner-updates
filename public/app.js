'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { companies: [], tasks: [], view: 'dashboard', filter: 'open', companyFilter: '', query: '', editing: null, editingCompany: null, setupRequired: false, vapidKey: '', newEntryType: 'task', pushBusy: false };
  let toastTimer;
  let entryReturn = false;
  const headings = {
    dashboard: ['DEIN ÜBERBLICK', 'Deine Übersicht', 'Alles Wichtige für deinen Arbeitstag.'],
    tasks: ['AUFGABENPLANUNG', 'Alle Aufgaben', 'Organisiert nach Termin, Firma und Priorität.'],
    notes: ['DEINE NOTIZEN', 'Notizen', 'Gedanken und Probleme festhalten – später Aufgaben daraus machen.'],
    companies: ['FIRMENVERWALTUNG', 'Deine Firmen', 'Alle Firmen und ihre offenen Einträge.'],
    settings: ['KONFIGURATION', 'Einstellungen', 'Benachrichtigungen, Daten und Konto.']
  };
  const fmt = date => new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
  const todayKey = v => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const today = () => todayKey(Date.now());
  const nameOf = id => state.companies.find(c => c.id === id)?.name || 'Unbekannte Firma';
  const isOverdue = t => t.type === 'task' && t.status === 'open' && t.dueAt && Date.parse(t.dueAt) < Date.now();
  const isToday = t => t.dueAt && todayKey(t.dueAt) === today();
  const sortTasks = (a,b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt !== b.dueAt) return a.dueAt ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  };
  const byDate = tasks => [...tasks].sort(sortTasks);
  const openTasks = () => state.tasks.filter(t => t.type === 'task' && t.status === 'open');
  const notes = () => state.tasks.filter(t => t.type === 'note');
  async function api(route, options={}) {
    const response = await fetch(route, { credentials: 'same-origin', ...options,
      headers: { ...(options.body !== undefined ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
    let json;
    try { json = await response.json(); } catch { throw new Error('Server antwortet nicht korrekt'); }
    if (!response.ok) {
      if (response.status === 401 && route !== '/api/login') { showGate(false); }
      throw new Error(json.error || 'Anfrage fehlgeschlagen');
    }
    return json;
  }
  const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
  const patch = (url, body) => api(url, { method: 'PATCH', body: JSON.stringify(body) });
  const del = url => api(url, { method: 'DELETE' });
  function toast(text) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3500); }
  function showError(id, message) { $(id).textContent = message; $(id).hidden = !message; }
  function showGate(setupRequired) {
    state.setupRequired = setupRequired;
    $('gate').hidden = false; $('app').hidden = true;
    $('auth-kicker').textContent = setupRequired ? 'ERSTE EINRICHTUNG' : 'WILLKOMMEN ZURÜCK';
    $('auth-heading').textContent = setupRequired ? 'Dein Konto einrichten' : 'FirmenPlaner öffnen';
    $('auth-description').textContent = setupRequired ? 'Lege ein Passwort für deine persönliche Aufgabenverwaltung fest.' : 'Gib dein Passwort ein, um deine Aufgaben zu öffnen.';
    $('auth-submit').textContent = setupRequired ? 'Konto erstellen' : 'Anmelden';
    $('auth-hint').hidden = !setupRequired;
    $('auth-password').autocomplete = setupRequired ? 'new-password' : 'current-password';
  }
  async function reload() {
    const result = await api('/api/bootstrap');
    state.companies = result.companies;
    state.tasks = result.tasks;
    render();
  }
  async function initialize() {
    try {
      const status = await api('/api/setup');
      state.vapidKey = status.publicVapidKey;
      if (!status.authenticated) return showGate(status.setupRequired);
      await openApp();
    } catch (error) { showGate(false); showError('auth-error', `${error.message}. Starte gegebenenfalls den FirmenPlaner-Server neu.`); }
  }
  async function openApp() {
    $('gate').hidden = true; $('app').hidden = false;
    await reload();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service Worker:', err));
  }
  $('auth-form').addEventListener('submit', async e => {
    e.preventDefault(); showError('auth-error','');
    const button = $('auth-submit'); button.disabled = true;
    try {
      const password = $('auth-password').value;
      await post(state.setupRequired ? '/api/setup' : '/api/login', { password });
      $('auth-password').value = '';
      await openApp();
      if (state.setupRequired) toast('Dein Konto wurde eingerichtet! Lege jetzt die erste Firma an.');
    } catch(error) { showError('auth-error', error.message); }
    finally { button.disabled = false; }
  });

  function stats() {
    const all = state.tasks.filter(t => t.type === 'task');
    return { open: all.filter(t => t.status === 'open').length, overdue: all.filter(isOverdue).length,
      today: all.filter(t => t.status === 'open' && isToday(t)).length, done: all.filter(t => t.status === 'done').length };
  }
  const companyOptions = withAll => `${withAll ? '<option value="">Alle Firmen</option>' : '<option value="">Firma auswählen</option>'}${state.companies.slice().sort((a,b)=>a.name.localeCompare(b.name, 'de')).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}`;
  function empty(icon, title, body, buttonText='', action='') {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${esc(title)}</strong><p>${esc(body)}</p>${buttonText ? `<button class="btn btn-soft" data-action="${esc(action)}">${esc(buttonText)}</button>` : ''}</div>`;
  }
  function dateBadge(t) {
    if (t.type === 'note') return '<span class="tag note">Notiz</span>';
    if (t.status === 'done') return '<span class="tag done">Erledigt</span>';
    if (isOverdue(t)) return '<span class="tag overdue">Überfällig</span>';
    if (isToday(t)) return '<span class="tag today">Heute</span>';
    if (t.priority === 'high') return '<span class="tag high">Wichtig</span>';
    return '';
  }
  function card(t) {
    const isDone = t.status === 'done';
    return `<article class="task-card ${isDone ? 'done' : ''}">
      ${t.type === 'task' ? `<button class="check-circle ${isDone ? 'checked' : ''}" title="${isDone?'Wieder öffnen':'Als erledigt markieren'}" aria-label="${isDone?'Wieder öffnen':'Als erledigt markieren'}" data-action="toggle-task" data-id="${esc(t.id)}">${isDone?'✓':''}</button>` : '<span class="note-symbol">▤</span>'}
      <div class="task-body"><div class="task-title"><button data-action="edit-task" data-id="${esc(t.id)}">${esc(t.title)}</button>${dateBadge(t)}</div>
      ${t.description ? `<div class="task-description">${esc(t.description)}</div>` : ''}
      <div class="task-meta"><strong>${esc(nameOf(t.companyId))}</strong>${t.dueAt ? `<span>◷ ${esc(fmt(t.dueAt))}</span>` : ''}<span>${t.type==='note'?'Notiz':t.priority==='high'?'Hohe Priorität':t.priority==='low'?'Niedrige Priorität':'Aufgabe'}</span></div></div>
      <div class="task-actions"><button class="icon-button" title="Bearbeiten" aria-label="Bearbeiten" data-action="edit-task" data-id="${esc(t.id)}">✎</button><button class="icon-button" title="Löschen" aria-label="Löschen" data-action="delete-task" data-id="${esc(t.id)}">×</button></div>
    </article>`;
  }
  function mini(t) {
    return `<div class="mini-task"><button class="check-circle" aria-label="Erledigt" data-action="toggle-task" data-id="${esc(t.id)}"></button><div class="mini-task-main"><strong>${esc(t.title)}</strong><small>${esc(nameOf(t.companyId))}</small></div><div class="mini-task-date ${isOverdue(t) ? 'overdue' : ''}">${t.dueAt ? `${isOverdue(t)?'Überfällig · ':''}${esc(fmt(t.dueAt))}`:'Ohne Termin'}</div><button class="icon-button" aria-label="Bearbeiten" data-action="edit-task" data-id="${esc(t.id)}">›</button></div>`;
  }
  function dashboard() {
    const s = stats();
    const prioritized = byDate(openTasks()).slice(0,6);
    const upcoming = byDate(openTasks().filter(t=>t.dueAt && Date.parse(t.dueAt) >= Date.now())).slice(0,5);
    const hasCompany = state.companies.length > 0;
    return `${!hasCompany ? `<div class="welcome-banner"><div><h2>Willkommen bei FirmenPlaner!</h2><p>Lege zuerst eine Firma an, damit du Aufgaben und Notizen zuordnen kannst.</p></div><button class="btn btn-primary" data-action="new-company">+ Erste Firma</button></div>`:''}
      <div class="stat-grid"><div class="stat-card"><span class="stat-label">Offene Aufgaben</span><div class="stat-symbol">☷</div><strong>${s.open}</strong></div>
      <div class="stat-card urgent"><span class="stat-label">Überfällig</span><div class="stat-symbol">!</div><strong>${s.overdue}</strong></div>
      <div class="stat-card"><span class="stat-label">Heute fällig</span><div class="stat-symbol">◷</div><strong>${s.today}</strong></div>
      <div class="stat-card"><span class="stat-label">Erledigt</span><div class="stat-symbol">✓</div><strong>${s.done}</strong></div></div>
      <div class="section-bar"><h2>Deine nächsten Schritte</h2><button class="text-button" data-action="view-tasks">Alle Aufgaben ansehen →</button></div>
      <div class="dashboard-layout"><div class="panel"><h3 class="panel-title">Aktuelle Aufgaben</h3>${prioritized.length ? prioritized.map(mini).join('') : empty('✓','Alles im grünen Bereich','Aktuell hast du keine offenen Aufgaben.','Neue Aufgabe','new-task')}</div>
      <div class="panel"><h3 class="panel-title">Demnächst fällig</h3>${upcoming.length ? upcoming.map(t=>`<div class="mini-task"><div class="mini-task-main"><strong>${esc(t.title)}</strong><small>${esc(nameOf(t.companyId))}</small></div><div class="mini-task-date">${esc(fmt(t.dueAt))}</div></div>`).join('') : empty('◷','Keine Termine geplant','Plane eine neue Aufgabe mit Datum und Uhrzeit.')}</div></div>`;
  }
  function filteredItems() {
    const items = state.tasks.filter(t => state.view === 'notes' ? t.type === 'note' : t.type === 'task');
    return byDate(items.filter(t => {
      if (state.view !== 'notes') {
        if (state.filter === 'open' && t.status !== 'open') return false;
        if (state.filter === 'done' && t.status !== 'done') return false;
        if (state.filter === 'overdue' && !isOverdue(t)) return false;
      }
      if (state.companyFilter && t.companyId !== state.companyFilter) return false;
      const q = state.query.toLocaleLowerCase('de');
      return !q || [t.title, t.description, nameOf(t.companyId)].some(x=>x.toLocaleLowerCase('de').includes(q));
    }));
  }
  function itemsPage() {
    const isNotes = state.view === 'notes';
    const items = filteredItems();
    return `<div class="tools-row"><div class="search-wrap"><input id="task-search" type="search" placeholder="Suche nach Firma, Titel oder Beschreibung ..." value="${esc(state.query)}" aria-label="Einträge durchsuchen"></div>
    <select id="company-filter" aria-label="Nach Firma filtern">${companyOptions(true)}</select></div>
    ${!isNotes ? `<div class="segmented" role="group" aria-label="Statusfilter">${[['open','Offen'],['overdue','Überfällig'],['done','Erledigt'],['all','Alle']].map(([v,t])=>`<button data-action="filter" data-filter="${v}" class="${state.filter===v?'active':''}">${t}</button>`).join('')}</div>` : ''}
    <div class="section-bar"><h2>${isNotes?'Gespeicherte Notizen':'Aufgabenliste'} <small>(${items.length})</small></h2><button class="text-button" data-action="${isNotes?'new-note':'new-task'}">+ ${isNotes?'Notiz':'Aufgabe'}</button></div>
    <div class="task-list">${items.length ? items.map(card).join('') : empty(isNotes?'▤':'☷','Keine Einträge gefunden',state.query?'Versuche einen anderen Suchbegriff.':isNotes?'Hier kannst du deine erste Notiz speichern.':'Hier kannst du deine erste Aufgabe erstellen.',isNotes?'Neue Notiz':'Neue Aufgabe',isNotes?'new-note':'new-task')}</div>`;
  }
  function companiesPage() {
    const companies = [...state.companies].sort((a,b)=>a.name.localeCompare(b.name, 'de'));
    return `<div class="section-bar companies-section"><h2>Firmenverzeichnis <small>(${companies.length})</small></h2><button class="btn btn-primary" data-action="new-company">+ Firma hinzufügen</button></div>
      ${companies.length ? `<div class="company-grid">${companies.map(c=>{
        const assigned = state.tasks.filter(t=>t.companyId===c.id);
        const open = assigned.filter(t=>t.type==='task'&&t.status==='open').length;
        return `<div class="company-card"><div class="company-head"><div class="company-avatar">${esc(c.name.substring(0,2).toLocaleUpperCase('de'))}</div><div><h3>${esc(c.name)}</h3><small>${esc(c.contact || 'Kein Ansprechpartner hinterlegt')}</small></div></div>
          <div class="company-foot"><span>${open} offene Aufgaben · ${assigned.length} Einträge</span><div><button data-action="edit-company" data-id="${esc(c.id)}">Bearbeiten</button><button data-action="view-company" data-id="${esc(c.id)}">Ansehen ›</button><button data-action="delete-company" data-id="${esc(c.id)}" title="Firma löschen">×</button></div></div></div>`;
      }).join('')}</div>` : empty('▦','Noch keine Firmen','Lege deine erste Firma an, um Aufgaben zu erfassen.','Firma erstellen','new-company')}`;
  }
  function pushEnvironmentIssue() {
    if (!window.isSecureContext) return 'Unsichere Verbindung: Öffne FirmenPlaner am PC über http://localhost:4173 oder über eine HTTPS-Adresse. Über normale HTTP-IP-Adressen ist Push gesperrt.';
    if (!('Notification' in window)) return 'Dieser Browser unterstützt keine Web-Benachrichtigungen.';
    if (!('serviceWorker' in navigator)) return 'Service Worker werden in diesem Browser nicht unterstützt.';
    if (!('PushManager' in window)) return 'Web Push ist in diesem Browser nicht verfügbar.';
    return '';
  }
  function pushStatus(message, error = false) {
    const el = $('push-state');
    if (el) { el.textContent = message; el.classList.toggle('push-error', error); }
  }
  function settingsPage() {
    const issue = pushEnvironmentIssue();
    return `<div class="setting-stack">
      <div class="panel setting-card"><h3>Push-Erinnerungen</h3><p>Erhalte Nachrichten zum Fälligkeitszeitpunkt und optional eine Vorwarnung – auch wenn die PWA geschlossen ist. Dafür muss der Server weiterlaufen und das Gerät über HTTPS verbunden sein (am PC ist localhost ebenfalls möglich).</p>
        <div class="setting-status"><span class="online-dot"></span><span id="push-state" role="status" aria-live="polite">${issue ? esc(issue) : 'Push-Status wird geprüft ...'}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:9px"><button id="push-enable" class="btn btn-primary" data-action="enable-push">Benachrichtigungen aktivieren</button><button class="btn btn-secondary" data-action="local-push-test">Lokale Testmeldung</button><button class="btn btn-secondary" data-action="test-push">Push-Test senden</button><button class="btn btn-secondary" data-action="disable-push">Für dieses Gerät ausschalten</button></div>
        <p class="push-explainer">Der lokale Test prüft Chrome und Windows. Der Push-Test prüft zusätzlich die Verbindung zum Push-Dienst. Erscheint kein Chrome-Dialog, lies die Statusmeldung direkt über den Knöpfen.</p></div>
      <div class="panel setting-card"><h3>Kontakt für iPhone-Push</h3><p>Einige Apple-Push-Dienste verlangen eine echte Kontaktadresse des Servers. Trage hier deine E-Mail-Adresse oder die HTTPS-Adresse deiner eigenen Domain ein. Diese Angabe wird dem Push-Dienst im signierten VAPID-Token übermittelt.</p><input id="push-contact" type="text" placeholder="z. B. ich@meinedomain.at oder https://meinedomain.at" class="setting-input"><button class="btn btn-secondary" data-action="save-push-config">Kontakt speichern</button></div>
      <div class="panel setting-card"><h3>Datensicherung</h3><p>Exportiere alle Firmen, Aufgaben und Notizen in eine JSON-Sicherungsdatei. Der Server speichert außerdem dauerhaft in seinem Datenordner.</p><button class="btn btn-secondary" data-action="export">Daten als JSON exportieren</button></div>
      <div class="panel setting-card"><h3>Software-Updates</h3><p>FirmenPlaner sucht automatisch nach neuen GitHub-Releases. Bei einem Update kannst du es direkt installieren, ohne Dateien selbst herunterzuladen. Deine Aufgaben und Firmen bleiben gespeichert.</p>
        <p id="update-state" class="push-explainer" role="status" aria-live="polite">Update-Status wird geladen ...</p>
        <label class="field-label" for="update-repo">Einmalige Updatequelle (öffentliches GitHub-Repository)</label>
        <input id="update-repo" class="setting-input" type="text" placeholder="benutzer/firmenplaner" autocomplete="off" spellcheck="false" maxlength="180">
        <label class="update-toggle"><input type="checkbox" id="update-auto" checked> Neue Version beim nächsten Programmstart automatisch installieren</label>
        <div class="update-buttons"><button class="btn btn-secondary" data-action="save-update-config">Updatequelle speichern</button><button class="btn btn-secondary" data-action="check-updates">Nach Updates suchen</button><button class="btn btn-primary" id="install-update" data-action="install-update" hidden>Update installieren und neu starten</button></div>
        <p class="push-explainer">Updatequelle: <code>GitHub-Benutzer/Repository</code>. Erforderlich sind veröffentlichte Releases mit den Dateien <code>update.json</code> und <code>firmenplaner-update.zip</code>. Die Verbindung benötigt Internet.</p></div>
      <div class="panel setting-card"><h3>Diese Version</h3><p>FirmenPlaner 1.1.1 · Einzelbenutzer-Konto mit gemeinsamen Aufgaben auf allen verbundenen Geräten. Für die Smartphone-Nutzung brauchst du eine HTTPS-Adresse zu deinem Server.</p><button class="btn btn-secondary" data-action="logout">Abmelden</button></div>
    </div>`;
  }
  function render() {
    const [eyebrow, title, subtitle] = headings[state.view];
    $('page-eyebrow').textContent = eyebrow; $('page-title').textContent = title; $('page-subtitle').textContent = subtitle;
    document.querySelectorAll('[data-view]').forEach(el=>{
      const selected = el.dataset.view === state.view;
      el.classList.toggle('active', selected);
      if (selected) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    $('content').innerHTML = ({dashboard, tasks:itemsPage, notes:itemsPage, companies:companiesPage, settings:settingsPage})[state.view]();
    const companyFilter = $('company-filter');
    if (companyFilter) companyFilter.value = state.companyFilter;
    if (state.view === 'settings') { void updatePushStatus(); void loadPushConfig(); void loadUpdateStatus(); }
  }
  function navigate(view, { companyFilter = '' }={}) {
    state.view = view; state.query = ''; state.filter = 'open'; state.companyFilter = companyFilter;
    render(); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.view)));
  $('quick-task').addEventListener('click',()=>openEntry('task'));
  $('quick-note').addEventListener('click',()=>openEntry('note'));

  function localDatetime(utc) {
    if (!utc) return '';
    const d = new Date(utc), pad = n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function futureDefault() {
    const d = new Date(); d.setMinutes(0,0,0); d.setHours(d.getHours()+1); return localDatetime(d.toISOString());
  }
  function toggleTaskOptions() { $('task-options').hidden = $('entry-type').value === 'note'; }
  $('entry-type').addEventListener('change', toggleTaskOptions);
  function openEntry(type='task', existing=null) {
    if (!state.companies.length) { toast('Lege bitte zuerst eine Firma an.'); openCompany(); return; }
    state.editing = existing?.id || null;
    $('entry-modal-title').textContent = existing ? (existing.type==='note'?'Notiz bearbeiten':'Aufgabe bearbeiten') : (type==='note'?'Neue Notiz':'Neue Aufgabe');
    $('entry-type').value = existing?.type || type;
    $('entry-company').innerHTML = companyOptions(false);
    $('entry-company').value = existing?.companyId || state.companyFilter || (state.companies.length === 1 ? state.companies[0].id : '');
    $('entry-title').value = existing?.title || '';
    $('entry-description').value = existing?.description || '';
    $('entry-due').value = existing?.dueAt ? localDatetime(existing.dueAt) : (type === 'task' ? futureDefault() : '');
    $('entry-reminder').value = String(existing?.remindBefore ?? 0);
    $('entry-priority').value = existing?.priority || 'normal';
    $('entry-status').value = existing?.status || 'open';
    toggleTaskOptions(); showError('entry-error',''); $('entry-dialog').showModal();
    setTimeout(()=>$('entry-title').focus(),80);
  }
  function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(el=>el.close()); }
  document.querySelectorAll('.close-dialog').forEach(el=>el.addEventListener('click', closeDialogs));
  document.querySelectorAll('dialog').forEach(el=>el.addEventListener('click', e=>{ if(e.target === el) el.close(); }));
  $('entry-company-add').addEventListener('click',()=>{ entryReturn = true; openCompany(); });
  $('entry-form').addEventListener('submit', async e=>{
    e.preventDefault(); showError('entry-error','');
    const type=$('entry-type').value;
    const date = $('entry-due').value;
    const body = {
      type, companyId:$('entry-company').value, title:$('entry-title').value, description:$('entry-description').value,
      dueAt:type==='task'&&date?new Date(date).toISOString():null,
      remindBefore:type==='task'?Number($('entry-reminder').value):0,
      priority: $('entry-priority').value, status: $('entry-status').value
    };
    if (!body.companyId) return showError('entry-error','Bitte eine Firma auswählen.');
    const btn=$('entry-save'); btn.disabled=true;
    try {
      if (state.editing) await patch(`/api/tasks/${state.editing}`,body); else await post('/api/tasks',body);
      $('entry-dialog').close(); await reload(); toast(type==='note'?'Notiz gespeichert':'Aufgabe gespeichert');
    } catch(err) { showError('entry-error',err.message); }
    finally { btn.disabled=false; }
  });
  function openCompany(existing=null) {
    state.editingCompany=existing?.id||null;
    $('company-modal-title').textContent=existing?'Firma bearbeiten':'Neue Firma';
    $('company-name').value=existing?.name||''; $('company-contact').value=existing?.contact||'';
    showError('company-error',''); $('company-dialog').showModal();
  }
  $('company-form').addEventListener('submit',async e=>{
    e.preventDefault(); showError('company-error','');
    try {
      const b={name:$('company-name').value,contact:$('company-contact').value};
      const saved=state.editingCompany?await patch(`/api/companies/${state.editingCompany}`,b):await post('/api/companies',b);
      const returnToEntry=entryReturn;
      $('company-dialog').close(); await reload();
      if (returnToEntry && $('entry-dialog').open) { $('entry-company').innerHTML=companyOptions(false);$('entry-company').value=saved.id; }
      entryReturn=false; toast('Firma gespeichert');
    } catch(err) { showError('company-error',err.message); }
  });
  $('company-dialog').addEventListener('close',()=>{entryReturn=false;});
  $('content').addEventListener('input',e=>{
    if (e.target.id==='task-search') {
      const pos=e.target.selectionStart;
      state.query=e.target.value;
      render();
      const input=$('task-search'); if(input){input.focus();input.setSelectionRange(pos,pos);}
    }
  });
  $('content').addEventListener('change',e=>{
    if (e.target.id==='company-filter'){state.companyFilter=e.target.value;render();}
  });
  $('content').addEventListener('click', async e=>{
    const b=e.target.closest('[data-action]'); if(!b)return;
    const action=b.dataset.action, id=b.dataset.id;
    try {
      if (action==='new-task') return openEntry('task');
      if (action==='new-note') return openEntry('note');
      if (action==='new-company') return openCompany();
      if (action==='edit-company') return openCompany(state.companies.find(c=>c.id===id));
      if (action==='view-company') return navigate('tasks',{companyFilter:id});
      if (action==='delete-company') {
        if (!window.confirm('Firma löschen? Das geht nur, wenn keine Aufgaben oder Notizen zugeordnet sind.'))return;
        await del(`/api/companies/${id}`); await reload();toast('Firma gelöscht');return;
      }
      if (action==='view-tasks') return navigate('tasks');
      if (action==='filter'){state.filter=b.dataset.filter;render();return;}
      if (action==='edit-task') return openEntry('task',state.tasks.find(t=>t.id===id));
      if (action==='delete-task') {
        if (!window.confirm('Diesen Eintrag wirklich löschen?')) return;
        await del(`/api/tasks/${id}`); await reload();toast('Eintrag gelöscht');return;
      }
      if (action==='toggle-task') {
        const t=state.tasks.find(t=>t.id===id);if(!t)return;
        await patch(`/api/tasks/${id}`,{...t,status:t.status==='open'?'done':'open'});
        await reload();toast(t.status==='done'?'Aufgabe wieder geöffnet':'Aufgabe erledigt');return;
      }
      if (action==='save-push-config') {const result=await post('/api/push/config',{subject:$('push-contact').value});$('push-contact').value=result.subject.replace(/^mailto:/,'');toast('Push-Kontakt gespeichert');return;}
      if (action==='enable-push') return enablePush();
      if (action==='disable-push') return disablePush();
      if (action==='local-push-test') return localPushTest();
      if (action==='test-push') {
        pushStatus('Sende Test an den Push-Dienst ...');
        const result=await post('/api/push/test',{});
        const message=result.delivered?`Test an Push-Dienst für ${result.delivered} Gerät(e) gesendet. Prüfe nun die Windows-Benachrichtigung.`:result.failed?'Push-Dienst nicht erreichbar. Prüfe Verbindung oder Push-Kontakt.':'Kein Gerät registriert. Bitte zuerst Push aktivieren.';
        pushStatus(message, !result.delivered);
        return toast(message);
      }
      if (action==='save-update-config') return saveUpdateConfig();
      if (action==='check-updates') return checkForUpdates();
      if (action==='install-update') return installUpdate();
      if (action==='export') return exportBackup();
      if (action==='logout') {
        await post('/api/logout',{}); showGate(false); return;
      }
    }catch(err){toast(err.message);}
  });
  function urlB64ToUint8Array(base64) {
    const padding='='.repeat((4-base64.length%4)%4);
    const base64Proper=(base64+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64Proper);
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  async function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]).finally(() => clearTimeout(timer));
  }
  async function pushRegistration() {
    const issue = pushEnvironmentIssue();
    if (issue) throw new Error(issue);
    await withTimeout(navigator.serviceWorker.register('/sw.js'), 12000, 'Service Worker konnte nicht rechtzeitig registriert werden. Bitte Seite neu laden.');
    return withTimeout(navigator.serviceWorker.ready, 12000, 'Service Worker ist nicht bereit. Öffne die Chrome-Entwicklertools und prüfe Application → Service Workers.');
  }
  async function loadPushConfig() { try { const x=await api('/api/push/config'); const el=$('push-contact'); if(el && document.activeElement!==el)el.value=x.subject.replace(/^mailto:/,''); } catch {} }
  async function updatePushStatus() {
    const el=$('push-state'); if(!el || state.pushBusy)return;
    const issue=pushEnvironmentIssue();
    if(issue) {pushStatus(issue, true);return;}
    if(Notification.permission==='denied') {pushStatus('Benachrichtigungen sind in Chrome blockiert. Klicke links neben der Adresse auf das Website-Symbol und erlaube Benachrichtigungen.',true);return;}
    if(Notification.permission==='default') {pushStatus('Noch nicht erlaubt: Klicke auf „Benachrichtigungen aktivieren“.');return;}
    try {
      const reg=await pushRegistration();
      if(!el.isConnected || state.pushBusy)return;
      const sub=await reg.pushManager.getSubscription();
      if(!el.isConnected || state.pushBusy)return;
      pushStatus(sub?'Push ist auf diesem Gerät aktiviert.':'Chrome erlaubt Benachrichtigungen, aber Push ist noch nicht registriert.');
    }catch(err){if(el.isConnected && !state.pushBusy)pushStatus(err.message,true);}
  }
  async function enablePush() {
    if(state.pushBusy)return;
    state.pushBusy=true;
    const button=$('push-enable');
    if(button){button.disabled=true;button.textContent='Wird aktiviert ...';}
    try {
      const issue=pushEnvironmentIssue();
      if(issue)throw new Error(issue);
      if(Notification.permission==='denied') throw new Error('Chrome blockiert Benachrichtigungen. Klicke links neben der Adresse auf das Website-Symbol, erlaube Benachrichtigungen und lade die Seite neu.');
      // Request directly from the click handler, BEFORE waiting for the service worker:
      // Chrome can lose the transient user gesture during an awaited registration.
      const permissionPromise=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
      pushStatus('Prüfe die Berechtigung in Chrome ...');
      const permission=await permissionPromise;
      if(permission!=='granted')throw new Error(permission==='denied'?'Chrome hat Benachrichtigungen blockiert. Bitte in den Website-Einstellungen erlauben.':'Du hast die Freigabe noch nicht bestätigt. Klicke erneut auf Aktivieren und wähle „Zulassen“.');
      pushStatus('Chrome erlaubt Benachrichtigungen. Registriere Push ...');
      const reg=await pushRegistration();
      let sub=await reg.pushManager.getSubscription();
      if(!sub) sub=await withTimeout(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToUint8Array(state.vapidKey)}), 15000, 'Die Registrierung beim Chrome-Push-Dienst hat zu lange gedauert. Prüfe deine Internetverbindung.');
      await post('/api/push/subscribe',{subscription:sub.toJSON()});
      pushStatus('Push-Erinnerungen aktiviert! Teste jetzt mit „Lokale Testmeldung“.');
      toast('Push-Erinnerungen sind auf diesem Gerät aktiviert');
    }catch(err){console.error('Push-Aktivierung:',err);pushStatus(err.message,true);toast(err.message);}
    finally{state.pushBusy=false;if(button?.isConnected){button.disabled=false;button.textContent='Benachrichtigungen aktivieren';}}
  }
  async function localPushTest() {
    try {
      const issue=pushEnvironmentIssue();
      if(issue)throw new Error(issue);
      if(Notification.permission!=='granted')throw new Error('Zuerst „Benachrichtigungen aktivieren“ anklicken und Chrome die Erlaubnis geben.');
      pushStatus('Erstelle lokale Testbenachrichtigung ...');
      const reg=await pushRegistration();
      await reg.showNotification('FirmenPlaner – lokaler Test', { body:'Chrome und Windows können Benachrichtigungen anzeigen.', icon:'/icon-192.png', tag:`local-push-test-${Date.now()}` });
      pushStatus('Lokale Testmeldung wurde ausgelöst. Falls keine Nachricht sichtbar ist: Windows → System → Benachrichtigungen prüfen.');
    }catch(err){console.error('Lokaler Benachrichtigungstest:',err);pushStatus(err.message,true);toast(err.message);}
  }
  async function disablePush() {
    try {
      const reg=await pushRegistration(), sub=await reg.pushManager.getSubscription();
      if (!sub){toast('Hier sind keine Push-Erinnerungen aktiv');return;}
      await post('/api/push/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();
      toast('Push-Erinnerungen auf diesem Gerät deaktiviert');await updatePushStatus();
    }catch(err){toast(err.message);}
  }
  let currentUpdateVersion='1.1.1';
  let updatingNow=false;
  function showUpdateStatus(data) {
    const info=$('update-state'),repo=$('update-repo'),automatic=$('update-auto'),install=$('install-update');
    if(!info)return;
    currentUpdateVersion=data.version||currentUpdateVersion;
    if(repo && document.activeElement!==repo)repo.value=data.repo||'';
    if(automatic && document.activeElement!==automatic)automatic.checked=Boolean(data.autoOnStart);
    const phases={current:'Aktuell',available:'Update verfügbar',checking:'Prüfe',downloading:'Lade herunter',installing:'Installiere',error:'Fehler',idle:'Bereit','not-configured':'Nicht eingerichtet'};
    info.textContent=`Aktuelle Version: ${currentUpdateVersion} · ${phases[data.phase]||data.phase||'Bereit'}. ${data.message||''}`;
    if(install)install.hidden=!data.availableVersion||data.busy;
    if(install && data.availableVersion) install.textContent=`Version ${data.availableVersion} installieren und neu starten`;
  }
  async function loadUpdateStatus(){
    try{showUpdateStatus(await api('/api/updates'));}
    catch(err){const el=$('update-state');if(el)el.textContent=`Update-Manager nicht erreichbar: ${err.message}. Starte die App mit start-windows.bat.`;}
  }
  async function saveUpdateConfig(){
    const repo=$('update-repo')?.value.trim()||'';
    const autoOnStart=Boolean($('update-auto')?.checked);
    try{showUpdateStatus(await post('/api/updates/config',{repo,autoOnStart}));toast('Update-Einstellungen gespeichert');}
    catch(err){toast(err.message);}
  }
  async function checkForUpdates(){
    const info=$('update-state');if(info)info.textContent='Suche nach Updates ...';
    try{showUpdateStatus(await post('/api/updates/check',{}));}
    catch(err){if(info)info.textContent=err.message;toast(err.message);}
  }
  async function installUpdate(){
    if(updatingNow)return;
    if(!window.confirm('Neue Version installieren? Der FirmenPlaner wird kurz neu gestartet. Bitte vorher ungespeicherte Änderungen sichern.'))return;
    updatingNow=true;
    try{
      const result=await post('/api/updates/install',{});
      const info=$('update-state');if(info)info.textContent=`Version ${result.version} wird installiert. Das Fenster geöffnet lassen ...`;
      const installed=result.version;
      for(let count=0;count<90;count++) {
        await new Promise(resolve=>setTimeout(resolve,1500));
        try{
          const status=await api('/api/updates');
          showUpdateStatus(status);
          if(status.version===installed){
            if('serviceWorker' in navigator){try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}catch{}}
            window.location.reload();return;
          }
          if(status.phase==='error'){toast(status.message);return;}
        }catch{}
      }
      toast('Update läuft noch. Falls nötig, FirmenPlaner erneut öffnen.');
    }catch(err){toast(err.message);}finally{updatingNow=false;}
  }
  // Keep the installed PWA fresh when the server receives a new version.
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!$('app').hidden && !document.querySelector('dialog[open]') && !updatingNow)window.location.reload();
    });
    setInterval(()=>{if(!document.hidden)void navigator.serviceWorker.getRegistration().then(r=>r?.update()).catch(()=>{});},15*60*1000);
  }
  async function exportBackup() {
    const response=await api('/api/export');
    const blob=new Blob([JSON.stringify(response,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`firmenplaner-backup-${today()}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Datensicherung exportiert');
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e=>{
    const task=state.tasks.find(t=>t.id===e.data?.taskId);
    if(task){navigate('tasks');openEntry('task',task);}
  });
  // Sync changes from another device while this app is open.
  setInterval(()=>{
    if (!$('app').hidden && !document.hidden && !document.querySelector('dialog[open]')) {
      void api('/api/bootstrap').then(data=>{
        const changed=JSON.stringify(data.tasks)!==JSON.stringify(state.tasks) || JSON.stringify(data.companies)!==JSON.stringify(state.companies);
        if(changed){state.tasks=data.tasks;state.companies=data.companies;render();}
      }).catch(()=>{});
    }
  },60000);
  void initialize();
})();
