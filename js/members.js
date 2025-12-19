(function(){
  'use strict';

  function positionLabel(pos){
    const map = {
      main_vocal: '메인보컬',
      main_dance: '메인댄서',
      main_rap: '메인래퍼',
      vocal: '보컬',
      dance: '댄서',
      rap: '래퍼'
    };
    return map[pos] || '';
  }

  function hasMainPosition(state, pos){
    return state.members.some(m => m.position === pos);
  }

  function currentLeaderId(state){
    const leader = state.members.find(m => m.isLeader);
    return leader ? leader.id : null;
  }

  function validateNewMember(state, m){
    if(state.members.length >= 25) return {ok:false, msg:'멤버는 최대 25명입니다'};
    if(!m.name || !m.name.trim()) return {ok:false, msg:'이름을 입력해 주세요'};
    if(!m.gender) return {ok:false, msg:'성별은 필수입니다'};
    if(!m.mbti) return {ok:false, msg:'MBTI는 필수입니다'};
    if(!m.position) return {ok:false, msg:'포지션 1개를 선택해 주세요'};

    if(['main_vocal','main_dance','main_rap'].includes(m.position)){
      if(hasMainPosition(state, m.position)) return {ok:false, msg:'메인 포지션은 각 1명만 가능합니다'};
    }
    if(m.isLeader){
      const leaderId = currentLeaderId(state);
      if(leaderId) return {ok:false, msg:'리더는 1명만 가능합니다'};
    }
    return {ok:true};
  }

  function addMember(state, m){
    const v = validateNewMember(state, m);
    if(!v.ok) return v;

    // weight base for threshold logging
    const w = Number.isFinite(m.weight) ? m.weight : null;
    m.meta = m.meta || {};
    if(m.meta.weightBase == null) m.meta.weightBase = w;

    state.members.push(m);

    // Initialize relations with others
    for(const other of state.members){
      if(other.id === m.id) continue;
      const key = pairKey(m.id, other.id);
      if(!state.relations[key]){
        state.relations[key] = {
          affection: 0,
          dating: false,
          coldUntilDay: 0,
          jealousyTargetId: null
        };
      }
    }
    return {ok:true};
  }

  function removeMember(state, id){
    state.members = state.members.filter(m => m.id !== id);

    // remove relations involving id
    const next = {};
    for(const k of Object.keys(state.relations)){
      if(k.includes(id)) continue;
      next[k] = state.relations[k];
    }
    state.relations = next;

    // clear album assignments
    if(state.album.composerId === id) state.album.composerId = null;
    if(state.album.arrangerId === id) state.album.arrangerId = null;

    // clear manual assignments
    if(state.manual && state.manual.assignments){
      delete state.manual.assignments[id];
    }
  }

  function pairKey(a,b){
    return [a,b].sort().join('|');
  }

  function getRelation(state, aId, bId){
    const key = pairKey(aId,bId);
    if(!state.relations[key]){
      state.relations[key] = {affection:0, dating:false, coldUntilDay:0, jealousyTargetId:null};
    }
    return state.relations[key];
  }

  function setLeader(state, id){
    for(const m of state.members){
      m.isLeader = (m.id === id);
    }
  }

  window.MemberSystem = {
    positionLabel,
    addMember,
    removeMember,
    pairKey,
    getRelation,
    setLeader
  };
})();
