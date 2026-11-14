import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {regions}=JSON.parse(fs.readFileSync(new URL('../public/regions.json',import.meta.url),'utf8'));
const has=(sido,name)=>regions[sido]?.some(r=>r.name===name);
test('every province the page lists has its regions',()=>{
 for(const p of ["서울특별시","경기도","인천광역시","부산광역시","대구광역시","대전광역시","광주광역시","울산광역시","세종특별자치시","강원특별자치도","충청북도","충청남도","전북특별자치도","전라남도","경상북도","경상남도","제주특별자치도"])
  assert.ok(regions[p]?.length>0,p);
});
test('cities people look for are listed by city name',()=>{
 for(const [s,n] of [['충청남도','천안시'],['경기도','수원시'],['경기도','용인시'],['경기도','고양시'],['경기도','성남시'],['경기도','부천시'],['경기도','화성시'],
  ['충청북도','청주시'],['경상북도','포항시'],['경상남도','창원시'],['전북특별자치도','전주시'],['대구광역시','중구'],['인천광역시','미추홀구'],
  ['부산광역시','중구'],['대전광역시','중구'],['울산광역시','남구'],['광주광역시','광산구'],['전라남도','여수시'],['강원특별자치도','철원군'],['충청북도','음성군']])
  assert.ok(has(s,n),`${s} ${n}`);
 assert.ok(has('경상남도','마산시 (현 창원시 마산합포·회원구)'),'former names kept');
 assert.ok(!has('경상남도','아산시')&&!has('충청남도','동구'),'old broken entries gone');
});
test('longitudes are inside Korea and names are unique per province',()=>{
 for(const [s,list] of Object.entries(regions)){
  assert.equal(new Set(list.map(r=>r.name)).size,list.length,s);
  for(const r of list)assert.ok(r.longitude>124.5&&r.longitude<131,`${s} ${r.name} ${r.longitude}`);
 }
});
