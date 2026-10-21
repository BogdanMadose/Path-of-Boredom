using Android.App;
using Android.Content.PM;
using Android.OS;

namespace Path_of_Boredom.Maui;

[Activity(Theme = "@style/Maui.SplashTheme",
    MainLauncher = true,
    // Landscape-only: the arena canvas is 1100x650 and the HUD assumes a wide layout.
    ScreenOrientation = ScreenOrientation.SensorLandscape,
    LaunchMode = LaunchMode.SingleTop,
    ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnActivityResult(int requestCode, Result resultCode, Android.Content.Intent? data)
    {
        base.OnActivityResult(requestCode, resultCode, data);
        if (requestCode == NativeGoogleSignIn.RequestCode) NativeGoogleSignIn.Complete(resultCode, data);
    }

    public override void OnWindowFocusChanged(bool hasFocus)
    {
        base.OnWindowFocusChanged(hasFocus);
        if (!hasFocus || Window is null) return;
        AndroidX.Core.View.WindowCompat.SetDecorFitsSystemWindows(Window, false);
        var controller = new AndroidX.Core.View.WindowInsetsControllerCompat(Window, Window.DecorView);
        controller.Hide(AndroidX.Core.View.WindowInsetsCompat.Type.SystemBars());
        controller.SystemBarsBehavior = AndroidX.Core.View.WindowInsetsControllerCompat.BehaviorShowTransientBarsBySwipe;
        PreferSixtyHertz();
    }

    // The game caps itself at 60/30 fps, but 90/120 Hz panels still refresh and composite the WebView at
    // full rate. Requesting the display mode closest to 60 Hz keeps the whole pipeline (and GPU) at 60.
    void PreferSixtyHertz()
    {
        if (Window is null || !OperatingSystem.IsAndroidVersionAtLeast(23)) return;
        var display = OperatingSystem.IsAndroidVersionAtLeast(30) ? Display : WindowManager?.DefaultDisplay;
        var current = display?.GetMode();
        var modes = display?.GetSupportedModes();
        if (current is null || modes is null) return;
        var best = modes
            .Where(mode => mode.PhysicalWidth == current.PhysicalWidth && mode.PhysicalHeight == current.PhysicalHeight)
            .OrderBy(mode => Math.Abs(mode.RefreshRate - 60f))
            .FirstOrDefault();
        if (best is null) return;
        var attributes = Window.Attributes;
        if (attributes is null || attributes.PreferredDisplayModeId == best.ModeId) return;
        attributes.PreferredDisplayModeId = best.ModeId;
        Window.Attributes = attributes;
    }
}
