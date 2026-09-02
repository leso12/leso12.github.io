package com.leso12.webtoonviewer;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.view.*;
import android.widget.*;

import androidx.documentfile.provider.DocumentFile;

import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipFile;

import java.io.*;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    static final int REQ_FILE = 10, REQ_FOLDER = 11;
    static final Set<String> IMG_EXT = new HashSet<>(Arrays.asList(".png",".jpg",".jpeg",".webp",".bmp"));
    static final Set<String> ARC_EXT = new HashSet<>(Arrays.asList(".zip",".cbz"));
    static final Pattern NAT = Pattern.compile("(\\d+)|(\\D+)");
    static final ExecutorService LOADER = Executors.newSingleThreadExecutor();

    LinearLayout topBar, bottomBar;
    FrameLayout stage;
    TileImageView viewer;
    TextView title, status;
    Button favBtn;
    ProgressBar loading;
    SharedPreferences prefs;

    ArrayList<Episode> episodes = new ArrayList<>();
    int current = -1;
    Uri sourceUri;
    String sourceKey = "";
    ArchiveSession archive;
    ImageDocument currentDoc;
    File extractedCache;

    boolean autoNext, keepScreen, chromeVisible = true;
    int backgroundMode;
    float brightness = -1f;
    long lastAutoNextAt = 0;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("viewer", MODE_PRIVATE);
        autoNext = prefs.getBoolean("auto_next", false);
        keepScreen = prefs.getBoolean("keep_screen", true);
        backgroundMode = prefs.getInt("bg", 0);
        brightness = prefs.getFloat("brightness", -1f);
        buildUi();
        applyWindowSettings();
        Intent in = getIntent();
        if (in != null && Intent.ACTION_VIEW.equals(in.getAction()) && in.getData()!=null) {
            openPickedUri(in.getData());
        }
    }

    void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);

        HorizontalScrollView topScroll = new HorizontalScrollView(this);
        topScroll.setHorizontalScrollBarEnabled(false);
        topBar = new LinearLayout(this); topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setPadding(dp(4), dp(4), dp(4), dp(4)); topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(0xff171717);
        topScroll.addView(topBar, new ViewGroup.LayoutParams(-2, dp(56)));

        addBtn(topBar,"파일/ZIP",v->pickFile());
        addBtn(topBar,"폴더",v->pickFolder());
        addBtn(topBar,"목록",v->showEpisodeList());
        addBtn(topBar,"◀",v->go(current-1));
        addBtn(topBar,"▶",v->go(current+1));
        title = new TextView(this); title.setTextColor(Color.WHITE); title.setTextSize(15); title.setSingleLine(true);
        title.setPadding(dp(10),0,dp(14),0);
        topBar.addView(title,new LinearLayout.LayoutParams(dp(260),dp(48)));

        stage = new FrameLayout(this);
        viewer = new TileImageView(this);
        viewer.listener = new TileImageView.Listener() {
            @Override public void onSingleTap(){ toggleChrome(); }
            @Override public void onProgress(float p){ savePosition(p); updateStatus(p); if(p>=.95f) markRead(true); }
            @Override public void onEndPull(){
                if(autoNext && System.currentTimeMillis()-lastAutoNextAt>1500 && current+1<episodes.size()){
                    lastAutoNextAt=System.currentTimeMillis(); go(current+1);
                }
            }
            @Override public void onFirstTile(){ loading.setVisibility(View.GONE); }
        };
        stage.addView(viewer,new FrameLayout.LayoutParams(-1,-1));
        loading = new ProgressBar(this);
        FrameLayout.LayoutParams lpLoad=new FrameLayout.LayoutParams(dp(48),dp(48),Gravity.CENTER);
        stage.addView(loading,lpLoad); loading.setVisibility(View.GONE);

        HorizontalScrollView botScroll = new HorizontalScrollView(this);
        botScroll.setHorizontalScrollBarEnabled(false);
        bottomBar = new LinearLayout(this); bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setPadding(dp(4),dp(2),dp(4),dp(2)); bottomBar.setGravity(Gravity.CENTER_VERTICAL);
        bottomBar.setBackgroundColor(0xff171717);
        botScroll.addView(bottomBar,new ViewGroup.LayoutParams(-2,dp(54)));

        favBtn=addBtn(bottomBar,"☆",v->toggleFavorite());
        addBtn(bottomBar,"너비",v->viewer.fitWidth());
        addBtn(bottomBar,"100%",v->viewer.set100());
        addBtn(bottomBar,"배경",v->cycleBackground());
        addBtn(bottomBar,"설정",v->showSettings());
        status=new TextView(this); status.setTextColor(0xffdddddd); status.setTextSize(13); status.setPadding(dp(12),0,dp(12),0);
        bottomBar.addView(status,new LinearLayout.LayoutParams(dp(300),dp(48)));

        root.addView(topScroll,new LinearLayout.LayoutParams(-1,dp(56)));
        root.addView(stage,new LinearLayout.LayoutParams(-1,0,1f));
        root.addView(botScroll,new LinearLayout.LayoutParams(-1,dp(54)));
        setContentView(root);
        applyBackground();

        topBar.setTag(topScroll); bottomBar.setTag(botScroll);
    }

    Button addBtn(LinearLayout row,String text,View.OnClickListener l){
        Button b=new Button(this); b.setText(text); b.setTextSize(13); b.setAllCaps(false);
        b.setMinWidth(dp(48)); b.setMinimumWidth(dp(48)); b.setPadding(dp(10),0,dp(10),0);
        b.setOnClickListener(l); row.addView(b,new LinearLayout.LayoutParams(-2,dp(48))); return b;
    }

    void pickFile(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/png","image/jpeg","image/webp","application/zip","application/x-cbz","application/octet-stream"});
        startActivityForResult(i,REQ_FILE);
    }
    void pickFolder(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(i,REQ_FOLDER);
    }
    @Override protected void onActivityResult(int req,int res,Intent data){
        super.onActivityResult(req,res,data);
        if(res!=RESULT_OK||data==null||data.getData()==null)return;
        Uri u=data.getData();
        try{ getContentResolver().takePersistableUriPermission(u,Intent.FLAG_GRANT_READ_URI_PERMISSION); }catch(Exception ignored){}
        if(req==REQ_FOLDER) openFolder(u); else openPickedUri(u);
    }

    void openPickedUri(Uri u){
        String n=queryName(u); String e=ext(n);
        if(ARC_EXT.contains(e)) openArchive(u,n); else if(IMG_EXT.contains(e)) openSingleImage(u,n);
        else Toast.makeText(this,"지원 형식: PNG/JPG/WEBP/ZIP/CBZ",Toast.LENGTH_LONG).show();
    }

    void resetSource(){
        viewer.setDocument(null,null,0f);
        closeCurrentDoc();
        if(archive!=null){ try{archive.close();}catch(Exception ignored){} archive=null; }
        episodes.clear(); current=-1; sourceUri=null;
        if(extractedCache!=null){ extractedCache.delete(); extractedCache=null; }
    }

    void openSingleImage(Uri u,String name){
        resetSource(); sourceUri=u; sourceKey="file:"+u;
        episodes.add(Episode.uri(name,u)); go(0);
    }

    void openFolder(Uri tree){
        loading.setVisibility(View.VISIBLE);
        LOADER.execute(()->{
            ArrayList<Episode> list=new ArrayList<>();
            DocumentFile root=DocumentFile.fromTreeUri(this,tree);
            if(root!=null) scanFolder(root,list,"");
            list.sort((a,b)->naturalCompare(a.name,b.name));
            runOnUiThread(()->{
                resetSource(); sourceUri=tree; sourceKey="folder:"+tree; episodes.addAll(list);
                if(list.isEmpty()){ loading.setVisibility(View.GONE); Toast.makeText(this,"이미지 파일이 없습니다.",Toast.LENGTH_LONG).show(); }
                else go(Math.min(prefs.getInt(srcHash()+"_index",0),list.size()-1));
            });
        });
    }

    void scanFolder(DocumentFile dir,ArrayList<Episode> out,String prefix){
        DocumentFile[] kids;
        try{ kids=dir.listFiles(); }catch(Exception ex){ return; }
        for(DocumentFile f:kids){
            if(f.isDirectory()) scanFolder(f,out,prefix+safe(f.getName())+"/");
            else if(f.isFile()){
                String n=safe(f.getName());
                if(IMG_EXT.contains(ext(n))) out.add(Episode.uri(prefix+n,f.getUri()));
            }
        }
    }

    void openArchive(Uri u,String display){
        loading.setVisibility(View.VISIBLE);
        LOADER.execute(()->{
            try{
                ArchiveSession s=new ArchiveSession(this,u);
                ArrayList<Episode> list=new ArrayList<>();
                Enumeration<ZipArchiveEntry> en=s.zip.getEntries();
                while(en.hasMoreElements()){
                    ZipArchiveEntry z=en.nextElement();
                    if(!z.isDirectory() && IMG_EXT.contains(ext(z.getName()))) list.add(Episode.zip(z.getName(),z));
                }
                list.sort((a,b)->naturalCompare(a.name,b.name));
                runOnUiThread(()->{
                    resetSource(); archive=s; sourceUri=u; sourceKey="archive:"+u; episodes.addAll(list);
                    if(list.isEmpty()){ loading.setVisibility(View.GONE); Toast.makeText(this,"ZIP/CBZ 안에 이미지가 없습니다.",Toast.LENGTH_LONG).show(); }
                    else go(Math.min(prefs.getInt(srcHash()+"_index",0),list.size()-1));
                });
            }catch(Exception ex){
                runOnUiThread(()->{ loading.setVisibility(View.GONE); showError("압축파일을 열 수 없습니다.",ex); });
            }
        });
    }

    void go(int idx){
        if(idx<0||idx>=episodes.size())return;
        current=idx; Episode ep=episodes.get(idx);
        title.setText((idx+1)+"/"+episodes.size()+"  "+ep.name);
        prefs.edit().putInt(srcHash()+"_index",idx).apply();
        favBtn.setText(isFavorite()?"★":"☆");
        loading.setVisibility(View.VISIBLE);
        viewer.setDocument(null,null,0f);
        closeCurrentDoc();

        final int token=idx;
        LOADER.execute(()->{
            try{
                ImageDocument d;
                if(ep.uri!=null) d=ImageDocument.fromUri(this,ep.uri);
                else {
                    File c=new File(getCacheDir(),"webtoon_entry");
                    if(!c.exists()) c.mkdirs();
                    String suffix=ext(ep.name); if(suffix.isEmpty()) suffix=".img";
                    File out=new File(c,"current"+suffix);
                    File tmp=new File(c,"current.tmp");
                    if(tmp.exists())tmp.delete();
                    archive.extract(ep.entry,tmp);
                    if(out.exists())out.delete();
                    if(!tmp.renameTo(out)) throw new IOException("임시 이미지 이동 실패");
                    extractedCache=out;
                    d=ImageDocument.fromFile(out);
                }
                float saved=prefs.getFloat(epHash(ep)+"_pos",0f);
                runOnUiThread(()->{
                    if(current!=token){ d.close(); return; }
                    currentDoc=d;
                    viewer.setDocument(d,epHash(ep),saved);
                    updateStatus(saved);
                });
            }catch(Exception ex){
                runOnUiThread(()->{ loading.setVisibility(View.GONE); showError("이미지를 열 수 없습니다: "+ep.name,ex); });
            }
        });
    }

    void closeCurrentDoc(){
        if(currentDoc!=null){ currentDoc.close(); currentDoc=null; }
    }

    void showEpisodeList(){
        if(episodes.isEmpty()){Toast.makeText(this,"먼저 작품을 여세요.",Toast.LENGTH_SHORT).show();return;}
        String[] rows=new String[episodes.size()];
        for(int i=0;i<rows.length;i++){
            Episode e=episodes.get(i);
            rows[i]=(prefs.getBoolean(epHash(e)+"_read",false)?"✓ ":"")+(prefs.getBoolean(epHash(e)+"_fav",false)?"★ ":"")+(i+1)+". "+e.name;
        }
        AlertDialog d=new AlertDialog.Builder(this).setTitle("회차 목록").setItems(rows,(x,which)->go(which)).setNegativeButton("닫기",null).create();
        d.setOnShowListener(x->{ ListView lv=d.getListView(); if(lv!=null)lv.setSelection(Math.max(0,current-2)); }); d.show();
    }

    void toggleFavorite(){
        if(current<0)return; Episode e=episodes.get(current); boolean v=!isFavorite();
        prefs.edit().putBoolean(epHash(e)+"_fav",v).apply(); favBtn.setText(v?"★":"☆");
    }
    boolean isFavorite(){ return current>=0 && prefs.getBoolean(epHash(episodes.get(current))+"_fav",false); }
    void markRead(boolean v){ if(current>=0)prefs.edit().putBoolean(epHash(episodes.get(current))+"_read",v).apply(); }

    void savePosition(float p){
        if(current<0)return; prefs.edit().putFloat(epHash(episodes.get(current))+"_pos",p).apply();
    }
    void updateStatus(float p){
        if(currentDoc==null){status.setText("");return;}
        status.setText(String.format(Locale.KOREA,"%d×%d  ·  %.1f%%  ·  타일 렌더링",currentDoc.width,currentDoc.height,p*100f));
    }

    void cycleBackground(){ backgroundMode=(backgroundMode+1)%4; prefs.edit().putInt("bg",backgroundMode).apply(); applyBackground(); }
    void applyBackground(){
        int c;
        switch(backgroundMode){case 1:c=0xff202020;break;case 2:c=0xff777777;break;case 3:c=0xffffffff;break;default:c=0xff000000;}
        viewer.setReaderBackground(c); stage.setBackgroundColor(c);
    }

    void showSettings(){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(20),dp(8),dp(20),0);
        CheckBox a=new CheckBox(this); a.setText("끝에서 다음 화 자동 이동"); a.setChecked(autoNext); box.addView(a);
        CheckBox k=new CheckBox(this); k.setText("읽는 동안 화면 켜짐 유지"); k.setChecked(keepScreen); box.addView(k);
        TextView bt=new TextView(this); bt.setText("화면 밝기  (시스템 밝기 = 맨 왼쪽)"); bt.setPadding(0,dp(12),0,0); box.addView(bt);
        SeekBar sb=new SeekBar(this); sb.setMax(101); sb.setProgress(brightness<0?0:Math.max(1,Math.min(101,Math.round(brightness*100)+1))); box.addView(sb);
        Button clear=new Button(this); clear.setText("임시 ZIP 이미지 캐시 지우기"); clear.setOnClickListener(v->{clearEntryCache();Toast.makeText(this,"캐시를 정리했습니다.",Toast.LENGTH_SHORT).show();}); box.addView(clear);
        new AlertDialog.Builder(this).setTitle("뷰어 설정").setView(box).setPositiveButton("저장",(d,w)->{
            autoNext=a.isChecked(); keepScreen=k.isChecked();
            int pr=sb.getProgress(); brightness=pr==0?-1f:(pr-1)/100f;
            prefs.edit().putBoolean("auto_next",autoNext).putBoolean("keep_screen",keepScreen).putFloat("brightness",brightness).apply();
            applyWindowSettings();
        }).setNegativeButton("취소",null).show();
    }
    void clearEntryCache(){
        File d=new File(getCacheDir(),"webtoon_entry"); File[] fs=d.listFiles(); if(fs!=null)for(File f:fs)if(currentDoc==null||!f.equals(extractedCache))f.delete();
    }

    void applyWindowSettings(){
        if(keepScreen)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowManager.LayoutParams lp=getWindow().getAttributes(); lp.screenBrightness=brightness; getWindow().setAttributes(lp);
    }

    void toggleChrome(){
        chromeVisible=!chromeVisible;
        View ts=(View)topBar.getTag(), bs=(View)bottomBar.getTag();
        ts.setVisibility(chromeVisible?View.VISIBLE:View.GONE); bs.setVisibility(chromeVisible?View.VISIBLE:View.GONE);
        if(Build.VERSION.SDK_INT>=30){
            WindowInsetsController c=getWindow().getInsetsController();
            if(c!=null){
                if(chromeVisible)c.show(WindowInsets.Type.statusBars()|WindowInsets.Type.navigationBars());
                else c.hide(WindowInsets.Type.statusBars()|WindowInsets.Type.navigationBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(chromeVisible?0:
                    View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    String queryName(Uri u){
        if("content".equals(u.getScheme())){
            try(Cursor c=getContentResolver().query(u,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
                if(c!=null&&c.moveToFirst())return c.getString(0);
            }catch(Exception ignored){}
        }
        String p=u.getLastPathSegment(); return p==null?"파일":p;
    }
    String srcHash(){ return "s_"+sha(sourceKey); }
    String epHash(Episode e){ return "e_"+sha(sourceKey+"|"+e.id); }
    static String sha(String s){
        try{ MessageDigest m=MessageDigest.getInstance("SHA-256"); byte[] b=m.digest(s.getBytes("UTF-8")); StringBuilder x=new StringBuilder(); for(int i=0;i<12;i++)x.append(String.format("%02x",b[i])); return x.toString();}
        catch(Exception e){return Integer.toHexString(s.hashCode());}
    }
    static String safe(String s){return s==null?"":s;}
    static String ext(String n){int q=n.lastIndexOf('.');return q<0?"":n.substring(q).toLowerCase(Locale.ROOT);}
    static int naturalCompare(String a,String b){
        Matcher ma=NAT.matcher(a.toLowerCase(Locale.ROOT)), mb=NAT.matcher(b.toLowerCase(Locale.ROOT));
        while(ma.find()&&mb.find()){
            String x=ma.group(),y=mb.group(); int c;
            if(Character.isDigit(x.charAt(0))&&Character.isDigit(y.charAt(0))){
                x=x.replaceFirst("^0+(?!$)",""); y=y.replaceFirst("^0+(?!$)","");
                c=Integer.compare(x.length(),y.length()); if(c==0)c=x.compareTo(y);
            }else c=x.compareTo(y);
            if(c!=0)return c;
        } return a.compareToIgnoreCase(b);
    }
    int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
    void showError(String msg,Exception e){ new AlertDialog.Builder(this).setTitle("오류").setMessage(msg+"\n\n"+e.getClass().getSimpleName()+": "+e.getMessage()).setPositiveButton("확인",null).show(); }

    @Override protected void onDestroy(){
        viewer.release(); closeCurrentDoc(); if(archive!=null)try{archive.close();}catch(Exception ignored){}
        super.onDestroy();
    }

    static class Episode {
        String name,id; Uri uri; ZipArchiveEntry entry;
        static Episode uri(String n,Uri u){Episode e=new Episode();e.name=n;e.id=u.toString();e.uri=u;return e;}
        static Episode zip(String n,ZipArchiveEntry z){Episode e=new Episode();e.name=n;e.id=n;e.entry=z;return e;}
    }

    static class ArchiveSession implements Closeable {
        ParcelFileDescriptor pfd; FileInputStream fis; SeekableByteChannel channel; ZipFile zip;
        ArchiveSession(Context c,Uri u)throws Exception{
            pfd=c.getContentResolver().openFileDescriptor(u,"r"); if(pfd==null)throw new IOException("파일 핸들을 열 수 없음");
            fis=new FileInputStream(pfd.getFileDescriptor()); channel=fis.getChannel();
            zip=ZipFile.builder().setSeekableByteChannel(channel).setCharset(Charset.forName("MS949")).get();
        }
        void extract(ZipArchiveEntry e,File out)throws IOException{
            try(InputStream in=zip.getInputStream(e); OutputStream o=new BufferedOutputStream(new FileOutputStream(out),1024*1024)){
                byte[] b=new byte[1024*1024]; int n; while((n=in.read(b))>0)o.write(b,0,n);
            }
        }
        @Override public void close()throws IOException{
            try{if(zip!=null)zip.close();}finally{try{if(fis!=null)fis.close();}finally{if(pfd!=null)pfd.close();}}
        }
    }

    static class ImageDocument implements Closeable {
        ParcelFileDescriptor pfd; BitmapRegionDecoder decoder; int width,height;
        static ImageDocument fromUri(Context c,Uri u)throws IOException{
            ImageDocument d=new ImageDocument(); d.pfd=c.getContentResolver().openFileDescriptor(u,"r");
            if(d.pfd==null)throw new IOException("이미지 파일 핸들 실패");
            d.decoder=BitmapRegionDecoder.newInstance(d.pfd.getFileDescriptor(),false);
            if(d.decoder==null)throw new IOException("지원하지 않는 이미지");
            d.width=d.decoder.getWidth(); d.height=d.decoder.getHeight(); return d;
        }
        static ImageDocument fromFile(File f)throws IOException{
            ImageDocument d=new ImageDocument(); d.decoder=BitmapRegionDecoder.newInstance(f.getAbsolutePath(),false);
            if(d.decoder==null)throw new IOException("이미지 디코더 생성 실패");
            d.width=d.decoder.getWidth(); d.height=d.decoder.getHeight(); return d;
        }
        synchronized Bitmap region(Rect r,int sample){
            if(decoder==null)return null;
            Rect q=new Rect(Math.max(0,r.left),Math.max(0,r.top),Math.min(width,r.right),Math.min(height,r.bottom));
            if(q.width()<=0||q.height()<=0)return null;
            BitmapFactory.Options o=new BitmapFactory.Options(); o.inSampleSize=Math.max(1,sample); o.inPreferredConfig=Bitmap.Config.ARGB_8888;
            try{return decoder.decodeRegion(q,o);}catch(Throwable t){return null;}
        }
        @Override public synchronized void close(){
            if(decoder!=null){decoder.recycle();decoder=null;} if(pfd!=null)try{pfd.close();}catch(Exception ignored){} pfd=null;
        }
    }

    public static class TileImageView extends View {
        interface Listener { void onSingleTap(); void onProgress(float p); void onEndPull(); void onFirstTile(); }
        Listener listener;
        ImageDocument doc; String docKey; int generation=0;
        float scale=1f, scrollX=0f, scrollY=0f, pendingSaved=0f; boolean fitMode=true;
        int bg=Color.BLACK;
        Paint paint=new Paint(Paint.FILTER_BITMAP_FLAG|Paint.DITHER_FLAG);
        ExecutorService decode=Executors.newSingleThreadExecutor();
        HashSet<String> pending=new HashSet<>();
        LruCache<String,Bitmap> cache;
        Bitmap preview;
        GestureDetector gesture; ScaleGestureDetector pinch; OverScroller fling;
        boolean firstTileSent=false;

        TileImageView(Context c){
            super(c); setFocusable(true);
            ActivityManager am=(ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE);
            int mb=am==null?256:am.getMemoryClass(); int cap=Math.max(48,Math.min(160,mb/3))*1024*1024;
            cache=new LruCache<String,Bitmap>(cap){@Override protected int sizeOf(String k,Bitmap b){return b.getAllocationByteCount();}@Override protected void entryRemoved(boolean e,String k,Bitmap o,Bitmap n){if(o!=n&&!o.isRecycled())o.recycle();}};
            fling=new OverScroller(c);
            gesture=new GestureDetector(c,new GestureDetector.SimpleOnGestureListener(){
                @Override public boolean onDown(android.view.MotionEvent e){fling.forceFinished(true);return true;}
                @Override public boolean onScroll(android.view.MotionEvent e1,android.view.MotionEvent e2,float dx,float dy){
                    float before=scrollY; scrollX+=dx; scrollY+=dy; clamp();
                    if(before>=maxScrollY()-2 && dy>35 && listener!=null)listener.onEndPull();
                    invalidate(); report(); return true;
                }
                @Override public boolean onFling(android.view.MotionEvent e1,android.view.MotionEvent e2,float vx,float vy){
                    fling.fling((int)scrollX,(int)scrollY,(int)-vx,(int)-vy,0,(int)maxScrollX(),0,(int)maxScrollY());
                    postInvalidateOnAnimation(); return true;
                }
                @Override public boolean onSingleTapConfirmed(android.view.MotionEvent e){if(listener!=null)listener.onSingleTap();return true;}
                @Override public boolean onDoubleTap(android.view.MotionEvent e){if(fitMode)setScaleAround(1f,e.getX(),e.getY());else fitWidth();return true;}
            });
            pinch=new ScaleGestureDetector(c,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
                @Override public boolean onScale(ScaleGestureDetector d){setScaleAround(scale*d.getScaleFactor(),d.getFocusX(),d.getFocusY());return true;}
            });
        }

        void setReaderBackground(int c){bg=c;invalidate();}
        void setDocument(ImageDocument d,String key,float saved){
            generation++; doc=d;docKey=key;pendingSaved=Math.max(0,Math.min(1,saved));firstTileSent=false;
            synchronized(pending){pending.clear();} cache.evictAll(); if(preview!=null&&!preview.isRecycled())preview.recycle();preview=null;
            scrollX=scrollY=0;fitMode=true;
            if(d!=null){ post(()->{fitWidthInternal(pendingSaved); buildPreview(generation);}); }
            else invalidate();
        }
        void fitWidth(){fitWidthInternal(progress());}
        void fitWidthInternal(float keep){
            if(doc==null||getWidth()==0)return; fitMode=true; scale=(float)getWidth()/doc.width; scale=Math.max(.02f,Math.min(4f,scale));
            scrollX=0; scrollY=keep*maxScrollY();clamp();invalidate();report();
        }
        void set100(){if(doc==null)return;setScaleAround(1f,getWidth()/2f,getHeight()/2f);}
        void setScaleAround(float ns,float fx,float fy){
            if(doc==null)return; ns=Math.max(.05f,Math.min(6f,ns)); float old=scale;
            float oldOriginX=originX(); float imageX=(fx-oldOriginX)/old; float imageY=(scrollY+fy)/old;
            scale=ns;fitMode=false;
            float newContentW=doc.width*scale;
            if(newContentW>getWidth())scrollX=imageX*scale-fx;else scrollX=0;
            scrollY=imageY*scale-fy;clamp();invalidate();report();
        }
        float originX(){float cw=doc==null?0:doc.width*scale; return cw<=getWidth()?(getWidth()-cw)/2f:-scrollX;}
        float maxScrollX(){return doc==null?0:Math.max(0,doc.width*scale-getWidth());}
        float maxScrollY(){return doc==null?0:Math.max(0,doc.height*scale-getHeight());}
        void clamp(){scrollX=Math.max(0,Math.min(maxScrollX(),scrollX));scrollY=Math.max(0,Math.min(maxScrollY(),scrollY));}
        float progress(){float m=maxScrollY();return m<=0?1f:Math.max(0,Math.min(1,scrollY/m));}
        void report(){if(listener!=null)listener.onProgress(progress());}

        @Override protected void onSizeChanged(int w,int h,int ow,int oh){
            if(doc!=null&&fitMode)post(()->fitWidthInternal(progress()));
        }
        @Override public boolean onTouchEvent(android.view.MotionEvent e){boolean a=pinch.onTouchEvent(e),b=gesture.onTouchEvent(e);return a||b||super.onTouchEvent(e);}
        @Override public void computeScroll(){if(fling.computeScrollOffset()){scrollX=fling.getCurrX();scrollY=fling.getCurrY();clamp();invalidate();report();postInvalidateOnAnimation();}}

        int sampleForScale(){
            int s=1; while(s<64 && s*2*scale<=1.05f)s*=2; return s;
        }
        @Override protected void onDraw(Canvas c){
            super.onDraw(c);c.drawColor(bg); if(doc==null)return;
            if(preview!=null&&!preview.isRecycled()){
                RectF dst=new RectF(originX(),-scrollY,originX()+doc.width*scale,-scrollY+doc.height*scale);
                c.drawBitmap(preview,null,dst,paint);
            }
            int sample=sampleForScale(); int tileSrc=Math.max(1024,sample*1536);
            int first=Math.max(0,(int)Math.floor((scrollY/scale)/tileSrc)-2);
            int last=Math.min((doc.height-1)/tileSrc,(int)Math.floor(((scrollY+getHeight())/scale)/tileSrc)+2);
            for(int i=first;i<=last;i++){
                String k=generation+":"+sample+":"+i; Bitmap b=cache.get(k);
                int sy=i*tileSrc, ey=Math.min(doc.height,sy+tileSrc);
                if(b!=null&&!b.isRecycled()){
                    float x=originX(),y=sy*scale-scrollY;
                    RectF dst=new RectF(x,y,x+doc.width*scale,y+(ey-sy)*scale);
                    c.drawBitmap(b,null,dst,paint);
                    if(!firstTileSent){firstTileSent=true;if(listener!=null)listener.onFirstTile();}
                } else requestTile(k,sample,i,tileSrc,generation);
            }
        }
        void requestTile(String key,int sample,int idx,int tileSrc,int gen){
            synchronized(pending){if(pending.contains(key))return;pending.add(key);}
            ImageDocument d=doc; if(d==null)return;
            decode.execute(()->{
                Bitmap b=d.region(new Rect(0,idx*tileSrc,d.width,Math.min(d.height,(idx+1)*tileSrc)),sample);
                post(()->{
                    synchronized(pending){pending.remove(key);}
                    if(gen!=generation){if(b!=null)b.recycle();return;}
                    if(b!=null)cache.put(key,b);invalidate();
                });
            });
        }
        void buildPreview(int gen){
            ImageDocument d=doc;if(d==null)return;
            decode.execute(()->{
                int s=1; while(s<256&&(d.height/s>4500||d.width/s>1000))s*=2;
                Bitmap b=d.region(new Rect(0,0,d.width,d.height),s);
                post(()->{if(gen!=generation){if(b!=null)b.recycle();return;}preview=b;invalidate();});
            });
        }
        void release(){generation++;decode.shutdownNow();cache.evictAll();if(preview!=null&&!preview.isRecycled())preview.recycle();preview=null;}
    }
}
