(function(){
  'use strict';

  const { clamp } = window.StateStore;

  function stageFromAffection(aff, settings, dating){
    if(dating) return '연애';
    if(aff <= -120) return '혐오';
    if(aff <= -41) return '불편';
    if(aff <= 39) return '무관심';
    if(aff <= 99) return '친구';
    // above 100 is '절친' until dating happens
    return '절친';
  }

  function stageColor(stage){
    if(stage === '연애') return 'pink';
    if(stage === '절친') return 'green';
    if(stage === '친구') return 'blue';
    if(stage === '무관심' || stage === '불편' || stage === '혐오') return 'gray';
    return 'gray';
  }

  function romancePossible(state, a, b){
    if(!state.settings.romanceEnabled) return false;
    if(!a || !b) return false;
    if(!a.gender || !b.gender) return false;
    if(a.gender === b.gender) return !!state.settings.allowSameSex;
    return !!state.settings.allowOppositeSex;
  }

  function isSomeTag(state, aId, bId, tag){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    if(tag === 'dating') return !!rel.dating;
    if(tag === 'cold') return state.day <= (rel.coldUntilDay || 0);
    return false;
  }

  function is썸(state, aId, bId){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    if(rel.dating) return false;
    if(!state.settings.romanceEnabled) return false;
    const a = state.members.find(m=>m.id===aId);
    const b = state.members.find(m=>m.id===bId);
    if(!romancePossible(state,a,b)) return false;
    return rel.affection >= state.settings.loveThreshold;
  }

  function applyAffection(state, aId, bId, delta){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    rel.affection = clamp(rel.affection + delta, state.settings.affectionMin, state.settings.affectionMax);
  }

  function setDating(state, aId, bId, value){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    rel.dating = !!value;
    if(!value){
      rel.jealousyTargetId = null;
    }
  }

  function setCold(state, aId, bId, days){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    rel.coldUntilDay = Math.max(rel.coldUntilDay||0, state.day + days);
  }

  function clearCold(state, aId, bId){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    rel.coldUntilDay = 0;
  }

  function anyDatingPairs(state){
    const pairs = [];
    for(const key of Object.keys(state.relations)){
      const rel = state.relations[key];
      if(rel.dating){
        const [aId,bId] = key.split('|');
        pairs.push([aId,bId]);
      }
    }
    return pairs;
  }

  function monogamyBlocks(state, aId, bId){
    if(!state.settings.monogamyMode) return false;
    // If either is already dating someone else, block
    for(const [x,y] of anyDatingPairs(state)){
      if((x===aId && y!==bId) || (y===aId && x!==bId)) return true;
      if((x===bId && y!==aId) || (y===bId && x!==aId)) return true;
    }
    return false;
  }

  function performConfessionAuto(state, aId, bId){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    if(rel.dating) return {done:false};
    const a = state.members.find(m=>m.id===aId);
    const b = state.members.find(m=>m.id===bId);
    if(!romancePossible(state,a,b)) return {done:false};

    if(monogamyBlocks(state, aId, bId)) return {done:false};

    const love = state.settings.loveThreshold;
    const cand = love - state.settings.confessionOffset;
    if(rel.affection < cand) return {done:false};

    // success always
    if(rel.affection >= love){
      rel.affection = clamp(rel.affection + 10, state.settings.affectionMin, state.settings.affectionMax);
    }else{
      // 135~149 -> set to 150 logic (generalized)
      rel.affection = love;
    }
    rel.dating = true;
    return {done:true, nowDating:true};
  }

  function performConfessionManual(state, aId, bId){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    const a = state.members.find(m=>m.id===aId);
    const b = state.members.find(m=>m.id===bId);
    if(!romancePossible(state,a,b)) return {done:true, nowDating:false, msg:'허용되지 않는 조합이라 연애로 진행되지 않습니다'};
    if(monogamyBlocks(state,aId,bId)) return {done:true, nowDating:false, msg:'단일 연애 모드에서 이미 다른 연애가 진행 중입니다'};

    const love = state.settings.loveThreshold;
    if(rel.affection < love){
      return {done:true, nowDating:false, msg:'마음이 복잡하지만 지금은 아닌 것 같다'};
    }
    // success always
    if(rel.affection >= love){
      rel.affection = clamp(rel.affection + 10, state.settings.affectionMin, state.settings.affectionMax);
    }else{
      rel.affection = love;
    }
    rel.dating = true;
    return {done:true, nowDating:true};
  }

  function tryBreakup(state, aId, bId){
    const rel = window.MemberSystem.getRelation(state,aId,bId);
    if(!state.settings.breakupEnabled) return false;
    if(!rel.dating) return false;
    if(rel.affection > state.settings.breakupThreshold) return false;
    return Math.random() < state.settings.breakupChance;
  }

  window.RelationSystem = {
    stageFromAffection,
    stageColor,
    romancePossible,
    is썸,
    applyAffection,
    setDating,
    setCold,
    clearCold,
    isSomeTag,
    performConfessionAuto,
    performConfessionManual,
    tryBreakup
  };
})();
