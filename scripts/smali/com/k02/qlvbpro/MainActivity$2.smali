.class Lcom/k02/qlvbpro/MainActivity$2;
.super Landroid/webkit/WebViewClient;
.source "MainActivity.java"


# instance fields
.field final synthetic this$0:Lcom/k02/qlvbpro/MainActivity;


# direct methods
.method constructor <init>(Lcom/k02/qlvbpro/MainActivity;)V
    .registers 2

    iput-object p1, p0, Lcom/k02/qlvbpro/MainActivity$2;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V

    return-void
.end method


# virtual methods
.method public shouldInterceptRequest(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .registers 6

    if-eqz p2, :cond_2f

    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;

    move-result-object v0

    if-eqz v0, :cond_2f

    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;

    move-result-object v1

    const-string v2, "gen-lang-client-0383399711.firebaseapp.com"

    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_2f

    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_26

    const-string v1, "/__/"

    invoke-virtual {v0, v1}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v1

    if-nez v1, :cond_2f

    :cond_26
    iget-object v1, p0, Lcom/k02/qlvbpro/MainActivity$2;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-virtual {v1, v0}, Lcom/k02/qlvbpro/MainActivity;->serveLocalAsset(Ljava/lang/String;)Landroid/webkit/WebResourceResponse;

    move-result-object v0

    return-object v0

    :cond_2f
    const/4 v0, 0x0

    return-object v0
.end method

.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .registers 4

    if-eqz p2, :cond_13

    const-string v0, "k02qlvb://"

    invoke-virtual {p2, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_13

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$2;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-virtual {v0, p2}, Lcom/k02/qlvbpro/MainActivity;->handleAuthUri(Ljava/lang/String;)V

    const/4 v0, 0x1

    return v0

    :cond_13
    const/4 v0, 0x0

    return v0
.end method
