using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.Extensions.Logging;
using Path_of_Boredom.Game;

namespace Path_of_Boredom.Maui;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();

        builder.Services.AddMauiBlazorWebView();

        // The mobile counterparts of what Web registers in its own Program.cs. Both are stand-ins
        // until Google/Apple sign-in lands in 005b; see each type's remarks for why they fail
        // closed rather than reaching the API.
        builder.Services.AddAuthorizationCore();
        builder.Services.AddCascadingAuthenticationState();
        builder.Services.AddSingleton<AuthenticationStateProvider, LocalAuthenticationStateProvider>();
        builder.Services.AddSingleton<OfflineGameSession>();
        builder.Services.AddSingleton<MobileCloudGameSession>();
        builder.Services.AddSingleton<IGameSession>(services => services.GetRequiredService<MobileCloudGameSession>());

#if DEBUG
        builder.Services.AddBlazorWebViewDeveloperTools();
        builder.Logging.AddDebug();
#endif

        return builder.Build();
    }
}
