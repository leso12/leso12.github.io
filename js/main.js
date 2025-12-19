(function(){
  'use strict';

  const S = window.StateStore;
  const MS = window.MemberSystem;
  const RS = window.RelationSystem;
  const EE = window.EventEngine;

  let state = null;

  const els = {};
  function $(id){ return document.getElementById(id); }

  function toast(msg){
    const t = els.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>t.classList.remove('show'), 1600);
  }

  function setTopStatus(){
    els.topStatus.textContent = `Day ${state.day} · 소지금 ${state.money}`;
  }

  function activityById(id){
    return (window.AppData?.schedules?.activities || []).find(a => a.id === id) || null;
  }

  function availableActivitiesForUI(){
    const list = window.AppData.schedules.activities.slice();
    return list.filter(a => isActivityAvailable(a));
  }

  function isActivityAvailable(act){
    const w = act.availableWhen || null;
    if(!w) return true;
    if(w.comebackActive && !state.album.comeback.active) return false;
    if(w.concertPlanned && !state.concert.planned) return false;
    if(w.concertNotStarted){
      if(!state.concert.planned) return false;
      if(state.day >= state.concert.startDay) return false;
    }
    return true;
  }

  function ensureRelations(){
    for(let i=0;i<state.members.length;i++){
      for(let j=i+1;j<state.members.length;j++){
        MS.getRelation(state, state.members[i].id, state.members[j].id);
      }
    }
  }

  function migrateIfNeeded(){
    state.settings = state.settings || window.AppData.config.defaults;
    state.dayBlocks = state.dayBlocks || [];
    state.log = state.log || [];
    state.manual = state.manual || { assignments: {} };
    state.album = state.album || { composerId:null, arrangerId:null, progress:{lyrics:0,vocal:0,dance:0}, released:false, comeback:{active:false,startDay:null,daysLeft:0,narrativeCounter:0} };
    state.concert = state.concert || { planned:false, startDay:null };
    state.relations = state.relations || {};
    ensureRelations();
  }

  function save(){ S.saveState(state); }

  function toggleTheme(){
    state.theme = (state.theme === 'dark') ? 'light' : 'dark';
    S.applyTheme(state.theme);
    save();
    toast(state.theme === 'dark' ? '다크 모드' : '라이트 모드');
    renderAll();
  }

  // -------- Scheduling --------
  function buildAutoAssignments(){
    const assign = {};
    const albumNeedLyrics = state.album.progress.lyrics < 100;
    const albumNeedVocal = state.album.progress.vocal < 100;
    const albumNeedDance = state.album.progress.dance < 100;

    for(const m of state.members){
      const c = m.condition;

      if(c.health <= 25 || c.fatigue >= 80 || c.stress >= 85){
        assign[m.id] = (Math.random()<0.6) ? 'rest_sleep' : 'rest_chill';
        continue;
      }

      if(state.album.comeback.active){
        const r = Math.random();
        if(r < 0.20) { assign[m.id] = 'music_show'; continue; }
        if(r < 0.34) { assign[m.id] = 'fansign'; continue; }
        if(r < 0.42) { assign[m.id] = 'live_stream'; continue; }
      }

      if(state.concert.planned && state.day < state.concert.startDay){
        const left = state.concert.startDay - state.day;
        if(left <= 10 && Math.random() < (left<=4 ? 0.7 : 0.45)){
          assign[m.id] = 'concert_practice';
          continue;
        }
      }

      if(albumNeedLyrics && state.album.composerId && m.id === state.album.composerId){
        assign[m.id] = 'compose'; continue;
      }
      if(albumNeedLyrics && state.album.arrangerId && m.id === state.album.arrangerId && Math.random()<0.55){
        assign[m.id] = 'arrange'; continue;
      }

      if(albumNeedVocal && (m.position==='main_vocal' || m.position==='vocal') && Math.random()<0.8){
        assign[m.id] = 'vocal_practice'; continue;
      }
      if(albumNeedDance && (m.position==='main_dance' || m.position==='dance') && Math.random()<0.8){
        assign[m.id] = 'dance_practice'; continue;
      }
      if(m.position==='main_rap' || m.position==='rap'){
        assign[m.id] = (Math.random()<0.65) ? 'rap_practice' : 'dance_practice'; continue;
      }

      const weak = Object.entries(m.stats).sort((a,b)=>a[1]-b[1])[0][0];
      if(weak==='vocal') assign[m.id]='vocal_practice';
      else if(weak==='dance') assign[m.id]='dance_practice';
      else if(weak==='rap') assign[m.id]='rap_practice';
      else if(weak==='compose') assign[m.id]='compose';
      else if(weak==='arrange') assign[m.id]='arrange';
      else assign[m.id]='rest_walk';
    }

    return assign;
  }

  function normalizeManualAssignments(){
    state.manual.assignments = state.manual.assignments || {};
    const ids = new Set(state.members.map(m=>m.id));
    for(const k of Object.keys(state.manual.assignments)){
      if(!ids.has(k)) delete state.manual.assignments[k];
    }
  }

  function decideAssignmentsForToday(){
    normalizeManualAssignments();
    const manualCount = Object.keys(state.manual.assignments).length;
    if(manualCount>0){
      const out = {};
      for(const m of state.members){
        out[m.id] = state.manual.assignments[m.id] || 'rest_sleep';
      }
      return { assignments: out, mode:'manual' };
    }
    return { assignments: buildAutoAssignments(), mode:'auto' };
  }

  function applyActivity(member, act){
    const eff = act.effects || {};
    member.condition.health = window.AppData.clamp(member.condition.health + (eff.health||0), 0, 100);
    member.condition.fatigue = window.AppData.clamp(member.condition.fatigue + (eff.fatigue||0), 0, 100);
    member.condition.stress = window.AppData.clamp(member.condition.stress + (eff.stress||0), 0, 100);

    if(Number.isFinite(member.weight)){
      member.weight = Math.round((member.weight + (eff.weight||0)) * 10) / 10;
    }

    let gain = null;
    if(act.skill && act.skillGain){
      const chance = act.skillGain.chance ?? 0.7;
      const val = (Math.random() < chance) ? window.AppData.randInt(act.skillGain.min, act.skillGain.max) : 0;
      member.stats[act.skill] = (member.stats[act.skill]||0) + val;
      gain = { skill: act.skill, val };
    }
    return gain;
  }

  function updateAlbumProgress(assignments){
    let lyricsDelta = 0;
    let vocalDelta = 0;
    let danceDelta = 0;

    for(const m of state.members){
      const actId = assignments[m.id];
      if(actId==='compose'){
        lyricsDelta += 8 + Math.min(8, (m.stats.compose||0)*0.2);
      }
      if(actId==='arrange'){
        lyricsDelta += 4 + Math.min(6, (m.stats.arrange||0)*0.15);
      }
      if(actId==='vocal_practice'){
        vocalDelta += 6 + Math.min(5, (m.stats.vocal||0)*0.1);
      }
      if(actId==='dance_practice'){
        danceDelta += 6 + Math.min(5, (m.stats.dance||0)*0.1);
      }
      if(actId==='concert_practice'){
        danceDelta += 3;
      }
      if(actId==='music_show' || actId==='fansign' || actId==='live_stream'){
        vocalDelta += 1;
        danceDelta += 1;
      }
    }

    const n = Math.max(1, state.members.length);
    lyricsDelta = lyricsDelta / Math.sqrt(n);
    vocalDelta = vocalDelta / Math.sqrt(n);
    danceDelta = danceDelta / Math.sqrt(n);

    state.album.progress.lyrics = window.AppData.clamp(state.album.progress.lyrics + lyricsDelta, 0, 100);
    state.album.progress.vocal = window.AppData.clamp(state.album.progress.vocal + vocalDelta, 0, 100);
    state.album.progress.dance = window.AppData.clamp(state.album.progress.dance + danceDelta, 0, 100);
  }

  // -------- Log helpers --------
  let currentBlock = null;

  function pushAutoLog(icon, text){
    currentBlock.auto.push({icon, text, kind:'auto'});
  }
  function pushActLog(icon, text){
    currentBlock.activities.push({icon, text, kind:'activity'});
  }

  function emitSomeTransitionIfNeeded(aId, bId, beforeAff, afterAff, emit){
    const rel = MS.getRelation(state, aId, bId);
    if(rel.dating) return;
    if(beforeAff >= state.settings.loveThreshold) return;
    if(afterAff < state.settings.loveThreshold) return;

    const A = state.members.find(m=>m.id===aId);
    const B = state.members.find(m=>m.id===bId);
    if(!A || !B) return;
    if(!RS.romancePossible(state, A, B)) return;

    const ev = EE.pickEvent('some_transition', state, {A:A.name, B:B.name});
    emit(ev ? ev.icon : '💞', ev ? ev.text : `${A.name}와 ${B.name} 사이가 전과 다르게 미묘해졌습니다.`);
  }

  function applyAffectionWithSome(aId, bId, delta, emit){
    const rel = MS.getRelation(state, aId, bId);
    const before = rel.affection;
    RS.applyAffection(state, aId, bId, delta);
    const after = rel.affection;
    if(delta > 0) emitSomeTransitionIfNeeded(aId, bId, before, after, emit);
  }

  function createDayBlock(dayStartMoney){
    return {
      day: state.day,
      moneyStart: dayStartMoney,
      moneyEnd: dayStartMoney,
      auto: [],
      activities: []
    };
  }

  function flattenLogStrings(){
    const out = [];
    for(const block of state.dayBlocks){
      out.push(`Day ${block.day} 종료 (소지금: ${block.moneyEnd})`);
      if(block.auto && block.auto.length){
        out.push('자동 이벤트');
        for(const e of block.auto) out.push(`- ${e.text}`);
      }
      if(block.activities && block.activities.length){
        out.push('활동');
        for(const e of block.activities) out.push(`- ${e.text}`);
      }
      out.push(`Day ${block.day}`);
      out.push('--------------------------------');
    }
    state.log = out;
  }

  // -------- Event mechanics --------
  function maybeStartConcert(){
    if(state.concert.planned && state.day >= state.concert.startDay){
      const ctx = Object.assign({}, state, {_concertStart:true});
      const ev = EE.pickEvent('concert_event', ctx, {});
      pushAutoLog(ev ? ev.icon : '🎟️', ev ? ev.text : '콘서트가 열렸습니다. 무대가 꽉 찼습니다.');
      state.concert.planned = false;
      state.concert.startDay = null;
    }
  }

  function maybeComebackNarrative(){
    if(!state.album.comeback.active) return;
    const start = state.album.comeback.startDay;
    const daysSince = state.day - start;
    if(daysSince < state.settings.comebackNarrativeStartAfterDays) return;

    const allowNegative = Math.random() < 0.28;
    const ctx = Object.assign({}, state, {_allowNegative: allowNegative});
    const ev = EE.pickEvent('comeback_reaction', ctx, {});
    if(ev) pushAutoLog(ev.icon, ev.text);
  }

  function maybeComebackEnd(){
    if(!state.album.comeback.active) return;
    state.album.comeback.daysLeft -= 1;
    if(state.album.comeback.daysLeft <= 0){
      const ctx = Object.assign({}, state, {_comebackSummary:true});
      const ev = EE.pickEvent('comeback_summary', ctx, {});
      pushAutoLog(ev ? ev.icon : '🏁', ev ? ev.text : '컴백 활동이 마무리됐습니다.');
      state.album.comeback.active = false;
      state.album.comeback.startDay = null;
      state.album.comeback.daysLeft = 0;
      state.album.comeback.narrativeCounter = 0;
    }
  }

  function randomPair(){
    if(state.members.length < 2) return null;
    const a = state.members[Math.floor(Math.random()*state.members.length)];
    let b = a;
    let guard = 0;
    while(b.id===a.id && guard++<12){
      b = state.members[Math.floor(Math.random()*state.members.length)];
    }
    if(a.id===b.id) return null;
    return [a,b];
  }

  function isMemberDatingSomeoneElse(memberId, partnerId){
    for(const key of Object.keys(state.relations)){
      const rel = state.relations[key];
      if(!rel.dating) continue;
      const [a,b] = key.split('|');
      if(a===memberId && b!==partnerId) return true;
      if(b===memberId && a!==partnerId) return true;
    }
    return false;
  }

  function clearJealousyFlags(){
    for(const key of Object.keys(state.relations)){
      state.relations[key].jealousyTargetId = null;
    }
  }

  function runRelationshipAutoEvents(){
    if(state.members.length < 2) return;

    const max = state.settings.autoEventMaxPerDay;
    if(max <= 0) return;

    let created = 0;

    // reconcile (cold only)
    const coldKeys = Object.keys(state.relations).filter(k => state.day <= (state.relations[k].coldUntilDay||0));
    for(const k of coldKeys){
      if(created >= max) break;
      if(Math.random() > state.settings.reconcileChance) continue;
      const [aId,bId] = k.split('|');
      const A = state.members.find(m=>m.id===aId);
      const B = state.members.find(m=>m.id===bId);
      if(!A || !B) continue;

      const ctx = Object.assign({}, state, {_coldPair:true});
      const ev = EE.pickEvent('pair_reconcile', ctx, {A:A.name, B:B.name});
      RS.clearCold(state, aId, bId);
      applyAffectionWithSome(aId, bId, 10, pushAutoLog);
      pushAutoLog(ev ? ev.icon : '🤍', ev ? ev.text : `${A.name}와 ${B.name}가 화해했습니다.`);
      created++;
    }

    // breakup
    const datingKeys = Object.keys(state.relations).filter(k => state.relations[k].dating);
    for(const k of datingKeys){
      if(created >= max) break;
      const [aId,bId] = k.split('|');
      if(!RS.tryBreakup(state,aId,bId)) continue;
      const A = state.members.find(m=>m.id===aId);
      const B = state.members.find(m=>m.id===bId);
      if(!A || !B) continue;

      const ctx = Object.assign({}, state, {_datingPair:true});
      const ev = EE.pickEvent('pair_breakup', ctx, {A:A.name, B:B.name});
      RS.setDating(state, aId, bId, false);
      applyAffectionWithSome(aId, bId, -10, pushAutoLog);
      pushAutoLog(ev ? ev.icon : '💔', ev ? ev.text : `${A.name}와 ${B.name}가 이별했습니다.`);
      created++;
    }

    // jealousy
    if(state.settings.romanceEnabled && created < max){
      const couples = Object.keys(state.relations).filter(k => state.relations[k].dating);
      for(const k of couples){
        if(created >= max) break;
        if(Math.random() > 0.22) continue;
        const [aId,bId] = k.split('|');
        const A = state.members.find(m=>m.id===aId);
        const B = state.members.find(m=>m.id===bId);
        if(!A || !B) continue;
        const others = state.members.filter(m=>m.id!==aId && m.id!==bId);
        if(!others.length) continue;
        const C = others[Math.floor(Math.random()*others.length)];

        const targetOk = RS.romancePossible(state, A, C) || RS.romancePossible(state, B, C);
        if(!targetOk) continue;

        const relAC = MS.getRelation(state, aId, C.id);
        const relBC = MS.getRelation(state, bId, C.id);
        const closeEnough = (relAC.affection >= (state.settings.loveThreshold - state.settings.jealousyOffset)) ||
                            (relBC.affection >= (state.settings.loveThreshold - state.settings.jealousyOffset));
        if(!closeEnough) continue;

        const ctx = Object.assign({}, state, {_datingPair:true});
        const ev = EE.pickEvent('tri_jealous', ctx, {A:A.name, B:B.name, C:C.name});
        MS.getRelation(state,aId,bId).jealousyTargetId = C.id;
        applyAffectionWithSome(aId, bId, -6, pushAutoLog);
        applyAffectionWithSome(aId, C.id, -2, pushAutoLog);
        applyAffectionWithSome(bId, C.id, -2, pushAutoLog);
        pushAutoLog(ev ? ev.icon : '🔴', ev ? ev.text : `${B.name}가 질투를 느꼈습니다. 상대는 ${C.name}였습니다.`);
        created++;
      }
    }

    // confession auto
    if(state.settings.romanceEnabled && created < max){
      for(let i=0;i<max*2 && created<max;i++){
        if(Math.random() > state.settings.confessionChanceInAutoEvent) continue;
        const pair = randomPair();
        if(!pair) continue;
        const A = pair[0], B = pair[1];

        if(state.settings.monogamyMode){
          if(isMemberDatingSomeoneElse(A.id, B.id) || isMemberDatingSomeoneElse(B.id, A.id)) continue;
        }

        const res = RS.performConfessionAuto(state, A.id, B.id);
        if(!res.done) continue;

        const ctx = Object.assign({}, state, {_datingPair:true});
        const ev = EE.pickEvent('pair_confess', ctx, {A:A.name, B:B.name});
        pushAutoLog(ev ? ev.icon : '💘', ev ? ev.text : `${A.name}가 ${B.name}에게 고백했습니다. 연애가 시작됐습니다.`);
        created++;
      }
    }

    // fight
    for(let i=0;i<max*2 && created<max;i++){
      if(Math.random() > state.settings.fightChance) continue;
      const pair = randomPair();
      if(!pair) continue;
      const A = pair[0], B = pair[1];
      const rel = MS.getRelation(state, A.id, B.id);
      if(state.day <= (rel.coldUntilDay||0)) continue;

      const stress = (A.condition.stress + B.condition.stress) / 2;
      const score = (100 - (rel.affection+200)/4) + stress*0.5;
      if(Math.random()*160 > score) continue;

      const ctx = Object.assign({}, state, {});
      const ev = EE.pickEvent('pair_fight', ctx, {A:A.name, B:B.name});
      const days = window.AppData.randInt(state.settings.coldDaysMin, state.settings.coldDaysMax);
      RS.setCold(state, A.id, B.id, days);
      applyAffectionWithSome(A.id, B.id, -12, pushAutoLog);
      pushAutoLog(ev ? ev.icon : '😡', ev ? ev.text : `${A.name}와 ${B.name}가 다퉜습니다.`);
      created++;
    }

    // filler
    for(let i=0;i<max*3 && created<max;i++){
      const r = Math.random();
      if(r < 0.12 && state.members.length >= 3){
        const ev = EE.pickEvent('group_event', state, {});
        if(ev){
          pushAutoLog(ev.icon, ev.text);
          created++;
        }
        continue;
      }

      const pair = randomPair();
      if(!pair) continue;
      const A = pair[0], B = pair[1];
      const rel = MS.getRelation(state, A.id, B.id);
      if(state.day <= (rel.coldUntilDay||0)) continue;

      const st = RS.stageFromAffection(rel.affection, state.settings, rel.dating);
      const monoBlocked = state.settings.monogamyMode && (isMemberDatingSomeoneElse(A.id,null) || isMemberDatingSomeoneElse(B.id,null));
      const romanceOk = RS.romancePossible(state, A, B);

      // dating
      if(rel.dating){
        const ctx = Object.assign({}, state, {_datingPair:true});
        let ev = EE.pickEvent('pair_date', ctx, {A:A.name, B:B.name});
        if(!ev) ev = EE.pickEvent('pair_friend', ctx, {A:A.name, B:B.name});
        if(ev){
          let text = ev.text;
          if(Math.random() < 0.45){
            const skin = EE.pickEvent('pair_skinship_pool', ctx, {A:A.name, B:B.name});
            if(skin) text += ' ' + skin.text;
          }
          pushAutoLog('💗', text);
          applyAffectionWithSome(A.id, B.id, +8, pushAutoLog);
          created++;
        }
        continue;
      }

      if(!monoBlocked && romanceOk && (st==='친구' || st==='절친') && Math.random() < 0.22){
        const ev = EE.pickEvent('pair_flirt', state, {A:A.name, B:B.name});
        if(ev){
          pushAutoLog(ev.icon, ev.text);
          applyAffectionWithSome(A.id, B.id, +6, pushAutoLog);
          created++;
          continue;
        }
      }

      if(!monoBlocked && romanceOk && (st==='친구' || st==='절친') && Math.random() < 0.15){
        const ev = EE.pickEvent('pair_date', state, {A:A.name, B:B.name});
        if(ev){
          pushAutoLog(ev.icon, ev.text);
          applyAffectionWithSome(A.id, B.id, +7, pushAutoLog);
          created++;
          continue;
        }
      }

      const ev = EE.pickEvent('pair_friend', state, {A:A.name, B:B.name});
      if(ev){
        pushAutoLog(ev.icon, ev.text);
        applyAffectionWithSome(A.id, B.id, +4, pushAutoLog);
        created++;
      }
    }
  }

  function skillName(skill){
    const map = { vocal:'보컬', dance:'댄스', rap:'랩', compose:'작사/작곡', arrange:'편곡' };
    return map[skill] || skill;
  }

  function advanceOneDay(modeOverride){
    if(state.members.length === 0){
      toast('먼저 멤버를 추가해 주세요');
      return;
    }

    clearJealousyFlags();

    const dayStartMoney = state.money;
    currentBlock = createDayBlock(dayStartMoney);

    const {assignments, mode} = decideAssignmentsForToday();
    const usedMode = modeOverride || mode;

    const gainsByMember = {}; // memberId -> {skill,val}
    let moneyDelta = 0;

    for(const m of state.members){
      const actId = assignments[m.id] || 'rest_sleep';
      const act = activityById(actId) || activityById('rest_sleep');

      const gain = applyActivity(m, act);
      moneyDelta += (act.moneyDelta || 0);
      if(gain) gainsByMember[m.id] = gain;

      // weight threshold log
      if(Number.isFinite(m.weight)){
        if(m.meta.weightBase == null) m.meta.weightBase = m.weight;
        const diff = Math.abs(m.weight - m.meta.weightBase);
        if(diff >= state.settings.weightLogThresholdKg){
          pushActLog('⚖️', `${m.name}의 몸무게가 ${m.meta.weightBase}kg에서 ${m.weight}kg로 변했습니다.`);
          m.meta.weightBase = m.weight;
        }
      }

      pushActLog(act.icon || '📌', `${m.name}가 ${act.name}을 진행했습니다.`);
    }

    state.money = dayStartMoney + moneyDelta;
    currentBlock.moneyEnd = state.money;

    updateAlbumProgress(assignments);

    // practice results log (member: skill +0/+1/+2)
    const gainLines = [];
    for(const m of state.members){
      const actId = assignments[m.id];
      const act = activityById(actId);
      if(!act || !act.skill) continue;
      const g = gainsByMember[m.id];
      if(!g) continue;
      gainLines.push(`(${m.name}: ${skillName(g.skill)} +${g.val})`);
    }
    if(gainLines.length){
      pushActLog('📈', `연습 결과 ${gainLines.join(' ')}`);
    }

    maybeStartConcert();
    maybeComebackNarrative();
    runRelationshipAutoEvents();
    maybeComebackEnd();

    state.dayBlocks.push(currentBlock);
    flattenLogStrings();

    state.manual.assignments = {};
    state.day += 1;

    save();
    renderAll();
    toast(usedMode === 'manual' ? '오늘 실행 완료 (수동)' : '다음날로 진행');
  }

  function run7Days(){
    for(let i=0;i<7;i++) advanceOneDay();
  }

  // -------- Render --------
  function switchTab(tab){
    document.querySelectorAll('.tab').forEach(b=>{
      b.setAttribute('aria-selected', b.dataset.tab===tab ? 'true':'false');
    });
    document.querySelectorAll('main section[id^="tab-"]').forEach(sec=>{
      sec.hidden = (sec.id !== `tab-${tab}`);
    });
    if(tab==='relations') setTimeout(()=>Graph.drawGraph(state, els.relationCanvas), 50);
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  function logCard(icon, text, meta){
    const m = meta ? `<div class="log-meta">${meta}</div>` : '';
    return `<div class="log-card"><div class="log-icon">${icon}</div><div class="log-text">${escapeHtml(text)}${m}</div></div>`;
  }

  function progressRow(label, percent){
    const p = Math.round(percent);
    return `<div style="margin:8px 0">
      <div class="row spread"><span>${label}</span><span class="muted small">${p}%</span></div>
      <div class="progress"><div style="width:${p}%"></div></div>
    </div>`;
  }

  function renderDashAlbum(){
    const p = state.album.progress;
    const cb = state.album.comeback;
    const con = state.concert;
    const parts = [];

    parts.push(progressRow('작사/작곡', p.lyrics));
    parts.push(progressRow('보컬', p.vocal));
    parts.push(progressRow('안무', p.dance));

    if(cb.active){
      parts.push(`<div class="row spread" style="margin-top:8px">
        <span class="badge pink">컴백 진행 중</span>
        <span class="muted small">남은 기간 ${cb.daysLeft}일</span>
      </div>`);
    }else{
      parts.push(`<div class="row spread" style="margin-top:8px">
        <span class="badge gray">컴백 없음</span>
        <span class="muted small">발매 후 21일 활동</span>
      </div>`);
    }

    if(con.planned){
      const left = con.startDay - state.day;
      parts.push(`<div class="row spread" style="margin-top:8px">
        <span class="badge blue">콘서트 예정</span>
        <span class="muted small">D-${left}</span>
      </div>`);
    }

    els.dashAlbum.innerHTML = parts.join('');
  }

  function renderMiniLogs(){
    const linesLimit = state.settings.dashboardLogLines || 40;

    const flattened = [];
    for(const block of state.dayBlocks.slice().reverse()){
      flattened.push({icon:'📅', text:`Day ${block.day} 종료 (소지금: ${block.moneyEnd})`, meta:`Day ${block.day}`});
      for(const e of (block.auto||[])) flattened.push({icon:e.icon||'✨', text:e.text, meta:'자동'});
      for(const e of (block.activities||[])) flattened.push({icon:e.icon||'📌', text:e.text, meta:'활동'});
      flattened.push({icon:'📌', text:`Day ${block.day}`, meta:''});
      if(flattened.length > linesLimit) break;
    }
    const slice = flattened.slice(0, linesLimit);

    const cards = slice.map(it=>logCard(it.icon, it.text, it.meta));
    els.logMini.innerHTML = cards.join('') || '<div class="muted">아직 로그가 없습니다.</div>';
    els.manualLogMini.innerHTML = cards.slice(0,8).join('');
    els.relationLogMini.innerHTML = cards.slice(0,8).join('');
    els.albumLogMini.innerHTML = cards.slice(0,8).join('');
  }

  function renderDashboard(){
    const {assignments, mode} = decideAssignmentsForToday();
    const lines = [];
    for(const m of state.members){
      const act = activityById(assignments[m.id]) || activityById('rest_sleep');
      lines.push(`<div class="row spread" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div><strong>${m.name}</strong> <span class="muted small">(${MS.positionLabel(m.position) || '포지션 없음'})</span></div>
        <div class="row">
          <span class="badge">${act.icon} ${act.name}</span>
          <span class="muted small">체력 ${m.condition.health} · 피로 ${m.condition.fatigue} · 스트레스 ${m.condition.stress}</span>
        </div>
      </div>`);
    }
    els.todaySchedule.innerHTML = lines.join('') || '<div class="muted">멤버가 없습니다.</div>';
    els.scheduleHint.textContent = (mode==='manual') ? '수동 스케줄이 설정되어 있습니다.' : '자동 배정 결과입니다.';
    renderDashAlbum();
    renderMiniLogs();
  }

  function renderMembers(){
    if(state.members.length===0){
      els.membersList.innerHTML = `<div class="muted">멤버가 없습니다.</div>`;
      return;
    }
    const rows = state.members.map(m=>{
      return `<div class="card" style="padding:12px; margin-bottom:10px; background:var(--card2)">
        <div class="row spread">
          <div>
            <strong>${m.name}</strong>
            <span class="muted small">(${m.gender} · ${m.mbti} · ${MS.positionLabel(m.position)})</span>
            ${m.isLeader ? `<span class="badge blue">리더</span>` : ''}
          </div>
          <div class="row">
            <button class="btn danger" data-del="${m.id}" type="button">삭제</button>
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <span class="badge">체력 ${m.condition.health}</span>
          <span class="badge">피로 ${m.condition.fatigue}</span>
          <span class="badge">스트레스 ${m.condition.stress}</span>
          <span class="badge">몸무게 ${Number.isFinite(m.weight) ? m.weight+'kg' : '-'}</span>
        </div>
        <div class="row" style="margin-top:8px">
          <span class="badge">보컬 ${m.stats.vocal}</span>
          <span class="badge">댄스 ${m.stats.dance}</span>
          <span class="badge">랩 ${m.stats.rap}</span>
          <span class="badge">작사/작곡 ${m.stats.compose}</span>
          <span class="badge">편곡 ${m.stats.arrange}</span>
        </div>
      </div>`;
    }).join('');
    els.membersList.innerHTML = rows;

    els.membersList.querySelectorAll('button[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-del');
        MS.removeMember(state, id);
        save();
        renderAll();
        toast('삭제 완료');
      });
    });
  }

  function renderManual(){
    const acts = availableActivitiesForUI();
    els.manualActivity.innerHTML = acts.map(a=>`<option value="${a.id}">${a.icon} ${a.name}</option>`).join('');
    const list = state.members.map(m=>{
      return `<label class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <input type="checkbox" data-mid="${m.id}" />
        <span><strong>${m.name}</strong> <span class="muted small">체력 ${m.condition.health} · 피로 ${m.condition.fatigue} · 스트레스 ${m.condition.stress}</span></span>
      </label>`;
    }).join('');
    els.manualMembers.innerHTML = list || '<div class="muted">멤버가 없습니다.</div>';
    els.manualHint.textContent = '체크한 멤버에게 선택한 활동을 배정합니다. 체크하지 않은 멤버는 자동으로 휴식합니다.';
  }

  function renderRelations(){
    const opts = state.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
    els.relSelect.innerHTML = `<option value="">선택</option>` + opts;
    els.evA.innerHTML = `<option value="">선택</option>` + opts;
    els.evB.innerHTML = `<option value="">선택</option>` + opts;
    Graph.drawGraph(state, els.relationCanvas);
  }

  function renderRelationScores(){
    const id = els.relSelect.value;
    if(!id){
      els.relScores.innerHTML = '<div class="muted">멤버를 선택해 주세요.</div>';
      return;
    }
    const rows = state.members.filter(m=>m.id!==id).map(other=>{
      const rel = MS.getRelation(state, id, other.id);
      const st = RS.stageFromAffection(rel.affection, state.settings, rel.dating);
      const cold = state.day <= (rel.coldUntilDay||0);
      const some = RS.is썸(state, id, other.id);
      return `<tr>
        <td>${other.name}</td>
        <td>${rel.affection}</td>
        <td>${st}${some ? ' (썸)' : ''}</td>
        <td>${rel.dating ? '연애' : '-'}</td>
        <td>${cold ? '냉전' : '-'}</td>
      </tr>`;
    }).join('');
    els.relScores.innerHTML = `<table class="table">
      <thead><tr><th>상대</th><th>호감도</th><th>단계</th><th>연애</th><th>상태</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderAlbum(){
    const opts = `<option value="">선택</option>` + state.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
    els.albumComposer.innerHTML = opts;
    els.albumArranger.innerHTML = opts;
    els.albumComposer.value = state.album.composerId || '';
    els.albumArranger.value = state.album.arrangerId || '';

    els.albumProgress.innerHTML = [
      progressRow('작사/작곡', state.album.progress.lyrics),
      progressRow('보컬', state.album.progress.vocal),
      progressRow('안무', state.album.progress.dance),
    ].join('');

    const canRelease = state.album.progress.lyrics>=100 && state.album.progress.vocal>=100 && state.album.progress.dance>=100;
    els.releaseBtn.disabled = !canRelease;

    if(state.concert.planned){
      const left = state.concert.startDay - state.day;
      els.concertInfo.innerHTML = `<div class="row spread">
        <span class="badge blue">콘서트 예정</span>
        <span class="muted small">D-${left} (Day ${state.concert.startDay} 시작)</span>
      </div>`;
    }else{
      els.concertInfo.innerHTML = `<div class="muted">예정된 콘서트가 없습니다.</div>`;
    }
  }

  function renderSettings(){
    els.setDashLines.value = state.settings.dashboardLogLines;
    els.setAutoMax.value = state.settings.autoEventMaxPerDay;
    els.setLove.value = state.settings.loveThreshold;
    els.setBreak.value = state.settings.breakupThreshold;

    syncSettingButtons();
  }

  function syncSettingButtons(){
    els.toggleRomanceBtn.classList.toggle('primary', !!state.settings.romanceEnabled);
    els.toggleMonoBtn.classList.toggle('primary', !!state.settings.monogamyMode);
    els.toggleBreakupBtn.classList.toggle('primary', !!state.settings.breakupEnabled);
    els.toggleOppBtn.classList.toggle('primary', !!state.settings.allowOppositeSex);
    els.toggleSameBtn.classList.toggle('primary', !!state.settings.allowSameSex);

    els.toggleRomanceBtn.textContent = state.settings.romanceEnabled ? '💖 연애 ON' : '💖 연애 OFF';
    els.toggleMonoBtn.textContent = state.settings.monogamyMode ? '🔒 단일 연애 ON' : '🔓 개방 관계 ON';
    els.toggleBreakupBtn.textContent = state.settings.breakupEnabled ? '💔 이별 ON' : '💔 이별 OFF';
    els.toggleOppBtn.textContent = state.settings.allowOppositeSex ? '♂♀ 이성 허용 ON' : '♂♀ 이성 허용 OFF';
    els.toggleSameBtn.textContent = state.settings.allowSameSex ? '♀♀/♂♂ 동성 허용 ON' : '♀♀/♂♂ 동성 허용 OFF';
  }

  function renderLogs(){
    const logBox = els.logBox;

    // 필수 라인 (스크롤을 맨 위로)
    logBox.textContent = state.log.join('\n');
    logBox.scrollTop = 0;

    const cards = [];
    for(const block of state.dayBlocks.slice().reverse()){
      cards.push(logCard('📅', `Day ${block.day} 종료 (소지금: ${block.moneyEnd})`, ''));
      if(block.auto && block.auto.length){
        cards.push(logCard('✨', '자동 이벤트', ''));
        for(const e of block.auto) cards.push(logCard(e.icon||'✨', e.text, ''));
      }
      if(block.activities && block.activities.length){
        cards.push(logCard('📌', '활동', ''));
        for(const e of block.activities) cards.push(logCard(e.icon||'📌', e.text, ''));
      }
      cards.push(logCard('📌', `Day ${block.day}`, ''));
    }
    logBox.innerHTML = cards.join('') || '<div class="muted">아직 로그가 없습니다.</div>';
    els.logStats.textContent = `총 Day 블록 ${state.dayBlocks.length}개 · 멤버 ${state.members.length}명`;
  }

  function renderAll(){
    setTopStatus();
    renderDashboard();
    renderMembers();
    renderManual();
    renderRelations();
    renderRelationScores();
    renderAlbum();
    renderSettings();
    renderLogs();
  }

  // -------- UI Bind --------
  function bindUI(){
    document.querySelectorAll('.tab').forEach(btn=>{
      btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
    });

    els.themeBtn.addEventListener('click', toggleTheme);
    els.saveBtn.addEventListener('click', ()=>{ save(); toast('저장 완료'); });
    els.exportBtn.addEventListener('click', ()=>{ S.exportState(state); toast('내보내기 완료'); });
    els.exportMembersBtn.addEventListener('click', ()=>{ S.exportMembersOnly(state); toast('멤버 파일 저장'); });
    els.logTxtBtn.addEventListener('click', ()=>{ S.downloadText('idol_sim_log.txt', S.buildTextLog(state)); toast('TXT 저장'); });

    els.loadBtn.addEventListener('click', ()=>{ els.fileInputAll.click(); });

    els.fileInputAll.addEventListener('change', async (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      const parsed = JSON.parse(await file.text());
      state = parsed;
      migrateIfNeeded();
      S.applyTheme(state.theme);
      save();
      renderAll();
      toast('불러오기 완료');
      e.target.value = '';
    });

    els.fileInputMembers.addEventListener('change', async (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      const parsed = JSON.parse(await file.text());
      if(parsed && Array.isArray(parsed.members)){
        state.members = parsed.members;
        ensureRelations();
        save();
        renderAll();
        toast('멤버만 불러오기 완료');
      }else{
        toast('멤버 파일 형식이 아닙니다');
      }
      e.target.value = '';
    });

    els.resetBtn.addEventListener('click', ()=>{
      if(!confirm('정말 전체 초기화할까요?')) return;
      S.clearState();
      state = S.defaultState(window.AppData.config.defaults);
      S.applyTheme(state.theme);
      save();
      renderAll();
      toast('초기화 완료');
    });

    els.nextDayBtn.addEventListener('click', ()=> advanceOneDay());
    els.next7Btn.addEventListener('click', ()=> run7Days());

    els.addMemberBtn.addEventListener('click', ()=>{
      const m = S.defaultMember();
      m.name = (els.mName.value||'').trim();
      m.gender = els.mGender.value;
      m.mbti = els.mMbti.value;
      m.height = els.mHeight.value ? Number(els.mHeight.value) : null;
      m.weight = els.mWeight.value ? Number(els.mWeight.value) : null;
      m.position = els.mPosition.value;
      m.isLeader = (els.mLeader.value === 'yes');

      const res = MS.addMember(state, m);
      if(!res.ok){ toast(res.msg || '추가 실패'); return; }

      els.mName.value = '';
      els.mGender.value = '';
      els.mMbti.value = '';
      els.mHeight.value = '';
      els.mWeight.value = '';
      els.mPosition.value = '';
      els.mLeader.value = 'no';

      save();
      renderAll();
      toast('추가 완료');
    });

    els.manualAssignBtn.addEventListener('click', ()=>{
      const actId = els.manualActivity.value;
      const checked = Array.from(els.manualMembers.querySelectorAll('input[type="checkbox"][data-mid]:checked'))
        .map(x=>x.getAttribute('data-mid'));
      if(!checked.length){ toast('체크된 멤버가 없습니다'); return; }
      for(const id of checked) state.manual.assignments[id] = actId;
      els.manualMembers.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
      save();
      renderDashboard();
      toast('배정 완료');
    });

    els.manualRunDayBtn.addEventListener('click', ()=> advanceOneDay('manual'));

    els.relSelect.addEventListener('change', renderRelationScores);
    els.reDrawBtn.addEventListener('click', ()=> Graph.drawGraph(state, els.relationCanvas));

    els.runManualEventBtn.addEventListener('click', ()=>{
      const aId = els.evA.value, bId = els.evB.value;
      if(!aId || !bId || aId===bId){ toast('A/B를 올바르게 선택해 주세요'); return; }
      const A = state.members.find(m=>m.id===aId);
      const B = state.members.find(m=>m.id===bId);
      if(!A || !B){ toast('멤버를 찾을 수 없습니다'); return; }

      const rel = MS.getRelation(state, aId, bId);
      const type = els.evType.value;

      const block = {day: state.day, moneyStart: state.money, moneyEnd: state.money, auto:[], activities:[]};
      const emit = (icon,text)=>block.auto.push({icon,text});

      if(type==='friend'){
        const ev = EE.pickEvent('pair_friend', state, {A:A.name, B:B.name});
        if(ev){ applyAffectionWithSome(aId, bId, +5, emit); emit(ev.icon, ev.text); }
      }
      if(type==='flirt'){
        if(state.settings.monogamyMode && (isMemberDatingSomeoneElse(aId,bId) || isMemberDatingSomeoneElse(bId,aId))){ toast('단일 연애 모드에서 연애 중인 멤버는 플러팅 불가'); return; }
        const ev = EE.pickEvent('pair_flirt', state, {A:A.name, B:B.name});
        if(ev){ applyAffectionWithSome(aId, bId, +8, emit); emit(ev.icon, ev.text); }
      }
      if(type==='date'){
        if(state.settings.monogamyMode && (isMemberDatingSomeoneElse(aId,bId) || isMemberDatingSomeoneElse(bId,aId))){ toast('단일 연애 모드에서 연애 중인 멤버는 데이트 불가'); return; }
        const ev = EE.pickEvent('pair_date', state, {A:A.name, B:B.name});
        if(ev){
          let text = ev.text;
          if(rel.dating && Math.random()<0.55){
            const sk = EE.pickEvent('pair_skinship_pool', Object.assign({}, state, {_datingPair:true}), {A:A.name,B:B.name});
            if(sk) text += ' ' + sk.text;
          }
          applyAffectionWithSome(aId, bId, +10, emit);
          emit('💗', text);
        }
      }
      if(type==='confess'){
        const res = RS.performConfessionManual(state, aId, bId);
        if(res.nowDating){
          const ev = EE.pickEvent('pair_confess', state, {A:A.name, B:B.name});
          emit(ev ? ev.icon : '💘', ev ? ev.text : `${A.name}가 ${B.name}에게 고백했습니다.`);
        }else{
          applyAffectionWithSome(aId, bId, +2, emit);
          emit('💭', `${A.name}가 ${B.name}에게 고백했습니다. ${res.msg || '마음이 복잡하지만 지금은 아닌 것 같다'}.`);
        }
      }
      if(type==='fight'){
        const ev = EE.pickEvent('pair_fight', state, {A:A.name, B:B.name});
        const days = window.AppData.randInt(state.settings.coldDaysMin, state.settings.coldDaysMax);
        RS.setCold(state,aId,bId,days);
        applyAffectionWithSome(aId, bId, -14, emit);
        emit(ev ? ev.icon : '😡', ev ? ev.text : `${A.name}와 ${B.name}가 다퉜습니다.`);
      }
      if(type==='reconcile'){
        if(!(state.day <= (rel.coldUntilDay||0))){ toast('냉전 상태가 아닙니다'); return; }
        const ev = EE.pickEvent('pair_reconcile', Object.assign({}, state, {_coldPair:true}), {A:A.name, B:B.name});
        RS.clearCold(state,aId,bId);
        applyAffectionWithSome(aId, bId, +10, emit);
        emit(ev ? ev.icon : '🤍', ev ? ev.text : `${A.name}와 ${B.name}가 화해했습니다.`);
      }

      if(block.auto.length){
        state.dayBlocks.push(block);
        flattenLogStrings();
        save();
        renderAll();
        toast('관계 이벤트 실행');
      }else{
        toast('이벤트를 생성할 수 없습니다');
      }
    });

    els.albumComposer.addEventListener('change', ()=>{ state.album.composerId = els.albumComposer.value || null; save(); renderAll(); });
    els.albumArranger.addEventListener('change', ()=>{ state.album.arrangerId = els.albumArranger.value || null; save(); renderAll(); });

    els.releaseBtn.addEventListener('click', ()=>{
      if(!(state.album.progress.lyrics>=100 && state.album.progress.vocal>=100 && state.album.progress.dance>=100)) return;
      state.album.released = true;
      state.album.comeback.active = true;
      state.album.comeback.startDay = state.day;
      state.album.comeback.daysLeft = state.settings.comebackDays;
      state.album.comeback.narrativeCounter = 0;

      state.dayBlocks.push({day: state.day, moneyStart: state.money, moneyEnd: state.money, auto:[{icon:'🎧', text:'앨범이 발매됐습니다. 21일 컴백 활동이 시작됩니다.'}], activities:[]});
      flattenLogStrings();
      save();
      renderAll();
      toast('발매 완료');
    });

    els.planConcertBtn.addEventListener('click', ()=>{
      const n = Number(els.concertInDays.value || 15);
      if(!Number.isFinite(n) || n<1){ toast('n일 값을 확인해 주세요'); return; }
      state.concert.planned = true;
      state.concert.startDay = state.day + n;
      state.dayBlocks.push({day: state.day, moneyStart: state.money, moneyEnd: state.money, auto:[{icon:'🎟️', text:`${n}일 뒤 콘서트를 개최하기로 결정했습니다.`}], activities:[]});
      flattenLogStrings();
      save();
      renderAll();
      toast('콘서트 예정');
    });

    els.cancelConcertBtn.addEventListener('click', ()=>{
      state.concert.planned = false;
      state.concert.startDay = null;
      save();
      renderAll();
      toast('콘서트 취소');
    });

    els.toggleRomanceBtn.addEventListener('click', ()=>{ state.settings.romanceEnabled = !state.settings.romanceEnabled; syncSettingButtons(); save(); toast('연애 설정 변경'); });
    els.toggleMonoBtn.addEventListener('click', ()=>{ state.settings.monogamyMode = !state.settings.monogamyMode; syncSettingButtons(); save(); toast('관계 모드 변경'); });
    els.toggleBreakupBtn.addEventListener('click', ()=>{ state.settings.breakupEnabled = !state.settings.breakupEnabled; syncSettingButtons(); save(); toast('이별 설정 변경'); });
    els.toggleOppBtn.addEventListener('click', ()=>{ state.settings.allowOppositeSex = !state.settings.allowOppositeSex; syncSettingButtons(); save(); toast('이성 허용 변경'); });
    els.toggleSameBtn.addEventListener('click', ()=>{ state.settings.allowSameSex = !state.settings.allowSameSex; syncSettingButtons(); save(); toast('동성 허용 변경'); });

    els.applySettingsBtn.addEventListener('click', ()=>{
      state.settings.dashboardLogLines = Number(els.setDashLines.value || state.settings.dashboardLogLines);
      state.settings.autoEventMaxPerDay = Number(els.setAutoMax.value || state.settings.autoEventMaxPerDay);
      state.settings.loveThreshold = Number(els.setLove.value || state.settings.loveThreshold);
      state.settings.breakupThreshold = Number(els.setBreak.value || state.settings.breakupThreshold);
      save();
      renderAll();
      toast('적용 완료');
    });
  }

  async function init(){
    [
      'toast','topStatus','themeBtn','saveBtn','loadBtn','exportBtn','exportMembersBtn','logTxtBtn','resetBtn',
      'nextDayBtn','next7Btn','todaySchedule','scheduleHint','dashAlbum','logMini',
      'mName','mGender','mMbti','mHeight','mWeight','mPosition','mLeader','addMemberBtn','membersList',
      'manualActivity','manualAssignBtn','manualRunDayBtn','manualMembers','manualHint','manualLogMini',
      'relationCanvas','reDrawBtn','relSelect','relScores','evA','evB','evType','runManualEventBtn','relationLogMini',
      'albumComposer','albumArranger','albumProgress','releaseBtn','concertInDays','planConcertBtn','cancelConcertBtn','concertInfo','albumLogMini',
      'setDashLines','setAutoMax','toggleRomanceBtn','toggleMonoBtn','toggleBreakupBtn','setLove','setBreak','toggleOppBtn','toggleSameBtn','applySettingsBtn',
      'logBox','logStats','fileInputAll','fileInputMembers'
    ].forEach(id=>els[id]=$(id));

    await S.loadData();
    await EE.loadEventTemplates();

    state = S.loadState();
    if(!state){
      state = S.defaultState(window.AppData.config.defaults);
      S.applyTheme(state.theme);
      save();
    }

    migrateIfNeeded();
    S.applyTheme(state.theme);

    bindUI();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
