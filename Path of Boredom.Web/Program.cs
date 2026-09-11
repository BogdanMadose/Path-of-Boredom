using Path_of_Boredom.Web;
using Path_of_Boredom.Web.Components;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Path_of_Boredom.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();
builder.Services.AddAuthorization();
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddOptions<SaveServiceOptions>()
    .BindConfiguration(SaveServiceOptions.SectionName)
    .Validate(options => SaveServiceOptions.IsValidApiKey(options.ApiKey), "Configure SaveService:ApiKey with the same 64-character hexadecimal secret in Web and ApiService, or start AppHost.")
    .ValidateOnStart();

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddHubOptions(options => options.MaximumReceiveMessageSize = 96 * 1024);

var apiServiceBaseUrl = builder.Configuration["ApiService:BaseUrl"] ?? "https+http://apiservice";
builder.Services.AddHttpClient<GameSaveClient>(client =>
    {
        client.BaseAddress = new(apiServiceBaseUrl);
        client.Timeout = TimeSpan.FromSeconds(15);
    });

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.UseAntiforgery();

app.MapStaticAssets();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .RequireAuthorization();

app.MapGet("/account/login", () => Results.LocalRedirect("/"))
    .RequireAuthorization();

app.MapDefaultEndpoints();

app.Run();