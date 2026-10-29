.class Lcom/k02/qlvbpro/MainActivity$1;
.super Ljava/lang/Object;
.source "MainActivity.java"


# instance fields
.field final synthetic this$0:Lcom/k02/qlvbpro/MainActivity;


# direct methods
.method constructor <init>(Lcom/k02/qlvbpro/MainActivity;)V
    .registers 2

    iput-object p1, p0, Lcom/k02/qlvbpro/MainActivity$1;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public consumePendingAuthUri()Ljava/lang/String;
    .registers 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$1;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-virtual {v0}, Lcom/k02/qlvbpro/MainActivity;->consumePendingAuthUri()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method public hasPendingAuthUri()Z
    .registers 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$1;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-virtual {v0}, Lcom/k02/qlvbpro/MainActivity;->hasPendingAuthUri()Z

    move-result v0

    return v0
.end method

.method public openExternalBrowser(Ljava/lang/String;)V
    .registers 3
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$1;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-virtual {v0, p1}, Lcom/k02/qlvbpro/MainActivity;->openExternalBrowser(Ljava/lang/String;)V

    return-void
.end method

.method public saveBase64File(Ljava/lang/String;Ljava/lang/String;)Z
    .registers 4
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    :try_start_0
    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$1;->this$0:Lcom/k02/qlvbpro/MainActivity;

    invoke-virtual {v0, p1, p2}, Lcom/k02/qlvbpro/MainActivity;->saveBase64ToDownloads(Ljava/lang/String;Ljava/lang/String;)Z

    move-result v0
    :try_end_7
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_7} :catch_8

    return v0

    :catch_8
    move-exception v0

    const/4 v0, 0x0

    return v0
.end method

.method public showNotification(Ljava/lang/String;Ljava/lang/String;)V
    .registers 4
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$1;->this$0:Lcom/k02/qlvbpro/MainActivity;

    # invokes: Lcom/k02/qlvbpro/MainActivity;->triggerNativeNotification(Ljava/lang/String;Ljava/lang/String;)V
    invoke-static {v0, p1, p2}, Lcom/k02/qlvbpro/MainActivity;->access$000(Lcom/k02/qlvbpro/MainActivity;Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method
