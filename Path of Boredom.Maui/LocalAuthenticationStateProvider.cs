using System.Security.Claims;
using Microsoft.AspNetCore.Components.Authorization;

namespace Path_of_Boredom.Maui;

/// <summary>
/// Supplies a always-authenticated local identity to the shared game components, which all carry
/// <c>[Authorize]</c> because the web head gates every page behind Windows sign-in.
/// </summary>
/// <remarks>
/// This grants no real authority: the mobile head is offline until 005b, so there is nothing for an
/// identity to authorize against. It exists purely so <c>AuthorizeRouteView</c> renders the game
/// instead of a "sign-in required" page. When Google/Apple sign-in lands this is replaced by a
/// provider-backed implementation, and the <c>[Authorize]</c> attributes start meaning something
/// on this head too.
/// </remarks>
public sealed class LocalAuthenticationStateProvider : AuthenticationStateProvider
{
    private static readonly AuthenticationState State = new(new ClaimsPrincipal(
        new ClaimsIdentity([new Claim(ClaimTypes.Name, "Mobile preview")], authenticationType: "LocalPreview")));

    public override Task<AuthenticationState> GetAuthenticationStateAsync() => Task.FromResult(State);
}
