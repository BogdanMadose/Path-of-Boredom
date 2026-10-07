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
}
