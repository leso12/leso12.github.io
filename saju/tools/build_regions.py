import json,sys,re,collections
src,out=sys.argv[1],sys.argv[2]
d=json.load(open(src,encoding='utf-8-sig'))
def rings(geom):
    if geom['type']=='Polygon':return [geom['coordinates'][0]]
    return [p[0] for p in geom['coordinates']]
def area_cx(ring):
    a=cx=0.0
    for (x1,y1),(x2,y2) in zip(ring,ring[1:]+ring[:1]):
        c=x1*y2-x2*y1;a+=c;cx+=(x1+x2)*c
    return a/2,(cx/(3*a) if a else 0)
acc=collections.defaultdict(lambda:[0.0,0.0])   # (sido, group) -> [area, area*cx]
def add(key,geom):
    for r in rings(geom):
        a,cx=area_cx(r);a=abs(a);acc[key][0]+=a;acc[key][1]+=a*cx
for f in d['features']:
    p=f['properties'];sido=p['sidonm'];sgg=p['sggnm']
    m=re.match(r'^(.+?시)(.+구)$',sgg)
    city=m.group(1) if m else sgg      # 일반구가 있는 시는 시 단위로 묶는다 (천안시동남구 → 천안시)
    add((sido,city),f['geometry'])
    add(('#gu',sido+' '+sgg),f['geometry'])   # 옛 지명 계산용
lon=lambda k:round(acc[k][1]/acc[k][0],3)
regions=collections.defaultdict(list)
for (sido,name),v in acc.items():
    if sido=='#gu':continue
    regions[sido].append({'name':name,'longitude':lon((sido,name))})
def gu(*names):
    ks=[('#gu',n) for n in names];a=sum(acc[k][0] for k in ks);return round(sum(acc[k][1] for k in ks)/a,3)
former={
 '인천광역시':[('중구 (현 제물포구·영종구)',gu('인천광역시 제물포구','인천광역시 영종구')),('동구 (현 제물포구)',gu('인천광역시 제물포구')),
              ('남구 (현 미추홀구)',gu('인천광역시 미추홀구')),('서구 (현 서해구·검단구)',gu('인천광역시 서해구','인천광역시 검단구'))],
 '경상북도':[('군위군 (현 대구 군위군)',gu('대구광역시 군위군'))],
 '충청북도':[('청원군 (현 청주시)',regions and next(r['longitude'] for r in regions['충청북도'] if r['name']=='청주시'))],
 '경상남도':[('마산시 (현 창원시 마산합포·회원구)',gu('경상남도 창원시마산합포구','경상남도 창원시마산회원구')),('진해시 (현 창원시 진해구)',gu('경상남도 창원시진해구'))],
 '충청남도':[('연기군 (현 세종시)',next(r['longitude'] for r in regions['세종특별자치시']))],
}
for sido,items in former.items():
    for n,l in items:regions[sido].append({'name':n,'longitude':l})
# 2026년 광주·전남 통합: 사람들은 출생지를 '광주광역시'·'전라남도'로 알고 있으므로 예전 이름으로 나눠 둔다
merged=regions.pop('전남광주통합특별시',None)
if merged:
    gj={'광산구','남구','동구','북구','서구'}
    regions['광주광역시']=[r for r in merged if r['name'] in gj]
    regions['전라남도']=[r for r in merged if r['name'] not in gj]
for v in regions.values():v.sort(key=lambda r:r['name'])
json.dump({'version':'2026-10-01','source':'통계청 SGIS 행정동 경계(공공누리 제1유형)를 가공한 vuski/admdongkor ver20261001 (CC BY 4.0) — 시·군·구 면적 중심 경도. 일반구가 있는 시는 시 단위로 묶음. 옛 지명은 현재 해당 지역의 경도.',
           'regions':regions},open(out,'w',encoding='utf8'),ensure_ascii=False,separators=(',',':'))
tot=0
for k,v in regions.items():
    tot+=len(v);print(k,len(v),' '.join(r['name'].split(' (')[0] for r in v))
print('total',tot)
