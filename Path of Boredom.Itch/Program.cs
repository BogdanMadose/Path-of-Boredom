using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Path_of_Boredom.Game;
using Path_of_Boredom.Itch;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddSingleton(_ => new HttpClient { Timeout = TimeSpan.FromSeconds(20) });
builder.Services.AddSingleton<BrowserSaveStore>();
#if ITCH_DEMO
builder.Services.AddSingleton(GameEdition.Demo);
builder.Services.AddSingleton<IGameSession, DemoGameSession>();
#else
builder.Services.AddSingleton(GameEdition.Full);
builder.Services.AddSingleton<BrowserGameSession>();
builder.Services.AddSingleton<IGameSession>(services => services.GetRequiredService<BrowserGameSession>());
#endif

await builder.Build().RunAsync();
