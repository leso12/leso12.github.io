(function(){
  'use strict';

  const STORAGE_KEY = 'idolSimStateV3';
  const MEMBERS_ONLY_KEY = 'idolSimMembersOnlyV1';

  const FALLBACK_CONFIG = {"version": "2025-12-18", "defaults": {"theme": "light", "dashboardLogLines": 40, "autoEventMaxPerDay": 6, "romanceEnabled": true, "loveThreshold": 150, "allowOppositeSex": true, "allowSameSex": true, "monogamyMode": true, "breakupEnabled": true, "breakupThreshold": 120, "breakupChance": 0.18, "confessionChanceInAutoEvent": 0.3, "confessionOffset": 15, "jealousyOffset": 40, "reconcileChance": 0.35, "fightChance": 0.2, "coldDaysMin": 1, "coldDaysMax": 4, "weightLogThresholdKg": 0.8, "affectionMin": -200, "affectionMax": 200, "comebackDays": 21, "comebackNarrativeStartAfterDays": 3}};
  const FALLBACK_SCHEDULES = {"activities": [{"id": "vocal_practice", "name": "보컬 연습", "icon": "🎶", "type": "practice", "targets": "any", "moneyDelta": -10, "effects": {"health": -4, "fatigue": 8, "stress": 4, "weight": -0.05}, "skill": "vocal", "skillGain": {"min": 0, "max": 2, "chance": 0.75}}, {"id": "dance_practice", "name": "안무 연습", "icon": "🕺", "type": "practice", "targets": "any", "moneyDelta": -10, "effects": {"health": -6, "fatigue": 10, "stress": 5, "weight": -0.08}, "skill": "dance", "skillGain": {"min": 0, "max": 2, "chance": 0.75}}, {"id": "rap_practice", "name": "랩 연습", "icon": "🎤", "type": "practice", "targets": "any", "moneyDelta": -10, "effects": {"health": -3, "fatigue": 7, "stress": 4, "weight": -0.03}, "skill": "rap", "skillGain": {"min": 0, "max": 2, "chance": 0.75}}, {"id": "compose", "name": "작사/작곡", "icon": "📝", "type": "creative", "targets": "solo", "moneyDelta": -15, "effects": {"health": -2, "fatigue": 6, "stress": 6, "weight": 0.0}, "skill": "compose", "skillGain": {"min": 0, "max": 2, "chance": 0.7}}, {"id": "arrange", "name": "편곡", "icon": "🎛️", "type": "creative", "targets": "solo", "moneyDelta": -15, "effects": {"health": -2, "fatigue": 6, "stress": 6, "weight": 0.0}, "skill": "arrange", "skillGain": {"min": 0, "max": 2, "chance": 0.7}}, {"id": "workout", "name": "운동", "icon": "🏋️", "type": "health", "targets": "solo", "moneyDelta": -5, "effects": {"health": 5, "fatigue": 7, "stress": -4, "weight": -0.1}, "skill": null}, {"id": "meal", "name": "식사", "icon": "🍽️", "type": "health", "targets": "solo", "moneyDelta": -8, "effects": {"health": 6, "fatigue": -3, "stress": -2, "weight": 0.08}, "skill": null}, {"id": "rest_sleep", "name": "집에서 잠", "icon": "😴", "type": "rest", "targets": "solo", "moneyDelta": 0, "effects": {"health": 10, "fatigue": -14, "stress": -10, "weight": 0.02}, "skill": null}, {"id": "rest_walk", "name": "산책", "icon": "🚶", "type": "rest", "targets": "solo", "moneyDelta": 0, "effects": {"health": 6, "fatigue": -8, "stress": -10, "weight": -0.03}, "skill": null}, {"id": "rest_trip", "name": "여행", "icon": "✈️", "type": "rest", "targets": "solo", "moneyDelta": -30, "effects": {"health": 8, "fatigue": -10, "stress": -16, "weight": -0.02}, "skill": null}, {"id": "rest_chill", "name": "침대에서 뒹굴기", "icon": "🛌", "type": "rest", "targets": "solo", "moneyDelta": 0, "effects": {"health": 8, "fatigue": -10, "stress": -12, "weight": 0.01}, "skill": null}, {"id": "content_shoot", "name": "콘텐츠 촬영", "icon": "📸", "type": "work", "targets": "solo", "moneyDelta": 40, "effects": {"health": -6, "fatigue": 10, "stress": 8, "weight": -0.01}, "skill": null}, {"id": "variety_show", "name": "예능 촬영", "icon": "📺", "type": "work", "targets": "solo", "moneyDelta": 60, "effects": {"health": -8, "fatigue": 12, "stress": 10, "weight": -0.01}, "skill": null}, {"id": "concert_practice", "name": "콘서트 연습", "icon": "🎟️", "type": "event_practice", "targets": "any", "moneyDelta": -20, "effects": {"health": -6, "fatigue": 12, "stress": 6, "weight": -0.06}, "skill": "dance", "skillGain": {"min": 0, "max": 2, "chance": 0.6}, "availableWhen": {"concertPlanned": true, "concertNotStarted": true}}, {"id": "fansign", "name": "팬싸인회", "icon": "✍️", "type": "comeback", "targets": "any", "moneyDelta": 120, "effects": {"health": -6, "fatigue": 10, "stress": 6, "weight": 0.0}, "skill": null, "availableWhen": {"comebackActive": true}}, {"id": "music_show", "name": "음악방송", "icon": "📡", "type": "comeback", "targets": "any", "moneyDelta": 150, "effects": {"health": -8, "fatigue": 12, "stress": 8, "weight": -0.02}, "skill": "vocal", "skillGain": {"min": 0, "max": 1, "chance": 0.45}, "availableWhen": {"comebackActive": true}}, {"id": "live_stream", "name": "라이브 방송", "icon": "🔴", "type": "comeback", "targets": "any", "moneyDelta": 80, "effects": {"health": -4, "fatigue": 8, "stress": 5, "weight": 0.0}, "skill": null, "availableWhen": {"comebackActive": true}}]};

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function randFloat(min, max){ return Math.random() * (max - min) + min; }
  function randInt(min, max){ return Math.floor(randFloat(min, max+1)); }

  function uid(){
    return 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function safeJSONParse(txt){
    try { return JSON.parse(txt); } catch(e){ return null; }
  }

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function defaultMember() {
    return {
      id: uid(),
      name: '',
      gender: '',
      mbti: '',
      height: null,
      weight: null,
      position: '',
      isLeader: false,
      stats: { vocal: 0, dance: 0, rap: 0, compose: 0, arrange: 0 },
      condition: { health: 100, fatigue: 0, stress: 0 },
      meta: { weightBase: null }
    };
  }

  function defaultState(configDefaults){
    return {
      meta: {
        createdAt: new Date().toISOString(),
        version: FALLBACK_CONFIG.version || 'unknown',
      },
      day: 1,
      money: 0,
      theme: configDefaults.theme || 'light',
      settings: deepClone(configDefaults),
      members: [],
      relations: {
        // pairKey -> { affection, dating, coldUntilDay, jealousyTargetId }
      },
      dayBlocks: [],
      log: [],
      album: {
        composerId: null,
        arrangerId: null,
        progress: { lyrics: 0, vocal: 0, dance: 0 },
        released: false,
        comeback: {
          active: false,
          startDay: null,
          daysLeft: 0,
          narrativeCounter: 0
        }
      },
      concert: {
        planned: false,
        startDay: null
      },
      manual: {
        assignments: {} // memberId -> activityId
      }
    };
  }

  async function fetchJSON(url){
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  }

  async function loadData(){
    let config = FALLBACK_CONFIG;
    let schedules = FALLBACK_SCHEDULES;

    try {
      config = await fetchJSON('data/config.json');
    } catch(e){ /* fallback */ }
    try {
      schedules = await fetchJSON('data/schedules.json');
    } catch(e){ /* fallback */ }

    window.AppData = {
      config,
      schedules,
      clamp,
      randInt,
      randFloat,
      uid
    };
    return window.AppData;
  }

  function loadState(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const parsed = safeJSONParse(raw);
    if(!parsed) return null;
    return parsed;
  }

  function saveState(state){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {
      console.warn('saveState failed', e);
    }
  }

  function clearState(){
    localStorage.removeItem(STORAGE_KEY);
  }

  function exportState(state){
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'idol_sim_state.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  function exportMembersOnly(state){
    const out = {
      meta: { exportedAt: new Date().toISOString(), version: state.meta?.version || '' },
      members: state.members
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'idol_sim_members.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  function buildTextLog(state){
    // TXT: 꾸밈 없음, 최신이 위
    const lines = [];
    for(const block of state.dayBlocks.slice().reverse()) {
      lines.push(`Day ${block.day} 종료 (소지금: ${block.moneyEnd})`);
      if(block.auto && block.auto.length){
        lines.push('자동 이벤트');
        for(const it of block.auto) lines.push(`- ${it.text}`);
      }
      if(block.activities && block.activities.length){
        lines.push('활동');
        for(const it of block.activities) lines.push(`- ${it.text}`);
      }
      lines.push(`Day ${block.day}`);
      lines.push('--------------------------------');
    }
    return lines.join('\n');
  }

  function downloadText(filename, text){
    const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  window.StateStore = {
    STORAGE_KEY,
    MEMBERS_ONLY_KEY,
    loadData,
    defaultState,
    defaultMember,
    loadState,
    saveState,
    clearState,
    exportState,
    exportMembersOnly,
    buildTextLog,
    downloadText,
    applyTheme,
    clamp,
    randInt,
    uid
  };
})();
