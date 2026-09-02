package com.leso12.webtoonviewer;

import android.app.*;
import android.content.*;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import android.util.LruCache;
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
    static final Set<String> IMG_EXT = new HashSet<>(Arrays.asList(".png", ".jpg", ".jpeg", ".webp", ".bmp"));
    static final Set<String> ARC_EXT = new HashSet<>(Arrays.asList(".zip", ".cbz"));
    static final Pattern NAT = Pattern.compile("(\\d+)|(\\D+)");
    static final ExecutorService LOADER = Executors.newSingleThreadExecutor();

    SharedPreferences prefs;
    boolean autoNext, keepScreen, readerMode, chromeVisible = true, autoScrolling = false;
    int backgroundMode, autoSpeed, archiveGap, rotationMode;
    float brightness = -1f;

    FrameLayout stage;
    LinearLayout topBar, bottomButtons;
    View topWrap, bottomWrap;
    TextView readerTitle, readerStatus;
    Button favBtn, autoBtn;
    SeekBar progressSeek;
    boolean progressInternal;

    ReaderSurface activeReader;
    TileImageView imageReader;
    ArchiveReaderView archiveReader;
    ImageDocument currentDoc;
    ArchiveSession archive;
    Uri sourceUri;
    String sourceName = "", sourceKey = "";

    ArrayList<Episode> episodes = new ArrayList<>();
    int current = -1;

    ArrayList<DocumentFile> browserStack = new ArrayList<>();
    DocumentFile browserDir;

    Handler autoHandler = new Handler(Looper.getMainLooper());
    Runnable autoTick = new Runnable() {
        @Override public void run() {
            if (!autoScrolling || !readerMode || activeReader == null) return;
            activeReader.scrollByPx(Math.max(1, autoSpeed));
            autoHandler.postDelayed(this, 24);
        }
    };

    interface ReaderEvents {
        void onSingleTap();
        void onProgress(float p);
        void onEndPull();
        void onFirstTile();
    }

    interface ReaderSurface {
        void fitWidth();
        void set100();
        void setProgress(float p);
        float getProgress();
        void setReaderBackground(int c);
        void scrollByPx(float dy);
        void release();
        String infoText();
    }

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("viewer", MODE_PRIVATE);
        autoNext = prefs.getBoolean("auto_next", true);
        keepScreen = prefs.getBoolean("keep_screen", true);
        backgroundMode = prefs.getInt("bg", 0);
        brightness = prefs.getFloat("brightness", -1f);
        autoSpeed = prefs.getInt("auto_speed", 3);
        archiveGap = prefs.getInt("archive_gap", 0);
        rotationMode = prefs.getInt("rotation", 0);
        applyWindowSettings();

        Intent in = getIntent();
        if (in != null && Intent.ACTION_VIEW.equals(in.getAction()) && in.getData() != null) {
            openPickedUri(in.getData());
        } else {
            showHome();
        }
    }

    void showHome() {
        stopAutoScroll();
        leaveReader();
        readerMode = false;
        chromeVisible = true;
        setImmersive(false);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(18), dp(18), dp(18));
        root.setBackgroundColor(0xff101113);

        TextView app = text("웹툰 뷰어", 26, Color.WHITE, true);
        TextView sub = text("원본 PNG · ZIP/CBZ · 광고 없음", 13, 0xffaeb3bc, false);
        root.addView(app, lp(-1, -2, 0, 0, 0, 4));
        root.addView(sub, lp(-1, -2, 0, 0, 0, 18));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button openFile = homeButton("파일 / ZIP 열기", 0xff2b6ef2);
        Button openFolder = homeButton("폴더 열기", 0xff2d3138);
        actions.addView(openFile, new LinearLayout.LayoutParams(0, dp(54), 1f));
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(8), 1); actions.addView(new Space(this), sp);
        actions.addView(openFolder, new LinearLayout.LayoutParams(0, dp(54), 1f));
        root.addView(actions, lp(-1, -2, 0, 0, 0, 18));
        openFile.setOnClickListener(v -> pickFile());
        openFolder.setOnClickListener(v -> pickFolder());

        TextView recentTitle = text("최근 본 항목", 17, Color.WHITE, true);
        root.addView(recentTitle, lp(-1, -2, 0, 0, 0, 8));
        addSavedPreview(root, "recent", 6);

        LinearLayout quick = new LinearLayout(this);
        quick.setOrientation(LinearLayout.HORIZONTAL);
        Button recent = homeSmallButton("최근 전체");
        Button fav = homeSmallButton("즐겨찾기");
        Button settings = homeSmallButton("설정");
        quick.addView(recent, new LinearLayout.LayoutParams(0, dp(48), 1));
        quick.addView(fav, new LinearLayout.LayoutParams(0, dp(48), 1));
        quick.addView(settings, new LinearLayout.LayoutParams(0, dp(48), 1));
        root.addView(quick, lp(-1, -2, 0, 12, 0, 0));
        recent.setOnClickListener(v -> showSavedList("recent", "최근 본 항목"));
        fav.setOnClickListener(v -> showSavedList("favorites", "즐겨찾기"));
        settings.setOnClickListener(v -> showSettings());

        Space fill = new Space(this);
        root.addView(fill, new LinearLayout.LayoutParams(1, 0, 1));
        TextView privacy = text("인터넷 권한 · 광고 SDK · 분석 SDK · 결제 기능 없음", 12, 0xff7f8792, false);
        privacy.setGravity(Gravity.CENTER);
        root.addView(privacy, lp(-1, -2, 0, 10, 0, 0));
        setContentView(root);
    }

    void addSavedPreview(LinearLayout root, String key, int max) {
        ArrayList<SavedItem> list = loadSaved(key);
        if (list.isEmpty()) {
            TextView none = text("아직 기록이 없어요. 파일이나 폴더를 열면 여기에 표시됩니다.", 14, 0xff808792, false);
            none.setPadding(dp(14), dp(16), dp(14), dp(16));
            none.setBackground(round(0xff191b1f, 12));
            root.addView(none, lp(-1, -2, 0, 0, 0, 8));
            return;
        }
        for (int i = 0; i < Math.min(max, list.size()); i++) {
            SavedItem s = list.get(i);
            TextView row = text(("folder".equals(s.kind) ? "▣  " : ARC_EXT.contains(ext(s.name)) ? "▤  " : "▥  ") + s.name, 14, 0xffe6e8ec, false);
            row.setSingleLine(true); row.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
            row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(14), 0, dp(14), 0);
            row.setBackground(round(0xff191b1f, 10));
            final SavedItem item = s;
            row.setOnClickListener(v -> openSaved(item));
            root.addView(row, lp(-1, dp(46), 0, 0, 0, 6));
        }
    }

    void showSavedList(String key, String title) {
        ArrayList<SavedItem> list = loadSaved(key);
        if (list.isEmpty()) { Toast.makeText(this, "목록이 비어 있습니다.", Toast.LENGTH_SHORT).show(); return; }
        String[] rows = new String[list.size()];
        for (int i = 0; i < rows.length; i++) rows[i] = list.get(i).name;
        new AlertDialog.Builder(this).setTitle(title).setItems(rows, (d, which) -> openSaved(list.get(which)))
                .setNeutralButton("목록 비우기", (d,w) -> { prefs.edit().remove(key).apply(); showHome(); })
                .setNegativeButton("닫기", null).show();
    }

    void openSaved(SavedItem s) {
        try {
            Uri u = Uri.parse(s.uri);
            if ("folder".equals(s.kind)) openTree(u); else openPickedUri(u);
        } catch (Exception e) { Toast.makeText(this, "항목을 다시 열 수 없습니다.", Toast.LENGTH_LONG).show(); }
    }

    void pickFile() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png","image/jpeg","image/webp","application/zip","application/x-cbz","application/octet-stream"});
        startActivityForResult(i, REQ_FILE);
    }

    void pickFolder() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(i, REQ_FOLDER);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        Uri u = data.getData();
        try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {}
        if (req == REQ_FOLDER) openTree(u); else openPickedUri(u);
    }

    void openTree(Uri tree) {
        DocumentFile root = DocumentFile.fromTreeUri(this, tree);
        if (root == null) { Toast.makeText(this, "폴더를 열 수 없습니다.", Toast.LENGTH_LONG).show(); return; }
        browserStack.clear(); browserStack.add(root);
        pushSaved("recent", new SavedItem("folder", safe(root.getName()), tree.toString()), 24);
        showBrowser(root);
    }

    void showBrowser(DocumentFile dir) {
        readerMode = false; setImmersive(false); browserDir = dir;
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(0xff101113);
        LinearLayout head = new LinearLayout(this); head.setGravity(Gravity.CENTER_VERTICAL); head.setPadding(dp(8), dp(8), dp(8), dp(8));
        head.setBackgroundColor(0xff17191d);
        Button back = homeSmallButton(browserStack.size() > 1 ? "‹ 상위" : "‹ 홈");
        TextView path = text(safe(dir.getName()), 16, Color.WHITE, true); path.setSingleLine(true); path.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE); path.setPadding(dp(12),0,0,0);
        head.addView(back, new LinearLayout.LayoutParams(-2, dp(46))); head.addView(path, new LinearLayout.LayoutParams(0, dp(46), 1));
        root.addView(head, new LinearLayout.LayoutParams(-1, dp(62)));
        back.setOnClickListener(v -> browserBack());

        ListView list = new ListView(this); list.setDividerHeight(0); list.setBackgroundColor(0xff101113);
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);

        LOADER.execute(() -> {
            ArrayList<DocumentFile> items = new ArrayList<>();
            try {
                for (DocumentFile f : dir.listFiles()) {
                    if (f.isDirectory()) items.add(f);
                    else if (f.isFile() && (IMG_EXT.contains(ext(safe(f.getName()))) || ARC_EXT.contains(ext(safe(f.getName()))))) items.add(f);
                }
            } catch (Exception ignored) {}
            items.sort((a,b) -> {
                if (a.isDirectory() != b.isDirectory()) return a.isDirectory() ? -1 : 1;
                return naturalCompare(safe(a.getName()), safe(b.getName()));
            });
            runOnUiThread(() -> {
                ArrayList<String> names = new ArrayList<>();
                for (DocumentFile f : items) names.add((f.isDirectory() ? "▣  " : ARC_EXT.contains(ext(safe(f.getName()))) ? "▤  " : "▥  ") + safe(f.getName()));
                ArrayAdapter<String> ad = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, names) {
                    @Override public View getView(int pos, View cv, ViewGroup parent) {
                        TextView t = (TextView)super.getView(pos, cv, parent); t.setTextColor(0xffe5e7eb); t.setTextSize(15); t.setPadding(dp(18), dp(4), dp(18), dp(4)); t.setMinHeight(dp(54)); return t;
                    }
                };
                list.setAdapter(ad);
                list.setOnItemClickListener((p,v,pos,id) -> {
                    DocumentFile f = items.get(pos);
                    if (f.isDirectory()) { browserStack.add(f); showBrowser(f); }
                    else if (ARC_EXT.contains(ext(safe(f.getName())))) openArchiveUri(f.getUri(), safe(f.getName()));
                    else openImageFromDirectory(dir, f);
                });
                list.setOnItemLongClickListener((p,v,pos,id) -> { toggleSavedFavorite(new SavedItem(items.get(pos).isDirectory()?"folder":"file", safe(items.get(pos).getName()), items.get(pos).getUri().toString())); return true; });
            });
        });
    }

    void browserBack() {
        if (browserStack.size() <= 1) { showHome(); return; }
        browserStack.remove(browserStack.size()-1); showBrowser(browserStack.get(browserStack.size()-1));
    }

    void openPickedUri(Uri u) {
        String n = queryName(u), e = ext(n);
        if (ARC_EXT.contains(e)) openArchiveUri(u, n);
        else if (IMG_EXT.contains(e)) openSingleImage(u, n);
        else Toast.makeText(this, "지원 형식: PNG/JPG/WEBP/BMP/ZIP/CBZ", Toast.LENGTH_LONG).show();
    }

    void openImageFromDirectory(DocumentFile dir, DocumentFile chosen) {
        ArrayList<Episode> list = new ArrayList<>();
        try {
            for (DocumentFile f : dir.listFiles()) if (f.isFile() && IMG_EXT.contains(ext(safe(f.getName())))) list.add(Episode.uri(safe(f.getName()), f.getUri()));
        } catch (Exception ignored) {}
        list.sort((a,b) -> naturalCompare(a.name,b.name));
        int idx = 0; for (int i=0;i<list.size();i++) if (list.get(i).uri.equals(chosen.getUri())) { idx=i; break; }
        resetAll(); episodes.addAll(list); sourceUri = dir.getUri(); sourceName = safe(dir.getName()); sourceKey = "folder:" + dir.getUri();
        enterImageReader(); go(idx);
    }

    void openSingleImage(Uri u, String name) {
        resetAll(); sourceUri = u; sourceName = name; sourceKey = "file:" + u; episodes.add(Episode.uri(name,u));
        pushSaved("recent", new SavedItem("file", name, u.toString()), 24);
        enterImageReader(); go(0);
    }

    void enterImageReader() {
        readerMode = true;
        imageReader = new TileImageView(this);
        imageReader.listener = readerEvents;
        activeReader = imageReader;
        buildReaderUi(imageReader);
    }

    void openArchiveUri(Uri u, String display) {
        resetAll(); sourceUri = u; sourceName = display; sourceKey = "archive:" + u;
        pushSaved("recent", new SavedItem("file", display, u.toString()), 24);
        ProgressDialog pd = ProgressDialog.show(this, null, "ZIP/CBZ 목록을 준비하는 중…", true, false);
        LOADER.execute(() -> {
            try {
                ArchiveSession s = new ArchiveSession(this, u);
                ArrayList<ArchivePart> parts = new ArrayList<>();
                Enumeration<ZipArchiveEntry> en = s.zip.getEntries();
                while (en.hasMoreElements()) {
                    ZipArchiveEntry z = en.nextElement();
                    if (z.isDirectory() || !IMG_EXT.contains(ext(z.getName()))) continue;
                    int[] wh = s.bounds(z);
                    if (wh[0] > 0 && wh[1] > 0) parts.add(new ArchivePart(z.getName(), z, wh[0], wh[1]));
                }
                parts.sort((a,b) -> naturalCompare(a.name,b.name));
                runOnUiThread(() -> {
                    pd.dismiss();
                    if (parts.isEmpty()) { try{s.close();}catch(Exception ignored){} Toast.makeText(this, "압축파일 안에 이미지가 없습니다.", Toast.LENGTH_LONG).show(); showHome(); return; }
                    archive = s; readerMode = true;
                    File cacheDir = new File(getCacheDir(), "archive_reader_" + shortHash(sourceKey));
                    archiveReader = new ArchiveReaderView(this, s, parts, cacheDir, archiveGap);
                    archiveReader.listener = readerEvents;
                    activeReader = archiveReader;
                    buildReaderUi(archiveReader);
                    float saved = prefs.getFloat(srcHash()+"_archive_pos", 0f);
                    archiveReader.setProgress(saved);
                    readerTitle.setText(display);
                    updateReaderStatus(saved);
                });
            } catch (Exception ex) {
                runOnUiThread(() -> { pd.dismiss(); showError("압축파일을 열 수 없습니다.", ex); showHome(); });
            }
        });
    }

    ReaderEvents readerEvents = new ReaderEvents() {
        @Override public void onSingleTap() { toggleChrome(); }
        @Override public void onProgress(float p) {
            if (archiveReader != null && activeReader == archiveReader) prefs.edit().putFloat(srcHash()+"_archive_pos", p).apply();
            else savePosition(p);
            if (!progressInternal && progressSeek != null) { progressInternal = true; progressSeek.setProgress(Math.round(p*1000)); progressInternal = false; }
            updateReaderStatus(p);
            if (p >= .95f) markRead(true);
        }
        @Override public void onEndPull() {
            if (archiveReader != null && activeReader == archiveReader) return;
            if (autoNext && current + 1 < episodes.size()) go(current + 1);
        }
        @Override public void onFirstTile() { if (stage != null) { View l = stage.findViewWithTag("loading"); if (l != null) l.setVisibility(View.GONE); } }
    };

    void buildReaderUi(View readerView) {
        chromeVisible = true; setImmersive(false);
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(readerBg());
        stage = root;
        root.addView(readerView, new FrameLayout.LayoutParams(-1,-1));
        ProgressBar loading = new ProgressBar(this); loading.setTag("loading");
        FrameLayout.LayoutParams lpLoad = new FrameLayout.LayoutParams(dp(46),dp(46),Gravity.CENTER); root.addView(loading, lpLoad);

        HorizontalScrollView topScroll = new HorizontalScrollView(this); topScroll.setHorizontalScrollBarEnabled(false); topScroll.setBackgroundColor(0xee17191d);
        topBar = new LinearLayout(this); topBar.setGravity(Gravity.CENTER_VERTICAL); topBar.setPadding(dp(4),dp(3),dp(4),dp(3));
        topScroll.addView(topBar, new ViewGroup.LayoutParams(-2,dp(54)));
        addReaderBtn(topBar,"‹",v -> returnFromReader());
        addReaderBtn(topBar,"목록",v -> showEpisodeList());
        addReaderBtn(topBar,"◀",v -> go(current-1));
        addReaderBtn(topBar,"▶",v -> go(current+1));
        readerTitle = text(sourceName, 14, Color.WHITE, true); readerTitle.setSingleLine(true); readerTitle.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE); readerTitle.setPadding(dp(10),0,dp(12),0);
        topBar.addView(readerTitle, new LinearLayout.LayoutParams(dp(300),dp(48)));
        FrameLayout.LayoutParams lpTop = new FrameLayout.LayoutParams(-1,dp(54),Gravity.TOP); root.addView(topScroll,lpTop); topWrap=topScroll;

        LinearLayout bottom = new LinearLayout(this); bottom.setOrientation(LinearLayout.VERTICAL); bottom.setBackgroundColor(0xee17191d);
        progressSeek = new SeekBar(this); progressSeek.setMax(1000); progressSeek.setPadding(dp(8),0,dp(8),0); bottom.addView(progressSeek,new LinearLayout.LayoutParams(-1,dp(28)));
        progressSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar s,int p,boolean from){ if(from && !progressInternal && activeReader!=null) activeReader.setProgress(p/1000f); }
            public void onStartTrackingTouch(SeekBar s){} public void onStopTrackingTouch(SeekBar s){}
        });
        HorizontalScrollView botScroll = new HorizontalScrollView(this); botScroll.setHorizontalScrollBarEnabled(false);
        bottomButtons = new LinearLayout(this); bottomButtons.setGravity(Gravity.CENTER_VERTICAL); bottomButtons.setPadding(dp(4),0,dp(4),0);
        botScroll.addView(bottomButtons,new ViewGroup.LayoutParams(-2,dp(50)));
        favBtn = addReaderBtn(bottomButtons,"☆",v -> toggleCurrentFavorite());
        addReaderBtn(bottomButtons,"너비",v -> activeReader.fitWidth());
        addReaderBtn(bottomButtons,"100%",v -> activeReader.set100());
        autoBtn = addReaderBtn(bottomButtons,"자동",v -> toggleAutoScroll());
        addReaderBtn(bottomButtons,"밝기",v -> showBrightness());
        addReaderBtn(bottomButtons,"배경",v -> cycleBackground());
        addReaderBtn(bottomButtons,"더보기",v -> showMore());
        readerStatus = text("",12,0xffc9ced6,false); readerStatus.setPadding(dp(12),0,dp(18),0); bottomButtons.addView(readerStatus,new LinearLayout.LayoutParams(dp(330),dp(46)));
        bottom.addView(botScroll,new LinearLayout.LayoutParams(-1,dp(50)));
        FrameLayout.LayoutParams lpBot = new FrameLayout.LayoutParams(-1,dp(78),Gravity.BOTTOM); root.addView(bottom,lpBot); bottomWrap=bottom;
        setContentView(root); applyBackground(); refreshFavoriteButton();
    }

    void returnFromReader() {
        if (!browserStack.isEmpty()) showBrowser(browserStack.get(browserStack.size()-1)); else showHome();
    }

    Button addReaderBtn(LinearLayout row,String t,View.OnClickListener l) {
        Button b = new Button(this); b.setText(t); b.setAllCaps(false); b.setTextSize(13); b.setTextColor(Color.WHITE); b.setPadding(dp(10),0,dp(10),0); b.setMinWidth(dp(48));
        b.setBackground(round(0xff292d34,9)); b.setOnClickListener(l); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,dp(44)); p.setMargins(dp(2),dp(2),dp(2),dp(2)); row.addView(b,p); return b;
    }

    void go(int idx) {
        if (archiveReader != null && activeReader == archiveReader) return;
        if (idx < 0 || idx >= episodes.size()) return;
        current = idx; Episode ep = episodes.get(idx);
        prefs.edit().putInt(srcHash()+"_index",idx).apply();
        if (readerTitle != null) readerTitle.setText((idx+1)+"/"+episodes.size()+"  "+ep.name);
        refreshFavoriteButton();
        View l = stage==null?null:stage.findViewWithTag("loading"); if(l!=null)l.setVisibility(View.VISIBLE);
        imageReader.setDocument(null,null,0f); closeCurrentDoc();
        final int token = idx;
        LOADER.execute(() -> {
            try {
                ImageDocument d = ImageDocument.fromUri(this, ep.uri);
                float saved = prefs.getFloat(epHash(ep)+"_pos",0f);
                runOnUiThread(() -> {
                    if (current != token || imageReader == null) { d.close(); return; }
                    currentDoc = d; imageReader.setDocument(d,epHash(ep),saved); updateReaderStatus(saved);
                    pushSaved("recent", new SavedItem("file", ep.name, ep.uri.toString()), 24);
                });
            } catch (Exception ex) { runOnUiThread(() -> { if(l!=null)l.setVisibility(View.GONE); showError("이미지를 열 수 없습니다: "+ep.name,ex); }); }
        });
    }

    void showEpisodeList() {
        if (archiveReader != null && activeReader == archiveReader) { archiveReader.showPartList(); return; }
        if (episodes.isEmpty()) return;
        String[] rows = new String[episodes.size()];
        for (int i=0;i<rows.length;i++) { Episode e=episodes.get(i); rows[i]=(prefs.getBoolean(epHash(e)+"_read",false)?"✓ ":"")+(isSavedFavorite(e.uri.toString())?"★ ":"")+(i+1)+". "+e.name; }
        AlertDialog d = new AlertDialog.Builder(this).setTitle("회차 목록").setItems(rows,(x,w)->go(w)).setNegativeButton("닫기",null).create();
        d.setOnShowListener(x -> { ListView lv=d.getListView(); if(lv!=null)lv.setSelection(Math.max(0,current-2)); }); d.show();
    }

    void toggleAutoScroll() {
        autoScrolling = !autoScrolling; if (autoBtn != null) autoBtn.setText(autoScrolling ? "정지" : "자동");
        autoHandler.removeCallbacks(autoTick); if (autoScrolling) autoHandler.post(autoTick);
    }
    void stopAutoScroll(){ autoScrolling=false; autoHandler.removeCallbacks(autoTick); if(autoBtn!=null)autoBtn.setText("자동"); }

    void showBrightness() {
        SeekBar sb=new SeekBar(this); sb.setMax(101); sb.setProgress(brightness<0?0:Math.max(1,Math.min(101,Math.round(brightness*100)+1))); sb.setPadding(dp(22),dp(12),dp(22),dp(12));
        AlertDialog d=new AlertDialog.Builder(this).setTitle("화면 밝기").setMessage("맨 왼쪽은 시스템 밝기를 사용합니다.").setView(sb).setPositiveButton("적용",null).setNegativeButton("취소",null).create();
        d.setOnShowListener(x -> d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {int p=sb.getProgress();brightness=p==0?-1f:(p-1)/100f;prefs.edit().putFloat("brightness",brightness).apply();applyWindowSettings();d.dismiss();})); d.show();
    }

    void showMore() {
        String[] items = new String[]{"읽음 / 안읽음 전환","화면 회전 방식","ZIP/CBZ 이미지 간격","자동 스크롤 속도","캐시 정리","뷰어 설정","광고/개인정보 안내"};
        new AlertDialog.Builder(this).setTitle("더보기").setItems(items,(d,w)->{
            switch(w){
                case 0: toggleRead(); break;
                case 1: chooseRotation(); break;
                case 2: chooseArchiveGap(); break;
                case 3: chooseAutoSpeed(); break;
                case 4: clearAllCaches(); break;
                case 5: showSettings(); break;
                case 6: new AlertDialog.Builder(this).setTitle("광고 없는 로컬 뷰어").setMessage("이 앱에는 광고 SDK, 추적/분석 SDK, 결제, 포인트 기능이 없습니다. 인터넷 권한도 요청하지 않습니다. 파일은 사용자가 선택한 기기 저장소에서만 읽습니다.").setPositiveButton("확인",null).show(); break;
            }
        }).show();
    }

    void chooseRotation() {
        String[] a={"자동","세로 고정","가로 고정"};
        new AlertDialog.Builder(this).setTitle("화면 회전").setSingleChoiceItems(a,rotationMode,(d,w)->{rotationMode=w;prefs.edit().putInt("rotation",w).apply();applyWindowSettings();d.dismiss();}).show();
    }
    void chooseArchiveGap() {
        String[] a={"0px (웹툰 권장)","2px","8px"}; int cur=archiveGap==0?0:archiveGap<=2?1:2;
        new AlertDialog.Builder(this).setTitle("ZIP/CBZ 이미지 간격").setSingleChoiceItems(a,cur,(d,w)->{archiveGap=w==0?0:w==1?2:8;prefs.edit().putInt("archive_gap",archiveGap).apply();if(archiveReader!=null){archiveReader.setGap(archiveGap);}d.dismiss();}).show();
    }
    void chooseAutoSpeed() {
        SeekBar s=new SeekBar(this);s.setMax(12);s.setProgress(Math.max(1,autoSpeed));s.setPadding(dp(20),dp(12),dp(20),dp(12));
        new AlertDialog.Builder(this).setTitle("자동 스크롤 속도").setView(s).setPositiveButton("저장",(d,w)->{autoSpeed=Math.max(1,s.getProgress());prefs.edit().putInt("auto_speed",autoSpeed).apply();}).setNegativeButton("취소",null).show();
    }

    void showSettings() {
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),dp(8),dp(20),0);
        CheckBox a=new CheckBox(this);a.setText("이미지 폴더에서 끝까지 읽으면 다음 화로 이동");a.setChecked(autoNext);box.addView(a);
        CheckBox k=new CheckBox(this);k.setText("읽는 동안 화면 켜짐 유지");k.setChecked(keepScreen);box.addView(k);
        TextView note=text("대용량 PNG는 전체 이미지를 메모리에 올리지 않고 화면 주변만 타일로 읽습니다. ZIP/CBZ도 화면 근처 이미지만 임시 캐시에 풀어 사용합니다.",13,0xff666666,false);note.setPadding(0,dp(10),0,dp(8));box.addView(note);
        new AlertDialog.Builder(this).setTitle("뷰어 설정").setView(box).setPositiveButton("저장",(d,w)->{autoNext=a.isChecked();keepScreen=k.isChecked();prefs.edit().putBoolean("auto_next",autoNext).putBoolean("keep_screen",keepScreen).apply();applyWindowSettings();}).setNegativeButton("취소",null).show();
    }

    void toggleRead() {
        if (archiveReader != null && activeReader == archiveReader) {
            String k=srcHash()+"_archive_read";prefs.edit().putBoolean(k,!prefs.getBoolean(k,false)).apply();
        } else if(current>=0){Episode e=episodes.get(current);String k=epHash(e)+"_read";prefs.edit().putBoolean(k,!prefs.getBoolean(k,false)).apply();}
        Toast.makeText(this,"읽음 상태를 변경했습니다.",Toast.LENGTH_SHORT).show();
    }

    void markRead(boolean v) {
        if (archiveReader != null && activeReader == archiveReader) prefs.edit().putBoolean(srcHash()+"_archive_read",v).apply();
        else if(current>=0)prefs.edit().putBoolean(epHash(episodes.get(current))+"_read",v).apply();
    }

    void savePosition(float p){ if(current>=0 && current<episodes.size())prefs.edit().putFloat(epHash(episodes.get(current))+"_pos",p).apply(); }

    void updateReaderStatus(float p) {
        if (readerStatus == null) return;
        String info = activeReader==null?"":activeReader.infoText();
        readerStatus.setText(String.format(Locale.KOREA,"%.1f%%  ·  %s",p*100f,info));
    }

    void toggleCurrentFavorite() {
        SavedItem s;
        if (archiveReader != null && activeReader == archiveReader) s=new SavedItem("file",sourceName,sourceUri.toString());
        else if(current>=0){Episode e=episodes.get(current);s=new SavedItem("file",e.name,e.uri.toString());} else return;
        toggleSavedFavorite(s); refreshFavoriteButton();
    }

    void toggleSavedFavorite(SavedItem s) {
        ArrayList<SavedItem> list=loadSaved("favorites"); int hit=-1;for(int i=0;i<list.size();i++)if(list.get(i).uri.equals(s.uri)){hit=i;break;}
        if(hit>=0){list.remove(hit);Toast.makeText(this,"즐겨찾기에서 제거했습니다.",Toast.LENGTH_SHORT).show();}
        else{list.add(0,s);Toast.makeText(this,"즐겨찾기에 추가했습니다.",Toast.LENGTH_SHORT).show();}
        saveSaved("favorites",list,100);
    }
    boolean isSavedFavorite(String uri){for(SavedItem s:loadSaved("favorites"))if(s.uri.equals(uri))return true;return false;}
    void refreshFavoriteButton(){if(favBtn==null)return;String u=null;if(archiveReader!=null&&activeReader==archiveReader&&sourceUri!=null)u=sourceUri.toString();else if(current>=0&&current<episodes.size())u=episodes.get(current).uri.toString();favBtn.setText(u!=null&&isSavedFavorite(u)?"★":"☆");}

    void cycleBackground(){backgroundMode=(backgroundMode+1)%4;prefs.edit().putInt("bg",backgroundMode).apply();applyBackground();}
    int readerBg(){switch(backgroundMode){case 1:return 0xff202124;case 2:return 0xff73777d;case 3:return Color.WHITE;default:return Color.BLACK;}}
    void applyBackground(){int c=readerBg();if(stage!=null)stage.setBackgroundColor(c);if(activeReader!=null)activeReader.setReaderBackground(c);}

    void toggleChrome(){if(!readerMode)return;chromeVisible=!chromeVisible;if(topWrap!=null)topWrap.setVisibility(chromeVisible?View.VISIBLE:View.GONE);if(bottomWrap!=null)bottomWrap.setVisibility(chromeVisible?View.VISIBLE:View.GONE);setImmersive(!chromeVisible);}
    void setImmersive(boolean on){if(on)getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);}

    void applyWindowSettings(){
        if(keepScreen)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowManager.LayoutParams p=getWindow().getAttributes();p.screenBrightness=brightness;getWindow().setAttributes(p);
        if(rotationMode==1)setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);else if(rotationMode==2)setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);else setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    void clearAllCaches(){
        File[] fs=getCacheDir().listFiles();if(fs!=null)for(File f:fs)if(f.getName().startsWith("archive_reader_")||f.getName().equals("webtoon_entry"))deleteRec(f);
        Toast.makeText(this,"임시 이미지 캐시를 정리했습니다.",Toast.LENGTH_SHORT).show();
    }

    void leaveReader(){
        if(activeReader!=null){activeReader.release();activeReader=null;} imageReader=null;archiveReader=null;closeCurrentDoc();
        if(archive!=null){try{archive.close();}catch(Exception ignored){}archive=null;}
    }
    void resetAll(){stopAutoScroll();leaveReader();episodes.clear();current=-1;sourceUri=null;sourceName="";sourceKey="";}
    void closeCurrentDoc(){if(currentDoc!=null){currentDoc.close();currentDoc=null;}}

    void pushSaved(String key,SavedItem s,int max){ArrayList<SavedItem> l=loadSaved(key);l.removeIf(x->x.uri.equals(s.uri));l.add(0,s);saveSaved(key,l,max);}
    ArrayList<SavedItem> loadSaved(String key){ArrayList<SavedItem> out=new ArrayList<>();String raw=prefs.getString(key,"");if(raw.isEmpty())return out;for(String line:raw.split("\\n")){SavedItem s=SavedItem.parse(line);if(s!=null)out.add(s);}return out;}
    void saveSaved(String key,ArrayList<SavedItem> l,int max){StringBuilder b=new StringBuilder();for(int i=0;i<Math.min(max,l.size());i++){if(i>0)b.append('\n');b.append(l.get(i).encode());}prefs.edit().putString(key,b.toString()).apply();}

    static class SavedItem {
        String kind,name,uri; SavedItem(String k,String n,String u){kind=k;name=n;uri=u;}
        String encode(){return Uri.encode(kind)+"\t"+Uri.encode(name)+"\t"+Uri.encode(uri);}
        static SavedItem parse(String s){String[] p=s.split("\\t",-1);if(p.length!=3)return null;return new SavedItem(Uri.decode(p[0]),Uri.decode(p[1]),Uri.decode(p[2]));}
    }

    TextView text(String s,int sp,int color,boolean bold){TextView t=new TextView(this);t.setText(s);t.setTextSize(sp);t.setTextColor(color);if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return t;}
    Button homeButton(String s,int color){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setTextSize(15);b.setBackground(round(color,12));return b;}
    Button homeSmallButton(String s){Button b=homeButton(s,0xff252930);b.setTextSize(13);return b;}
    GradientDrawable round(int color,int r){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(r));return g;}
    LinearLayout.LayoutParams lp(int w,int h,int l,int t,int r,int b){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(w,h);p.setMargins(dp(l),dp(t),dp(r),dp(b));return p;}

    String queryName(Uri u){try(Cursor c=getContentResolver().query(u,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return safe(c.getString(0));}catch(Exception ignored){}String p=u.getLastPathSegment();return p==null?"file":p;}
    static String safe(String s){return s==null?"":s;}
    static String ext(String n){int i=n.lastIndexOf('.');return i<0?"":n.substring(i).toLowerCase(Locale.ROOT);}
    String srcHash(){return shortHash(sourceKey);}
    String epHash(Episode e){return shortHash(sourceKey+"|"+e.id);}
    static String shortHash(String s){try{byte[] d=MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(int i=0;i<8;i++)b.append(String.format(Locale.ROOT,"%02x",d[i]));return b.toString();}catch(Exception e){return Integer.toHexString(s.hashCode());}}
    static int naturalCompare(String a,String b){Matcher ma=NAT.matcher(a.toLowerCase(Locale.ROOT)),mb=NAT.matcher(b.toLowerCase(Locale.ROOT));while(ma.find()&&mb.find()){String x=ma.group(),y=mb.group();int c;if(Character.isDigit(x.charAt(0))&&Character.isDigit(y.charAt(0))){x=x.replaceFirst("^0+(?!$)","");y=y.replaceFirst("^0+(?!$)","");c=Integer.compare(x.length(),y.length());if(c==0)c=x.compareTo(y);}else c=x.compareTo(y);if(c!=0)return c;}return a.compareToIgnoreCase(b);}
    int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
    void showError(String msg,Exception e){new AlertDialog.Builder(this).setTitle("오류").setMessage(msg+"\n\n"+e.getClass().getSimpleName()+": "+e.getMessage()).setPositiveButton("확인",null).show();}
    static void deleteRec(File f){if(f==null||!f.exists())return;if(f.isDirectory()){File[] a=f.listFiles();if(a!=null)for(File x:a)deleteRec(x);}f.delete();}

    @Override public void onBackPressed(){if(readerMode){returnFromReader();return;}if(!browserStack.isEmpty()){browserBack();return;}super.onBackPressed();}
    @Override protected void onDestroy(){stopAutoScroll();resetAll();LOADER.shutdownNow();super.onDestroy();}

    static class Episode {String name,id;Uri uri;static Episode uri(String n,Uri u){Episode e=new Episode();e.name=n;e.id=u.toString();e.uri=u;return e;}}
    static class ArchivePart {String name;ZipArchiveEntry entry;int width,height;ArchivePart(String n,ZipArchiveEntry e,int w,int h){name=n;entry=e;width=w;height=h;}}

    static class ArchiveSession implements Closeable {
        ParcelFileDescriptor pfd;FileInputStream fis;SeekableByteChannel channel;ZipFile zip;
        ArchiveSession(Context c,Uri u)throws Exception{pfd=c.getContentResolver().openFileDescriptor(u,"r");if(pfd==null)throw new IOException("파일 핸들을 열 수 없음");fis=new FileInputStream(pfd.getFileDescriptor());channel=fis.getChannel();zip=ZipFile.builder().setSeekableByteChannel(channel).setCharset(Charset.forName("MS949")).get();}
        synchronized int[] bounds(ZipArchiveEntry e)throws IOException{BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;try(InputStream in=zip.getInputStream(e)){BitmapFactory.decodeStream(in,null,o);}return new int[]{o.outWidth,o.outHeight};}
        synchronized void extract(ZipArchiveEntry e,File out)throws IOException{try(InputStream in=zip.getInputStream(e);OutputStream o=new BufferedOutputStream(new FileOutputStream(out),1024*1024)){byte[] b=new byte[1024*1024];int n;while((n=in.read(b))>0)o.write(b,0,n);}}
        public void close()throws IOException{try{if(zip!=null)zip.close();}finally{try{if(fis!=null)fis.close();}finally{if(pfd!=null)pfd.close();}}}
    }

    static class ImageDocument implements Closeable {
        ParcelFileDescriptor pfd;BitmapRegionDecoder decoder;int width,height;
        static ImageDocument fromUri(Context c,Uri u)throws IOException{ImageDocument d=new ImageDocument();d.pfd=c.getContentResolver().openFileDescriptor(u,"r");if(d.pfd==null)throw new IOException("이미지 파일 핸들 실패");d.decoder=BitmapRegionDecoder.newInstance(d.pfd.getFileDescriptor(),false);if(d.decoder==null)throw new IOException("지원하지 않는 이미지");d.width=d.decoder.getWidth();d.height=d.decoder.getHeight();return d;}
        static ImageDocument fromFile(File f)throws IOException{ImageDocument d=new ImageDocument();d.decoder=BitmapRegionDecoder.newInstance(f.getAbsolutePath(),false);if(d.decoder==null)throw new IOException("이미지 디코더 생성 실패");d.width=d.decoder.getWidth();d.height=d.decoder.getHeight();return d;}
        synchronized Bitmap region(Rect r,int sample){if(decoder==null)return null;Rect q=new Rect(Math.max(0,r.left),Math.max(0,r.top),Math.min(width,r.right),Math.min(height,r.bottom));if(q.width()<=0||q.height()<=0)return null;BitmapFactory.Options o=new BitmapFactory.Options();o.inSampleSize=Math.max(1,sample);o.inPreferredConfig=Bitmap.Config.ARGB_8888;try{return decoder.decodeRegion(q,o);}catch(Throwable t){return null;}}
        public synchronized void close(){if(decoder!=null){decoder.recycle();decoder=null;}if(pfd!=null)try{pfd.close();}catch(Exception ignored){}pfd=null;}
    }

    public static class TileImageView extends View implements ReaderSurface {
        ReaderEvents listener;ImageDocument doc;int generation;float scale=1f,scrollX,scrollY,pendingSaved;boolean fitMode=true;int bg=Color.BLACK;Paint paint=new Paint(Paint.FILTER_BITMAP_FLAG|Paint.DITHER_FLAG);ExecutorService decode=Executors.newSingleThreadExecutor();HashSet<String> pending=new HashSet<>();LruCache<String,Bitmap> cache;Bitmap preview;GestureDetector gesture;ScaleGestureDetector pinch;OverScroller fling;boolean firstTileSent;
        TileImageView(Context c){super(c);setFocusable(true);ActivityManager am=(ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE);int mb=am==null?256:am.getMemoryClass();int cap=Math.max(48,Math.min(160,mb/3))*1024*1024;cache=new LruCache<String,Bitmap>(cap){protected int sizeOf(String k,Bitmap b){return b.getAllocationByteCount();}protected void entryRemoved(boolean e,String k,Bitmap o,Bitmap n){if(o!=n&&!o.isRecycled())o.recycle();}};fling=new OverScroller(c);gesture=new GestureDetector(c,new GestureDetector.SimpleOnGestureListener(){public boolean onDown(MotionEvent e){fling.forceFinished(true);return true;}public boolean onScroll(MotionEvent e1,MotionEvent e2,float dx,float dy){float before=scrollY;scrollX+=dx;scrollY+=dy;clamp();if(before>=maxScrollY()-2&&dy>35&&listener!=null)listener.onEndPull();invalidate();report();return true;}public boolean onFling(MotionEvent e1,MotionEvent e2,float vx,float vy){fling.fling((int)scrollX,(int)scrollY,(int)-vx,(int)-vy,0,(int)maxScrollX(),0,(int)maxScrollY());postInvalidateOnAnimation();return true;}public boolean onSingleTapConfirmed(MotionEvent e){if(listener!=null)listener.onSingleTap();return true;}public boolean onDoubleTap(MotionEvent e){if(fitMode)setScaleAround(1f,e.getX(),e.getY());else fitWidth();return true;}});pinch=new ScaleGestureDetector(c,new ScaleGestureDetector.SimpleOnScaleGestureListener(){public boolean onScale(ScaleGestureDetector d){setScaleAround(scale*d.getScaleFactor(),d.getFocusX(),d.getFocusY());return true;}});}
        void setDocument(ImageDocument d,String key,float saved){generation++;doc=d;pendingSaved=Math.max(0,Math.min(1,saved));firstTileSent=false;synchronized(pending){pending.clear();}cache.evictAll();if(preview!=null&&!preview.isRecycled())preview.recycle();preview=null;scrollX=scrollY=0;fitMode=true;if(d!=null)post(()->{fitWidthInternal(pendingSaved);buildPreview(generation);});else invalidate();}
        public void setReaderBackground(int c){bg=c;invalidate();}public void fitWidth(){fitWidthInternal(getProgress());}void fitWidthInternal(float keep){if(doc==null||getWidth()==0)return;fitMode=true;scale=(float)getWidth()/doc.width;scale=Math.max(.02f,Math.min(4f,scale));scrollX=0;scrollY=keep*maxScrollY();clamp();invalidate();report();}public void set100(){if(doc!=null)setScaleAround(1f,getWidth()/2f,getHeight()/2f);}void setScaleAround(float ns,float fx,float fy){if(doc==null)return;ns=Math.max(.05f,Math.min(6f,ns));float old=scale;float imageX=(fx-originX())/old;float imageY=(scrollY+fy)/old;scale=ns;fitMode=false;if(doc.width*scale>getWidth())scrollX=imageX*scale-fx;else scrollX=0;scrollY=imageY*scale-fy;clamp();invalidate();report();}
        float originX(){float cw=doc==null?0:doc.width*scale;return cw<=getWidth()?(getWidth()-cw)/2f:-scrollX;}float maxScrollX(){return doc==null?0:Math.max(0,doc.width*scale-getWidth());}float maxScrollY(){return doc==null?0:Math.max(0,doc.height*scale-getHeight());}void clamp(){scrollX=Math.max(0,Math.min(maxScrollX(),scrollX));scrollY=Math.max(0,Math.min(maxScrollY(),scrollY));}public float getProgress(){float m=maxScrollY();return m<=0?1f:Math.max(0,Math.min(1,scrollY/m));}public void setProgress(float p){scrollY=Math.max(0,Math.min(1,p))*maxScrollY();clamp();invalidate();report();}void report(){if(listener!=null)listener.onProgress(getProgress());}public void scrollByPx(float dy){scrollY+=dy;clamp();invalidate();report();}
        protected void onSizeChanged(int w,int h,int ow,int oh){if(doc!=null&&fitMode)post(()->fitWidthInternal(getProgress()));}public boolean onTouchEvent(MotionEvent e){boolean a=pinch.onTouchEvent(e),b=gesture.onTouchEvent(e);return a||b||super.onTouchEvent(e);}public void computeScroll(){if(fling.computeScrollOffset()){scrollX=fling.getCurrX();scrollY=fling.getCurrY();clamp();invalidate();report();postInvalidateOnAnimation();}}
        int sampleForScale(){int s=1;while(s<64&&s*2*scale<=1.05f)s*=2;return s;}protected void onDraw(Canvas c){super.onDraw(c);c.drawColor(bg);if(doc==null)return;if(preview!=null&&!preview.isRecycled()){RectF dst=new RectF(originX(),-scrollY,originX()+doc.width*scale,-scrollY+doc.height*scale);c.drawBitmap(preview,null,dst,paint);}int sample=sampleForScale(),tileSrc=Math.max(1024,sample*1536);int first=Math.max(0,(int)Math.floor((scrollY/scale)/tileSrc)-2),last=Math.min((doc.height-1)/tileSrc,(int)Math.floor(((scrollY+getHeight())/scale)/tileSrc)+2);for(int i=first;i<=last;i++){String k=generation+":"+sample+":"+i;Bitmap b=cache.get(k);int sy=i*tileSrc,ey=Math.min(doc.height,sy+tileSrc);if(b!=null&&!b.isRecycled()){float x=originX(),y=sy*scale-scrollY;RectF dst=new RectF(x,y,x+doc.width*scale,y+(ey-sy)*scale);c.drawBitmap(b,null,dst,paint);if(!firstTileSent){firstTileSent=true;if(listener!=null)listener.onFirstTile();}}else requestTile(k,sample,i,tileSrc,generation);}}
        void requestTile(String key,int sample,int idx,int tileSrc,int gen){synchronized(pending){if(pending.contains(key))return;pending.add(key);}ImageDocument d=doc;if(d==null)return;decode.execute(()->{Bitmap b=d.region(new Rect(0,idx*tileSrc,d.width,Math.min(d.height,(idx+1)*tileSrc)),sample);post(()->{synchronized(pending){pending.remove(key);}if(gen!=generation){if(b!=null)b.recycle();return;}if(b!=null)cache.put(key,b);invalidate();});});}
        void buildPreview(int gen){ImageDocument d=doc;if(d==null)return;decode.execute(()->{int s=1;while(s<256&&(d.height/s>3600||d.width/s>1000))s*=2;Bitmap b=d.region(new Rect(0,0,d.width,d.height),s);post(()->{if(gen!=generation){if(b!=null)b.recycle();return;}preview=b;invalidate();});});}
        public String infoText(){return doc==null?"대기 중":doc.width+"×"+doc.height+" · 타일";}public void release(){generation++;decode.shutdownNow();cache.evictAll();if(preview!=null&&!preview.isRecycled())preview.recycle();preview=null;}
    }

    public class ArchiveReaderView extends View implements ReaderSurface {
        ArchiveSession session;ArrayList<ArchivePart> parts;File cacheDir;int gap,bg=Color.BLACK,generation;float zoom=1f,scrollX,scrollY,baseTotal;float[] tops,heights;Paint paint=new Paint(Paint.FILTER_BITMAP_FLAG|Paint.DITHER_FLAG);ExecutorService decode=Executors.newSingleThreadExecutor();LruCache<String,Bitmap> tiles;LinkedHashMap<Integer,PartDoc> docs=new LinkedHashMap<>(8,.75f,true);HashSet<Integer> pendingDocs=new HashSet<>();HashSet<String> pendingTiles=new HashSet<>();GestureDetector gesture;ScaleGestureDetector pinch;OverScroller fling;ReaderEvents listener;boolean firstTileSent;float pendingProgress=-1;
        ArchiveReaderView(Context c,ArchiveSession s,ArrayList<ArchivePart> p,File dir,int g){super(c);session=s;parts=p;cacheDir=dir;gap=g;if(cacheDir.exists())deleteRec(cacheDir);cacheDir.mkdirs();ActivityManager am=(ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE);int mb=am==null?256:am.getMemoryClass();int cap=Math.max(56,Math.min(180,mb/3))*1024*1024;tiles=new LruCache<String,Bitmap>(cap){protected int sizeOf(String k,Bitmap b){return b.getAllocationByteCount();}protected void entryRemoved(boolean e,String k,Bitmap o,Bitmap n){if(o!=n&&!o.isRecycled())o.recycle();}};fling=new OverScroller(c);gesture=new GestureDetector(c,new GestureDetector.SimpleOnGestureListener(){public boolean onDown(MotionEvent e){fling.forceFinished(true);return true;}public boolean onScroll(MotionEvent e1,MotionEvent e2,float dx,float dy){scrollX+=dx;scrollY+=dy;clamp();invalidate();report();return true;}public boolean onFling(MotionEvent e1,MotionEvent e2,float vx,float vy){fling.fling((int)scrollX,(int)scrollY,(int)-vx,(int)-vy,0,(int)maxScrollX(),0,(int)maxScrollY());postInvalidateOnAnimation();return true;}public boolean onSingleTapConfirmed(MotionEvent e){if(listener!=null)listener.onSingleTap();return true;}public boolean onDoubleTap(MotionEvent e){if(Math.abs(zoom-1f)<.05f)setZoomAround(1.7f,e.getX(),e.getY());else fitWidth();return true;}});pinch=new ScaleGestureDetector(c,new ScaleGestureDetector.SimpleOnScaleGestureListener(){public boolean onScale(ScaleGestureDetector d){setZoomAround(zoom*d.getScaleFactor(),d.getFocusX(),d.getFocusY());return true;}});}
        public void setGap(int g){gap=g;float p=getProgress();recalc();setProgress(p);}void recalc(){if(getWidth()<=0)return;tops=new float[parts.size()];heights=new float[parts.size()];float y=0;for(int i=0;i<parts.size();i++){ArchivePart p=parts.get(i);tops[i]=y;float h=p.width<=0?0:(float)p.height*getWidth()/p.width;heights[i]=h;y+=h;if(i+1<parts.size())y+=gap;}baseTotal=y;clamp();invalidate();}
        protected void onSizeChanged(int w,int h,int ow,int oh){float p=getProgress();recalc();if(pendingProgress>=0){float q=pendingProgress;pendingProgress=-1;post(()->setProgress(q));}else post(()->setProgress(p));}
        public void fitWidth(){float p=getProgress();zoom=1f;scrollX=0;setProgress(p);}public void set100(){if(parts.isEmpty()||getWidth()==0)return;int i=currentPart();ArchivePart p=parts.get(i);float base=(float)getWidth()/Math.max(1,p.width);setZoomAround(1f/base,getWidth()/2f,getHeight()/2f);}void setZoomAround(float z,float fx,float fy){z=Math.max(.6f,Math.min(5f,z));float ratio=contentHeight()<=0?0:(scrollY+fy)/contentHeight();zoom=z;scrollY=ratio*contentHeight()-fy;clamp();invalidate();report();}
        float contentHeight(){return baseTotal*zoom;}float maxScrollY(){return Math.max(0,contentHeight()-getHeight());}float maxScrollX(){return Math.max(0,getWidth()*zoom-getWidth());}float originX(){float w=getWidth()*zoom;return w<=getWidth()?(getWidth()-w)/2f:-scrollX;}void clamp(){scrollX=Math.max(0,Math.min(maxScrollX(),scrollX));scrollY=Math.max(0,Math.min(maxScrollY(),scrollY));}public float getProgress(){float m=maxScrollY();return m<=0?1f:Math.max(0,Math.min(1,scrollY/m));}public void setProgress(float p){if(baseTotal<=0){pendingProgress=p;return;}scrollY=Math.max(0,Math.min(1,p))*maxScrollY();clamp();invalidate();report();}public void scrollByPx(float dy){scrollY+=dy;clamp();invalidate();report();}void report(){if(listener!=null)listener.onProgress(getProgress());}
        public boolean onTouchEvent(MotionEvent e){boolean a=pinch.onTouchEvent(e),b=gesture.onTouchEvent(e);return a||b||super.onTouchEvent(e);}public void computeScroll(){if(fling.computeScrollOffset()){scrollX=fling.getCurrX();scrollY=fling.getCurrY();clamp();invalidate();report();postInvalidateOnAnimation();}}
        int currentPart(){if(parts.isEmpty()||tops==null)return 0;float y=(scrollY+getHeight()/2f)/zoom;for(int i=0;i<parts.size();i++)if(y<tops[i]+heights[i]+gap)return i;return parts.size()-1;}
        protected void onDraw(Canvas c){super.onDraw(c);c.drawColor(bg);if(parts.isEmpty()||tops==null)return;float viewTop=scrollY,viewBottom=scrollY+getHeight();int cp=currentPart();ensureDoc(cp);if(cp>0)ensureDoc(cp-1);if(cp+1<parts.size())ensureDoc(cp+1);for(int i=Math.max(0,cp-2);i<=Math.min(parts.size()-1,cp+2);i++){float top=tops[i]*zoom,bottom=(tops[i]+heights[i])*zoom;if(bottom<viewTop||top>viewBottom)continue;PartDoc pd=docs.get(i);if(pd==null){ensureDoc(i);continue;}float x=originX(),dstTop=top-scrollY,dstH=heights[i]*zoom;if(pd.preview!=null&&!pd.preview.isRecycled())c.drawBitmap(pd.preview,null,new RectF(x,dstTop,x+getWidth()*zoom,dstTop+dstH),paint);float partScale=(float)getWidth()/parts.get(i).width*zoom;int sample=sampleFor(partScale),tileSrc=Math.max(1024,sample*1536);float localTop=Math.max(0,viewTop-top),localBottom=Math.min(dstH,viewBottom-top);int sy0=(int)(localTop/partScale),sy1=(int)(localBottom/partScale);int first=Math.max(0,sy0/tileSrc-1),last=Math.min((parts.get(i).height-1)/tileSrc,sy1/tileSrc+1);for(int ti=first;ti<=last;ti++){String key=generation+":"+i+":"+sample+":"+ti;Bitmap b=tiles.get(key);int sy=ti*tileSrc,ey=Math.min(parts.get(i).height,sy+tileSrc);if(b!=null&&!b.isRecycled()){float y=top+sy*partScale-scrollY;RectF dst=new RectF(x,y,x+getWidth()*zoom,y+(ey-sy)*partScale);c.drawBitmap(b,null,dst,paint);if(!firstTileSent){firstTileSent=true;if(listener!=null)listener.onFirstTile();}}else requestTile(i,pd,key,sample,ti,tileSrc,generation);}}}
        int sampleFor(float s){int x=1;while(x<64&&x*2*s<=1.05f)x*=2;return x;}
        void ensureDoc(int idx){if(idx<0||idx>=parts.size()||docs.containsKey(idx)||pendingDocs.contains(idx))return;pendingDocs.add(idx);int gen=generation;decode.execute(()->{PartDoc pd=null;try{ArchivePart p=parts.get(idx);String ex=ext(p.name);if(ex.isEmpty())ex=".img";File f=new File(cacheDir,"p_"+idx+ex);if(!f.exists()||f.length()==0){File tmp=new File(cacheDir,"p_"+idx+".tmp");if(tmp.exists())tmp.delete();session.extract(p.entry,tmp);if(!tmp.renameTo(f))throw new IOException("캐시 파일 이동 실패");}ImageDocument d=ImageDocument.fromFile(f);int sm=1;while(sm<256&&(d.height/sm>3000||d.width/sm>900))sm*=2;Bitmap prev=d.region(new Rect(0,0,d.width,d.height),sm);pd=new PartDoc(f,d,prev);}catch(Exception ignored){}PartDoc result=pd;post(()->{pendingDocs.remove(idx);if(gen!=generation){if(result!=null)result.close();return;}if(result!=null){docs.put(idx,result);trimDocs();invalidate();}});});}
        void trimDocs(){while(docs.size()>3){Iterator<Map.Entry<Integer,PartDoc>> it=docs.entrySet().iterator();if(!it.hasNext())break;Map.Entry<Integer,PartDoc> e=it.next();it.remove();e.getValue().close();}}
        void requestTile(int part,PartDoc pd,String key,int sample,int ti,int tileSrc,int gen){if(pendingTiles.contains(key))return;pendingTiles.add(key);ImageDocument d=pd.doc;ArchivePart p=parts.get(part);decode.execute(()->{Bitmap b=d.region(new Rect(0,ti*tileSrc,d.width,Math.min(d.height,(ti+1)*tileSrc)),sample);post(()->{pendingTiles.remove(key);if(gen!=generation){if(b!=null)b.recycle();return;}if(b!=null)tiles.put(key,b);invalidate();});});}
        public void showPartList(){String[] rows=new String[parts.size()];for(int i=0;i<rows.length;i++)rows[i]=(i+1)+". "+parts.get(i).name;new AlertDialog.Builder(MainActivity.this).setTitle("압축파일 이미지 목록").setItems(rows,(d,w)->jumpToPart(w)).setNegativeButton("닫기",null).show();}
        void jumpToPart(int i){if(tops==null||i<0||i>=parts.size())return;scrollY=tops[i]*zoom;clamp();invalidate();report();}
        public void setReaderBackground(int c){bg=c;invalidate();}public String infoText(){if(parts.isEmpty())return "ZIP";int i=currentPart();return "ZIP/CBZ · "+(i+1)+"/"+parts.size()+" · 연속";}
        public void release(){generation++;decode.shutdownNow();tiles.evictAll();for(PartDoc p:docs.values())p.close();docs.clear();pendingDocs.clear();pendingTiles.clear();deleteRec(cacheDir);}
        class PartDoc {File file;ImageDocument doc;Bitmap preview;PartDoc(File f,ImageDocument d,Bitmap p){file=f;doc=d;preview=p;}void close(){if(preview!=null&&!preview.isRecycled())preview.recycle();doc.close();if(file!=null)file.delete();}}
    }
}
