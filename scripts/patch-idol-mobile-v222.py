from pathlib import Path
import re

p = Path('mobile/idol/index.html')
s = p.read_text(encoding='utf-8')

s = re.sub(r'<meta name="idol-sim-version" content="[^"]+">',
           '<meta name="idol-sim-version" content="2.2.2">', s, count=1)

old_header = '''  <div class="header-actions">
    <span class="header-day"   id="header-day-disp">Day 1</span>
    <span class="header-money" id="header-money-disp">5,000원</span>
    <button class="header-icon-btn" id="header-theme-btn" onclick="onToggleTheme()" title="라이트/다크 전환">🌙</button>
  </div>'''
new_header = '''  <div class="header-actions">
    <button class="mobile-header-quick quick-save" onclick="onSave()" title="저장" aria-label="저장">💾</button>
    <button class="mobile-header-quick quick-load" onclick="onImport()" title="불러오기" aria-label="불러오기">📥</button>
    <button class="mobile-header-quick quick-backup" onclick="onExport()" title="전체 백업" aria-label="전체 백업">📤</button>
    <span class="header-day"   id="header-day-disp">Day 1</span>
    <span class="header-money" id="header-money-disp">5,000원</span>
    <button class="header-icon-btn" id="header-theme-btn" onclick="onToggleTheme()" title="라이트/다크 전환">🌙</button>
  </div>'''
if 'class="mobile-header-quick quick-save"' not in s:
    assert old_header in s, 'header source block not found'
    s = s.replace(old_header, new_header, 1)

s = re.sub(r'\n<section class="mobile-data-tools" aria-label="저장 및 데이터 도구">.*?</section>\n', '\n', s, count=1, flags=re.S)

s = s.replace(
    '<h3>저장 / 불러오기</h3>\n      <p class="note" style="margin-bottom:8px">상단 탭 바 우측 아이콘으로도 빠르게 접근할 수 있습니다</p>',
    '<h3>저장 · 데이터 관리</h3>\n      <p class="note" style="margin-bottom:8px">전체 데이터 도구는 여기에서 관리합니다. 모바일 상단 오른쪽에는 저장·불러오기·전체 백업만 빠른 아이콘으로 표시됩니다.</p>',
    1
)

css = '''<style id="idol-mobile-v222-layout">
.mobile-header-quick { display:none; }

@media (max-width:720px) {
  html { font-size:14px; }
  body { overflow-x:hidden; -webkit-tap-highlight-color:transparent; }
  #app-header {
    position:sticky; top:0; z-index:100;
    min-height:76px; height:auto;
    padding:7px max(10px,env(safe-area-inset-right)) 7px max(10px,env(safe-area-inset-left));
    gap:8px;
  }
  .app-title {
    min-width:0; flex:1 1 auto;
    font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .header-actions {
    flex:0 0 auto; width:146px;
    display:grid !important;
    grid-template-columns:repeat(4,34px);
    grid-template-areas:
      'save load backup theme'
      'day day money money';
    gap:4px; justify-content:end; align-items:center;
  }
  .mobile-header-quick {
    display:flex; width:34px; height:34px; min-width:34px; min-height:34px;
    align-items:center; justify-content:center;
    border:1px solid var(--border); border-radius:10px;
    background:var(--bg2); color:var(--text-main);
    font-size:1rem; line-height:1; padding:0;
    box-shadow:0 1px 4px rgba(124,92,191,.05);
    touch-action:manipulation;
  }
  .mobile-header-quick:active { background:var(--accent-soft); border-color:var(--accent); }
  .quick-save { grid-area:save; }
  .quick-load { grid-area:load; }
  .quick-backup { grid-area:backup; }
  #header-theme-btn { grid-area:theme; width:34px; min-width:34px; height:34px; min-height:34px; border-radius:10px; }
  .header-day { grid-area:day; }
  .header-money { grid-area:money; }
  .header-day,.header-money {
    display:flex; align-items:center; justify-content:center; min-width:0; min-height:24px;
    padding:3px 5px; border-radius:999px; background:var(--bg3);
    font-size:.66rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }

  #tab-nav {
    position:static !important; top:auto !important;
    display:grid !important; grid-template-columns:repeat(4,minmax(0,1fr));
    gap:6px; width:100%; padding:8px 10px; overflow:visible !important;
    background:var(--bg); border-bottom:0; scroll-snap-type:none !important;
  }
  #tab-nav .tab-btn {
    min-width:0 !important; width:100%; min-height:58px; padding:6px 4px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
    white-space:normal !important; word-break:keep-all; overflow-wrap:normal;
    line-height:1.18; text-align:center !important; font-size:.72rem; font-weight:700;
    color:var(--text-sub); background:var(--bg2); border:1px solid var(--border) !important;
    border-radius:12px; box-shadow:0 1px 5px rgba(124,92,191,.05);
  }
  #tab-nav .tab-btn::before { font-size:1.08rem; line-height:1; }
  #tab-nav .tab-btn[data-tab="dashboard"]::before { content:'🏠'; }
  #tab-nav .tab-btn[data-tab="members"]::before { content:'👥'; }
  #tab-nav .tab-btn[data-tab="schedule"]::before { content:'🗓️'; }
  #tab-nav .tab-btn[data-tab="relations"]::before { content:'💞'; }
  #tab-nav .tab-btn[data-tab="album"]::before { content:'🎤'; }
  #tab-nav .tab-btn[data-tab="settings"]::before { content:'⚙️'; }
  #tab-nav .tab-btn[data-tab="log"]::before { content:'📋'; }
  #tab-nav .tab-btn.active {
    color:var(--accent); background:var(--accent-soft); border-color:var(--accent) !important;
    box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent);
  }
  #tab-nav .tab-btn:hover { transform:none; }
  #tab-nav .tab-save-group { display:none !important; }

  #main-content {
    width:100%; max-width:none; padding:2px 10px calc(18px + env(safe-area-inset-bottom)); margin:0;
  }
  .card { padding:12px; border-radius:14px; }
  .card + .card { margin-top:10px; }
  .dash-grid { gap:7px; }
  .member-grid,.relation-pair-grid { grid-template-columns:1fr !important; }
  .member-card { padding:12px; }
  .member-actions,.dash-actions,.settings-actions,.schedule-header-actions { gap:6px; }
  .settings-actions .btn { flex:1 1 calc(50% - 6px); min-width:0; }

  button,.btn,.btn-sm,.ev-item,.activity-picker-btn,.activity-btn,.relation-detail-btn,.schedule-confirm-btn { text-align:center !important; }
  .btn,.ev-item,.activity-picker-btn,.activity-btn,.relation-detail-btn,.schedule-confirm-btn { min-height:44px; justify-content:center !important; }
  select,input,.input { min-height:44px; }

  #log-full,.log-mini,.summary-list,.pair-timeline { text-align:left !important; word-break:break-word; overflow-wrap:anywhere; }
  .summary-list > div,.pair-timeline-item,.log-card,.log-item { text-align:left !important; }
  .modal-box { width:min(calc(100vw - 20px),560px); }
}

@media (max-width:380px) {
  #app-header { gap:5px; padding-left:8px; padding-right:8px; }
  .app-title { font-size:.92rem; }
  .header-actions { width:138px; grid-template-columns:repeat(4,32px); gap:3px; }
  .mobile-header-quick,#header-theme-btn { width:32px; min-width:32px; height:32px; min-height:32px; }
  #tab-nav { grid-template-columns:repeat(3,minmax(0,1fr)); }
  #tab-nav .tab-btn { min-height:56px; font-size:.69rem; }
  .settings-actions .btn { flex-basis:100%; }
}
</style>'''

m = re.search(r'<style id="idol-mobile-v22(?:0|1)-layout">.*?</style>', s, flags=re.S)
if not m:
    m = re.search(r'<style id="idol-mobile-v220-layout">.*?</style>', s, flags=re.S)
assert m, 'existing mobile v22 layout style not found'
s = s[:m.start()] + css + s[m.end():]

if 'idol-mobile-v22.2 header-quick-tools build' not in s:
    s = s.replace('</body>', '<!-- idol-mobile-v22.2 header-quick-tools build -->\n</body>', 1)

p.write_text(s, encoding='utf-8')
check = p.read_text(encoding='utf-8')
assert 'idol-sim-version" content="2.2.2' in check
assert 'idol-mobile-v222-layout' in check
assert 'class="mobile-header-quick quick-save"' in check
assert 'class="mobile-data-tools"' not in check
assert '<h3>저장 · 데이터 관리</h3>' in check
block = check[check.index('<style id="idol-mobile-v222-layout">'):check.index('</style>', check.index('<style id="idol-mobile-v222-layout">'))]
assert '\\n' not in block
