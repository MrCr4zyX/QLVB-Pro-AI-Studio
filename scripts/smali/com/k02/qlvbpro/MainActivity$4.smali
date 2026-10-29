.class Lcom/k02/qlvbpro/MainActivity$4;
.super Landroid/webkit/WebChromeClient;
.source "MainActivity.java"


# instance fields
.field final synthetic val$dialog:Landroid/app/Dialog;


# direct methods
.method constructor <init>(Landroid/app/Dialog;)V
    .registers 2

    iput-object p1, p0, Lcom/k02/qlvbpro/MainActivity$4;->val$dialog:Landroid/app/Dialog;

    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V

    return-void
.end method


# virtual methods
.method public onCloseWindow(Landroid/webkit/WebView;)V
    .registers 3

    :try_start_0
    iget-object v0, p0, Lcom/k02/qlvbpro/MainActivity$4;->val$dialog:Landroid/app/Dialog;

    if-eqz v0, :cond_9

    invoke-virtual {v0}, Landroid/app/Dialog;->dismiss()V
    :try_end_7
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_7} :catch_f

    :cond_9
    :goto_9
    if-eqz p1, :cond_e

    invoke-virtual {p1}, Landroid/webkit/WebView;->destroy()V

    :cond_e
    return-void

    :catch_f
    move-exception v0

    goto :goto_9
.end method
