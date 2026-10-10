namespace Path_of_Boredom.Maui;

public partial class MainPage : ContentPage
{
    public MainPage() => InitializeComponent();

    internal void SuspendGame()
    {
#if ANDROID
        if (blazorWebView.Handler?.PlatformView is Android.Webkit.WebView webView)
        {
            webView.EvaluateJavascript("window.dispatchEvent(new Event('game-background'));", null);
        }
#endif
    }
}
