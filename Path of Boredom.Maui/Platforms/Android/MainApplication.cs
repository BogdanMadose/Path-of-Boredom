using Android.App;
using Android.Runtime;
using Android.Gms.Games;

namespace Path_of_Boredom.Maui;

[Application]
public class MainApplication(IntPtr handle, JniHandleOwnership ownership) : MauiApplication(handle, ownership)
{
    public override void OnCreate()
    {
        base.OnCreate();
        if (NativePlayGamesAchievements.IsConfigured(this)) PlayGamesSdk.Initialize(this);
    }

    protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
