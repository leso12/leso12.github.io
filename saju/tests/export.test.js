import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {jpegSize,buildPdf,stitchJpeg,createExport,getExport,disposition} from '../lib/export.js';

const jpg=(w,h,color)=>sharp({create:{width:w,height:h,channels:3,background:color}}).jpeg().toBuffer();

test('long image: parts are joined top to bottom into one JPEG',async()=>{
 const parts=[await jpg(300,500,'#ff0000'),await jpg(300,700,'#0000ff')];
 const out=await stitchJpeg(parts);
 assert.deepEqual([jpegSize(out).width,jpegSize(out).height],[300,1200]);
 const {data}=await sharp(out).extract({left:150,top:100,width:1,height:1}).raw().toBuffer({resolveWithObject:true});
 assert.ok(data[0]>200&&data[2]<60,'top part stays on top');
});

test('PDF: one page per part, valid structure',async()=>{
 const pdf=buildPdf([await jpg(300,600,'#eee'),await jpg(300,900,'#ddd')]);
 const t=pdf.toString('latin1');
 assert.ok(t.startsWith('%PDF-1.4'));assert.ok(t.trimEnd().endsWith('%%EOF'));
 assert.equal((t.match(/\/Type \/Page /g)||[]).length,2);
 const xref=Number(t.match(/startxref\n(\d+)/)[1]);
 assert.equal(t.slice(xref,xref+4),'xref','xref offset is exact');
});

test('export: upload pieces once, get a real download with a Korean file name',async()=>{
 const a=await jpg(200,300,'#fff'),b=await jpg(200,300,'#000');
 const out=await createExport(Buffer.concat([a,b]),{kind:'jpg',sizes:`${a.length},${b.length}`,name:'나의사주_2000-01-19'});
 assert.equal(out.name,'나의사주_2000-01-19.jpg');
 const f=getExport(out.id);assert.equal(f.mime,'image/jpeg');assert.equal(jpegSize(f.buf).height,600);
 assert.match(disposition(f.name),/^attachment; filename="saju_2000-01-19\.jpg"; filename\*=UTF-8''%EB%82%98/);
 await assert.rejects(()=>createExport(Buffer.concat([a,b]),{kind:'jpg',sizes:`${a.length}`}),/다 오지 않았/);
 await assert.rejects(()=>createExport(Buffer.from('not a jpeg'),{kind:'pdf',sizes:'10'}),/JPEG/);
 assert.equal(getExport('../etc/passwd'),null);
});
