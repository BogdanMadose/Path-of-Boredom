using Path_of_Boredom.ApiService;
using Microsoft.AspNetCore.Authentication;
using Path_of_Boredom.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddProblemDetails();
builder.Services.AddSingleton<GameSaveStore>();
builder.Services.AddOptions<SaveServiceOptions>()
    .BindConfiguration(SaveServiceOptions.SectionName)
    .Validate(options => SaveServiceOptions.IsValidApiKey(options.ApiKey), "Configure SaveService:ApiKey with the same 64-character hexadecimal secret in Web and ApiService, or start AppHost.")
    .ValidateOnStart();
builder.Services.AddAuthentication(SaveServiceOptions.AuthenticationScheme)
    .AddScheme<AuthenticationSchemeOptions, SaveServiceAuthenticationHandler>(SaveServiceOptions.AuthenticationScheme, _ => { });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();

app.MapGameSaves();
app.MapDefaultEndpoints();

app.Run();
