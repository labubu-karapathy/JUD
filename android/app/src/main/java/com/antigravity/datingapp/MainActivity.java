package com.antigravity.datingapp;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "AppInstaller")
class AppInstallerPlugin extends Plugin {
    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        try {
            if (filePath.startsWith("file://")) {
                filePath = filePath.substring(7);
            }

            File apkFile = new File(filePath);
            if (!apkFile.exists()) {
                call.reject("APK file does not exist at path: " + filePath);
                return;
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to trigger Android package installer: " + e.getMessage(), e);
        }
    }
}

@CapacitorPlugin(name = "OtaUpdater")
class OtaUpdaterPlugin extends Plugin {
    public static final String PREFS_NAME = "CapWebViewSettings";
    public static final String PREF_SERVER_PATH = "serverBasePath";
    public static final String PREF_OTA_VERSION = "ota_version";

    @PluginMethod
    public void getActiveVersion(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
        String version = prefs.getString(PREF_OTA_VERSION, "bundled");
        String path = prefs.getString(PREF_SERVER_PATH, "");
        JSObject ret = new JSObject();
        ret.put("version", version);
        ret.put("path", path);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadAndApply(PluginCall call) {
        String urlString = call.getString("url");
        String version = call.getString("version");

        if (urlString == null || urlString.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        new Thread(() -> {
            File tempZip = null;
            try {
                File otaBaseDir = new File(getContext().getFilesDir(), "ota_updates");
                if (!otaBaseDir.exists()) otaBaseDir.mkdirs();

                tempZip = new File(otaBaseDir, "temp_" + System.currentTimeMillis() + ".zip");
                URL url = new URL(urlString);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new Exception("HTTP error " + conn.getResponseCode() + ": " + conn.getResponseMessage());
                }

                InputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream out = new FileOutputStream(tempZip);
                byte[] buffer = new byte[8192];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                }
                out.flush();
                out.close();
                in.close();

                File targetDir = new File(otaBaseDir, version != null ? version : ("v_" + System.currentTimeMillis()));
                if (targetDir.exists()) {
                    deleteRecursive(targetDir);
                }
                targetDir.mkdirs();

                unzip(tempZip, targetDir);

                File indexFile = new File(targetDir, "index.html");
                if (!indexFile.exists()) {
                    File nestedDist = new File(targetDir, "dist");
                    if (nestedDist.exists() && new File(nestedDist, "index.html").exists()) {
                        targetDir = nestedDist;
                    } else {
                        throw new Exception("Invalid web bundle: index.html not found in archive root");
                    }
                }

                final File finalTargetDir = targetDir;
                final String finalVersion = version != null ? version : "custom";

                SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
                prefs.edit()
                    .putString(PREF_SERVER_PATH, finalTargetDir.getAbsolutePath())
                    .putString(PREF_OTA_VERSION, finalVersion)
                    .apply();

                getActivity().runOnUiThread(() -> {
                    try {
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            getBridge().getWebView().clearCache(true);
                        }
                    } catch (Exception ignored) {}

                    getBridge().setServerBasePath(finalTargetDir.getAbsolutePath());

                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().post(() -> {
                            getBridge().getWebView().reload();
                        });
                    }

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("version", finalVersion);
                    call.resolve(ret);
                });

            } catch (Exception e) {
                call.reject("OTA Update failed: " + e.getMessage(), e);
            } finally {
                if (tempZip != null && tempZip.exists()) {
                    tempZip.delete();
                }
            }
        }).start();
    }

    @PluginMethod
    public void resetToDefault(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
        prefs.edit().remove(PREF_SERVER_PATH).remove(PREF_OTA_VERSION).apply();
        getActivity().runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().clearCache(true);
                }
            } catch (Exception ignored) {}
            getBridge().setServerAssetPath("public");
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().reload();
                });
            }
            call.resolve();
        });
    }

    private void unzip(File zipFile, File targetDirectory) throws Exception {
        ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile)));
        ZipEntry ze;
        while ((ze = zis.getNextEntry()) != null) {
            File file = new File(targetDirectory, ze.getName());
            String canonicalDestPath = targetDirectory.getCanonicalPath();
            String canonicalFilePath = file.getCanonicalPath();
            if (!canonicalFilePath.startsWith(canonicalDestPath + File.separator)) {
                throw new SecurityException("Zip entry is outside target dir: " + ze.getName());
            }

            if (ze.isDirectory()) {
                file.mkdirs();
            } else {
                File parent = file.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                FileOutputStream fos = new FileOutputStream(file);
                byte[] buffer = new byte[8192];
                int count;
                while ((count = zis.read(buffer)) != -1) {
                    fos.write(buffer, 0, count);
                }
                fos.flush();
                fos.close();
            }
            zis.closeEntry();
        }
        zis.close();
    }

    private void deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            File[] children = fileOrDirectory.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        fileOrDirectory.delete();
    }
}

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppInstallerPlugin.class);
        registerPlugin(OtaUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

        // Restore OTA base path on cold start if an update was previously applied
        try {
            SharedPreferences prefs = getSharedPreferences(OtaUpdaterPlugin.PREFS_NAME, Activity.MODE_PRIVATE);
            String savedPath = prefs.getString(OtaUpdaterPlugin.PREF_SERVER_PATH, null);
            if (savedPath != null && !savedPath.trim().isEmpty()) {
                File indexFile = new File(savedPath, "index.html");
                if (indexFile.exists() && this.bridge != null) {
                    this.bridge.setServerBasePath(savedPath);
                }
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Failed to restore OTA serverBasePath", e);
        }

        // Native Android Navigation Bar & Gesture Back Interceptor
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchNativeBackEvent();
            }
        });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            dispatchNativeBackEvent();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void dispatchNativeBackEvent() {
        if (this.bridge != null) {
            this.bridge.triggerJSEvent("backbutton", "document");
            this.bridge.eval("window.dispatchEvent(new CustomEvent('nativeappback'));", value -> {});
        }
    }
}
