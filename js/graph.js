(function(){
  'use strict';

  function colorFor(stage){
    // match CSS-ish palette
    switch(stage){
      case '연애': return '#ec4899';
      case '절친': return '#22c55e';
      case '친구': return '#3b82f6';
      case '혐오':
      case '불편':
      case '무관심':
      default: return '#94a3b8';
    }
  }

  function getTheme(){
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function bgColor(){
    return getTheme()==='dark' ? '#0f172a' : '#ffffff';
  }

  function textColor(){
    return getTheme()==='dark' ? '#e5e7eb' : '#111827';
  }

  function drawGraph(state, canvas){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    // background
    ctx.fillStyle = bgColor();
    ctx.fillRect(0,0,W,H);

    const members = state.members || [];
    if(members.length === 0){
      ctx.fillStyle = textColor();
      ctx.font = '16px ui-sans-serif, system-ui';
      ctx.fillText('멤버가 없어서 관계도를 그릴 수 없습니다.', 20, 40);
      return;
    }

    const cx = W/2, cy = H/2;
    const r = Math.min(W,H)*0.34;
    const pos = {};
    for(let i=0;i<members.length;i++){
      const ang = (Math.PI*2*i)/members.length - Math.PI/2;
      pos[members[i].id] = {x: cx + r*Math.cos(ang), y: cy + r*Math.sin(ang)};
    }

    // edges
    for(let i=0;i<members.length;i++){
      for(let j=i+1;j<members.length;j++){
        const a = members[i], b = members[j];
        const rel = window.MemberSystem.getRelation(state, a.id, b.id);
        const aff = rel.affection || 0;
        const cold = state.day <= (rel.coldUntilDay || 0);
        const jealous = !!rel.jealousyTargetId; // if any is set in this pair
        const dating = !!rel.dating;

        const shouldDraw = dating || cold || Math.abs(aff) >= 20;
        if(!shouldDraw) continue;

        const stage = window.RelationSystem.stageFromAffection(aff, state.settings, dating);
        const p1 = pos[a.id], p2 = pos[b.id];

        ctx.save();
        if(cold || jealous){
          ctx.setLineDash([6,4]);
          ctx.strokeStyle = '#ef4444';
        }else{
          ctx.setLineDash([]);
          ctx.strokeStyle = colorFor(stage);
        }
        const w = Math.min(8, 1 + Math.abs(aff)/35);
        ctx.lineWidth = w;
        ctx.globalAlpha = 0.85;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // nodes
    for(const m of members){
      const p = pos[m.id];
      ctx.save();
      ctx.fillStyle = getTheme()==='dark' ? '#111827' : '#f1f5f9';
      ctx.strokeStyle = getTheme()==='dark' ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x,p.y,18,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // name
      ctx.fillStyle = textColor();
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(m.name, p.x, p.y+34);

      // leader mark
      if(m.isLeader){
        ctx.fillText('★', p.x, p.y-24);
      }
      ctx.restore();
    }
  }

  window.Graph = { drawGraph };
})();
