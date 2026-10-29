.class Lcom/k02/qlvbpro/MainActivity$3;
.super Landroid/webkit/WebChromeClient;
.source "MainActivity.java"


# instance fields
.field final synthetic this$0:Lcom/k02/qlvbpro/MainActivity;


# direct methods
.method constructor <init>(Lcom/k02/qlvbpro/MainActivity;)V
    .registers 2

    iput-object p1, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V

    return-void
.end method


# virtual methods
.method public onCreateWindow(Landroid/webkit/WebView;ZZLandroid/os/Message;)Z
    .registers 9

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    new-instance v1, Landroid/app/Dialog;

    const v2, 0x01030129

    invoke-direct {v1, v0, v2}, Landroid/app/Dialog;-><init>(Landroid/content/Context;I)V

    new-instance v2, Landroid/webkit/WebView;

    invoke-direct {v2, v0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    const/4 v0, 0x1

    invoke-virtual {v2, v0}, Landroid/webkit/WebView;->setFocusable(Z)V

    invoke-virtual {v2, v0}, Landroid/webkit/WebView;->setFocusableInTouchMode(Z)V

    invoke-virtual {v2}, Landroid/webkit/WebView;->requestFocus()Z

    invoke-virtual {v2}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object v3

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setJavaScriptCanOpenWindowsAutomatically(Z)V

    const-string v0, "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

    invoke-virtual {v3, v0}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V

    invoke-static {}, Landroid/webkit/CookieManager;->getInstance()Landroid/webkit/CookieManager;

    move-result-object v3

    const/4 v0, 0x1

    invoke-virtual {v3, v0}, Landroid/webkit/CookieManager;->setAcceptCookie(Z)V

    invoke-virtual {v3, v2, v0}, Landroid/webkit/CookieManager;->setAcceptThirdPartyCookies(Landroid/webkit/WebView;Z)V

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    new-instance v3, Lcom/k02/qlvbpro/MainActivity$2;

    invoke-direct {v3, v0}, Lcom/k02/qlvbpro/MainActivity$2;-><init>(Lcom/k02/qlvbpro/MainActivity;)V

    invoke-virtual {v2, v3}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v3, Lcom/k02/qlvbpro/MainActivity$4;

    invoke-direct {v3, v1}, Lcom/k02/qlvbpro/MainActivity$4;-><init>(Landroid/app/Dialog;)V

    invoke-virtual {v2, v3}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    const/4 v0, 0x1

    invoke-virtual {v1, v0}, Landroid/app/Dialog;->setCancelable(Z)V

    invoke-virtual {v1, v2}, Landroid/app/Dialog;->setContentView(Landroid/view/View;)V

    invoke-virtual {v1}, Landroid/app/Dialog;->show()V

    invoke-virtual {v1}, Landroid/app/Dialog;->getWindow()Landroid/view/Window;

    move-result-object v0

    if-eqz v0, :cond_66

    const/high16 v3, 0x20000

    invoke-virtual {v0, v3}, Landroid/view/Window;->clearFlags(I)V

    :cond_66
    iget-object v0, p4, Landroid/os/Message;->obj:Ljava/lang/Object;

    check-cast v0, Landroid/webkit/WebView$WebViewTransport;

    invoke-virtual {v0, v2}, Landroid/webkit/WebView$WebViewTransport;->setWebView(Landroid/webkit/WebView;)V

    invoke-virtual {p4}, Landroid/os/Message;->sendToTarget()V

    const/4 v0, 0x1

    return v0
.end method

.method public onShowFileChooser(Landroid/webkit/WebView;Landroid/webkit/ValueCallback;Landroid/webkit/WebChromeClient$FileChooserParams;)Z
    .registers 8

    const/4 v3, 0x0

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    # getter for: Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;
    invoke-static {v0}, Lcom/k02/qlvbpro/MainActivity;->access$100(Lcom/k02/qlvbpro/MainActivity;)Landroid/webkit/ValueCallback;

    move-result-object v0

    if-eqz v0, :cond_12

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    # getter for: Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;
    invoke-static {v0}, Lcom/k02/qlvbpro/MainActivity;->access$100(Lcom/k02/qlvbpro/MainActivity;)Landroid/webkit/ValueCallback;

    move-result-object v0

    invoke-interface {v0, v3}, Landroid/webkit/ValueCallback;->onReceiveValue(Ljava/lang/Object;)V

    :cond_12
    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    # setter for: Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;
    invoke-static {v0, p2}, Lcom/k02/qlvbpro/MainActivity;->access$102(Lcom/k02/qlvbpro/MainActivity;Landroid/webkit/ValueCallback;)Landroid/webkit/ValueCallback;

    invoke-virtual {p3}, Landroid/webkit/WebChromeClient$FileChooserParams;->createIntent()Landroid/content/Intent;

    move-result-object v0

    :try_start_1b
    iget-object v1, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    const/16 v2, 0x3e9

    invoke-virtual {v1, v0, v2}, Lcom/k02/qlvbpro/MainActivity;->startActivityForResult(Landroid/content/Intent;I)V
    :try_end_22
    .catch Ljava/lang/Exception; {:try_start_1b .. :try_end_22} :catch_24

    const/4 v0, 0x1

    :goto_23
    return v0

    :catch_24
    move-exception v0

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$3;->this$0:Lcom/k02/qlvbpro/MainActivity;

    # setter for: Lcom/k02/qlvbpro/MainActivity;->mFilePathCallback:Landroid/webkit/ValueCallback;
    invoke-static {v0, v3}, Lcom/k02/qlvbpro/MainActivity;->access$102(Lcom/k02/qlvbpro/MainActivity;Landroid/webkit/ValueCallback;)Landroid/webkit/ValueCallback;

    const/4 v0, 0x0

    goto :goto_23
.end method
