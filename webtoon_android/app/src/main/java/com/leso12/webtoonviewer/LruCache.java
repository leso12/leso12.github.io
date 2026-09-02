package com.leso12.webtoonviewer;

public class LruCache<K,V> extends android.util.LruCache<K,V> {
    public LruCache(int maxSize) {
        super(maxSize);
    }
}
