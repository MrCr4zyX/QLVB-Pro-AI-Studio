.class public Lcom/k02/qlvbpro/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"


# static fields
.field private static final CHANNEL_ID:Ljava/lang/String;

.field private static final FILE_CHOOSER_REQUEST_CODE:I


# instance fields
.field private mFilePathCallback:Landroid/webkit/ValueCallback;

.field private mPendingAuthUri:Ljava/lang/String;

.field private mWebView:Landroid/webkit/WebView;


# direct methods
.method public constructor <init>()V
    .registers 1

    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method static synthetic access$000(Lcom/k02/qlvbpro/MainActivity;Ljava/lang/String;Ljava/lang/String;)V
    .registers 3

    invoke-direct {p0, p1, p2}, Lcom/k02/qlvbpro/MainActivity;->triggerNativeNotification(Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method static synthetic access$100(Lcom/k02/qlvbpro/MainActivity;)Landroid/webkit/ValueCallback;
    .registers 2

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;

    return-object v0
.end method

.method static synthetic access$102(Lcom/k02/qlvbpro/MainActivity;Landroid/webkit/ValueCallback;)Landroid/webkit/ValueCallback;
    .registers 2

    iput-object p1, p0, Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;

    return-object p1
.end method

.method private createNotificationChannel()V
    .registers 6

    const/4 v4, 0x1

    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1a

    if-lt v0, v1, :cond_29

    new-instance v1, Landroid/app/NotificationChannel;

    const-string v0, "k02_deadline_alerts"

    const-string v2, "C\u1ea3nh b\u00e1o th\u1eddi h\u1ea1n K02"

    const/4 v3, 0x4

    invoke-direct {v1, v0, v2, v3}, Landroid/app/NotificationChannel;-><init>(Ljava/lang/String;Ljava/lang/CharSequence;I)V

    const-string v0, "Th\u00f4ng b\u00e1o v\u0103n b\u1ea3n qu\u00e1 h\u1ea1n v\u00e0 s\u1eafp \u0111\u1ebfn h\u1ea1n"

    invoke-virtual {v1, v0}, Landroid/app/NotificationChannel;->setDescription(Ljava/lang/String;)V

    invoke-virtual {v1, v4}, Landroid/app/NotificationChannel;->enableVibration(Z)V

    invoke-virtual {v1, v4}, Landroid/app/NotificationChannel;->enableLights(Z)V

    const-string v0, "notification"

    invoke-virtual {p0, v0}, Lcom/k02/qlvbpro/MainActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/NotificationManager;

    if-eqz v0, :cond_29

    invoke-virtual {v0, v1}, Landroid/app/NotificationManager;->createNotificationChannel(Landroid/app/NotificationChannel;)V

    :cond_29
    return-void
.end method

.method private triggerNativeNotification(Ljava/lang/String;Ljava/lang/String;)V
    .registers 8

    :try_start_0
    const-string v0, "notification"

    invoke-virtual {p0, v0}, Lcom/k02/qlvbpro/MainActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/NotificationManager;

    if-nez v0, :cond_b

    :goto_a
    return-void

    :cond_b
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v2, 0x1a

    if-lt v1, v2, :cond_52

    new-instance v1, Landroid/app/Notification$Builder;

    const-string v2, "k02_deadline_alerts"

    invoke-direct {v1, p0, v2}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    :goto_18
    invoke-virtual {v1, p1}, Landroid/app/Notification$Builder;->setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object v2

    invoke-virtual {v2, p2}, Landroid/app/Notification$Builder;->setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object v2

    const/high16 v3, 0x7f020000

    invoke-virtual {v2, v3}, Landroid/app/Notification$Builder;->setSmallIcon(I)Landroid/app/Notification$Builder;

    move-result-object v2

    const/4 v3, 0x1

    invoke-virtual {v2, v3}, Landroid/app/Notification$Builder;->setAutoCancel(Z)Landroid/app/Notification$Builder;

    move-result-object v2

    const/4 v3, -0x1

    invoke-virtual {v2, v3}, Landroid/app/Notification$Builder;->setDefaults(I)Landroid/app/Notification$Builder;

    new-instance v2, Landroid/content/Intent;

    const-class v3, Lcom/k02/qlvbpro/MainActivity;

    invoke-direct {v2, p0, v3}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const/high16 v3, 0x24000000

    invoke-virtual {v2, v3}, Landroid/content/Intent;->setFlags(I)Landroid/content/Intent;

    const/4 v3, 0x0

    const/high16 v4, 0xc000000

    invoke-static {p0, v3, v2, v4}, Landroid/app/PendingIntent;->getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v2

    invoke-virtual {v1, v2}, Landroid/app/Notification$Builder;->setContentIntent(Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J

    move-result-wide v2

    long-to-int v2, v2

    invoke-virtual {v1}, Landroid/app/Notification$Builder;->build()Landroid/app/Notification;

    move-result-object v1

    invoke-virtual {v0, v2, v1}, Landroid/app/NotificationManager;->notify(ILandroid/app/Notification;)V

    goto :goto_a

    :cond_52
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;)V

    goto :goto_18
    :try_end_58
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_58} :catch_59

    :catch_59
    move-exception v0

    goto :goto_a
.end method


# virtual methods
.method public consumePendingAuthUri()Ljava/lang/String;
    .registers 3

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mPendingAuthUri:Ljava/lang/String;

    const/4 v1, 0x0

    iput-object v1, p0, Lcom/k02/qlvbpro/MainActivity;->mPendingAuthUri:Ljava/lang/String;

    return-object v0
.end method

.method public handleAuthUri(Ljava/lang/String;)V
    .registers 4

    if-eqz p1, :cond_19

    const-string v0, "k02qlvb://"

    invoke-virtual {p1, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_19

    iput-object p1, p0, Lcom/k02/qlvbpro/MainActivity;->mPendingAuthUri:Ljava/lang/String;

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    if-eqz v0, :cond_19

    const-string v1, "javascript:if(window.onApkAuthCallback)window.onApkAuthCallback();"

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    :cond_19
    return-void
.end method

.method public hasPendingAuthUri()Z
    .registers 2

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mPendingAuthUri:Ljava/lang/String;

    if-eqz v0, :cond_e

    invoke-virtual {v0}, Ljava/lang/String;->isEmpty()Z

    move-result v0

    if-nez v0, :cond_e

    const/4 v0, 0x1

    return v0

    :cond_e
    const/4 v0, 0x0

    return v0
.end method

.method public openExternalBrowser(Ljava/lang/String;)V
    .registers 5

    :try_start_0
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.VIEW"

    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v2

    invoke-direct {v0, v1, v2}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V

    const/high16 v1, 0x10000000

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    invoke-virtual {p0, v0}, Lcom/k02/qlvbpro/MainActivity;->startActivity(Landroid/content/Intent;)V
    :try_end_13
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_13} :catch_14

    :goto_13
    return-void

    :catch_14
    move-exception v0

    goto :goto_13
.end method

.method public saveBase64ToDownloads(Ljava/lang/String;Ljava/lang/String;)Z
    .registers 10

    const/4 v0, 0x0

    :try_start_1
    invoke-static {p1, v0}, Landroid/util/Base64;->decode(Ljava/lang/String;I)[B

    move-result-object v1

    move-object v2, p2

    const-string v3, "QLVB_PRO/"

    invoke-virtual {v2, v3}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v3

    if-eqz v3, :cond_18

    const/16 v3, 0x9

    invoke-virtual {v2, v3}, Ljava/lang/String;->substring(I)Ljava/lang/String;

    move-result-object v2

    :cond_18
    new-instance v3, Ljava/lang/StringBuilder;

    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    const-string v4, "QLVB_PRO/"

    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v6
    :try_end_2b
    .catch Ljava/lang/Throwable; {:try_start_1 .. :try_end_2b} :catch_b3

    sget v3, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v4, 0x1d

    if-lt v3, v4, :cond_6d

    :try_start_31
    invoke-virtual {p0}, Lcom/k02/qlvbpro/MainActivity;->getContentResolver()Landroid/content/ContentResolver;

    move-result-object v3

    new-instance v4, Landroid/content/ContentValues;

    invoke-direct {v4}, Landroid/content/ContentValues;-><init>()V

    const-string v5, "_display_name"

    invoke-virtual {v4, v5, v2}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V

    const-string v5, ".json"

    invoke-virtual {v2, v5}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v5

    if-eqz v5, :cond_4c

    const-string v5, "application/json"

    goto :goto_4e

    :cond_4c
    const-string v5, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    :goto_4e
    const-string p1, "mime_type"

    invoke-virtual {v4, p1, v5}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V

    const-string p1, "relative_path"

    const-string v5, "Download/QLVB_PRO"

    invoke-virtual {v4, p1, v5}, Landroid/content/ContentValues;->put(Ljava/lang/String;Ljava/lang/String;)V

    sget-object v5, Landroid/provider/MediaStore$Downloads;->EXTERNAL_CONTENT_URI:Landroid/net/Uri;

    invoke-virtual {v3, v5, v4}, Landroid/content/ContentResolver;->insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;

    move-result-object v5

    if-eqz v5, :cond_6d

    invoke-virtual {v3, v5}, Landroid/content/ContentResolver;->openOutputStream(Landroid/net/Uri;)Ljava/io/OutputStream;

    move-result-object v4

    if-eqz v4, :cond_6d

    invoke-virtual {v4, v1}, Ljava/io/OutputStream;->write([B)V

    invoke-virtual {v4}, Ljava/io/OutputStream;->flush()V

    invoke-virtual {v4}, Ljava/io/OutputStream;->close()V
    :try_end_6b
    .catch Ljava/lang/Throwable; {:try_start_31 .. :try_end_6b} :catch_6c

    goto :goto_8f

    :catch_6c
    move-exception v3

    :cond_6d
    :try_start_6d
    sget-object v2, Landroid/os/Environment;->DIRECTORY_DOWNLOADS:Ljava/lang/String;

    invoke-static {v2}, Landroid/os/Environment;->getExternalStoragePublicDirectory(Ljava/lang/String;)Ljava/io/File;

    move-result-object v2

    invoke-virtual {v2}, Ljava/io/File;->mkdirs()Z

    new-instance v3, Ljava/io/File;

    invoke-direct {v3, v2, v6}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-virtual {v3}, Ljava/io/File;->getParentFile()Ljava/io/File;

    move-result-object v2

    if-eqz v2, :cond_86

    invoke-virtual {v2}, Ljava/io/File;->mkdirs()Z

    :cond_86
    new-instance v2, Ljava/io/FileOutputStream;

    invoke-direct {v2, v3}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    invoke-virtual {v2, v1}, Ljava/io/FileOutputStream;->write([B)V

    invoke-virtual {v2}, Ljava/io/FileOutputStream;->flush()V

    invoke-virtual {v2}, Ljava/io/FileOutputStream;->close()V
    :try_end_8f
    .catch Ljava/lang/Throwable; {:try_start_6d .. :try_end_8f} :catch_97

    :goto_8f
    const-string v2, "\u0110\u00e3 l\u01b0u t\u1ec7p v\u00e0o Download/QLVB_PRO"

    invoke-direct {p0, v2, v6}, Lcom/k02/qlvbpro/MainActivity;->triggerNativeNotification(Ljava/lang/String;Ljava/lang/String;)V

    const/4 v0, 0x1

    return v0

    :catch_97
    move-exception v2

    :try_start_98
    sget-object v2, Landroid/os/Environment;->DIRECTORY_DOWNLOADS:Ljava/lang/String;

    invoke-virtual {p0, v2}, Lcom/k02/qlvbpro/MainActivity;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v2

    if-eqz v2, :cond_b4

    invoke-virtual {v2}, Ljava/io/File;->mkdirs()Z

    new-instance v3, Ljava/io/File;

    invoke-direct {v3, v2, v6}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-virtual {v3}, Ljava/io/File;->getParentFile()Ljava/io/File;

    move-result-object v2

    if-eqz v2, :cond_ad

    invoke-virtual {v2}, Ljava/io/File;->mkdirs()Z

    :cond_ad
    new-instance v2, Ljava/io/FileOutputStream;

    invoke-direct {v2, v3}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    invoke-virtual {v2, v1}, Ljava/io/FileOutputStream;->write([B)V

    invoke-virtual {v2}, Ljava/io/FileOutputStream;->flush()V

    invoke-virtual {v2}, Ljava/io/FileOutputStream;->close()V
    :try_end_b1
    .catch Ljava/lang/Throwable; {:try_start_98 .. :try_end_b1} :catch_b3

    goto :goto_8f

    :catch_b3
    move-exception v1

    :cond_b4
    return v0
.end method

.method public serveLocalAsset(Ljava/lang/String;)Landroid/webkit/WebResourceResponse;
    .registers 6

    if-eqz p1, :cond_12

    invoke-virtual {p1}, Ljava/lang/String;->isEmpty()Z

    move-result v0

    if-nez v0, :cond_12

    const-string v0, "/"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_14

    :cond_12
    const-string p1, "/index.html"

    :cond_14
    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    const-string v1, "dist"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v1

    const-string v0, ".html"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_46

    const-string v0, "text/html"

    :goto_2f
    :try_start_2f
    invoke-virtual {p0}, Lcom/k02/qlvbpro/MainActivity;->getAssets()Landroid/content/res/AssetManager;

    move-result-object v2

    invoke-virtual {v2, v1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object v1

    new-instance v2, Landroid/webkit/WebResourceResponse;

    const-string v3, "UTF-8"

    invoke-direct {v2, v0, v3, v1}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/io/InputStream;)V
    :try_end_3e
    .catch Ljava/lang/Exception; {:try_start_2f .. :try_end_3e} :catch_8e

    move-object v0, v2

    :goto_3f
    return-object v0

    :cond_46
    const-string v0, ".js"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_51

    const-string v0, "application/javascript"

    goto :goto_2f

    :cond_51
    const-string v0, ".css"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_5c

    const-string v0, "text/css"

    goto :goto_2f

    :cond_5c
    const-string v0, ".json"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_67

    const-string v0, "application/json"

    goto :goto_2f

    :cond_67
    const-string v0, ".png"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_72

    const-string v0, "image/png"

    goto :goto_2f

    :cond_72
    const-string v0, ".jpg"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_7d

    const-string v0, "image/jpeg"

    goto :goto_2f

    :cond_7d
    const-string v0, ".svg"

    invoke-virtual {p1, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_88

    const-string v0, "image/svg+xml"

    goto :goto_2f

    :cond_88
    const-string v0, "application/octet-stream"

    goto :goto_2f

    :catch_8e
    move-exception v0

    :try_start_8f
    invoke-virtual {p0}, Lcom/k02/qlvbpro/MainActivity;->getAssets()Landroid/content/res/AssetManager;

    move-result-object v0

    const-string v1, "dist/index.html"

    invoke-virtual {v0, v1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;

    move-result-object v1

    new-instance v0, Landroid/webkit/WebResourceResponse;

    const-string v2, "text/html"

    const-string v3, "UTF-8"

    invoke-direct {v0, v2, v3, v1}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/io/InputStream;)V
    :try_end_a2
    .catch Ljava/lang/Exception; {:try_start_8f .. :try_end_a2} :catch_a3

    goto :goto_3f

    :catch_a3
    move-exception v0

    const/4 v0, 0x0

    goto :goto_3f
.end method

.method protected onActivityResult(IILandroid/content/Intent;)V
    .registers 8

    const/4 v1, 0x0

    const/16 v0, 0x3e9

    if-ne p1, v0, :cond_26

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;

    if-eqz v0, :cond_25

    const/4 v0, -0x1

    if-ne p2, v0, :cond_2a

    if-eqz p3, :cond_2a

    invoke-virtual {p3}, Landroid/content/Intent;->getDataString()Ljava/lang/String;

    move-result-object v2

    if-eqz v2, :cond_2a

    const/4 v0, 0x1

    new-array v0, v0, [Landroid/net/Uri;

    const/4 v3, 0x0

    invoke-static {v2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object v2

    aput-object v2, v0, v3

    :goto_1e
    iget-object v2, p0, Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;

    invoke-interface {v2, v0}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V

    iput-object v1, p0, Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;

    :cond_25
    :goto_25
    return-void

    :cond_26
    invoke-super {p0, p1, p2, p3}, Landroid/app/Activity;->onActivityResult(IILandroid/content/Intent;)V

    goto :goto_25

    :cond_2a
    move-object v0, v1

    goto :goto_1e
.end method

.method public onBackPressed()V
    .registers 2

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    if-eqz v0, :cond_12

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z

    move-result v0

    if-eqz v0, :cond_12

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V

    :goto_11
    return-void

    :cond_12
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V

    goto :goto_11
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .registers 3

    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V

    invoke-virtual {p0, p1}, Lcom/k02/qlvbpro/MainActivity;->setIntent(Landroid/content/Intent;)V

    if-eqz p1, :cond_12

    invoke-virtual {p1}, Landroid/content/Intent;->getDataString()Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_12

    invoke-virtual {p0, v0}, Lcom/k02/qlvbpro/MainActivity;->handleAuthUri(Ljava/lang/String;)V

    :cond_12
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 5

    const/4 v2, 0x0

    const/4 v1, 0x1

    invoke-virtual {p0, v1}, Lcom/k02/qlvbpro/MainActivity;->requestWindowFeature(I)Z

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    invoke-virtual {p0}, Lcom/k02/qlvbpro/MainActivity;->getIntent()Landroid/content/Intent;

    move-result-object v0

    if-eqz v0, :cond_19

    invoke-virtual {v0}, Landroid/content/Intent;->getDataString()Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_19

    invoke-virtual {p0, v0}, Lcom/k02/qlvbpro/MainActivity;->handleAuthUri(Ljava/lang/String;)V

    :cond_19
    invoke-direct {p0}, Lcom/k02/qlvbpro/MainActivity;->createNotificationChannel()V

    new-instance v0, Landroid/webkit/WebView;

    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    iput-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    invoke-virtual {p0, v0}, Lcom/k02/qlvbpro/MainActivity;->setContentView(Landroid/view/View;)V

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object v0

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowFileAccessFromFileURLs(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setAllowUniversalAccessFromFileURLs(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V

    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V

    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setSupportMultipleWindows(Z)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebSettings;->setJavaScriptCanOpenWindowsAutomatically(Z)V

    const-string v2, "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

    invoke-virtual {v0, v2}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V

    invoke-static {}, Landroid/webkit/CookieManager;->getInstance()Landroid/webkit/CookieManager;

    move-result-object v0

    invoke-virtual {v0, v1}, Landroid/webkit/CookieManager;->setAcceptCookie(Z)V

    iget-object v2, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    invoke-virtual {v0, v2, v1}, Landroid/webkit/CookieManager;->setAcceptThirdPartyCookies(Landroid/webkit/WebView;Z)V

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    new-instance v1, Lcom/k02/qlvbpro/MainActivity$1;

    invoke-direct {v1, p0}, Lcom/k02/qlvbpro/MainActivity$1;-><init>(Lcom/k02/qlvbpro/MainActivity;)V

    const-string v2, "AndroidBridge"

    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    new-instance v1, Lcom/k02/qlvbpro/MainActivity$2;

    invoke-direct {v1, p0}, Lcom/k02/qlvbpro/MainActivity$2;-><init>(Lcom/k02/qlvbpro/MainActivity;)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    new-instance v1, Lcom/k02/qlvbpro/MainActivity$3;

    invoke-direct {v1, p0}, Lcom/k02/qlvbpro/MainActivity$3;-><init>(Lcom/k02/qlvbpro/MainActivity;)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity;->mWebView:Landroid/webkit/WebView;

    const-string v1, "https://gen-lang-client-0383399711.firebaseapp.com/index.html"

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method
