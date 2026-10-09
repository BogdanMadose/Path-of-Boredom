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
    public override void OnWindowFocusChanged(bool hasFocus)
    {
        base.OnWindowFocusChanged(hasFocus);
        if (!hasFocus || Window is null) return;
        AndroidX.Core.View.WindowCompat.SetDecorFitsSystemWindows(Window, false);
        var controller = new AndroidX.Core.View.WindowInsetsControllerCompat(Window, Window.DecorView);
        controller.Hide(AndroidX.Core.View.WindowInsetsCompat.Type.SystemBars());
        controller.SystemBarsBehavior = AndroidX.Core.View.WindowInsetsControllerCompat.BehaviorShowTransientBarsBySwipe;
    }
}
