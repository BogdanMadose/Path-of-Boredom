using Path_of_Boredom.Game;

namespace Path_of_Boredom.Maui;

public sealed class GameApplicationControl : IGameApplicationControl
{
    public void Quit() => MainThread.BeginInvokeOnMainThread(() =>
    {
#if ANDROID
        Platform.CurrentActivity?.FinishAndRemoveTask();
#else
        Application.Current?.Quit();
#endif
    });
}
